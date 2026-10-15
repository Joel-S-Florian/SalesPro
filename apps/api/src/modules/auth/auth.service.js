import { prisma, basePrisma } from '../../config/db.js';
import { hashPassword, comparePassword, comparePasswordDummy, hashRounds } from '../../shared/utils/crypto.js';
import { generateTemporaryPassword, TEMP_PASSWORD_HOURS } from '../../shared/utils/tempPassword.js';
import { loginThrottle, humanizeWait } from '../../shared/utils/loginThrottle.js';
import { generateTokenPair, generateRefreshToken, verifyRefreshToken } from '../../shared/utils/jwt.js';
import { AppError } from '../../shared/exceptions/AppError.js';
import { ERROR_CODES } from '../../shared/exceptions/AppError.js';
import { env } from '../../config/env.js';
import { prewarmToken } from '../ecf/ecf.token.service.js';
import { sendMail, mailConfigured } from '../../shared/utils/mailer.js';
import { logger } from '../../shared/utils/logger.js';
import { createHash, randomBytes } from 'node:crypto';
import { assertPasswordAllowed } from '../../shared/utils/passwordPolicy.js';
import { assertWithinPlan } from '../../shared/plans.js';
import { getTenantId } from '../../config/tenant.js';

/** Minutos de inactividad por defecto antes de cerrar la sesión (configurable por empresa en `security`). */
export const DEFAULT_IDLE_MINUTES = 30;
/** El navegador renueva la sesión cada 15 min (vida del token de acceso): ese margen se suma al límite de inactividad. */
const REFRESH_GRACE_MINUTES = 15;
const RESET_TTL_MINUTES = 30;
const MAX_RESETS_PER_HOUR = 3;

const hashToken = token => createHash('sha256').update(token).digest('hex');
const normalizeEmail = value => (value ? String(value).trim().toLowerCase() : null);
const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;
const digitsOrNull = value => (value ? String(value).replace(/\D/g, '') || null : null);
const phoneOrNull = value => (value ? String(value).trim() || null : null);

async function assertDocumentAvailable(documentId, exceptUserId) {
  if (!documentId) return;
  const taken = await prisma.user.findFirst({ where: { documentId } });
  if (taken && taken.id !== exceptUserId) throw AppError.conflict('Esa cédula ya está registrada en otro usuario', ERROR_CODES.DUPLICATE_ENTRY);
}

async function idleMinutesOf(companyId) {
  if (!companyId) return 0;
  const row = await basePrisma.systemConfig.findUnique({ where: { companyId_key: { companyId, key: 'security' } } });
  const minutes = row?.value?.idleTimeoutMinutes;
  return Number.isFinite(minutes) ? minutes : DEFAULT_IDLE_MINUTES;
}

/** Error 429 genérico del bloqueo temporal (no dice si el usuario existe). */
function lockedError(lock) {
  const error = AppError.tooManyRequests(`Demasiados intentos fallidos. Espera ${humanizeWait(lock.retryAfterMs)} e inténtalo de nuevo, o usa «¿Olvidaste tu contraseña?».`);
  error.code = 'LOGIN_LOCKED';
  error.extra = { retryAfterSeconds: Math.ceil(lock.retryAfterMs / 1000) };
  return error;
}

/** Anota un inicio fallido y, si provoca un bloqueo, lo deja en la auditoría. Devuelve el error 401 genérico. */
async function failedLogin(username, ip, user) {
  const events = loginThrottle.recordFailure(username, ip);
  for (const event of events) {
    await basePrisma.auditLog
      .create({
        data: {
          companyId: user?.companyId ?? null,
          userId: user?.id ?? null,
          action: 'LOGIN_LOCKED',
          entity: 'auth',
          newData: { scope: event.scope, username: String(username).slice(0, 60), level: event.level, lockedMinutes: Math.round(event.lockMs / 60000) },
          ipAddress: ip || null,
        },
      })
      .catch(err => logger.warn(`Auditoría de bloqueo falló: ${err.message}`));
  }
  return AppError.unauthorized('Credenciales incorrectas', ERROR_CODES.INVALID_CREDENTIALS);
}

/** Datos del contexto que la política de contraseñas necesita (rol, usuario, correo y nombre de la empresa). */
async function passwordContext(user) {
  const company = user.companyId ? await basePrisma.company.findUnique({ where: { id: user.companyId }, select: { name: true } }) : null;
  return { role: user.role, username: user.username, email: user.email, companyName: company?.name };
}

/**
 * Authenticate user with username and password
 * @param {string} username - Username
 * @param {string} password - Plain text password
 * @returns {Promise<Object>} User data and tokens
 */
export async function login(username, password, ip) {
  // Retraso progresivo por cuenta e IP: la respuesta es la misma exista o no el usuario
  const lock = loginThrottle.check(username, ip);
  if (lock.locked) throw lockedError(lock);

  const user = await basePrisma.user.findUnique({
    where: { username: username.toLowerCase() },
    include: { company: { select: { id: true, name: true, active: true } } },
  });

  if (!user) {
    await comparePasswordDummy(password);
    throw await failedLogin(username, ip, null);
  }

  const validPassword = await comparePassword(password, user.passwordHash);
  if (!validPassword) throw await failedLogin(username, ip, user);
  loginThrottle.recordSuccess(username, ip);

  // La clave temporal caduca (48 h): pasado ese tiempo hay que pedir otra
  if (user.mustChangePassword && user.tempPasswordExpiresAt && user.tempPasswordExpiresAt < new Date()) {
    const expired = AppError.unauthorized('La clave temporal venció. Pide a un administrador que genere una nueva.');
    expired.code = 'TEMP_PASSWORD_EXPIRED';
    throw expired;
  }

  if (!user.active) {
    throw AppError.forbidden('El usuario se encuentra inactivo', ERROR_CODES.USER_INACTIVE);
  }

  if (user.role !== 'SUPERADMIN' && !user.company?.active) {
    throw AppError.forbidden('La empresa se encuentra suspendida o inactiva', 'COMPANY_INACTIVE');
  }

  // Generate token pair
  const { accessToken, refreshToken } = generateTokenPair(user);

  // Save refresh token in session
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

  await prisma.session.create({
    data: {
      token: refreshToken,
      userId: user.id,
      expiresAt,
    },
  });

  // Update last login. Si el hash tiene más rondas que las actuales, se rehace aquí (ya tenemos la clave en claro)
  const rehash = hashRounds(user.passwordHash) > env.BCRYPT_ROUNDS ? { passwordHash: await hashPassword(password) } : {};
  await basePrisma.user.update({
    where: { id: user.id },
    data: { updatedAt: new Date(), ...rehash },
  });

  // Si la empresa factura electrónicamente, deja listo el token de la DGII para que la primera venta no espere
  prewarmToken(user.companyId);

  return {
    user: {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      active: user.active,
      companyId: user.companyId,
      companyName: user.company?.name ?? null,
      mustChangePassword: user.mustChangePassword,
    },
    accessToken,
    refreshToken,
  };
}

/**
 * Refresh access token using refresh token
 * @param {string} refreshToken - Refresh token
 * @returns {Promise<Object>} New token pair
 */
export async function refreshTokens(refreshToken) {
  // Verify refresh token
  const decoded = verifyRefreshToken(refreshToken);
  if (!decoded) {
    throw AppError.unauthorized('Refresh token inválido', ERROR_CODES.REFRESH_TOKEN_INVALID);
  }

  // Find session
  const session = await basePrisma.session.findUnique({
    where: { token: refreshToken },
    include: { user: { include: { company: { select: { active: true } } } } },
  });

  if (!session || session.expiresAt < new Date()) {
    throw AppError.unauthorized('Sesión expirada', ERROR_CODES.REFRESH_TOKEN_EXPIRED);
  }

  // Sesión abandonada: si nadie la renovó en el tiempo de inactividad (más el margen de renovación), se cierra
  const idleMinutes = await idleMinutesOf(session.user.companyId);
  if (idleMinutes > 0 && Date.now() - session.lastActivityAt.getTime() > (idleMinutes + REFRESH_GRACE_MINUTES) * 60000) {
    await basePrisma.session.deleteMany({ where: { id: session.id } });
    throw AppError.unauthorized('Sesión cerrada por inactividad', ERROR_CODES.REFRESH_TOKEN_EXPIRED);
  }

  if (!session.user.active) {
    throw AppError.forbidden('Usuario inactivo', ERROR_CODES.USER_INACTIVE);
  }
  if (session.user.role !== 'SUPERADMIN' && !session.user.company?.active) {
    throw AppError.forbidden('La empresa se encuentra suspendida o inactiva', 'COMPANY_INACTIVE');
  }

  // Rotate refresh token (generate new pair)
  const { accessToken, refreshToken: newRefreshToken } = generateTokenPair(session.user);

  // Update session with new refresh token
  const newExpiresAt = new Date();
  newExpiresAt.setDate(newExpiresAt.getDate() + 7);

  await prisma.session.update({
    where: { id: session.id },
    data: {
      token: newRefreshToken,
      expiresAt: newExpiresAt,
      lastActivityAt: new Date(),
    },
  });

  return {
    accessToken,
    refreshToken: newRefreshToken,
  };
}

/**
 * Logout user - revoke session
 * @param {string} refreshToken - Refresh token to revoke
 * @returns {Promise<void>}
 */
export async function logout(refreshToken) {
  if (refreshToken) {
    await prisma.session.deleteMany({
      where: { token: refreshToken },
    });
  }
}

/**
 * Logout all sessions for a user
 * @param {string} userId - User ID
 * @returns {Promise<void>}
 */
export async function logoutAll(userId) {
  await prisma.session.deleteMany({
    where: { userId },
  });
}

/**
 * Change user password
 * @param {string} userId - User ID
 * @param {string} oldPassword - Current password
 * @param {string} newPassword - New password
 * @returns {Promise<void>}
 */
export async function changePassword(userId, oldPassword, newPassword) {
  const user = await basePrisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw AppError.notFound('Usuario no encontrado');
  }

  const validPassword = await comparePassword(oldPassword, user.passwordHash);
  if (!validPassword) {
    throw AppError.badRequest('Contraseña actual incorrecta', ERROR_CODES.INVALID_CREDENTIALS);
  }

  assertPasswordAllowed(newPassword, await passwordContext(user));
  const newHash = await hashPassword(newPassword);

  await basePrisma.user.update({
    where: { id: userId },
    data: { passwordHash: newHash, mustChangePassword: false, tempPasswordExpiresAt: null },
  });
}

/**
 * «¿Olvidaste tu contraseña?»: envía un enlace de un solo uso (30 min) al correo del usuario.
 * Responde siempre igual, exista o no la cuenta, para no revelar qué usuarios hay. Máximo 3 enlaces por hora y usuario.
 */
export async function forgotPassword(identifier) {
  const key = String(identifier || '').trim().toLowerCase();
  if (!key) return;
  const user = await basePrisma.user.findFirst({
    where: { OR: [{ username: key }, { email: key }], active: true },
    include: { company: { select: { active: true } } },
  });
  if (!user || !user.email) return;
  if (user.role !== 'SUPERADMIN' && !user.company?.active) return;

  const recent = await basePrisma.passwordReset.count({ where: { userId: user.id, createdAt: { gte: new Date(Date.now() - 3600000) } } });
  if (recent >= MAX_RESETS_PER_HOUR) return;

  const token = randomBytes(32).toString('base64url');
  await basePrisma.$transaction([
    basePrisma.passwordReset.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } }),
    basePrisma.passwordReset.create({ data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + RESET_TTL_MINUTES * 60000) } }),
  ]);

  const link = `${env.WEB_URL.replace(/\/$/, '')}/?reset=${token}`;
  const result = await sendMail({
    to: user.email,
    subject: 'Restablece tu contraseña de FACTOS',
    text: [
      `Hola ${user.fullName},`,
      '',
      `Recibimos una solicitud para restablecer la contraseña del usuario «${user.username}».`,
      `Abre este enlace (vale ${RESET_TTL_MINUTES} minutos y solo se puede usar una vez):`,
      '',
      link,
      '',
      'Si no fuiste tú, ignora este correo: tu contraseña no cambia.',
    ].join('\n'),
  });
  // Solo en desarrollo, sin correo configurado, el enlace queda en el log para poder probar el flujo
  if (!result.sent && env.NODE_ENV === 'development' && !mailConfigured()) logger.info(`[DEV] Enlace de recuperación para ${user.username}: ${link}`);
}

/** Cambia la contraseña con el enlace recibido por correo y cierra todas las sesiones del usuario. */
export async function resetPassword(token, newPassword) {
  const reset = await basePrisma.passwordReset.findUnique({ where: { tokenHash: hashToken(String(token || '')) }, include: { user: true } });
  if (!reset || reset.usedAt || reset.expiresAt < new Date() || !reset.user.active) {
    throw AppError.badRequest('El enlace no es válido o ya venció. Solicita uno nuevo.', ERROR_CODES.REFRESH_TOKEN_INVALID);
  }
  assertPasswordAllowed(newPassword, await passwordContext(reset.user));
  const passwordHash = await hashPassword(newPassword);
  await basePrisma.$transaction([
    basePrisma.user.update({ where: { id: reset.userId }, data: { passwordHash, mustChangePassword: false, tempPasswordExpiresAt: null } }),
    basePrisma.passwordReset.updateMany({ where: { userId: reset.userId, usedAt: null }, data: { usedAt: new Date() } }),
    basePrisma.session.deleteMany({ where: { userId: reset.userId } }),
  ]);
}

/**
 * Get current user profile
 * @param {string} userId - User ID
 * @returns {Promise<Object>} User data
 */
export async function getProfile(userId) {
  const user = await basePrisma.user.findUnique({
    where: { id: userId },
    select: {
      companyId: true,
      company: { select: { name: true, plan: true, trialEndsAt: true } },
      id: true,
      username: true,
      email: true,
      documentId: true,
      phone: true,
      mustChangePassword: true,
      fullName: true,
      role: true,
      active: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!user) {
    throw AppError.notFound('Usuario no encontrado');
  }

  return user;
}

/** El correo se usa para recuperar la contraseña: debe tener forma válida y no estar en otra cuenta. */
async function assertEmailAvailable(email, exceptUserId) {
  if (!email) return;
  if (!EMAIL_PATTERN.test(email) || email.length > 120) throw AppError.badRequest('El correo no es válido');
  const taken = await basePrisma.user.findUnique({ where: { email } });
  if (taken && taken.id !== exceptUserId) throw AppError.conflict('Ese correo ya está registrado en otra cuenta', ERROR_CODES.DUPLICATE_ENTRY);
}

/**
 * Create new user (admin only)
 * @param {Object} data - User data
 * @returns {Promise<Object>} Created user
 */
export async function createUser(data) {
  const { username, fullName, role, active } = data;
  const email = normalizeEmail(data.email);
  const documentId = digitsOrNull(data.documentId);
  // Un usuario nuevo nace activo salvo que se indique lo contrario: solo los activos cuentan contra el tope
  if (active ?? true) await assertWithinPlan('users');
  await assertEmailAvailable(email);
  await assertDocumentAvailable(documentId);
  // La clave es TEMPORAL y la genera el servidor (se muestra una sola vez). Solo uso interno: una clave propia (pruebas, alta de empresa).
  const issuedTemp = !data.password;
  const companyName = (await basePrisma.company.findUnique({ where: { id: getTenantId() }, select: { name: true } }))?.name;
  const password = data.password || generateTemporaryPassword({ username, email, companyName });
  if (!issuedTemp) assertPasswordAllowed(password, { role, username, email, companyName });
  const tempPasswordExpiresAt = issuedTemp ? new Date(Date.now() + TEMP_PASSWORD_HOURS * 3600 * 1000) : null;

  const existing = await basePrisma.user.findUnique({
    where: { username: username.toLowerCase() },
  });

  if (existing) {
    throw AppError.conflict('El nombre de usuario ya está registrado', ERROR_CODES.DUPLICATE_ENTRY);
  }

  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      username: username.toLowerCase(),
      email,
      documentId,
      phone: phoneOrNull(data.phone),
      fullName,
      role,
      passwordHash,
      ...(issuedTemp ? { mustChangePassword: true, tempPasswordExpiresAt } : {}),
      active: active ?? true,
    },
    select: {
      id: true,
      username: true,
      email: true,
      documentId: true,
      phone: true,
      fullName: true,
      role: true,
      active: true,
      createdAt: true,
    },
  });

  return issuedTemp ? { ...user, temporaryPassword: password, temporaryPasswordExpiresAt: tempPasswordExpiresAt } : user;
}

/**
 * Genera una clave temporal nueva para otro usuario de la empresa (la anterior deja de servir y se cierran sus sesiones).
 * Devuelve la clave UNA sola vez; caduca a las 48 horas y obliga a cambiarla al entrar.
 */
export async function resetUserPassword(id, actorId) {
  if (id === actorId) throw AppError.badRequest('Para cambiar tu propia contraseña usa «Cambiar mi contraseña»');
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw AppError.notFound('Usuario no encontrado');
  const companyName = user.companyId ? (await basePrisma.company.findUnique({ where: { id: user.companyId }, select: { name: true } }))?.name : undefined;
  const temporaryPassword = generateTemporaryPassword({ username: user.username, email: user.email, companyName });
  const temporaryPasswordExpiresAt = new Date(Date.now() + TEMP_PASSWORD_HOURS * 3600 * 1000);
  await basePrisma.$transaction([
    basePrisma.user.update({ where: { id }, data: { passwordHash: await hashPassword(temporaryPassword), mustChangePassword: true, tempPasswordExpiresAt: temporaryPasswordExpiresAt } }),
    basePrisma.session.deleteMany({ where: { userId: id } }),
  ]);
  loginThrottle.recordSuccess(user.username, null);
  return { username: user.username, fullName: user.fullName, temporaryPassword, temporaryPasswordExpiresAt };
}

/**
 * Get all users (admin only)
 * @param {Object} params - Query params
 * @returns {Promise<Object>} Users with pagination
 */
const USER_SORT_FIELDS = ['createdAt', 'fullName', 'username', 'role', 'active'];

export async function getUsers({ page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc', q }) {
  const skip = (page - 1) * limit;
  const orderField = USER_SORT_FIELDS.includes(sortBy) ? sortBy : 'createdAt';
  const where = q
    ? {
        OR: [
          { fullName: { contains: q, mode: 'insensitive' } },
          { username: { contains: q, mode: 'insensitive' } },
          ...(/\d{3,}/.test(q) ? [{ documentId: { contains: q.replace(/\D/g, '') } }] : []),
        ],
      }
    : {};
  
  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip,
      take: limit,
      orderBy: { [orderField]: sortOrder === 'asc' ? 'asc' : 'desc' },
      select: {
        id: true,
        username: true,
        email: true,
        documentId: true,
        phone: true,
        mustChangePassword: true,
        tempPasswordExpiresAt: true,
        fullName: true,
        role: true,
        active: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.user.count({ where }),
  ]);

  return {
    data: users,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNext: page < Math.ceil(total / limit),
      hasPrev: page > 1,
    },
  };
}

/**
 * Update user (admin only)
 * @param {string} id - User ID
 * @param {Object} data - Update data
 * @returns {Promise<Object>} Updated user
 */
export async function updateUser(id, data, actorId) {
  const { fullName, role, active, password } = data;

  const user = await prisma.user.findUnique({
    where: { id },
  });

  if (!user) {
    throw AppError.notFound('Usuario no encontrado');
  }

  // Reactivar un usuario cuenta contra el tope del plan
  if (active === true && !user.active) await assertWithinPlan('users');

  const updateData = {};
  if (fullName) updateData.fullName = fullName;
  if (role) updateData.role = role;
  if (active !== undefined) updateData.active = active;
  if (password) {
    assertPasswordAllowed(password, { ...(await passwordContext(user)), role: role || user.role, email: data.email !== undefined ? data.email : user.email });
    updateData.passwordHash = await hashPassword(password);
    // Clave puesta por otra persona (uso interno): es temporal y debe cambiarla al entrar
    if (id !== actorId) {
      updateData.mustChangePassword = true;
      updateData.tempPasswordExpiresAt = new Date(Date.now() + TEMP_PASSWORD_HOURS * 3600 * 1000);
    } else {
      updateData.mustChangePassword = false;
      updateData.tempPasswordExpiresAt = null;
    }
  }
  if (data.email !== undefined) {
    const email = normalizeEmail(data.email);
    await assertEmailAvailable(email, id);
    updateData.email = email;
  }
  if (data.documentId !== undefined) {
    const documentId = digitsOrNull(data.documentId);
    await assertDocumentAvailable(documentId, id);
    updateData.documentId = documentId;
  }
  if (data.phone !== undefined) updateData.phone = phoneOrNull(data.phone);

  const updated = await prisma.user.update({
    where: { id },
    data: updateData,
    select: {
      id: true,
      username: true,
      email: true,
      documentId: true,
      phone: true,
      mustChangePassword: true,
      fullName: true,
      role: true,
      active: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return updated;
}

/**
 * Delete user (admin only) - soft delete by deactivating
 * @param {string} id - User ID
 * @returns {Promise<void>}
 */
export async function deleteUser(id) {
  const user = await prisma.user.findUnique({
    where: { id },
  });

  if (!user) {
    throw AppError.notFound('Usuario no encontrado');
  }

  // Soft delete - deactivate and revoke sessions
  await prisma.user.update({
    where: { id },
    data: { active: false },
  });

  await logoutAll(id);
}