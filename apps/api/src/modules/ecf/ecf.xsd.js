import { readFileSync } from 'node:fs';
import { validateXML } from 'xmllint-wasm';

/**
 * Validación de los XML contra los esquemas XSD oficiales de la DGII (carpeta `xsd/`).
 * Se valida el documento ya FIRMADO: los esquemas exigen el elemento de firma al final (`xs:any`).
 */

const SCHEMA_FILES = {
  E31: 'ecf-31.xsd',
  E32: 'ecf-32.xsd',
  E33: 'ecf-33.xsd',
  E34: 'ecf-34.xsd',
  E41: 'ecf-41.xsd',
  E43: 'ecf-43.xsd',
  E44: 'ecf-44.xsd',
  E45: 'ecf-45.xsd',
  E46: 'ecf-46.xsd',
  E47: 'ecf-47.xsd',
  RFCE: 'rfce-32.xsd',
  ARECF: 'arecf.xsd',
  ACECF: 'acecf.xsd',
  ANECF: 'anecf.xsd',
  SEMILLA: 'semilla.xsd',
};

const cache = new Map();

function schemaText(name) {
  const file = SCHEMA_FILES[name];
  if (!file) throw new Error(`No hay esquema XSD para ${name}`);
  if (!cache.has(file)) cache.set(file, readFileSync(new URL(`./xsd/${file}`, import.meta.url), 'utf8'));
  return { fileName: file, contents: cache.get(file) };
}

/**
 * @param {keyof typeof SCHEMA_FILES} schema - E31…E47, RFCE, ARECF, ACECF, ANECF
 * @param {string} xml
 * @returns {Promise<{ valid: boolean, errors: string[] }>}
 */
export async function validateAgainstXsd(schema, xml) {
  const result = await validateXML({
    xml: [{ fileName: 'documento.xml', contents: xml }],
    schema: [schemaText(schema)],
    initialMemoryPages: 512,
  });
  return {
    valid: result.valid,
    errors: (result.errors || []).map(error => error.rawMessage || error.message).filter(Boolean),
  };
}

export const SCHEMAS = Object.keys(SCHEMA_FILES);
