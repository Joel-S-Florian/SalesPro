import http from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { generateTestPkcs12, parsePkcs12 } from './ecf.certificate.js';
import { DgiiHttpError, dgiiClient } from './ecf.dgii.client.js';
import { signXml } from './ecf.signer.js';
import { createTokenManager } from './ecf.token.service.js';
import { createDgiiSimulator } from './sim/dgii-simulator.js';

describe('token de la DGII contra el simulador', () => {
  let server;
  let sim;
  let creds;
  let clock;
  let manager;
  const previousOverride = process.env.ECF_BASE_URL_OVERRIDE;

  beforeAll(async () => {
    const { p12, password } = generateTestPkcs12();
    creds = { ...parsePkcs12(p12, password), mode: 'PRECERT' };
    sim = createDgiiSimulator();
    server = http.createServer(sim.app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    process.env.ECF_BASE_URL_OVERRIDE = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(async () => {
    process.env.ECF_BASE_URL_OVERRIDE = previousOverride ?? '';
    if (!previousOverride) delete process.env.ECF_BASE_URL_OVERRIDE;
    await new Promise(resolve => server.close(resolve));
  });

  beforeEach(() => {
    sim.state.issuedTokens = 0;
    sim.state.failures.clear();
    clock = Date.now();
    manager = createTokenManager({ loadCredentials: async () => creds, now: () => clock });
  });

  it('pide la semilla, la firma y obtiene un token JWT', async () => {
    const token = await manager.getToken('empresa-1');
    expect(token.split('.')).toHaveLength(3);
    expect(sim.state.issuedTokens).toBe(1);
    expect(manager.status('empresa-1').connected).toBe(true);
  });

  it('reutiliza el token mientras está vigente', async () => {
    const first = await manager.getToken('empresa-1');
    expect(await manager.getToken('empresa-1')).toBe(first);
    expect(sim.state.issuedTokens).toBe(1);
  });

  it('varias peticiones simultáneas comparten una sola solicitud', async () => {
    const tokens = await Promise.all(Array.from({ length: 6 }, () => manager.getToken('empresa-1')));
    expect(new Set(tokens).size).toBe(1);
    expect(sim.state.issuedTokens).toBe(1);
  });

  it('cada empresa tiene su propio token', async () => {
    const [a, b] = await Promise.all([manager.getToken('empresa-1'), manager.getToken('empresa-2')]);
    expect(a).not.toBe(b);
    expect(sim.state.issuedTokens).toBe(2);
  });

  it('renueva el token antes de que venza (margen de 5 minutos)', async () => {
    const first = await manager.getToken('empresa-1');
    clock += 54 * 60 * 1000; // faltan 6 min: todavía sirve
    expect(await manager.getToken('empresa-1')).toBe(first);
    clock += 2 * 60 * 1000; // faltan 4 min: se renueva
    const renewed = await manager.getToken('empresa-1');
    expect(renewed).not.toBe(first);
    expect(sim.state.issuedTokens).toBe(2);
  });

  it('si la DGII responde 401 renueva el token y reintenta una vez', async () => {
    await manager.getToken('empresa-1');
    sim.revokeAllTokens();
    let calls = 0;
    const result = await manager.withToken('empresa-1', async token => {
      calls += 1;
      return dgiiClient.authed(token, `${process.env.ECF_BASE_URL_OVERRIDE}/testecf/consultadirectorio/api/consultas/listado`);
    });
    expect(calls).toBe(2);
    expect(result.json).toHaveLength(2);
    expect(sim.state.issuedTokens).toBe(2);
  });

  it('un error distinto de 401 no se reintenta', async () => {
    let calls = 0;
    await expect(
      manager.withToken('empresa-1', async () => {
        calls += 1;
        throw new DgiiHttpError('falló', { status: 500 });
      })
    ).rejects.toThrow('falló');
    expect(calls).toBe(1);
  });

  it('la DGII caída (503) se informa con el estado', async () => {
    sim.failNext('autenticacion', 503, 1);
    await expect(manager.getToken('empresa-1')).rejects.toMatchObject({ status: 503 });
    // y al volver el servicio, funciona
    expect(await manager.getToken('empresa-1')).toBeTruthy();
  });

  it('sin conexión da un mensaje claro', async () => {
    const saved = process.env.ECF_BASE_URL_OVERRIDE;
    process.env.ECF_BASE_URL_OVERRIDE = 'http://127.0.0.1:1';
    await expect(manager.getToken('empresa-1')).rejects.toThrow(/No se pudo conectar con la DGII/);
    process.env.ECF_BASE_URL_OVERRIDE = saved;
  });

  it('el simulador rechaza semillas alteradas, sin firmar o ya usadas', async () => {
    const seed = await dgiiClient.getSeed('PRECERT');
    const signed = signXml(seed, creds);

    await expect(dgiiClient.validateSeed('PRECERT', signed.replace(/<valor>.{3}/, '<valor>AAA'))).rejects.toMatchObject({ status: 400 });
    await expect(dgiiClient.validateSeed('PRECERT', seed)).rejects.toMatchObject({ status: 400 });
    expect((await dgiiClient.validateSeed('PRECERT', signed)).token).toBeTruthy();
    await expect(dgiiClient.validateSeed('PRECERT', signed)).rejects.toMatchObject({ status: 400 }); // reutilizada
  });

  it('el directorio exige token', async () => {
    await expect(dgiiClient.authed('token-falso', `${process.env.ECF_BASE_URL_OVERRIDE}/testecf/consultadirectorio/api/consultas/listado`)).rejects.toMatchObject({ status: 401 });
  });
});
