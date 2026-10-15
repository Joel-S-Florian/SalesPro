import forge from 'node-forge';

/**
 * Lectura de certificados digitales PKCS#12 (.p12 / .pfx) y utilidades de prueba.
 * Funciones puras: no tocan la base de datos ni guardan nada.
 */

const toBinary = input => (Buffer.isBuffer(input) ? input.toString('binary') : forge.util.decode64(String(input)));
const digits = value => String(value || '').replace(/\D/g, '');

function certFingerprint(cert) {
  const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
  const md = forge.md.sha256.create();
  md.update(der);
  return md.digest().toHex().toUpperCase();
}

const attributesOf = entity => entity.attributes.map(a => ({ name: a.shortName || a.name || a.type, value: String(a.value) }));
const describe = attrs => attrs.map(a => `${a.name}=${a.value}`).join(', ');

/**
 * Abre un .p12 y devuelve la llave privada, el certificado (PEM) y sus datos.
 * @param {Buffer|string} p12 - Contenido del archivo (Buffer o base64)
 * @param {string} password - Contraseña del archivo
 * @param {string} [companyRnc] - RNC de la empresa, para comprobar que el certificado le pertenece
 * @throws {Error} con mensaje en español si la contraseña es incorrecta o el archivo no es válido
 */
export function parsePkcs12(p12, password, companyRnc) {
  let pkcs12;
  try {
    const asn1 = forge.asn1.fromDer(toBinary(p12));
    pkcs12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, password || '');
  } catch (error) {
    if (/Invalid password|MAC could not be verified|PKCS#12 MAC/i.test(error.message)) {
      throw new Error('La contraseña del certificado es incorrecta');
    }
    throw new Error('El archivo no es un certificado .p12 válido');
  }

  const keyBags = [
    ...(pkcs12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] || []),
    ...(pkcs12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] || []),
  ];
  const certBags = pkcs12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || [];
  const privateKey = keyBags[0]?.key;
  if (!privateKey) throw new Error('El archivo no contiene una llave privada');

  // El certificado del titular es el que corresponde a la llave privada (el resto es la cadena de confianza)
  const own = certBags.map(b => b.cert).find(c => c?.publicKey?.n && c.publicKey.n.equals(privateKey.n));
  if (!own) throw new Error('El archivo no contiene el certificado que corresponde a la llave privada');

  const subject = attributesOf(own.subject);
  const issuer = attributesOf(own.issuer);
  const rnc = digits(companyRnc);
  // DGII exige que el titular del certificado (SN) sea el RNC/cédula; los campos varían según la entidad emisora
  const rncMatch = rnc ? subject.some(a => digits(a.value).includes(rnc)) : null;

  const now = new Date();
  return {
    privateKeyPem: forge.pki.privateKeyToPem(privateKey),
    certPem: forge.pki.certificateToPem(own),
    info: {
      subject: describe(subject),
      issuer: describe(issuer),
      serial: own.serialNumber,
      notBefore: own.validity.notBefore,
      notAfter: own.validity.notAfter,
      fingerprint: certFingerprint(own),
      rncMatch,
      expired: now > own.validity.notAfter,
      notYetValid: now < own.validity.notBefore,
    },
  };
}

/** Datos del certificado X.509 (PEM), p. ej. el que trae la firma de un e-CF recibido. */
export function certificateInfoFromPem(certPem) {
  const cert = forge.pki.certificateFromPem(certPem);
  const subject = attributesOf(cert.subject);
  return {
    subject: describe(subject),
    subjectDigits: subject.map(a => digits(a.value)).filter(Boolean),
    notBefore: cert.validity.notBefore,
    notAfter: cert.validity.notAfter,
    fingerprint: certFingerprint(cert),
  };
}

/** ¿El titular del certificado corresponde a este RNC o cédula? (la DGII exige que el SN sea el RNC del firmante) */
export function certificateMatchesRnc(certPem, rnc) {
  const wanted = digits(rnc);
  if (!wanted) return false;
  return certificateInfoFromPem(certPem).subjectDigits.some(value => value.includes(wanted));
}

/** Días que faltan para que venza el certificado (negativo si ya venció). */
export function daysUntil(date, now = new Date()) {
  return Math.floor((new Date(date).getTime() - now.getTime()) / 86400000);
}

/**
 * Genera un certificado autofirmado en .p12 SOLO PARA PRUEBAS (simulador y pruebas automáticas).
 * `withKey: false` genera un archivo sin llave privada (solo el certificado) para probar el rechazo.
 * @returns {{ p12: Buffer, password: string, certPem: string }}
 */
export function generateTestPkcs12({ rnc = '131880738', commonName = 'PRUEBA FACTOS', password = 'prueba123', algorithm = 'aes256', validDays = 365, notBeforeDays = -1, withKey = true } = {}) {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01' + forge.util.bytesToHex(forge.random.getBytesSync(8));
  // notBeforeDays: cuándo empieza a valer (negativo = en el pasado); validDays: cuándo vence, contado desde HOY (negativo = ya venció)
  cert.validity.notBefore = new Date(Date.now() + notBeforeDays * 86400000);
  cert.validity.notAfter = new Date(Date.now() + validDays * 86400000);
  const attrs = [
    { name: 'commonName', value: commonName },
    { name: 'serialNumber', value: `RNC${rnc}` },
    { name: 'organizationName', value: 'FACTOS (certificado de prueba)' },
    { name: 'countryName', value: 'DO' },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());

  const asn1 = forge.pkcs12.toPkcs12Asn1(withKey ? keys.privateKey : null, [cert], password, { algorithm, generateLocalKeyId: true, friendlyName: 'factos-test' });
  return {
    p12: Buffer.from(forge.asn1.toDer(asn1).getBytes(), 'binary'),
    password,
    certPem: forge.pki.certificateToPem(cert),
  };
}

/**
 * Escenarios de certificados de PRUEBA para ensayar la carga en pantalla (los usa `scripts/gen-test-cert.mjs`
 * y `scripts/test-ecf-certificate.mjs`). `expect`: 'ok', 'warning' (se guarda pero avisa) o 'error' (se rechaza, con `message`).
 */
export const TEST_CERT_SCENARIOS = [
  { id: 'valido-aes', file: '1-valido.p12', description: 'Certificado correcto (cifrado AES-256), titular = RNC de la empresa', options: {}, expect: 'ok' },
  { id: 'valido-3des', file: '2-valido-3des.p12', description: 'Correcto, con el cifrado antiguo 3DES que usan algunas entidades', options: { algorithm: '3des' }, expect: 'ok' },
  { id: 'por-vencer', file: '3-por-vencer.p12', description: 'Correcto pero vence en 20 días', options: { validDays: 20 }, expect: 'ok' },
  { id: 'otro-rnc', file: '4-otro-rnc.p12', description: 'Titular con OTRO RNC (101672919): se guarda pero muestra la advertencia', options: { rnc: '101672919' }, expect: 'warning', message: /no parece corresponder/ },
  { id: 'vencido', file: '5-vencido.p12', description: 'Venció hace 35 días: se rechaza', options: { notBeforeDays: -400, validDays: -35 }, expect: 'error', message: /venció/ },
  { id: 'no-vigente', file: '6-no-vigente.p12', description: 'Empieza a valer dentro de 10 días: se rechaza', options: { notBeforeDays: 10 }, expect: 'error', message: /todavía no está vigente/ },
  { id: 'sin-llave', file: '7-sin-llave.p12', description: 'Trae el certificado pero no la llave privada: se rechaza', options: { withKey: false }, expect: 'error', message: /llave privada/ },
];

/** Contraseña de todos los archivos de prueba. */
export const TEST_CERT_PASSWORD = 'prueba123';
