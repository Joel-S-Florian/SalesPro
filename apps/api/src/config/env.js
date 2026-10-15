import { z } from 'zod';

// Variables opcionales: una cadena vacía (como en .env.example) cuenta como no definida
const optionalUrl = z.preprocess(value => (value === '' ? undefined : value), z.string().url().optional());

// Texto opcional: una cadena vacía cuenta como no definida
const optionalText = z.preprocess(value => (value === '' ? undefined : value), z.string().optional());
const optionalEmail = z.preprocess(value => (value === '' ? undefined : value), z.string().email().optional());

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4010),
  DATABASE_URL: z.string(),
  JWT_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(14).default(11), // 11 ≈ 200 ms; los hashes con más rondas se rebajan solos al iniciar sesión
  CORS_ORIGIN: z.string().default('http://localhost:5180,http://localhost:5190'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  SALES_RATE_LIMIT_PER_MIN: z.coerce.number().default(60), // ventas por minuto y por usuario (el POS no necesita más)
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(600), // por IP y por minuto: varias cajas de un local comparten conexión
  // Facturación electrónica (DGII)
  ECF_MASTER_KEY: z.string().optional(), // 32 bytes en base64: cifra certificados digitales
  ECF_BASE_URL_OVERRIDE: optionalUrl, // simulador de la DGII (nunca en producción)
  PUBLIC_API_URL: optionalUrl, // dirección pública del API, para registrar las URL de recepción
  // Correo saliente (avisos de la landing y recuperación de contraseña)
  SMTP_HOST: optionalText,
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: optionalText,
  SMTP_PASS: optionalText,
  SMTP_SECURE: z.preprocess(value => (value === '' || value === undefined ? undefined : value === 'true' || value === true), z.boolean().optional()),
  MAIL_FROM: optionalText, // p. ej. "FACTOS <no-responder@tudominio.com>"
  NOTIFY_EMAIL: optionalEmail, // a dónde llegan las solicitudes de la landing y los registros nuevos
  WEB_URL: z.preprocess(value => (value === '' ? undefined : value), z.string().url().default('http://localhost:5180')), // dirección del sistema, para los enlaces de los correos
});

export const env = envSchema.parse(process.env);

export const isDev = env.NODE_ENV === 'development';
export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';