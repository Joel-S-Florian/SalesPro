import { z } from 'zod';
import { passwordSchema } from '../../shared/utils/passwordPolicy.js';
import { validateCedula } from '../../shared/utils/dgii.js';

/**
 * Auth validation schemas
 */

/** Formatos planos ({ body, params }): son los que `validate()` aplica de verdad (la forma `z.object({ body })` no se ejecuta). */
export const loginSchema = {
  body: z.object({
    username: z.string().min(1, 'Usuario requerido').max(50),
    password: z.string().min(1, 'Contraseña requerida').max(100),
  }),
};

export const forgotPasswordSchema = {
  body: z.object({ identifier: z.string().trim().min(1, 'Escribe tu usuario o correo').max(120) }),
};

export const resetPasswordSchema = {
  body: z.object({ token: z.string().min(20).max(200), newPassword: passwordSchema }),
};

export const changePasswordSchema = {
  body: z.object({
    oldPassword: z.string().min(1, 'Contraseña actual requerida').max(100),
    newPassword: passwordSchema,
  }),
};

const emailField = z.string().trim().toLowerCase().email('Correo inválido').max(120);
const phoneField = z
  .string()
  .trim()
  .max(25)
  .refine(value => value === '' || (/^[\d\s()+.-]+$/.test(value) && value.replace(/\D/g, '').length >= 10), 'Teléfono inválido: escribe al menos 10 dígitos');
const cedulaField = z
  .string()
  .trim()
  .max(20)
  .refine(value => value === '' || validateCedula(value), 'Cédula inválida');

export const createUserSchema = {
  body: z.object({
    username: z.string().min(3, 'Mínimo 3 caracteres').max(50, 'Máximo 50 caracteres').regex(/^[a-zA-Z0-9_]+$/, 'Solo letras, números y guión bajo'),
    fullName: z.string().trim().min(2, 'Mínimo 2 caracteres').max(100),
    role: z.enum(['ADMINISTRADOR', 'VENDEDOR']),
    // Sin `password`: la clave temporal la genera el servidor y se devuelve una sola vez
    email: emailField.nullish(),
    documentId: cedulaField.nullish(),
    phone: phoneField.nullish(),
    active: z.boolean().default(true),
  }),
};

export const updateUserSchema = {
  params: z.object({ id: z.string().cuid() }),
  body: z
    .object({
      fullName: z.string().trim().min(2).max(100).optional(),
      role: z.enum(['ADMINISTRADOR', 'VENDEDOR']).optional(),
      active: z.boolean().optional(),
      email: emailField.nullish(),
      documentId: cedulaField.nullish(),
      phone: phoneField.nullish(),
    })
    .refine(data => Object.keys(data).length > 0, 'Al menos un campo es requerido'),
};

export const userIdParamSchema = {
  params: z.object({ id: z.string().cuid() }),
};
