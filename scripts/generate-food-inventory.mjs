// Genera un archivo de ingesta de ALIMENTOS para «Importar Inventario»:
// unidades (UND/LB/KG/LT…), perecederos con varios lotes y fechas relativas a HOY, y presentaciones (paquetes/cajas).
// Los vencimientos se calculan desde la fecha de ejecución: genérelo justo antes de cargarlo.
// Uso: node scripts/generate-food-inventory.mjs [salida.csv]
import { writeFileSync } from 'node:fs';

const out = process.argv[2] || new URL('../Doc/ejemplos/inventario_alimentos.csv', import.meta.url);

/** EAN-13 válido: 746 + 9 dígitos + verificador (pesos 1,3,1,3…). */
let counter = 0;
const ean = () => {
  counter += 1;
  const body = `746${String(100000000 + counter * 37).slice(0, 9)}`;
  const sum = [...body].reduce((acc, digit, index) => acc + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
  return body + ((10 - (sum % 10)) % 10);
};

const day = offset => {
  const date = new Date(Date.now() + offset * 86400000);
  return date.toISOString().slice(0, 10);
};

// [descripcion, categoria, unidad, costo, precio, existencia, minimo, perecedero, lotes[[lote, díasParaVencer, cantidad]], presentaciones[[nombre, unidades, precio, ean?]], codigoInterno]
const catalog = [
  ['Leche entera 1 L', 'Lácteos', 'UND', 62, 82, 0, 24, 'SI', [['L2610-A', 3, 18], ['L2610-B', 12, 40], ['L2611-A', 45, 60]], [['Caja x12', 12, 900, true]]],
  ['Yogurt natural 8 oz', 'Lácteos', 'UND', 38, 55, 0, 12, 'SI', [['Y-0912', 6, 14], ['Y-1004', 25, 36]], [['Paquete x6', 6, 310, false]]],
  ['Queso de freír (lb)', 'Lácteos', 'LB', 165, 230, 0, 10, 'SI', [['QF-33', 2, 6.5], ['QF-34', 9, 20]], []],
  ['Mantequilla 8 oz', 'Lácteos', 'UND', 95, 130, 0, 8, 'SI', [['MT-01', 40, 24]], []],
  ['Huevos medianos (unidad)', 'Huevos', 'UND', 7.5, 11, 0, 60, 'SI', [['H-1001', 8, 120], ['H-1008', 20, 300]], [['Cartón x30', 30, 300, true], ['Caja x180', 180, 1700, false]]],
  ['Pollo entero (lb)', 'Carnes y Embutidos', 'LB', 72, 98, 0, 40, 'SI', [['P-5521', 4, 55], ['P-5524', 7, 90]], []],
  ['Carne molida de res (lb)', 'Carnes y Embutidos', 'LB', 150, 210, 0, 20, 'SI', [['CM-77', 1, 8], ['CM-78', 5, 35]], []],
  ['Longaniza (lb)', 'Carnes y Embutidos', 'LB', 130, 185, 0, 10, 'SI', [['LG-02', 10, 18]], []],
  ['Salami Induveca 1 lb', 'Carnes y Embutidos', 'UND', 175, 240, 0, 8, 'SI', [['SA-9', 35, 22]], []],
  ['Jamón de pavo (lb)', 'Carnes y Embutidos', 'LB', 210, 285, 0, 6, 'SI', [['JP-14', 12, 12]], []],
  ['Pan de agua (unidad)', 'Panadería', 'UND', 4, 7, 0, 100, 'SI', [['PA-D1', 1, 80], ['PA-D2', 3, 150]], [['Funda x10', 10, 62, false]]],
  ['Pan sobao (unidad)', 'Panadería', 'UND', 6, 10, 0, 60, 'SI', [['PS-D1', 2, 70]], [['Funda x6', 6, 54, false]]],
  ['Tomate (lb)', 'Frutas y Verduras', 'LB', 22, 38, 0, 40, 'SI', [['T-A', 3, 60], ['T-B', 6, 85]], []],
  ['Cebolla roja (lb)', 'Frutas y Verduras', 'LB', 18, 30, 0, 30, 'SI', [['CB-1', 21, 120]], []],
  ['Plátano verde (unidad)', 'Frutas y Verduras', 'UND', 9, 15, 0, 80, 'SI', [['PL-1', 5, 200]], [['Racimo x12', 12, 160, false]]],
  ['Aguacate (unidad)', 'Frutas y Verduras', 'UND', 35, 55, 0, 20, 'SI', [['AG-1', 4, 30], ['AG-2', 9, 45]], []],
  ['Naranja dulce (lb)', 'Frutas y Verduras', 'LB', 14, 25, 0, 30, 'SI', [['NA-7', 11, 140]], []],
  ['Jugo de naranja natural 1 L', 'Bebidas', 'UND', 85, 125, 0, 12, 'SI', [['JN-1', 3, 20], ['JN-2', 7, 30]], []],
  ['Arroz selecto (lb)', 'Granos a granel', 'LB', 24, 33, 400, 100, 'NO', [], [['Saco 25 lb', 25, 780, false]]],
  ['Habichuelas rojas (lb)', 'Granos a granel', 'LB', 48, 66, 180, 50, 'NO', [], []],
  ['Habichuelas negras (lb)', 'Granos a granel', 'LB', 52, 70, 90, 40, 'NO', [], []],
  ['Azúcar crema (lb)', 'Granos a granel', 'LB', 26, 36, 300, 80, 'NO', [], []],
  ['Sal fina (lb)', 'Granos a granel', 'LB', 8, 14, 150, 40, 'NO', [], []],
  ['Aceite vegetal (galón)', 'Abarrotes', 'GAL', 560, 690, 24, 8, 'NO', [], []],
  ['Aceite vegetal 1 L', 'Abarrotes', 'UND', 150, 195, 60, 20, 'NO', [], [['Caja x12', 12, 2150, true]]],
  ['Espaguetis 1 lb', 'Abarrotes', 'UND', 28, 40, 140, 40, 'NO', [], [['Caja x20', 20, 740, false]]],
  ['Salsa de tomate 8 oz', 'Abarrotes', 'UND', 22, 34, 120, 30, 'NO', [], [['Caja x24', 24, 740, false]]],
  ['Sardinas en lata', 'Enlatados', 'UND', 36, 52, 96, 24, 'NO', [], [['Caja x24', 24, 1150, true]]],
  ['Atún en agua 5 oz', 'Enlatados', 'UND', 62, 88, 80, 24, 'NO', [], []],
  ['Maíz dulce en lata', 'Enlatados', 'UND', 48, 70, 50, 15, 'NO', [], []],
  ['Refresco cola 2 L', 'Bebidas', 'UND', 72, 105, 150, 36, 'NO', [], [['Paquete x6', 6, 590, true]]],
  ['Agua 500 ml', 'Bebidas', 'UND', 9, 15, 400, 96, 'NO', [], [['Paca x24', 24, 330, true]]],
  ['Cerveza lata 12 oz', 'Bebidas', 'UND', 48, 70, 240, 48, 'NO', [], [['Paquete x12', 12, 800, true], ['Caja x24', 24, 1550, false]]],
  ['Galletas de soda', 'Snacks', 'UND', 18, 28, 120, 30, 'NO', [], [['Paquete x10', 10, 255, false]]],
  ['Papitas fritas 4 oz', 'Snacks', 'UND', 34, 50, 90, 24, 'NO', [], [['Caja x24', 24, 1100, true]]],
  ['Detergente en polvo 1 kg', 'Limpieza', 'UND', 110, 155, 40, 12, 'NO', [], []],
  ['Cloro 1 galón', 'Limpieza', 'GAL', 85, 125, 30, 10, 'NO', [], []],
  ['Papel higiénico x4', 'Higiene', 'UND', 80, 115, 70, 20, 'NO', [], [['Paca x12', 12, 1250, true]]],
  ['Pollo congelado en alas (lb)', 'Congelados', 'LB', 85, 120, 0, 15, 'SI', [['AL-3', 60, 40]], []],
  ['Helado de vainilla 1 L', 'Congelados', 'UND', 180, 260, 0, 6, 'SI', [['HE-1', 90, 15]], []],
  ['Leche en polvo (lb)', 'Lácteos', 'LB', 210, 285, 0, 6, 'SI', [['LP-2', -4, 5], ['LP-3', 70, 12]], []], // un lote ya vencido, para probar la baja
];

const header = ['codigo', 'descripcion', 'categoria', 'unidad', 'costo', 'precio_venta', 'existencia', 'stock_minimo', 'perecedero', 'lote', 'vencimiento',
  'pres1_nombre', 'pres1_unidades', 'pres1_precio', 'pres1_codigo', 'pres2_nombre', 'pres2_unidades', 'pres2_precio', 'pres2_codigo'];

const escape = value => {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const rows = [];
catalog.forEach(([name, category, unit, cost, price, stock, min, perishable, lots, presentations], index) => {
  // Envasados con EAN real; granel y elaborados con código interno
  const code = unit === 'UND' && perishable === 'NO' ? ean() : `ALM-${String(index + 1).padStart(4, '0')}`;
  const pres = [0, 1].map(i => {
    const p = presentations[i];
    return p ? [p[0], p[1], p[2], p[3] ? ean() : ''] : ['', '', '', ''];
  }).flat();
  const base = [code, name, category, unit, cost, price];
  if (perishable === 'SI') {
    lots.forEach(([lot, days, qty], lotIndex) => {
      // Cada lote repite el producto; las presentaciones solo en la primera fila
      rows.push([...base, qty, min, 'SI', lot, day(days), ...(lotIndex === 0 ? pres : Array(8).fill(''))]);
    });
  } else {
    rows.push([...base, stock, min, 'NO', '', '', ...pres]);
  }
});

writeFileSync(out, '﻿' + [header, ...rows].map(row => row.map(escape).join(',')).join('\n') + '\n', 'utf8');
console.log(`${rows.length} filas (${catalog.length} productos) generadas`);
