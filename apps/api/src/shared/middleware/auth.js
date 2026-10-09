import { verifyAccessToken, verifyRefreshToken } from '../../shared/utils/jwt.js';
import { basePrisma as prisma } from '../../config/db.js';
import { tenantStore } from '../../config/tenant.js';
import { AppError } from '../../shared/exceptions/AppError.js';
import { ERROR_CODES } from '../../shared/exceptions/AppError.js';

export async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    console.log('🔍 [DEBUG AUTH] 1. Header recibido:', authHeader);
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('❌ [DEBUG AUTH] 2. Falta token o no empieza con "Bearer "');
      throw AppError.unauthorized('Falta token de autenticación');
    }

    const token = authHeader.split(' ')[1];
    console.log('🔑 [DEBUG AUTH] 3. Token presente. Longitud:', token.length);

    let decoded;
    try {
      decoded = verifyAccessToken(token);
      console.log('🔓 [DEBUG AUTH] 4. Token decodificado exitosamente. UserID:', decoded?.userId);
    } catch (jwtError) {
      console.error('❌ [DEBUG AUTH] 4b. Error de JWT (firma inválida o expirado):', jwtError.message);
      throw AppError.unauthorized('Token inválido o expirado', ERROR_CODES.TOKEN_INVALID);
    }

    if (!decoded) {
      console.log('❌ [DEBUG AUTH] 5. verifyAccessToken retornó null/falsy sin lanzar error');
      throw AppError.unauthorized('Token inválido o expirado', ERROR_CODES.TOKEN_INVALID);
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        username: true,
        fullName: true,
        role: true,
        active: true,
        companyId: true,
        company: { select: { active: true } },
      },
    });
    console.log('👤 [DEBUG AUTH] 6. Usuario encontrado en DB:', user ? user.username : 'NULL');

    if (!user) {
      throw AppError.unauthorized('Usuario no encontrado', ERROR_CODES.TOKEN_INVALID);
    }

    if (!user.active) {
      throw AppError.forbidden('Usuario inactivo', ERROR_CODES.USER_INACTIVE);
    }

    // Usuarios de empresa: la empresa debe existir y estar activa. SUPERADMIN no pertenece a ninguna.
    if (user.role !== 'SUPERADMIN' && (!user.companyId || !user.company?.active)) {
      throw AppError.forbidden('La empresa se encuentra suspendida o inactiva', 'COMPANY_INACTIVE');
    }

    req.user = {
      userId: user.id,
      username: user.username,
      role: user.role,
      fullName: user.fullName,
      companyId: user.companyId,
    };

    console.log('✅ [DEBUG AUTH] 7. Autenticación exitosa para:', req.user.username);
    // Todo lo que sigue (controladores, servicios) corre dentro del contexto de la empresa
    tenantStore.run({ companyId: user.companyId }, () => next());
  } catch (error) {
    console.error('💥 [DEBUG AUTH] ERROR FINAL:', error.message);
    next(error);
  }
}

// ... (Mantén el resto de las funciones authenticateRefresh, authorize, optionalAuth igual que antes) ...
export async function authenticateRefresh(req, res, next) {
  // (Copia y pega tu código original de authenticateRefresh aquí sin cambios)
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw AppError.unauthorized('Falta refresh token');
    }
    const token = authHeader.split(' ')[1];
    const decoded = verifyRefreshToken(token);
    if (!decoded) {
      throw AppError.unauthorized('Refresh token inválido o expirado', ERROR_CODES.REFRESH_TOKEN_INVALID);
    }
    const session = await prisma.session.findUnique({
      where: { token },
      include: { user: true },
    });
    if (!session || session.expiresAt < new Date()) {
      throw AppError.unauthorized('Sesión expirada', ERROR_CODES.REFRESH_TOKEN_EXPIRED);
    }
    if (!session.user.active) {
      throw AppError.forbidden('Usuario inactivo', ERROR_CODES.USER_INACTIVE);
    }
    req.user = {
      userId: session.user.id,
      username: session.user.username,
      role: session.user.role,
      fullName: session.user.fullName,
      companyId: session.user.companyId,
    };
    req.session = session;
    req.refreshToken = token;
    next();
  } catch (error) {
    next(error);
  }
}

export function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return next(AppError.unauthorized());
    }
    if (!roles.includes(req.user.role)) {
      return next(AppError.forbidden('No tiene permisos para esta acción'));
    }
    next();
  };
}

export async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }
    const token = authHeader.split(' ')[1];
    const decoded = verifyAccessToken(token);
    if (!decoded) {
      return next();
    }
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, username: true, fullName: true, role: true, active: true },
    });
    if (user && user.active) {
      req.user = {
        userId: user.id,
        username: user.username,
        role: user.role,
        fullName: user.fullName,
      };
    }
    next();
  } catch {
    next();
  }
}