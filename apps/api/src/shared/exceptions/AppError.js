/**
 * Custom application error class
 */
export class AppError extends Error {
  constructor(message, statusCode, code, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.extra = null; // campos adicionales que van en la raíz de la respuesta (p. ej. PLAN_LIMIT)
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message, details = null) {
    return new AppError(message, 400, 'BAD_REQUEST', details);
  }

  static unauthorized(message = 'No autorizado') {
    return new AppError(message, 401, 'UNAUTHORIZED');
  }

  static forbidden(message = 'Acceso denegado') {
    return new AppError(message, 403, 'FORBIDDEN');
  }

  static notFound(message = 'Recurso no encontrado') {
    return new AppError(message, 404, 'NOT_FOUND');
  }

  static conflict(message = 'Conflicto de datos') {
    return new AppError(message, 409, 'CONFLICT');
  }

  static validation(message = 'Error de validación', details = null) {
    return new AppError(message, 422, 'VALIDATION_ERROR', details);
  }

  static internal(message = 'Error interno del servidor') {
    return new AppError(message, 500, 'INTERNAL_ERROR');
  }

  /** 403 PLAN_LIMIT: se llegó al tope de un recurso del plan. Cuerpo: { code, resource, plan, limit, current, message }. */
  static planLimit(message, { resource, plan, limit, current }) {
    const error = new AppError(message, 403, 'PLAN_LIMIT');
    error.extra = { resource, plan, limit, current, message };
    return error;
  }

  /** 403 PLAN_FEATURE: la función no está incluida en el plan. Cuerpo: { code, feature, plan, requiredPlan, message }. */
  static planFeature(message, { feature, plan, requiredPlan }) {
    const error = new AppError(message, 403, 'PLAN_FEATURE');
    error.extra = { feature, plan, requiredPlan, message };
    return error;
  }

  static tooManyRequests(message = 'Demasiadas solicitudes') {
    return new AppError(message, 429, 'TOO_MANY_REQUESTS');
  }
}

/**
 * Error codes for client handling
 */
export const ERROR_CODES = {
  // Auth
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  REFRESH_TOKEN_EXPIRED: 'REFRESH_TOKEN_EXPIRED',
  REFRESH_TOKEN_REVOKED: 'REFRESH_TOKEN_REVOKED',
  USER_INACTIVE: 'USER_INACTIVE',

  // Validation
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  DUPLICATE_ENTRY: 'DUPLICATE_ENTRY',
  FOREIGN_KEY_CONSTRAINT: 'FOREIGN_KEY_CONSTRAINT',

  // Business logic
  INSUFFICIENT_STOCK: 'INSUFFICIENT_STOCK',
  PRODUCT_INACTIVE: 'PRODUCT_INACTIVE',
  CUSTOMER_HAS_SALES: 'CUSTOMER_HAS_SALES',
  CATEGORY_HAS_PRODUCTS: 'CATEGORY_HAS_PRODUCTS',
  PRODUCT_HAS_SALES: 'PRODUCT_HAS_SALES',
  NCF_EXHAUSTED: 'NCF_EXHAUSTED',

  // System
  DATABASE_ERROR: 'DATABASE_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
};