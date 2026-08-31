import { prisma } from '../../config/db.js';
import { hashPassword, comparePassword } from '../../shared/utils/crypto.js';
import { generateTokenPair, generateRefreshToken, verifyRefreshToken } from '../../shared/utils/jwt.js';
import { AppError } from '../../shared/exceptions/AppError.js';
import { ERROR_CODES } from '../../shared/exceptions/AppError.js';
import { env } from '../../config/env.js';

/**
 * Authenticate user with username and password
 * @param {string} username - Username
 * @param {string} password - Plain text password
 * @returns {Promise<Object>} User data and tokens
 */
export async function login(username, password) {
  const user = await prisma.user.findUnique({
    where: { username: username.toLowerCase() },
  });

  if (!user) {
    throw AppError.unauthorized('Credenciales incorrectas', ERROR_CODES.INVALID_CREDENTIALS);
  }

  const validPassword = await comparePassword(password, user.passwordHash);
  if (!validPassword) {
    throw AppError.unauthorized('Credenciales incorrectas', ERROR_CODES.INVALID_CREDENTIALS);
  }

  if (!user.active) {
    throw AppError.forbidden('El usuario se encuentra inactivo', ERROR_CODES.USER_INACTIVE);
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

  // Update last login
  await prisma.user.update({
    where: { id: user.id },
    data: { updatedAt: new Date() },
  });

  return {
    user: {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      active: user.active,
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
  const session = await prisma.session.findUnique({
    where: { token: refreshToken },
    include: { user: true },
  });

  if (!session || session.expiresAt < new Date()) {
    throw AppError.unauthorized('Sesión expirada', ERROR_CODES.REFRESH_TOKEN_EXPIRED);
  }

  if (!session.user.active) {
    throw AppError.forbidden('Usuario inactivo', ERROR_CODES.USER_INACTIVE);
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
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw AppError.notFound('Usuario no encontrado');
  }

  const validPassword = await comparePassword(oldPassword, user.passwordHash);
  if (!validPassword) {
    throw AppError.badRequest('Contraseña actual incorrecta', ERROR_CODES.INVALID_CREDENTIALS);
  }

  const newHash = await hashPassword(newPassword);

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: newHash },
  });

  // Revoke all sessions except current (optional - for security)
  // await logoutAll(userId);
}

/**
 * Get current user profile
 * @param {string} userId - User ID
 * @returns {Promise<Object>} User data
 */
export async function getProfile(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
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

/**
 * Create new user (admin only)
 * @param {Object} data - User data
 * @returns {Promise<Object>} Created user
 */
export async function createUser(data) {
  const { username, fullName, role, password, active } = data;

  const existing = await prisma.user.findUnique({
    where: { username: username.toLowerCase() },
  });

  if (existing) {
    throw AppError.conflict('El nombre de usuario ya está registrado', ERROR_CODES.DUPLICATE_ENTRY);
  }

  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      username: username.toLowerCase(),
      fullName,
      role,
      passwordHash,
      active: active ?? true,
    },
    select: {
      id: true,
      username: true,
      fullName: true,
      role: true,
      active: true,
      createdAt: true,
    },
  });

  return user;
}

/**
 * Get all users (admin only)
 * @param {Object} params - Query params
 * @returns {Promise<Object>} Users with pagination
 */
export async function getUsers({ page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc' }) {
  const skip = (page - 1) * limit;
  
  const [users, total] = await Promise.all([
    prisma.user.findMany({
      skip,
      take: limit,
      orderBy: { [sortBy]: sortOrder },
      select: {
        id: true,
        username: true,
        fullName: true,
        role: true,
        active: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.user.count(),
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
export async function updateUser(id, data) {
  const { fullName, role, active, password } = data;

  const user = await prisma.user.findUnique({
    where: { id },
  });

  if (!user) {
    throw AppError.notFound('Usuario no encontrado');
  }

  const updateData = {};
  if (fullName) updateData.fullName = fullName;
  if (role) updateData.role = role;
  if (active !== undefined) updateData.active = active;
  if (password) updateData.passwordHash = await hashPassword(password);

  const updated = await prisma.user.update({
    where: { id },
    data: updateData,
    select: {
      id: true,
      username: true,
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