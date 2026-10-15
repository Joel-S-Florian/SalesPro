import rateLimit from 'express-rate-limit';
import { env } from '../../config/env.js';
import { ipKeyGenerator } from 'express-rate-limit';

/**
 * General API rate limiter
 */
export const rateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX_REQUESTS,
  message: {
    error: 'Demasiadas solicitudes, intente más tarde',
    code: 'RATE_LIMIT_EXCEEDED',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: req => ipKeyGenerator(req.ip),
  skip: (req) => env.isDev, // Disable in development
});

const loginMessage = {
  error: 'Demasiados intentos fallidos de inicio de sesión. Intente de nuevo en 15 minutos o use «¿Olvidaste tu contraseña?»',
  code: 'AUTH_RATE_LIMIT_EXCEEDED',
};

/**
 * Límites del inicio de sesión: cuentan solo los intentos fallidos (los correctos no gastan cupo).
 * Por usuario + conexión (frena adivinar una clave) y por conexión (frena probar muchos usuarios).
 */
export const loginAccountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  skipSuccessfulRequests: true,
  message: loginMessage,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: req => `${ipKeyGenerator(req.ip)}|${String(req.body?.username || '').toLowerCase().slice(0, 50)}`,
});

export const loginIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100, // las peticiones en curso también cuentan: un local que abre todas sus cajas a la vez no debe toparse con el límite
  skipSuccessfulRequests: true,
  message: loginMessage,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: req => ipKeyGenerator(req.ip),
});

/**
 * Sales rate limiter (POS)
 */
export const salesRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: env.SALES_RATE_LIMIT_PER_MIN, // por USUARIO y no por IP: varias cajas comparten la misma conexión de internet
  message: {
    error: 'Demasiadas ventas registradas, espere un momento',
    code: 'SALES_RATE_LIMIT_EXCEEDED',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: req => (req.user?.userId ? `u:${req.user.userId}` : ipKeyGenerator(req.ip)),
});