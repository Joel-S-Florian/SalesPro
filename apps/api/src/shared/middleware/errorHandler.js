import { AppError } from '../exceptions/AppError.js';
import { ERROR_CODES } from '../exceptions/AppError.js';
import { env } from '../../config/env.js';
import { logger } from '../utils/logger.js';

/**
 * Global error handler middleware
 */
export function errorHandler(err, req, res, next) {
  // Log error
  logger.error('Error:', {
    message: err.message,
    code: err.code,
    statusCode: err.statusCode,
    stack: err.stack,
    path: req.path,
    method: req.method,
    userId: req.user?.userId,
  });

  // Prisma errors
  if (err.code === 'P2002') {
    const field = err.meta?.target?.[0] || 'campo';
    return res.status(409).json({
      error: 'Entrada duplicada',
      code: ERROR_CODES.DUPLICATE_ENTRY,
      details: { field: `${field} ya existe` },
    });
  }

  if (err.code === 'P2003') {
    return res.status(400).json({
      error: 'Referencia inválida',
      code: ERROR_CODES.FOREIGN_KEY_CONSTRAINT,
      details: { field: err.meta?.field_name },
    });
  }

  if (err.code === 'P2025') {
    return res.status(404).json({
      error: 'Registro no encontrado',
      code: ERROR_CODES.NOT_FOUND,
    });
  }

  // Zod validation errors (should be caught by validate middleware)
  if (err.name === 'ZodError') {
    return res.status(422).json({
      error: 'Error de validación',
      code: ERROR_CODES.VALIDATION_ERROR,
      details: err.errors.map(e => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      error: 'Token inválido',
      code: ERROR_CODES.TOKEN_INVALID,
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      error: 'Token expirado',
      code: ERROR_CODES.TOKEN_EXPIRED,
    });
  }

  // AppError (operational errors)
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
      details: err.details,
    });
  }

  // Unknown errors
  const message = env.isProd ? 'Error interno del servidor' : err.message;
  return res.status(500).json({
    error: message,
    code: ERROR_CODES.INTERNAL_ERROR,
    ...(!env.isProd && { stack: err.stack }),
  });
}

/**
 * 404 handler for unmatched routes
 */
export function notFoundHandler(req, res) {
  res.status(404).json({
    error: `Ruta no encontrada: ${req.method} ${req.path}`,
    code: 'ROUTE_NOT_FOUND',
  });
}