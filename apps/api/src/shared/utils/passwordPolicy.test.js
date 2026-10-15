import { describe, expect, it } from 'vitest';
import { COMMON_PASSWORDS } from '@factos/shared/commonPasswords.js';
import { MAX_PASSWORD_LENGTH, minLengthFor, passwordProblem, passwordStrength } from '@factos/shared/passwordPolicy.js';
import { passwordSchema } from './passwordPolicy.js';
import { generateTemporaryPassword } from './tempPassword.js';

describe('lista de contraseñas comunes', () => {
  it('tiene más de 1,000 entradas', () => {
    expect(COMMON_PASSWORDS.size).toBeGreaterThan(1000);
    expect(COMMON_PASSWORDS.has('password')).toBe(true);
    expect(COMMON_PASSWORDS.has('contrasena')).toBe(true);
  });
});

describe('longitud', () => {
  it('mínimo 10 para un usuario normal y 12 para ADMINISTRADOR y SUPERADMIN', () => {
    expect(minLengthFor('VENDEDOR')).toBe(10);
    expect(minLengthFor('ADMINISTRADOR')).toBe(12);
    expect(minLengthFor('SUPERADMIN')).toBe(12);
    expect(passwordProblem('tres cafes', { role: 'VENDEDOR' })).toBeNull(); // 10 exactos
    expect(passwordProblem('nueve caf', { role: 'VENDEDOR' })).toMatch(/10 caracteres/);
    expect(passwordProblem('once cafes!', { role: 'ADMINISTRADOR' })).toMatch(/12 caracteres/);
    expect(passwordProblem('doce cafes!!', { role: 'ADMINISTRADOR' })).toBeNull();
    expect(passwordProblem('Corta-12', { role: 'SUPERADMIN' })).toMatch(/12 caracteres/);
  });

  it('máximo 128', () => {
    const ok = 'a1B2c3D4e5'.repeat(13).slice(0, MAX_PASSWORD_LENGTH);
    expect(ok.length).toBe(128);
    expect(passwordProblem(ok)).toBeNull();
    expect(passwordProblem(ok + 'x')).toMatch(/128/);
  });

  it('ya no se exigen letras y números: una frase larga sirve', () => {
    expect(passwordProblem('caminando bajo la lluvia', { role: 'ADMINISTRADOR' })).toBeNull();
    expect(passwordProblem('4829103756')).toBeNull();
    expect(passwordProblem('soloLetrasPeroLargas')).toBeNull();
  });
});

describe('contraseñas comunes', () => {
  it('rechaza las comunes aunque lleven mayúsculas, símbolos o números al final o al principio', () => {
    expect(passwordProblem('Contrasena12345')).toMatch(/común/);
    expect(passwordProblem('2024contrasena!!')).toMatch(/común/);
    expect(passwordProblem('Administrador99')).toMatch(/común/);
    expect(passwordProblem('Dominicana-2025')).toMatch(/común/);
  });

  it('deshace las sustituciones de letras por números y símbolos (p4ssw0rd)', () => {
    expect(passwordProblem('P@ssw0rd2026!!')).toMatch(/común/);
    expect(passwordProblem('1l0v3y0u2024')).toMatch(/común/);
  });

  it('rechaza secuencias y repeticiones', () => {
    expect(passwordProblem('mnopqrstuv12')).toMatch(/secuencia/);
    expect(passwordProblem('1234567890123')).toMatch(/común|secuencia/);
    expect(passwordProblem('aaaaaaaaaaa1')).toMatch(/repetitiva/);
    expect(passwordProblem('zzzzzzzzzzzz')).toMatch(/repetitiva/);
  });
});

describe('contexto: usuario, correo, empresa y «factos»', () => {
  it('no puede contener el usuario ni la parte local del correo', () => {
    expect(passwordProblem('jflores-2024-ok', { username: 'jflores' })).toMatch(/usuario/);
    expect(passwordProblem('maria.perez.2024', { email: 'maria.perez@correo.com' })).toMatch(/correo/);
    expect(passwordProblem('Otra clave segura 5', { username: 'jflores', email: 'maria@x.com' })).toBeNull();
  });

  it('no puede contener el nombre de la empresa ni una de sus palabras', () => {
    const ctx = { companyName: 'Colmado San Judas' };
    expect(passwordProblem('colmado san judas 2026', ctx)).toMatch(/empresa/);
    expect(passwordProblem('mi-judas-querido-77', ctx)).toMatch(/empresa/);
    expect(passwordProblem('Pan con mantequilla 8', ctx)).toBeNull();
  });

  it('no puede contener «factos»', () => {
    expect(passwordProblem('Mi-FACTOS-favorito-9')).toMatch(/factos/i);
  });
});

describe('medidor de fuerza', () => {
  it('es 0 vacío, bajo si no cumple y alto con frases largas', () => {
    expect(passwordStrength('')).toBe(0);
    expect(passwordStrength('password')).toBeLessThanOrEqual(1);
    expect(passwordStrength('caminando bajo la lluvia 77')).toBeGreaterThanOrEqual(3);
  });
});

describe('passwordSchema (zod)', () => {
  it('valida con la política básica y devuelve el motivo', () => {
    expect(passwordSchema.safeParse('caminando bajo la lluvia').success).toBe(true);
    const bad = passwordSchema.safeParse('corta');
    expect(bad.success).toBe(false);
    expect(bad.error.issues[0].message).toMatch(/10 caracteres/);
  });
});

describe('clave temporal generada por el servidor', () => {
  it('14 caracteres, legible y siempre válida para un administrador', () => {
    for (let i = 0; i < 200; i++) {
      const password = generateTemporaryPassword({ username: 'maria', companyName: 'Colmado Pedro' });
      expect(password).toMatch(/^[A-HJ-NP-Za-km-z2-9]{4}-[A-HJ-NP-Za-km-z2-9]{4}-[A-HJ-NP-Za-km-z2-9]{4}$/);
      expect(password.length).toBe(14);
      expect(passwordProblem(password, { role: 'ADMINISTRADOR', username: 'maria', companyName: 'Colmado Pedro' })).toBeNull();
    }
  });

  it('no se repite', () => {
    const set = new Set(Array.from({ length: 500 }, () => generateTemporaryPassword()));
    expect(set.size).toBe(500);
  });
});
