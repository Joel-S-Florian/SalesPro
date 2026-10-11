import crypto from 'node:crypto';
import express from 'express';
import jwt from 'jsonwebtoken';
import { buildArecfXml } from '../ecf.builder.js';
import { generateTestPkcs12, parsePkcs12 } from '../ecf.certificate.js';
import { signXml, verifySignedXml } from '../ecf.signer.js';
import { readAcecf, readEcfHeader } from '../ecf.xml.js';
import { validateAgainstXsd } from '../ecf.xsd.js';

/**
 * Simulador local de los servicios de la DGII, para desarrollar y probar sin certificado ni acceso real.
 * Imita las rutas, formatos y estados documentados en «Descripción Técnica Servicios DGII».
 *
 * Es una aproximación: valida firmas y estructura básica, pero NO reemplaza las pruebas de pre-certificación.
 * Uso: `node scripts/dgii-sim.mjs` y `ECF_BASE_URL_OVERRIDE=http://localhost:4090` en el API.
 */

const iso = date => new Date(date).toISOString().replace(/\.\d{3}Z$/, 'Z');

/** Lee el XML de una petición multipart (campo `xml`) o de un cuerpo XML directo. */
async function readXml(req) {
  const contentType = req.headers['content-type'] || '';
  if (contentType.includes('multipart/form-data')) {
    const form = await new Response(req.body, { headers: { 'content-type': contentType } }).formData();
    const file = form.get('xml');
    return file ? await file.text() : null;
  }
  return req.body?.length ? req.body.toString('utf8') : null;
}

/**
 * @param {Object} [options]
 * @param {number} [options.tokenTtlSeconds=3600] Duración del token (use pocos segundos para probar la renovación)
 * @param {string} [options.jwtSecret]
 * @param {number} [options.seedTtlMs=300000] Vida de una semilla sin usar
 * @param {number} [options.processingMs=300] Tiempo que un e-CF permanece «En proceso» antes de resolverse
 */
export function createDgiiSimulator({ tokenTtlSeconds = 3600, jwtSecret = 'dgii-sim-secret', seedTtlMs = 5 * 60 * 1000, processingMs = 300, publicUrl = 'http://localhost:4090' } = {}) {
  const state = {
    tokenTtlSeconds,
    seeds: new Map(), // valor -> { issuedAt, used }
    activeTokens: new Set(), // jti de los tokens vigentes (vaciarlo simula tokens anulados -> 401)
    issuedTokens: 0,
    requests: [], // { method, path, at }
    failures: new Map(), // clave de servicio -> { status, remaining }
    processingMs,
    documents: new Map(), // trackId -> { eNcf, rnc, xml, receivedAt, resolveAt, outcome, messages }
    receivedEncf: new Set(),
    summaries: [], // RFCE recibidos
    rejections: [], // próximos rechazos programados: { messages: string[] }
    voids: [], // anulaciones de rangos recibidas
    approvals: [], // aprobaciones comerciales recibidas por la «DGII»
    peer: { received: [], approvals: [], rejectReason: [], failures: 0 }, // otro contribuyente electrónico simulado
    directory: [
      { nombre: 'COMERCIAL ELECTRONICA SRL', rnc: '101010101', urlRecepcion: '', urlAceptacion: '', urlOpcional: '' },
      { nombre: 'FERRETERIA DEL CIBAO SRL', rnc: '131880738', urlRecepcion: 'https://ejemplo.invalid/fe/recepcion/api/ecf', urlAceptacion: 'https://ejemplo.invalid/fe/aprobacioncomercial/api/ecf', urlOpcional: '' },
    ],
  };

  /** Hace fallar las próximas `times` llamadas a un servicio con el estado indicado (p. ej. 503). */
  const failNext = (service, status = 503, times = 1) => state.failures.set(service, { status, remaining: times });
  const revokeAllTokens = () => state.activeTokens.clear();
  // «Otro contribuyente»: RNC 101010101, con su propio certificado (para firmar acuses de recibo)
  const peerCert = generateTestPkcs12({ rnc: '101010101', password: 'peer' });
  const peerCreds = parsePkcs12(peerCert.p12, peerCert.password);
  const PEER_RNC = '101010101';
  /** Cambia la dirección pública del simulador (los enlaces del directorio apuntan a ella). */
  const setPublicUrl = base => {
    const root = String(base).replace(/\/+$/, '');
    state.directory[0].urlRecepcion = `${root}/receptor-sim/fe/recepcion/api/ecf`;
    state.directory[0].urlAceptacion = `${root}/receptor-sim/fe/aprobacioncomercial/api/ecf`;
  };
  /** El próximo documento recibido será rechazado con estos mensajes. */
  const rejectNext = (...messages) => state.rejections.push({ messages: messages.length ? messages : ['Rechazo simulado'] });

  const app = express();
  app.use(express.raw({ type: () => true, limit: '10mb' }));
  app.use((req, _res, next) => {
    state.requests.push({ method: req.method, path: req.path, at: Date.now() });
    next();
  });

  /** Falla programada por servicio (clave = primer segmento de la ruta tras el ambiente). */
  app.use('/:amb/:service', (req, res, next) => {
    const planned = state.failures.get(req.params.service);
    if (planned && planned.remaining > 0) {
      planned.remaining -= 1;
      return res.status(planned.status).json({ mensaje: `Fallo simulado (${planned.status})` });
    }
    next();
  });

  /** Exige un token emitido por este simulador. */
  const requireToken = (req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.replace(/^bearer\s+/i, '');
    try {
      const payload = jwt.verify(token, jwtSecret, { issuer: 'DGII.FE' });
      if (!state.activeTokens.has(payload.jti)) throw new Error('revocado');
      req.dgiiUser = payload;
      next();
    } catch {
      res.status(401).json({ mensaje: 'Token inválido o vencido' });
    }
  };

  /* ---------------------------------- Autenticación ---------------------------------- */

  app.get('/:amb/autenticacion/api/autenticacion/semilla', (_req, res) => {
    const valor = crypto.randomBytes(48).toString('base64');
    state.seeds.set(valor, { issuedAt: Date.now(), used: false });
    res
      .type('application/xml')
      .send(
        `<?xml version="1.0" encoding="utf-8"?><SemillaModel xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><valor>${valor}</valor><fecha>${new Date().toISOString()}</fecha></SemillaModel>`
      );
  });

  app.post('/:amb/autenticacion/api/autenticacion/validarsemilla', async (req, res) => {
    const xml = await readXml(req);
    if (!xml) return res.status(400).json({ mensaje: 'Archivo no válido' });

    const verification = verifySignedXml(xml);
    if (!verification.valid) return res.status(400).json({ mensaje: 'La firma del documento no es válida' });

    const valor = /<valor>([^<]+)<\/valor>/.exec(xml)?.[1];
    const seed = valor && state.seeds.get(valor);
    if (!seed || seed.used || Date.now() - seed.issuedAt > seedTtlMs) {
      return res.status(400).json({ mensaje: 'La semilla no es válida, ya fue utilizada o está vencida' });
    }
    seed.used = true;

    const issuedAt = Date.now();
    const jti = crypto.randomUUID();
    const token = jwt.sign({ jti }, jwtSecret, { issuer: 'DGII.FE', audience: 'USUARIOS.DGII.FE', expiresIn: state.tokenTtlSeconds });
    state.issuedTokens += 1;
    state.activeTokens.add(jti);
    res.json({ token, expira: iso(issuedAt + state.tokenTtlSeconds * 1000), expedido: iso(issuedAt) });
  });

  /* ------------------------------------ Directorio ------------------------------------ */

  app.get('/:amb/consultadirectorio/api/consultas/listado', requireToken, (_req, res) => res.json(state.directory));

  app.get('/:amb/consultadirectorio/api/consultas/obtenerdirectorioporrnc', requireToken, (req, res) => {
    const rnc = String(req.query.RNC || req.query.rnc || '').replace(/\D/g, '');
    const entries = state.directory.filter(e => e.rnc === rnc);
    if (!entries.length) return res.status(404).json({ mensaje: 'El contribuyente no es emisor electrónico' });
    res.json(entries);
  });

  /* ----------------------------- Recepción de e-CF ----------------------------- */

  /** Valida firma, esquema y duplicados. Devuelve un error 400 o los datos del documento. */
  async function inspect(xml, expectedKind) {
    if (!xml) return { error: 'Archivo no válido' };
    if (!verifySignedXml(xml).valid) return { error: 'La firma del XML no es válida' };
    const type = /<TipoeCF>(\d+)<\/TipoeCF>/.exec(xml)?.[1];
    const schema = expectedKind === 'RFCE' ? 'RFCE' : `E${type}`;
    const check = await validateAgainstXsd(schema, xml);
    if (!check.valid) return { error: 'La estructura del archivo XML no es válida, favor verificar el XSD correspondiente', detail: check.errors.slice(0, 3) };
    const eNcf = /<eNCF>([^<]+)<\/eNCF>/.exec(xml)?.[1];
    const rnc = /<RNCEmisor>([^<]+)<\/RNCEmisor>/.exec(xml)?.[1];
    return { eNcf, rnc, type };
  }

  app.post('/:amb/recepcion/api/facturaselectronicas', requireToken, async (req, res) => {
    const xml = await readXml(req);
    const info = await inspect(xml, 'ECF');
    if (info.error) return res.status(400).json({ trackId: null, error: 'Rechazado', mensaje: info.error, mensajes: info.detail });
    if (info.type === '32' && Number(/<MontoTotal>([^<]+)<\/MontoTotal>/.exec(xml)?.[1]) < 250000) {
      return res.status(400).json({ trackId: null, error: 'Rechazado', mensaje: 'Las facturas de consumo menores de RD$250,000 se informan con su resumen (RFCE)' });
    }
    if (state.receivedEncf.has(`${info.rnc}${info.eNcf}`)) {
      return res.status(400).json({ trackId: null, error: 'Rechazado', mensaje: 'El e-NCF ya fue recibido anteriormente' });
    }
    state.receivedEncf.add(`${info.rnc}${info.eNcf}`);
    const trackId = crypto.randomUUID();
    const planned = state.rejections.shift();
    state.documents.set(trackId, {
      eNcf: info.eNcf,
      rnc: info.rnc,
      xml,
      receivedAt: Date.now(),
      resolveAt: Date.now() + state.processingMs,
      outcome: planned ? 'REJECTED' : 'ACCEPTED',
      messages: planned ? planned.messages : [],
    });
    res.json({ trackId, error: null, mensaje: null });
  });

  app.get('/:amb/consultaresultado/api/consultas/estado', requireToken, (req, res) => {
    const doc = state.documents.get(String(req.query.trackid || req.query.trackId || ''));
    if (!doc) return res.json({ trackId: req.query.trackid, codigo: 0, estado: 'No encontrado', rnc: null, eNCF: null, secuenciaUtilizada: false, fechaRecepcion: null, mensajes: [] });
    const resolved = Date.now() >= doc.resolveAt;
    const accepted = doc.outcome === 'ACCEPTED';
    res.json({
      trackId: req.query.trackid,
      codigo: !resolved ? 3 : accepted ? 1 : 2,
      estado: !resolved ? 'En Proceso' : accepted ? 'Aceptado' : 'Rechazado',
      rnc: doc.rnc,
      eNCF: doc.eNcf,
      secuenciaUtilizada: resolved && !accepted ? true : accepted,
      fechaRecepcion: new Date(doc.receivedAt).toISOString(),
      mensajes: resolved && !accepted ? doc.messages.map((valor, i) => ({ valor, codigo: i + 1 })) : [],
    });
  });

  app.post('/:amb/recepcionfc/api/recepcion/ecf', requireToken, async (req, res) => {
    const xml = await readXml(req);
    const info = await inspect(xml, 'RFCE');
    if (info.error) {
      return res.status(400).json({ codigo: 2, estado: 'Rechazado', mensajes: [{ codigo: '1', valor: info.error }], encf: null, secuenciaUtilizada: false });
    }
    const planned = state.rejections.shift();
    state.summaries.push({ eNcf: info.eNcf, rnc: info.rnc, xml, receivedAt: Date.now() });
    if (planned) {
      return res.json({ codigo: 2, estado: 'Rechazado', mensajes: planned.messages.map((valor, i) => ({ codigo: String(i + 1), valor })), encf: info.eNcf, secuenciaUtilizada: true });
    }
    res.json({ codigo: 1, estado: 'Aceptado', mensajes: [], encf: info.eNcf, secuenciaUtilizada: true });
  });

  /* ------------------------ Aprobación comercial recibida por la «DGII» ------------------------ */

  app.post('/:amb/aprobacioncomercial/api/aprobacioncomercial', requireToken, async (req, res) => {
    const xml = await readXml(req);
    if (!xml) return res.status(400).json({ mensaje: ['Archivo no válido'], estado: 'Aprobación comercial rechazada', codigo: '2' });
    const check = await validateAgainstXsd('ACECF', xml);
    if (!check.valid) return res.status(400).json({ mensaje: ['La estructura del archivo XML no es válida'], estado: 'Aprobación comercial rechazada', codigo: '2' });
    if (!verifySignedXml(xml).valid) return res.status(400).json({ mensaje: ['La firma del XML no es válida'], estado: 'Aprobación comercial rechazada', codigo: '2' });
    const approval = readAcecf(xml);
    state.approvals.push(approval);
    res.json({ mensaje: ['Aprobación comercial recibida'], estado: approval.status === 1 ? 'Aprobación comercial aprobada' : 'Aprobación comercial rechazada', codigo: String(approval.status) });
  });

  app.post('/:amb/anulacionrangos/api/operaciones/anularrango', requireToken, async (req, res) => {
    const xml = await readXml(req);
    const fail = mensaje => res.status(400).json({ rnc: null, codigo: '2', nombre: 'Rechazado', mensajes: [mensaje] });
    if (!xml) return fail('Tipo de archivo no valido, favor proveer un XML');
    if (!verifySignedXml(xml).valid) return fail('La firma del documento no es válida');
    const check = await validateAgainstXsd('ANECF', xml);
    if (!check.valid) return fail('La estructura del archivo XML no es válida');
    const rnc = /<RncEmisor>([^<]+)<\/RncEmisor>/.exec(xml)?.[1];
    state.voids.push({ rnc, xml, at: Date.now() });
    res.json({ rnc, codigo: '1', nombre: 'Secuencias anuladas', mensajes: ['Las secuencias fueron anuladas correctamente'] });
  });

  /* --------- Otro contribuyente electrónico (RNC 101010101): recibe e-CF y aprobaciones --------- */

  app.post('/receptor-sim/fe/recepcion/api/ecf', async (req, res) => {
    if (state.peer.failures > 0) {
      state.peer.failures -= 1;
      return res.status(503).json({ mensaje: 'Receptor no disponible (simulado)' });
    }
    const xml = await readXml(req);
    const header = readEcfHeader(xml || '');
    const reason = state.peer.rejectReason.shift();
    state.peer.received.push({ eNcf: header.eNcf, rncEmisor: header.rncEmisor, rncComprador: header.rncComprador, xml, at: Date.now() });
    const arecf = signXml(
      buildArecfXml({ rncEmisor: header.rncEmisor, rncComprador: PEER_RNC, eNcf: header.eNcf, received: !reason, reasonCode: reason }),
      peerCreds
    );
    res.type('application/xml').send(arecf);
  });

  app.post('/receptor-sim/fe/aprobacioncomercial/api/ecf', async (req, res) => {
    const xml = await readXml(req);
    state.peer.approvals.push({ approval: readAcecf(xml || ''), xml });
    res.status(200).json({ mensaje: ['Aprobación comercial recibida'] });
  });

  setPublicUrl(publicUrl);

  return { app, state, failNext, rejectNext, revokeAllTokens, requireToken, setPublicUrl, peer: { rnc: PEER_RNC, creds: peerCreds, failNext: (times = 1) => (state.peer.failures = times), rejectNext: (reasonCode = 1) => state.peer.rejectReason.push(reasonCode) } };
}
