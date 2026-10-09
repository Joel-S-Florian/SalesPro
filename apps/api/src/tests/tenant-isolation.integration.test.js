import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

// Requiere una API en ejecución: API_URL=http://localhost:3000/api npm test
describe.skipIf(!process.env.API_URL)('aislamiento multi-empresa (integración)', () => {
  it('pasa las 30 comprobaciones de scripts/test-tenant-isolation.mjs', () => {
    const result = spawnSync('node', ['scripts/test-tenant-isolation.mjs'], {
      cwd: root,
      env: process.env,
      encoding: 'utf8',
    });
    if (result.status !== 0) console.error(result.stdout, result.stderr);
    expect(result.stdout).toMatch(/0 fallidas/);
    expect(result.status).toBe(0);
  }, 180000);
});
