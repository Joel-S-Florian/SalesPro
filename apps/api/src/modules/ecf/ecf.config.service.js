import { prisma, basePrisma } from '../../config/db.js';
import { getTenantId } from '../../config/tenant.js';
import { AppError } from '../../shared/exceptions/AppError.js';
import { encryptSecret, isSecretBoxConfigured } from '../../shared/utils/secretBox.js';
import { daysUntil, parsePkcs12 } from './ecf.certificate.js';
import { ECF_TYPES, ECF_TYPE_CODES, ENVIRONMENT_PATH, RECEIVER_PATHS } from './ecf.constants.js';
import { DgiiHttpError } from './ecf.dgii.client.js';
import { forgetCredentials, tokenManager } from './ecf.token.service.js';

const MAX_CERTIFICATE_BYTES = 200 * 1024;
const FISCAL_FIELDS = ['legalName', 'tradeName', 'address', 'municipalityCode', 'provinceCode', 'economicActivity'];

const clean = value => {
  if (value === undefined) return undefined;
  const text = String(value ?? '').trim();
  return text === '' ? null : text;
};

async function companyOf(companyId) {
  return basePrisma.company.findUnique({ where: { id: companyId }, select: { id: true, name: true, rnc: true, address: true } });
}

/** Direcciones que cada empresa registra ante la DGII (host propio de FACTOS + ruta estándar). */
export function receiverUrls(rnc) {
  const base = (process.env.PUBLIC_API_URL || `http://localhost:${process.env.PORT || 4010}`).replace(/\/+$/, '');
  const root = `${base}/api/ecf-receptor/${String(rnc || '').replace(/\D/g, '')}`;
  return {
    reception: `${root}${RECEIVER_PATHS.reception}`,
    commercialApproval: `${root}${RECEIVER_PATHS.commercialApproval}`,
    authentication: `${root}${RECEIVER_PATHS.seed}`,
    isPublic: !/localhost|127\.0\.0\.1/.test(base),
  };
}

/** Vista de la configuración sin ningún secreto. */
function toPublic(config, company) {
  const usingSimulator = Boolean(process.env.ECF_BASE_URL_OVERRIDE);
  return {
    mode: config?.mode || 'OFF',
    legalName: config?.legalName ?? company.name ?? '',
    tradeName: config?.tradeName ?? '',
    address: config?.address ?? company.address ?? '',
    municipalityCode: config?.municipalityCode ?? '',
    provinceCode: config?.provinceCode ?? '',
    economicActivity: config?.economicActivity ?? '',
    rnc: company.rnc || '',
    certificate: config?.certificateEnc
      ? {
          loaded: true,
          subject: config.certSubject,
          issuer: config.certIssuer,
          serial: config.certSerial,
          fingerprint: config.certFingerprint,
          notBefore: config.certNotBefore,
          notAfter: config.certNotAfter,
          daysLeft: config.certNotAfter ? daysUntil(config.certNotAfter) : null,
          rncMatch: config.certRncMatch,
        }
      : { loaded: false },
    connection: {
      checkedAt: config?.lastConnectionAt ?? null,
      ok: config?.lastConnectionOk ?? null,
      note: config?.lastConnectionNote ?? null,
      token: tokenManager.status(company.id),
    },
    receiverUrls: receiverUrls(company.rnc),
    environment: { usingSimulator, path: ENVIRONMENT_PATH[config?.mode] || null },
    encryptionReady: isSecretBoxConfigured(),
    types: ECF_TYPES,
  };
}

export async function getConfig() {
  const companyId = getTenantId();
  const [config, company] = await Promise.all([prisma.ecfConfig.findFirst(), companyOf(companyId)]);
  return toPublic(config, company);
}

/** Datos fiscales y modo de operación. */
export async function updateConfig(data) {
  const companyId = getTenantId();
  const [current, company] = await Promise.all([prisma.ecfConfig.findFirst(), companyOf(companyId)]);

  const patch = {};
  for (const field of FISCAL_FIELDS) {
    const value = clean(data[field]);
    if (value !== undefined) patch[field] = value;
  }

  if (data.mode !== undefined && data.mode !== (current?.mode || 'OFF')) {
    if (data.mode !== 'OFF') {
      if (!current?.certificateEnc) throw AppError.badRequest('Cargue primero el certificado digital de la empresa');
      if (current.certNotAfter && current.certNotAfter < new Date()) throw AppError.badRequest('El certificado digital está vencido');
      if (!company.rnc) throw AppError.badRequest('La empresa necesita un RNC para facturar electrónicamente');
      if (!(patch.legalName ?? current.legalName ?? company.name)) throw AppError.badRequest('Indique la razón social');
    }
    if (data.mode === 'PROD') {
      if (process.env.ECF_BASE_URL_OVERRIDE) {
        throw AppError.badRequest('El sistema apunta a un simulador de la DGII (ECF_BASE_URL_OVERRIDE): no se puede activar Producción');
      }
      if (current.certRncMatch === false) {
        throw AppError.badRequest('El certificado no corresponde al RNC de la empresa: la DGII lo rechazará');
      }
    }
    patch.mode = data.mode;
  }

  const saved = await prisma.ecfConfig.upsert({
    where: { companyId },
    update: patch,
    create: { companyId, ...patch },
  });
  if (patch.mode !== undefined) {
    tokenManager.invalidate(companyId);
    forgetCredentials(companyId);
  }
  return toPublic(saved, company);
}

/** Guarda el certificado .p12 (cifrado) tras comprobar contraseña, vigencia y titular. */
export async function uploadCertificate({ fileBase64, password }) {
  const companyId = getTenantId();
  if (!isSecretBoxConfigured()) {
    throw AppError.internal('El servidor no tiene configurada la llave de cifrado (ECF_MASTER_KEY); no se puede guardar el certificado');
  }

  const file = Buffer.from(String(fileBase64 || ''), 'base64');
  if (!file.length) throw AppError.badRequest('Seleccione el archivo del certificado (.p12)');
  if (file.length > MAX_CERTIFICATE_BYTES) throw AppError.badRequest('El archivo es demasiado grande para ser un certificado');

  const company = await companyOf(companyId);
  let parsed;
  try {
    parsed = parsePkcs12(file, password, company.rnc);
  } catch (error) {
    throw AppError.badRequest(error.message);
  }
  const { info } = parsed;
  if (info.expired) throw AppError.badRequest(`El certificado venció el ${info.notAfter.toLocaleDateString('es-DO')}`);
  if (info.notYetValid) throw AppError.badRequest('El certificado todavía no está vigente');

  const data = {
    certificateEnc: encryptSecret(file),
    certificatePassEnc: encryptSecret(password),
    certSubject: info.subject,
    certIssuer: info.issuer,
    certSerial: info.serial,
    certFingerprint: info.fingerprint,
    certNotBefore: info.notBefore,
    certNotAfter: info.notAfter,
    certRncMatch: info.rncMatch,
    lastConnectionAt: null,
    lastConnectionOk: null,
    lastConnectionNote: null,
  };
  const saved = await prisma.ecfConfig.upsert({ where: { companyId }, update: data, create: { companyId, ...data } });
  tokenManager.invalidate(companyId);
  forgetCredentials(companyId);
  return { config: toPublic(saved, company), warning: info.rncMatch === false ? 'El titular del certificado no parece corresponder al RNC de la empresa' : null };
}

export async function removeCertificate() {
  const companyId = getTenantId();
  const company = await companyOf(companyId);
  const current = await prisma.ecfConfig.findFirst();
  if (!current) return toPublic(null, company);
  const saved = await prisma.ecfConfig.update({
    where: { companyId },
    data: {
      mode: 'OFF',
      certificateEnc: null,
      certificatePassEnc: null,
      certSubject: null,
      certIssuer: null,
      certSerial: null,
      certFingerprint: null,
      certNotBefore: null,
      certNotAfter: null,
      certRncMatch: null,
      lastConnectionAt: null,
      lastConnectionOk: null,
      lastConnectionNote: null,
    },
  });
  tokenManager.invalidate(companyId);
  forgetCredentials(companyId);
  return toPublic(saved, company);
}

/** Pide un token a la DGII (o al simulador) para comprobar que certificado y conexión funcionan. */
export async function testConnection() {
  const companyId = getTenantId();
  const current = await prisma.ecfConfig.findFirst();
  if (!current?.certificateEnc) throw AppError.badRequest('Cargue primero el certificado digital');

  // Para probar basta que haya un ambiente; con el modo apagado se usa pre-certificación
  let ok = false;
  let note;
  let expiresAt = null;
  try {
    if (current.mode === 'OFF') {
      await prisma.ecfConfig.update({ where: { companyId }, data: { mode: 'PRECERT' } });
    }
    forgetCredentials(companyId);
    await tokenManager.getToken(companyId, { force: true });
    const status = tokenManager.status(companyId);
    ok = true;
    expiresAt = status.expiresAt;
    note = 'Conexión correcta: la DGII entregó un token';
  } catch (error) {
    note = error instanceof DgiiHttpError ? error.message : `No se pudo obtener el token: ${error.message}`;
  } finally {
    // Si probamos con el modo apagado, se restaura (la prueba no activa la facturación)
    if (current.mode === 'OFF') {
      await prisma.ecfConfig.update({ where: { companyId }, data: { mode: 'OFF' } });
      tokenManager.invalidate(companyId);
      forgetCredentials(companyId);
    }
  }
  await prisma.ecfConfig.update({ where: { companyId }, data: { lastConnectionAt: new Date(), lastConnectionOk: ok, lastConnectionNote: note } });
  return { ok, note, expiresAt, usingSimulator: Boolean(process.env.ECF_BASE_URL_OVERRIDE), environment: ENVIRONMENT_PATH[current.mode === 'OFF' ? 'PRECERT' : current.mode] };
}

/* ---------------------------------------------------------------------------------------------- */
/* Secuencias de e-NCF autorizadas por la DGII                                                      */
/* ---------------------------------------------------------------------------------------------- */

const present = seq => ({
  id: seq.id,
  ecfType: seq.ecfType,
  rangeFrom: seq.rangeFrom,
  rangeTo: seq.rangeTo,
  current: seq.current,
  remaining: Math.max(0, seq.rangeTo - Math.max(seq.current, seq.rangeFrom - 1)),
  validUntil: seq.validUntil,
  expired: Boolean(seq.validUntil && seq.validUntil < new Date()),
  active: seq.active,
});

export async function listSequences() {
  const rows = await prisma.ecfSequence.findMany({ orderBy: [{ ecfType: 'asc' }, { rangeFrom: 'asc' }] });
  return rows.map(present);
}

function assertRange({ ecfType, rangeFrom, rangeTo }) {
  if (!ECF_TYPE_CODES.includes(ecfType)) throw AppError.badRequest('Tipo de comprobante no válido');
  if (!Number.isInteger(rangeFrom) || !Number.isInteger(rangeTo) || rangeFrom < 1 || rangeTo < rangeFrom) {
    throw AppError.badRequest('El rango autorizado no es válido (desde debe ser 1 o más y no mayor que hasta)');
  }
  if (rangeTo > 9999999999) throw AppError.badRequest('El número máximo de un e-NCF es 9,999,999,999');
}

export async function createSequence({ ecfType, rangeFrom, rangeTo, validUntil }) {
  assertRange({ ecfType, rangeFrom, rangeTo });
  const overlapping = await prisma.ecfSequence.findFirst({ where: { ecfType, rangeFrom: { lte: rangeTo }, rangeTo: { gte: rangeFrom } } });
  if (overlapping) throw AppError.conflict(`El rango se cruza con otro ya registrado (${overlapping.rangeFrom} a ${overlapping.rangeTo})`);
  const created = await prisma.ecfSequence.create({
    data: { ecfType, rangeFrom, rangeTo, current: rangeFrom - 1, validUntil: validUntil ? new Date(validUntil) : null },
  });
  return present(created);
}

export async function updateSequence(id, { active, validUntil, rangeTo }) {
  const current = await prisma.ecfSequence.findUnique({ where: { id } });
  if (!current) throw AppError.notFound('Rango no encontrado');
  const data = {};
  if (active !== undefined) data.active = active;
  if (validUntil !== undefined) data.validUntil = validUntil ? new Date(validUntil) : null;
  if (rangeTo !== undefined) {
    if (!Number.isInteger(rangeTo) || rangeTo < current.current) throw AppError.badRequest('El nuevo límite no puede ser menor que el último número usado');
    data.rangeTo = rangeTo;
  }
  return present(await prisma.ecfSequence.update({ where: { id }, data }));
}

export async function deleteSequence(id) {
  const current = await prisma.ecfSequence.findUnique({ where: { id } });
  if (!current) throw AppError.notFound('Rango no encontrado');
  if (current.current >= current.rangeFrom) throw AppError.conflict('El rango ya se usó y no se puede eliminar; desactívelo');
  await prisma.ecfSequence.delete({ where: { id } });
  return { deleted: true };
}
