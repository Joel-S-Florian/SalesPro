import { describe, it, expect } from 'vitest';
import {
  validateNCF,
  getNCFType,
  getDocumentType,
  validateCedula,
  validateRNC,
  determineNCFType,
} from './dgii.js';
import { round2, getPaginationMeta, buildPaginationQuery } from './helpers.js';

describe('NCF', () => {
  it('acepta formatos válidos, con o sin guiones', () => {
    expect(validateNCF('B0100000001')).toBe(true);
    expect(validateNCF('B02-00000125')).toBe(true);
    expect(validateNCF('B1600000001')).toBe(true);
  });

  it.each(['', null, 'B0000000001', 'B1700000001', 'B010000001', 'X0100000001', 'B01000000012'])(
    'rechaza %s',
    value => expect(validateNCF(value)).toBe(false)
  );

  it('extrae el tipo', () => {
    expect(getNCFType('B0200000009')).toBe('B02');
    expect(getNCFType('basura')).toBeNull();
  });

  it('consumidor final -> B02 (consumo); contribuyente con RNC -> B01 (crédito fiscal)', () => {
    expect(determineNCFType({ rnc: null, documentId: '123' })).toBe('B02');
    expect(determineNCFType({ rnc: '000000000', documentId: '000000000' })).toBe('B02');
    expect(determineNCFType({ rnc: '131889421', documentId: '131889421' })).toBe('B01');
  });
});

describe('cédula y RNC', () => {
  // Para cualquier prefijo, exactamente un dígito verificador (0-9) debe ser válido
  const withExactlyOneCheckDigit = (prefix, validator) =>
    Array.from({ length: 10 }, (_, d) => prefix + d).filter(validator).length;

  it('cédula: un único dígito verificador es válido', () => {
    expect(withExactlyOneCheckDigit('0011492749', validateCedula)).toBe(1);
    expect(withExactlyOneCheckDigit('4020012345', validateCedula)).toBe(1);
  });

  it('RNC de 9 dígitos: como máximo un dígito verificador es válido', () => {
    expect(withExactlyOneCheckDigit('13188942', validateRNC)).toBeLessThanOrEqual(1);
  });

  it.each(['', null, '12345', '00000000000', '11111111111', 'abcdefghijk'])('rechaza documento %s', value => {
    expect(validateCedula(value)).toBe(false);
    expect(validateRNC(value)).toBe(false);
  });

  it('clasifica documentos desconocidos', () => {
    expect(getDocumentType('')).toBe('UNKNOWN');
    expect(getDocumentType('!!')).toBe('UNKNOWN');
  });
});

describe('helpers', () => {
  it('round2 redondea a centavos', () => {
    expect(round2(1.005 + 0.0001)).toBe(1.01);
    expect(round2(10)).toBe(10);
    expect(round2(0.1 + 0.2)).toBe(0.3);
  });

  it('getPaginationMeta calcula páginas', () => {
    expect(getPaginationMeta(2, 10, 25)).toEqual({
      page: 2,
      limit: 10,
      total: 25,
      totalPages: 3,
      hasNext: true,
      hasPrev: true,
    });
    expect(getPaginationMeta(1, 10, 0).hasNext).toBe(false);
  });

  it('buildPaginationQuery limita el tamaño de página a 100', () => {
    expect(buildPaginationQuery({ page: 3, limit: 500 })).toMatchObject({ skip: 200, take: 100 });
    expect(buildPaginationQuery({ page: 0, limit: 0 })).toMatchObject({ skip: 0, take: 1 });
  });
});
