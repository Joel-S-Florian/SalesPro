import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { decryptSecret, decryptSecretToString, encryptSecret, generateMasterKey } from '../../shared/utils/secretBox.js';
import { daysUntil, generateTestPkcs12, parsePkcs12 } from './ecf.certificate.js';
import { compactXml, extractSignatureValue, securityCodeOf, signXml, verifySignedXml } from './ecf.signer.js';
import { dgiiServiceUrl } from './ecf.constants.js';
import { assertSafeTarget } from './ecf.safety.js';

describe('secretBox (AES-256-GCM)', () => {
  const key = generateMasterKey();

  it('cifra y descifra texto y binarios', () => {
    expect(decryptSecretToString(encryptSecret('contraseña ñ 123', key), key)).toBe('contraseña ñ 123');
    const bytes = Buffer.from([0, 1, 2, 250, 255]);
    expect(decryptSecret(encryptSecret(bytes, key), key).equals(bytes)).toBe(true);
  });

  it('el mismo texto cifra distinto cada vez (IV aleatorio)', () => {
    expect(encryptSecret('x', key)).not.toBe(encryptSecret('x', key));
  });

  it('falla con otra llave o si el dato fue alterado', () => {
    const token = encryptSecret('secreto', key);
    expect(() => decryptSecret(token, generateMasterKey())).toThrow(/No se pudo descifrar/);
    const [v, iv, tag, data] = token.split('.');
    const tampered = [v, iv, tag, Buffer.from('otro').toString('base64')].join('.');
    expect(() => decryptSecret(tampered, key)).toThrow(/No se pudo descifrar/);
  });

  it('rechaza una llave que no mide 32 bytes y formatos desconocidos', () => {
    expect(() => encryptSecret('x', Buffer.from('corta').toString('base64'))).toThrow(/32 bytes/);
    expect(() => decryptSecret('basura', key)).toThrow(/formato desconocido/);
  });
});

describe('certificado .p12', () => {
  it.each(['aes256', '3des'])('abre un .p12 (%s) y lee sus datos', algorithm => {
    const { p12, password } = generateTestPkcs12({ rnc: '131880738', algorithm });
    const { privateKeyPem, certPem, info } = parsePkcs12(p12, password, '131-88073-8');
    expect(privateKeyPem).toContain('PRIVATE KEY');
    expect(certPem).toContain('BEGIN CERTIFICATE');
    expect(info.rncMatch).toBe(true);
    expect(info.expired).toBe(false);
    expect(info.fingerprint).toMatch(/^[0-9A-F]{64}$/);
    expect(daysUntil(info.notAfter)).toBeGreaterThan(300);
  });

  it('acepta el archivo en base64', () => {
    const { p12, password } = generateTestPkcs12();
    expect(parsePkcs12(p12.toString('base64'), password).info.subject).toContain('PRUEBA FACTOS');
  });

  it('avisa si el certificado es de otro RNC', () => {
    const { p12, password } = generateTestPkcs12({ rnc: '131880738' });
    expect(parsePkcs12(p12, password, '101672919').info.rncMatch).toBe(false);
  });

  it('contraseña incorrecta y archivo inválido dan mensajes claros', () => {
    const { p12 } = generateTestPkcs12();
    expect(() => parsePkcs12(p12, 'mala')).toThrow(/contraseña/);
    expect(() => parsePkcs12(Buffer.from('no soy un p12'), 'x')).toThrow(/no es un certificado/);
  });
});

describe('firma XML-DSig', () => {
  let creds;
  const xml = '<ECF>\n  <Encabezado>\n    <eNCF>E310000000001</eNCF>\n  </Encabezado>\n</ECF>';

  beforeAll(() => {
    const { p12, password } = generateTestPkcs12();
    creds = parsePkcs12(p12, password);
  });

  it('compacta espacios entre etiquetas', () => {
    expect(compactXml(xml)).toBe('<ECF><Encabezado><eNCF>E310000000001</eNCF></Encabezado></ECF>');
  });

  it('firma con el perfil de la DGII (URI vacía, RSA-SHA256, enveloped)', () => {
    const signed = signXml(xml, creds);
    expect(signed).toContain('<Reference URI=""');
    expect(signed).toContain('rsa-sha256');
    expect(signed).toContain('enveloped-signature');
    // la guía de la DGII usa una sola transformación en la referencia
    expect(signed.match(/<Transform /g)).toHaveLength(1);
    expect(signed).toContain('<X509Certificate>');
    expect(signed.indexOf('<Signature')).toBeGreaterThan(signed.indexOf('</Encabezado>'));
  });

  it('la firma verifica y detecta cualquier alteración', () => {
    const signed = signXml(xml, creds);
    expect(verifySignedXml(signed).valid).toBe(true);
    expect(verifySignedXml(signed.replace('E310000000001', 'E310000000002')).valid).toBe(false);
    expect(verifySignedXml(xml).valid).toBe(false);
  });

  it('el código de seguridad son los 6 primeros caracteres del SignatureValue', () => {
    const signed = signXml(xml, creds);
    const value = extractSignatureValue(signed);
    expect(value.length).toBeGreaterThan(100);
    expect(securityCodeOf(signed)).toBe(value.slice(0, 6));
    expect(securityCodeOf(signed)).toHaveLength(6);
  });

  it('firmar el mismo contenido da la misma firma (RSA PKCS#1 v1.5 es determinista)', () => {
    expect(securityCodeOf(signXml(xml, creds))).toBe(securityCodeOf(signXml(xml, creds)));
  });
});

describe('URLs de la DGII', () => {
  it('arma la URL por ambiente y servicio', () => {
    expect(dgiiServiceUrl('PRECERT', 'auth', { overrideBaseUrl: '' })).toBe('https://ecf.dgii.gov.do/testecf/autenticacion');
    expect(dgiiServiceUrl('CERT', 'reception', { overrideBaseUrl: '' })).toBe('https://ecf.dgii.gov.do/certecf/recepcion');
    expect(dgiiServiceUrl('PROD', 'rfceReception', { overrideBaseUrl: '' })).toBe('https://fc.dgii.gov.do/ecf/recepcionfc');
  });

  it('permite apuntar todo a un simulador', () => {
    expect(dgiiServiceUrl('PRECERT', 'auth', { overrideBaseUrl: 'http://localhost:4090/' })).toBe('http://localhost:4090/testecf/autenticacion');
    expect(dgiiServiceUrl('PRECERT', 'rfceReception', { overrideBaseUrl: 'http://localhost:4090' })).toBe('http://localhost:4090/testecf/recepcionfc');
  });

  it('rechaza modos sin ambiente', () => {
    expect(() => dgiiServiceUrl('OFF', 'auth', { overrideBaseUrl: '' })).toThrow();
  });
});

describe('assertSafeTarget (anti-SSRF)', () => {
  const saved = process.env.ECF_BASE_URL_OVERRIDE;
  beforeAll(() => { delete process.env.ECF_BASE_URL_OVERRIDE; });
  afterAll(() => { if (saved) process.env.ECF_BASE_URL_OVERRIDE = saved; });

  it('acepta HTTPS hacia hosts públicos', () => {
    expect(assertSafeTarget('https://ecf.empresa.do/fe/recepcion/api/ecf')).toContain('https://');
  });

  it.each([
    'http://ecf.empresa.do/x',
    'https://localhost/x',
    'https://127.0.0.1/x',
    'https://10.0.0.5/x',
    'https://192.168.1.10/x',
    'https://172.20.0.1/x',
    'https://169.254.169.254/latest',
    'https://[::1]/x',
    'no es una url',
  ])('rechaza %s', url => {
    expect(() => assertSafeTarget(url)).toThrow();
  });
});
