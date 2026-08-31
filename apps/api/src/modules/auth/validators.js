import { z } from 'zod';

/**
 * Auth validation schemas
 */

export const loginSchema = z.object({
  body: z.object({
    username: z.string().min(1, 'Usuario requerido').max(50),
    password: z.string().min(1, 'Contraseña requerida').max(100),
  }),
});

export const changePasswordSchema = z.object({
  body: z.object({
    oldPassword: z.string().min(1, 'Contraseña actual requerida'),
    newPassword: z.string().min(8, 'La nueva contraseña debe tener al menos 8 caracteres').max(100),
  }),
});

export const createUserSchema = z.object({
  body: z.object({
    username: z.string().min(3, 'Mínimo 3 caracteres').max(50, 'Máximo 50 caracteres').regex(/^[a-zA-Z0-9_]+$/, 'Solo letras, números y guión bajo'),
    fullName: z.string().min(2, 'Mínimo 2 caracteres').max(100),
    role: z.enum(['ADMINISTRADOR', 'VENDEDOR']),
    password: z.string().min(8, 'Mínimo 8 caracteres').max(100),
    active: z.boolean().default(true),
  }),
});

export const updateUserSchema = z.object({
  params: z.object({
    id: z.string().cuid(),
  }),
  body: z.object({
    fullName: z.string().min(2).max(100).optional(),
    role: z.enum(['ADMINISTRADOR', 'VENDEDOR']).optional(),
    active: z.boolean().optional(),
    password: z.string().min(8).max(100).optional(),
  }).refine(data => Object.keys(data).length > 0, 'Al menos un campo es requerido'),
});

export const userIdParamSchema = z.object({
  params: z.object({
    id: z.string().cuid(),
  }),
});