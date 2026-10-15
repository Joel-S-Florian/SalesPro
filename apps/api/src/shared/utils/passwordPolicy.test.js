import { describe, expect, it } from 'vitest';
import { passwordProblem, passwordSchema, MIN_PASSWORD_LENGTH } from './passwordPolicy.js';

describe('passwordProblem', () => {
  it('acepta una contraseña larga con letras y números', () => {
    expect(passwordProblem('Cafe-con-leche-77')).toBeNull();
    expect(passwordProblem('Hk7m-Qw3p-Zr9t')).toBeNull();
  });

  it('exige la longitud mínima, una letra y un número', () => {
    expect(passwordProblem('Corta1')).toMatch(String(MIN_PASSWORD_LENGTH));
    expect(passwordProblem('soloLetrasAqui')).toMatch(/letra y un número/);
    expect(passwordProblem('12345678901234')).toMatch(/letra y un número/);
  });

  it('rechaza contraseñas comunes aunque lleven mayúsculas, símbolos o números al final', () => {
    expect(passwordProblem('Contrasena123')).toMatch(/común/);
    expect(passwordProblem('Password-2024')).toMatch(/común/);
    expect(passwordProblem('Administrador99')).toMatch(/común/);
  });

  it('rechaza secuencias y repeticiones', () => {
    expect(passwordProblem('mnopqrstuv12')).toMatch(/secuencia/);
    expect(passwordProblem('aaaaaaaaaaa1')).toMatch(/repetitiva/);
  });

  it('rechaza las que contienen el usuario o el correo', () => {
    expect(passwordProblem('jflores-2024-ok', { username: 'jflores' })).toMatch(/usuario/);
    expect(passwordProblem('maria.perez.2024', { email: 'maria.perez@correo.com' })).toMatch(/correo/);
    expect(passwordProblem('Otra-clave-segura-5', { username: 'jflores' })).toBeNull();
  });
});

describe('passwordSchema', () => {
  it('valida con zod y devuelve el motivo', () => {
    expect(passwordSchema.safeParse('Cafe-con-leche-77').success).toBe(true);
    const bad = passwordSchema.safeParse('corta');
    expect(bad.success).toBe(false);
    expect(bad.error.issues[0].message).toMatch(/al menos/);
  });
});
