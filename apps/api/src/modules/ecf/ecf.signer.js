import { SignedXml } from 'xml-crypto';
import { DOMParser } from '@xmldom/xmldom';

/**
 * Firma digital XML-DSig de los documentos de la DGII (semilla, e-CF, RFCE, acuses, aprobaciones, anulaciones).
 *
 * Perfil exacto de la guía oficial «Firmado de e-CF» de la DGII: firma "enveloped" sobre todo el documento
 * (Reference URI=""), con UNA sola transformación (enveloped-signature), RSA-SHA256, digest SHA-256, canonicalización
 * C14N 1.0 en SignedInfo y el certificado X.509 en KeyInfo. La firma se agrega como último hijo de la raíz. Se firma sin
 * conservar espacios y el XML firmado no se altera nunca después (ni siquiera con saltos de línea).
 */
const C14N = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315';
const RSA_SHA256 = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256';
const SHA256 = 'http://www.w3.org/2001/04/xmlenc#sha256';
const ENVELOPED = 'http://www.w3.org/2000/09/xmldsig#enveloped-signature';
const DSIG_NS = 'http://www.w3.org/2000/09/xmldsig#';

/** Quita espacios entre etiquetas (preserveWhitespace = false) para que lo firmado sea exactamente lo enviado. */
export function compactXml(xml) {
  return String(xml).replace(/^\uFEFF/, '').replace(/>\s+</g, '><').trim();
}

/**
 * Firma un XML y lo devuelve firmado.
 * @param {string} xml
 * @param {{ privateKeyPem: string, certPem: string }} credentials
 */
export function signXml(xml, { privateKeyPem, certPem }) {
  const sig = new SignedXml({
    privateKey: privateKeyPem,
    publicCert: certPem,
    signatureAlgorithm: RSA_SHA256,
    canonicalizationAlgorithm: C14N,
    getKeyInfoContent: SignedXml.getKeyInfoContent,
  });
  sig.addReference({
    xpath: '/*',
    isEmptyUri: true,
    digestAlgorithm: SHA256,
    transforms: [ENVELOPED],
  });
  sig.computeSignature(compactXml(xml), { location: { reference: '/*', action: 'append' } });
  return sig.getSignedXml();
}

function parse(xml) {
  return new DOMParser({ onError: () => {} }).parseFromString(xml, 'text/xml');
}

/** Valor de `SignatureValue` (base64) de un XML firmado, o null. */
export function extractSignatureValue(signedXml) {
  const node = parse(signedXml).getElementsByTagNameNS(DSIG_NS, 'SignatureValue')[0];
  return node ? node.textContent.replace(/\s+/g, '') : null;
}

/**
 * Código de seguridad del e-CF: los primeros 6 caracteres del `SignatureValue`.
 * Va en la representación impresa (QR) y en el resumen de factura de consumo.
 */
export function securityCodeOf(signedXml) {
  const value = extractSignatureValue(signedXml);
  return value ? value.slice(0, 6) : null;
}

/** Certificado (PEM) incluido en el KeyInfo de un XML firmado, o null. */
export function extractCertificatePem(signedXml) {
  const node = parse(signedXml).getElementsByTagNameNS(DSIG_NS, 'X509Certificate')[0];
  if (!node) return null;
  const body = node.textContent.replace(/\s+/g, '');
  return `-----BEGIN CERTIFICATE-----\n${body.match(/.{1,64}/g).join('\n')}\n-----END CERTIFICATE-----\n`;
}

/**
 * Verifica la firma de un XML con el certificado que trae en KeyInfo.
 * Solo comprueba integridad y autoría del certificado incluido; la confianza en el emisor es asunto del llamador.
 * @returns {{ valid: boolean, certPem: string|null, error?: string }}
 */
export function verifySignedXml(signedXml) {
  try {
    const doc = parse(signedXml);
    const signature = doc.getElementsByTagNameNS(DSIG_NS, 'Signature')[0];
    const certPem = extractCertificatePem(signedXml);
    if (!signature || !certPem) return { valid: false, certPem, error: 'El documento no está firmado' };
    const verifier = new SignedXml({ publicCert: certPem });
    verifier.loadSignature(signature);
    const valid = verifier.checkSignature(signedXml);
    return { valid, certPem, ...(valid ? {} : { error: 'La firma no es válida' }) };
  } catch (error) {
    return { valid: false, certPem: null, error: error.message };
  }
}
