import { z } from 'zod';

// Variables opcionales: una cadena vacía (como en .env.example) cuenta como no definida
const optionalUrl = z.preprocess(value => (value === '' ? undefined : value), z.string().url().optional());

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4010),
  DATABASE_URL: z.string(),
  JWT_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),
  BCRYPT_ROUNDS: z.coerce.number().default(12),
  CORS_ORIGIN: z.string().default('http://localhost:5180,http://localhost:5190'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),
  // Facturación electrónica (DGII)
  ECF_MASTER_KEY: z.string().optional(), // 32 bytes en base64: cifra certificados digitales
  ECF_BASE_URL_OVERRIDE: optionalUrl, // simulador de la DGII (nunca en producción)
  PUBLIC_API_URL: optionalUrl, // dirección pública del API, para registrar las URL de recepción
});

export const env = envSchema.parse(process.env);

export const isDev = env.NODE_ENV === 'development';
export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';