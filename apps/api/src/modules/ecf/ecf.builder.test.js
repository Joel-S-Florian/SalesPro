import { beforeAll, describe, expect, it } from 'vitest';
import { buildAcecfXml, buildAnecfXml, buildArecfXml, buildEcfXml, buildRfceXml, computeAmounts, EcfBuildError, escapeXml, formatDate, formatDateTime } from './ecf.builder.js';
import { generateTestPkcs12, parsePkcs12 } from './ecf.certificate.js';
import { securityCodeOf, signXml, verifySignedXml } from './ecf.signer.js';
import { validateAgainstXsd } from './ecf.xsd.js';

const issuer = { rnc: '131880738', legalName: 'MI EMPRESA SRL', tradeName: 'Mi Colmado', address: 'Calle Duarte #12, Santiago', municipalityCode: '250101', provinceCode: '250000' };
const issuedAt = new Date('2026-10-11T00:30:00Z'); // 10-10-2026 8:30 pm en RD
const base = {
  issuer,
  issuedAt,
  signedAt: new Date('2026-10-11T00:30:05Z'),
  taxRate: 0.18,
  paymentMethod: 'EFECTIVO',
  lines: [
    { name: 'Arroz Premium 5 lb', quantity: 2, unitPrice: 150 },
    { name: 'Aceite de cocina 1 L', quantity: 1, unitPrice: 215.5 },
  ],
};

describe('formato de fechas (hora dominicana)', () => {
  it('usa UTC-4 aunque el servidor esté en UTC', () => {
    expect(formatDate(issuedAt)).toBe('10-10-2026');
    expect(formatDateTime(issuedAt)).toBe('10-10-2026 20:30:00');
  });
});

describe('montos', () => {
  it('reparte el descuento global y cuadra con la venta', () => {
    const lines = [
      { name: 'A', quantity: 1, unitPrice: 33.33 },
      { name: 'B', quantity: 1, unitPrice: 33.33 },
      { name: 'C', quantity: 1, unitPrice: 33.34 },
    ];
    const a = computeAmounts({ lines, discount: 10, taxRate: 0.18 });
    expect(a.items.reduce((s, i) => s + i.discount, 0)).toBeCloseTo(10, 2);
    expect(a.taxable).toBe(90);
    expect(a.tax).toBe(16.2);
    expect(a.total).toBe(106.2);
  });

  it('rechaza una venta cuyo ITBIS o total no cuadran', () => {
    const lines = [{ name: 'A', quantity: 1, unitPrice: 100 }];
    expect(() => computeAmounts({ lines, taxRate: 0.18, expectedTax: 17 })).toThrow(/ITBIS calculado/);
    expect(() => computeAmounts({ lines, taxRate: 0.18, expectedTotal: 120 })).toThrow(/total calculado/);
  });

  it('rechaza tasas de ITBIS no soportadas', () => {
    expect(() => computeAmounts({ lines: [{ name: 'A', quantity: 1, unitPrice: 100 }], taxRate: 0.07 })).toThrow(/no está soportada/);
  });
});

describe('XML contra el esquema oficial de la DGII', () => {
  let creds;
  beforeAll(() => {
    const { p12, password } = generateTestPkcs12({ rnc: issuer.rnc });
    creds = parsePkcs12(p12, password, issuer.rnc);
  });

  const check = async (type, xml) => {
    const signed = signXml(xml, creds);
    const result = await validateAgainstXsd(type, signed);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
    expect(verifySignedXml(signed).valid).toBe(true);
    return signed;
  };

  it('E32 consumidor final', async () => {
    const { xml, amounts } = buildEcfXml({ ...base, ecfType: 'E32', eNcf: 'E320000000001', buyer: {} });
    expect(amounts.taxable).toBe(515.5);
    expect(amounts.tax).toBe(92.79);
    expect(amounts.total).toBe(608.29);
    expect(xml).toContain('<RazonSocialComprador>CONSUMIDOR FINAL</RazonSocialComprador>');
    expect(xml).not.toMatch(/<(\w+)><\/\1>|<\w+\/>/); // sin etiquetas vacías
    await check('E32', xml);
  });

  it('E32 con cédula del comprador y descuento', async () => {
    const { xml } = buildEcfXml({ ...base, ecfType: 'E32', eNcf: 'E320000000002', discount: 20, buyer: { rnc: '001-1492749-3', name: 'Juan Pérez' }, paymentMethod: 'TARJETA' });
    expect(xml).toContain('<RNCComprador>00114927493</RNCComprador>');
    expect(xml).toContain('<FormaPago>3</FormaPago>');
    expect(xml).toContain('<DescuentoMonto>');
    await check('E32', xml);
  });

  it('E31 crédito fiscal con RNC y vencimiento de secuencia', async () => {
    const { xml } = buildEcfXml({ ...base, ecfType: 'E31', eNcf: 'E310000000001', buyer: { rnc: '101-01010-1', name: 'COMERCIAL ELECTRONICA SRL' }, sequenceValidUntil: new Date('2028-12-31T12:00:00Z') });
    expect(xml).toContain('<FechaVencimientoSecuencia>31-12-2028</FechaVencimientoSecuencia>');
    await check('E31', xml);
  });

  it('E34 nota de crédito con referencia al e-CF original', async () => {
    const { xml } = buildEcfXml({
      ...base,
      ecfType: 'E34',
      eNcf: 'E340000000001',
      buyer: { rnc: '101010101', name: 'COMERCIAL ELECTRONICA SRL' },
      lines: [{ name: 'Arroz Premium 5 lb', quantity: 1, unitPrice: 150 }],
      reference: { eNcf: 'E310000000001', issuedAt: new Date('2026-10-01T15:00:00Z'), modificationCode: 3, afterThirtyDays: false },
    });
    expect(xml).toContain('<NCFModificado>E310000000001</NCFModificado>');
    expect(xml).toContain('<IndicadorNotaCredito>0</IndicadorNotaCredito>');
    expect(xml).not.toContain('TablaFormasPago');
    await check('E34', xml);
  });

  it('ITBIS al 16%', async () => {
    const { xml } = buildEcfXml({ ...base, taxRate: 0.16, ecfType: 'E32', eNcf: 'E320000000003', buyer: {} });
    expect(xml).toContain('<MontoGravadoI2>');
    expect(xml).toContain('<ITBIS2>16</ITBIS2>');
    await check('E32', xml);
  });

  it('caracteres especiales se escapan y el documento sigue siendo válido', async () => {
    const { xml } = buildEcfXml({
      ...base,
      ecfType: 'E32',
      eNcf: 'E320000000004',
      buyer: {},
      lines: [{ name: `Pan "Bimbo" & <café> d'oro ñ`, quantity: 3, unitPrice: 45.5 }],
    });
    expect(xml).toContain('Pan &quot;Bimbo&quot; &amp; &lt;café&gt; d&apos;oro ñ');
    await check('E32', xml);
  });

  it('RFCE (resumen de factura de consumo) con el código de seguridad del e-CF', async () => {
    const input = { ...base, eNcf: 'E320000000005', buyer: {} };
    const ecf = signXml(buildEcfXml({ ...input, ecfType: 'E32' }).xml, creds);
    const code = securityCodeOf(ecf);
    const rfce = buildRfceXml({ ...input, securityCode: code });
    expect(rfce).toContain(`<CodigoSeguridadeCF>${code}</CodigoSeguridadeCF>`);
    await check('RFCE', rfce);
  });

  it('muchas líneas y cantidades/precios con decimales', async () => {
    const lines = Array.from({ length: 40 }, (_, i) => ({ name: `Producto ${i + 1}`, quantity: i % 3 === 0 ? 2 : 1, unitPrice: 10.35 + i * 0.07 }));
    const { xml } = buildEcfXml({ ...base, ecfType: 'E32', eNcf: 'E320000000006', buyer: {}, lines, discount: 12.34 });
    await check('E32', xml);
  });
});

describe('reglas del comprobante', () => {
  it('E31 exige RNC y razón social del comprador', () => {
    expect(() => buildEcfXml({ ...base, ecfType: 'E31', eNcf: 'E310000000001', buyer: {}, sequenceValidUntil: new Date() })).toThrow(EcfBuildError);
    expect(() => buildEcfXml({ ...base, ecfType: 'E31', eNcf: 'E310000000001', buyer: { rnc: '131880738' }, sequenceValidUntil: new Date() })).toThrow(/razón social/);
  });

  it('E31 exige fecha de vencimiento del rango', () => {
    expect(() => buildEcfXml({ ...base, ecfType: 'E31', eNcf: 'E310000000001', buyer: { rnc: '131880738', name: 'X' } })).toThrow(/vencimiento/);
  });

  it('E32 de RD$250,000 o más exige identificar al comprador', () => {
    const lines = [{ name: 'Equipo', quantity: 1, unitPrice: 250000 }];
    expect(() => buildEcfXml({ ...base, lines, ecfType: 'E32', eNcf: 'E320000000001', buyer: {} })).toThrow(/identificar al comprador/);
    expect(() => buildRfceXml({ ...base, lines, eNcf: 'E320000000001', buyer: {}, securityCode: 'abc123' })).toThrow(/se envían completas/);
  });

  it('E34 exige la referencia', () => {
    expect(() => buildEcfXml({ ...base, ecfType: 'E34', eNcf: 'E340000000001', buyer: {} })).toThrow(/referenciar/);
  });

  it('faltan datos de la empresa: mensajes accionables', () => {
    expect(() => buildEcfXml({ ...base, issuer: { ...issuer, address: '' }, ecfType: 'E32', eNcf: 'E320000000001', buyer: {} })).toThrow(/dirección fiscal/);
    expect(() => buildEcfXml({ ...base, issuer: { ...issuer, legalName: '' }, ecfType: 'E32', eNcf: 'E320000000001', buyer: {} })).toThrow(/razón social/);
    expect(() => buildEcfXml({ ...base, issuer: { ...issuer, rnc: '123' }, ecfType: 'E32', eNcf: 'E320000000001', buyer: {} })).toThrow(/RNC/);
  });

  it('rechaza un e-NCF mal formado o de otro tipo', () => {
    expect(() => buildEcfXml({ ...base, ecfType: 'E32', eNcf: 'B0200000001', buyer: {} })).toThrow(/formato/);
    expect(() => buildEcfXml({ ...base, ecfType: 'E32', eNcf: 'E310000000001', buyer: {} })).toThrow(/formato/);
    expect(() => buildEcfXml({ ...base, ecfType: 'E47', eNcf: 'E470000000001', buyer: {} })).toThrow(/no soportado/);
  });

  it('escapeXml reemplaza los cinco caracteres y quita controles', () => {
    expect(escapeXml(`<a href="x">'&'</a>\u0001`)).toBe('&lt;a href=&quot;x&quot;&gt;&apos;&amp;&apos;&lt;/a&gt;');
  });
});

describe('acuse de recibo, aprobación comercial y anulación de rangos (esquemas oficiales)', () => {
  let creds;
  beforeAll(() => {
    const { p12, password } = generateTestPkcs12({ rnc: issuer.rnc });
    creds = parsePkcs12(p12, password, issuer.rnc);
  });
  const valid = async (type, xml) => {
    const signed = signXml(xml, creds);
    const result = await validateAgainstXsd(type, signed);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  };

  it('ARECF: recibido y no recibido (con motivo)', async () => {
    await valid('ARECF', buildArecfXml({ rncEmisor: '101010101', rncComprador: '131880738', eNcf: 'E310000000001', received: true, at: issuedAt }));
    const refused = buildArecfXml({ rncEmisor: '101010101', rncComprador: '131880738', eNcf: 'E310000000001', received: false, reasonCode: 3, at: issuedAt });
    expect(refused).toContain('<CodigoMotivoNoRecibido>3</CodigoMotivoNoRecibido>');
    await valid('ARECF', refused);
  });

  it('ACECF: aprobada y rechazada (el rechazo exige motivo)', async () => {
    const base = { rncEmisor: '101010101', rncComprador: '131880738', eNcf: 'E310000000001', issueDate: '10-10-2026', total: 1180, at: issuedAt };
    await valid('ACECF', buildAcecfXml({ ...base, approved: true }));
    await valid('ACECF', buildAcecfXml({ ...base, approved: false, rejectionReason: 'Mercancía no recibida' }));
    expect(() => buildAcecfXml({ ...base, approved: false })).toThrow(/motivo/);
  });

  it('ANECF: rangos anulados', async () => {
    const xml = buildAnecfXml({ rncEmisor: '131880738', ranges: [{ type: 'E32', from: 10, to: 20 }, { type: 'E31', from: 5, to: 5 }], at: issuedAt });
    expect(xml).toContain('<CantidadeNCFAnulados>12</CantidadeNCFAnulados>');
    await valid('ANECF', xml);
    expect(() => buildAnecfXml({ rncEmisor: '131880738', ranges: [] })).toThrow(/al menos un rango/);
    expect(() => buildAnecfXml({ rncEmisor: '131880738', ranges: [{ type: 'E32', from: 9, to: 3 }] })).toThrow(/no es válido/);
  });
});
