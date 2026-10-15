import rateLimit from 'express-rate-limit';
import { env, isDev } from '../../config/env.js';
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
  skip: (req) => isDev, // Disable in development
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