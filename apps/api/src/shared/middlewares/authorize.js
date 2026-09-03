import { AppError } from '../../shared/exceptions/AppError.js';
import { ERROR_CODES } from '../../shared/exceptions/AppError.js';
import { logger } from '../../shared/utils/logger.js';
import { ROLES, PERMISSIONS, hasPermission } from '../../../../../packages/shared/src/constants/roles.js';

const VALID_ROLES = Object.values(ROLES);
const VALID_PERMISSIONS = Object.values(PERMISSIONS);

function validateRoles(roles) {
  const invalidRoles = roles.filter(r => !VALID_ROLES.includes(r));
  if (invalidRoles.length > 0) {
    throw new Error(`Roles inválidos: ${invalidRoles.join(', ')}`);
  }
}

function validatePermissions(perms) {
  const invalidPerms = perms.filter(p => !VALID_PERMISSIONS.includes(p));
  if (invalidPerms.length > 0) {
    throw new Error(`Permisos inválidos: ${invalidPerms.join(', ')}`);
  }
}

export function authorize(...allowedRoles) {
  validateRoles(allowedRoles);

  return (req, res, next) => {
    if (!req.user) {
      logger.warn('Acceso denegado: usuario no autenticado', {
        path: req.path,
        method: req.method,
        ip: req.ip,
      });
      return next(AppError.unauthorized());
    }

    const userRole = req.user.role;
    if (!allowedRoles.includes(userRole)) {
      logger.warn('Acceso denegado: rol no autorizado', {
        userId: req.user.userId,
        userRole,
        allowedRoles,
        path: req.path,
        method: req.method,
        ip: req.ip,
      });
      return next(AppError.forbidden('No tiene permisos para esta acción'));
    }

    next();
  };
}

export function authorizePermission(...requiredPermissions) {
  validatePermissions(requiredPermissions);

  return (req, res, next) => {
    if (!req.user) {
      logger.warn('Acceso denegado: usuario no autenticado', {
        path: req.path,
        method: req.method,
        ip: req.ip,
      });
      return next(AppError.unauthorized());
    }

    const userRole = req.user.role;
    const hasAll = requiredPermissions.every(p => hasPermission(userRole, p));

    if (!hasAll) {
      logger.warn('Acceso denegado: permiso insuficiente', {
        userId: req.user.userId,
        userRole,
        requiredPermissions,
        path: req.path,
        method: req.method,
        ip: req.ip,
      });
      return next(AppError.forbidden('No tiene permisos para esta acción'));
    }

    next();
  };
}

export function authorizeAnyRole(...allowedRoles) {
  return authorize(...allowedRoles);
}

export function authorizeAnyPermission(...allowedPermissions) {
  validatePermissions(allowedPermissions);

  return (req, res, next) => {
    if (!req.user) {
      return next(AppError.unauthorized());
    }

    const userRole = req.user.role;
    const hasAny = allowedPermissions.some(p => hasPermission(userRole, p));

    if (!hasAny) {
      logger.warn('Acceso denegado: permiso insuficiente (any)', {
        userId: req.user.userId,
        userRole,
        allowedPermissions,
        path: req.path,
        method: req.method,
        ip: req.ip,
      });
      return next(AppError.forbidden('No tiene permisos para esta acción'));
    }

    next();
  };
}

export { ROLES, PERMISSIONS };