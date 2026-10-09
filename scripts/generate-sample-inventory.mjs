// Genera archivos de inventario de ejemplo (con códigos EAN-13 válidos) para probar el importador
// y los lectores de código de barras sin tener productos físicos.
//
//   node scripts/generate-sample-inventory.mjs
//
// Salida: Doc/ejemplos/inventario_limpio.csv, inventario_sucio.csv e inventario_sucio.json
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'Doc', 'ejemplos');
mkdirSync(outDir, { recursive: true });

/** Calcula el dígito verificador EAN-13 de los 12 primeros dígitos. */
function ean13(base12) {
  const sum = base12.split('').reduce((acc, d, i) => acc + Number(d) * (i % 2 === 0 ? 1 : 3), 0);
  return base12 + ((10 - (sum % 10)) % 10);
}

// [descripción, categoría, costo, margen aprox., existencia]
const catalog = [
  ['Arroz Selecto 5 lb', 'Abarrotes', 142.5, 1.28, 40],
  ['Habichuelas Rojas 1 lb', 'Abarrotes', 48, 1.3, 60],
  ['Aceite Vegetal 1 L', 'Abarrotes', 165, 1.25, 36],
  ['Azúcar Crema 5 lb', 'Abarrotes', 118, 1.27, 30],
  ['Sal Fina 1 lb', 'Abarrotes', 14, 1.4, 80],
  ['Spaghetti 400 g', 'Abarrotes', 38, 1.35, 70],
  ['Salsa de Tomate 8 oz', 'Abarrotes', 26, 1.38, 90],
  ['Café Molido 1 lb', 'Abarrotes', 210, 1.22, 25],
  ['Avena en Hojuelas 400 g', 'Abarrotes', 55, 1.33, 45],
  ['Leche Entera 1 L', 'Lácteos', 62.5, 1.28, 48],
  ['Leche Evaporada 354 ml', 'Lácteos', 41, 1.3, 55],
  ['Queso Blanco 1 lb', 'Lácteos', 180, 1.25, 20],
  ['Mantequilla 200 g', 'Lácteos', 96, 1.3, 24],
  ['Yogurt Natural 1 L', 'Lácteos', 88, 1.28, 18],
  ['Agua Purificada 500 ml', 'Bebidas', 9, 1.6, 200],
  ['Refresco Cola 2 L', 'Bebidas', 72, 1.3, 60],
  ['Jugo de Naranja 1 L', 'Bebidas', 64, 1.32, 40],
  ['Cerveza Lata 355 ml', 'Bebidas', 52, 1.35, 120],
  ['Malta 8 oz', 'Bebidas', 33, 1.36, 80],
  ['Detergente en Polvo 1 kg', 'Limpieza', 98, 1.3, 35],
  ['Cloro 1 gal', 'Limpieza', 76, 1.35, 30],
  ['Jabón de Cuaba', 'Limpieza', 22, 1.45, 100],
  ['Fregador Antibacterial', 'Limpieza', 18, 1.5, 70],
  ['Papel Higiénico 4 rollos', 'Higiene', 85, 1.3, 50],
  ['Jabón de Baño 3 pack', 'Higiene', 70, 1.32, 45],
  ['Pasta Dental 100 ml', 'Higiene', 58, 1.34, 60],
  ['Champú 400 ml', 'Higiene', 135, 1.28, 28],
  ['Desodorante Roll-on', 'Higiene', 92, 1.3, 32],
  ['Pan Sobao Paquete', 'Panadería', 45, 1.4, 25],
  ['Galletas de Soda', 'Panadería', 31, 1.42, 65],
].map(([name, category, cost, factor, stock], i) => ({
  code: ean13(`746${String(100000 + i * 37).padStart(9, '0')}`),
  name,
  category,
  cost,
  price: Math.round(cost * factor * 100) / 100,
  stock,
}));

const csvCell = value => `"${String(value).replace(/"/g, '""')}"`;

// 1) Archivo limpio: encabezados claros y valores simples
const clean = [
  'codigo_barras,descripcion,categoria,costo,precio_venta,existencia',
  ...catalog.map(p => [p.code, csvCell(p.name), p.category, p.cost, p.price, p.stock].join(',')),
].join('\n');
writeFileSync(join(outDir, 'inventario_limpio.csv'), clean + '\n');

// 2) Archivo sucio: espacios, símbolos de moneda, comas decimales, columnas basura y filas defectuosas
const dirtyRows = catalog.map((p, i) => {
  const cost = i % 3 === 0 ? `RD$ ${p.cost.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : String(p.cost).replace('.', ',');
  return [
    ` ${p.code} `,
    csvCell(`  ${p.name.toUpperCase()}   `),
    csvCell(cost),
    csvCell(`${p.stock}.0`),
    `LOTE-${1000 + i}`,
    `ALM-${(i % 4) + 1}`,
  ].join(',');
});
dirtyRows.push(
  ['7461000000000', csvCell('Producto sin costo'), '', '5', 'LOTE-9', 'ALM-1'].join(','), // costo vacío -> inválida
  ['', csvCell('Producto sin código'), '10', '5', 'LOTE-9', 'ALM-1'].join(','), // sin código -> inválida
  [catalog[0].code, csvCell('DUPLICADO DE ARROZ'), '150', '3', 'LOTE-9', 'ALM-1'].join(',') // duplicado
);
const dirty = ['SKU Proveedor,Descripción,Costo Unit.,Cant. Disponible,Lote Origen,Ubicación', ...dirtyRows].join('\n');
writeFileSync(join(outDir, 'inventario_sucio.csv'), dirty + '\n');

// 3) JSON anidado y desordenado
const json = {
  proveedor: 'Distribuidora de Prueba SRL',
  generado: new Date().toISOString(),
  articulos: catalog.slice(0, 12).map((p, i) => ({
    ean: p.code,
    nombre: `  ${p.name}  `,
    clasificacion: { departamento: p.category },
    precios: { costo: i % 2 ? `$${p.cost}` : p.cost, venta: p.price },
    inventario: { disponible: String(p.stock), almacen: 'Principal' },
  })),
};
writeFileSync(join(outDir, 'inventario_sucio.json'), JSON.stringify(json, null, 2) + '\n');

console.log(`Generados ${catalog.length} productos en ${outDir}`);
console.log('Primer código EAN-13:', catalog[0].code);
