import { DOMParser } from '@xmldom/xmldom';

/** Utilidades para leer los XML de la DGII y de otros emisores. */

/** Lee el XML de una petición multipart (campo `xml`) o de un cuerpo XML directo. Requiere `express.raw` antes. */
export async function readXmlFromRequest(req) {
  const contentType = req.headers['content-type'] || '';
  if (!Buffer.isBuffer(req.body) || !req.body.length) return null;
  if (contentType.includes('multipart/form-data')) {
    const form = await new Response(req.body, { headers: { 'content-type': contentType } }).formData();
    const file = form.get('xml');
    return file && typeof file !== 'string' ? await file.text() : typeof file === 'string' ? file : null;
  }
  return req.body.toString('utf8');
}

/** Primer texto de una etiqueta (cualquier nivel), o '' si no existe. */
export function textOf(doc, tagName) {
  const node = doc.getElementsByTagName(tagName)[0];
  return node ? node.textContent.trim() : '';
}

export function parseXml(xml) {
  return new DOMParser({ onError: () => {} }).parseFromString(String(xml || ''), 'text/xml');
}

/** Datos de cabecera de un e-CF recibido. */
export function readEcfHeader(xml) {
  const doc = parseXml(xml);
  const root = doc.documentElement?.tagName;
  return {
    root,
    typeNumber: textOf(doc, 'TipoeCF'),
    eNcf: textOf(doc, 'eNCF'),
    rncEmisor: textOf(doc, 'RNCEmisor'),
    razonSocialEmisor: textOf(doc, 'RazonSocialEmisor'),
    rncComprador: textOf(doc, 'RNCComprador'),
    issueDate: textOf(doc, 'FechaEmision'),
    total: Number(textOf(doc, 'MontoTotal')) || 0,
  };
}

/** Datos de un acuse de recibo (ARECF). */
export function readArecf(xml) {
  const doc = parseXml(xml);
  return {
    rncEmisor: textOf(doc, 'RNCEmisor'),
    rncComprador: textOf(doc, 'RNCComprador'),
    eNcf: textOf(doc, 'eNCF'),
    status: Number(textOf(doc, 'Estado')),
    reasonCode: Number(textOf(doc, 'CodigoMotivoNoRecibido')) || null,
  };
}

/** Datos de una aprobación comercial (ACECF). */
export function readAcecf(xml) {
  const doc = parseXml(xml);
  return {
    rncEmisor: textOf(doc, 'RNCEmisor'),
    rncComprador: textOf(doc, 'RNCComprador'),
    eNcf: textOf(doc, 'eNCF'),
    status: Number(textOf(doc, 'Estado')), // 1 = aprobada, 2 = rechazada
    reason: textOf(doc, 'DetalleMotivoRechazo'),
    total: Number(textOf(doc, 'MontoTotal')) || 0,
  };
}

/** Motivos por los que un e-CF recibido no se acepta (CodigoMotivoNoRecibido del ARECF). */
export const NOT_RECEIVED_REASON = {
  SPECIFICATION_ERROR: 1,
  SIGNATURE_ERROR: 2,
  DUPLICATE: 3,
  BUYER_MISMATCH: 4,
};
