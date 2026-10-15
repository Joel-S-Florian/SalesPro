import { addBatchStock, addUnbatchedStock } from '../inventory/batches.service.js';
import { parseExpiration } from '../inventory/batches.logic.js';
import { getConfig } from '../config/config.service.js';
import { getDefaultSupplier } from '../suppliers/suppliers.service.js';
import { countResource, getCompanyPlanState } from '../../shared/plans.js';
import { limitOf, planHasFeature, planName } from '@factos/shared/plans.js';
import { Readable } from 'node:stream';
import ExcelJS from 'exceljs';
import { prisma } from '../../config/db.js';
import { AppError } from '../../shared/exceptions/AppError.js';
import { cleanText, sanitizeRow } from './sanitize.js';

const MAX_ROWS = 5000;
const PREVIEW_ROWS = 100;
const round2 = n => Math.round(n * 100) / 100;

/** Valor de celda de ExcelJS -> texto/número simple. */
function cellValue(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    if ('result' in value) return cellValue(value.result);
    if ('richText' in value) return value.richText.map(part => part.text).join('');
    if ('text' in value) return value.text;
    return '';
  }
  return value;
}

/** Aplana un objeto anidado a claves con punto: { a: { b: 1 } } -> { 'a.b': 1 }. */
function flatten(value, prefix = '', out = {}) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    Object.entries(value).forEach(([key, inner]) => flatten(inner, prefix ? `${prefix}.${key}` : key, out));
  } else {
    out[prefix] = Array.isArray(value) ? value.join(', ') : (value ?? '');
  }
  return out;
}

/**
 * Lee un JSON: un arreglo de objetos o un objeto con el arreglo dentro
 * (`products`, `items`, `data`, `productos`, `articulos`...). Las claves son las columnas.
 */
function readJson(buffer) {
  let parsed;
  try {
    parsed = JSON.parse(buffer.toString('utf8').replace(/^\uFEFF/, ''));
  } catch {
    throw AppError.badRequest('El JSON no es válido. Verifique comas, comillas y llaves');
  }

  let list = parsed;
  if (!Array.isArray(list)) {
    list = Object.values(parsed || {}).find(v => Array.isArray(v) && v.some(item => item && typeof item === 'object'));
  }
  if (!Array.isArray(list)) {
    throw AppError.badRequest('El JSON debe ser un arreglo de productos (o un objeto que lo contenga)');
  }

  const rows = list.filter(item => item && typeof item === 'object').map(item => flatten(item));
  const columns = [...new Set(rows.flatMap(row => Object.keys(row)))];
  return { columns, rows };
}

/**
 * Lee un CSV/XLSX/JSON y devuelve { columns, rows } donde cada fila es { [columna]: valor }.
 * En CSV/XLSX la primera fila no vacía se toma como encabezado.
 */
async function readSpreadsheet(fileName, buffer) {
  if (/\.json$/i.test(fileName)) {
    const result = readJson(buffer);
    if (result.rows.length === 0) throw AppError.badRequest('El archivo no tiene filas de datos');
    if (result.rows.length > MAX_ROWS) {
      throw AppError.badRequest(`El archivo supera el máximo de ${MAX_ROWS} filas`);
    }
    return result;
  }

  const workbook = new ExcelJS.Workbook();
  const isCsv = /\.(csv|txt)$/i.test(fileName);
  const isXlsx = /\.xlsx$/i.test(fileName);
  if (!isCsv && !isXlsx) {
    throw AppError.badRequest('Formato no soportado. Use un archivo .csv, .xlsx o .json');
  }

  try {
    if (isCsv) await workbook.csv.read(Readable.from(buffer));
    else await workbook.xlsx.load(buffer);
  } catch {
    throw AppError.badRequest('No se pudo leer el archivo. Verifique que no esté dañado');
  }

  const sheet = workbook.worksheets[0];
  if (!sheet) throw AppError.badRequest('El archivo no contiene hojas');

  const matrix = [];
  sheet.eachRow({ includeEmpty: false }, row => {
    matrix.push(row.values.slice(1).map(cellValue));
  });

  if (matrix.length < 2) throw AppError.badRequest('El archivo no tiene filas de datos');
  if (matrix.length - 1 > MAX_ROWS) {
    throw AppError.badRequest(`El archivo supera el máximo de ${MAX_ROWS} filas`);
  }

  // Encabezados únicos y no vacíos
  const seen = new Map();
  const columns = matrix[0].map((header, index) => {
    const base = String(header).trim() || `Columna ${index + 1}`;
    const count = (seen.get(base) || 0) + 1;
    seen.set(base, count);
    return count > 1 ? `${base} (${count})` : base;
  });

  const rows = matrix
    .slice(1)
    .map(values => Object.fromEntries(columns.map((column, i) => [column, values[i] ?? ''])))
    .filter(row => Object.values(row).some(v => String(v).trim() !== ''));

  return { columns, rows };
}

/** Paso 1: carga el archivo y guarda las filas crudas en staging. */
export async function stageFile({ fileName, contentBase64 }, requester) {
  const buffer = Buffer.from(contentBase64, 'base64');
  const { columns, rows } = await readSpreadsheet(fileName, buffer);

  const batch = await prisma.inventoryImport.create({
    data: { fileName, userId: requester.userId, userName: requester.fullName },
  });
  await prisma.inventoryImportRow.createMany({
    data: rows.map((raw, index) => ({ importId: batch.id, rowNumber: index + 2, raw })),
  });

  return { importId: batch.id, columns, rowCount: rows.length, sample: rows.slice(0, 5) };
}

async function getStagedBatch(importId) {
  const batch = await prisma.inventoryImport.findUnique({ where: { id: importId } });
  if (!batch) throw AppError.notFound('Importación no encontrada');
  if (batch.status !== 'STAGED') throw AppError.conflict('Esta importación ya fue procesada');
  return batch;
}

/**
 * Paso 2: aplica el mapeo de columnas, sanitiza y clasifica cada fila (crear / actualizar / inválida).
 */
export async function previewImport(importId, { mapping, marginPercent, defaultCategoryId, supplierId, updatePrices }) {
  const batch = await getStagedBatch(importId);

  if (!mapping.category && !defaultCategoryId) {
    throw AppError.badRequest('Seleccione una categoría por defecto o mapee la columna de categoría');
  }
  if (defaultCategoryId) {
    const category = await prisma.category.findUnique({ where: { id: defaultCategoryId } });
    if (!category) throw AppError.notFound('Categoría por defecto no encontrada');
  }
  if (supplierId) {
    const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
    if (!supplier || !supplier.active) throw AppError.notFound('Proveedor no encontrado o inactivo');
  }

  const rows = await prisma.inventoryImportRow.findMany({
    where: { importId },
    orderBy: { rowNumber: 'asc' },
  });
  const existing = await prisma.product.findMany({ select: { code: true, unit: true, isPerishable: true } });
  const existingProducts = new Map(existing.map(p => [p.code.toUpperCase(), p]));
  const perishableEnabled = (await getConfig()).perishable.enabled;
  // Códigos de barras ya ocupados (productos y presentaciones): una presentación nueva no puede repetirlos
  const takenBarcodes = new Set(existing.map(p => p.code.toUpperCase()));
  (await prisma.productPresentation.findMany({ where: { barcode: { not: null } }, select: { barcode: true } })).forEach(p => takenBarcodes.add(p.barcode.toUpperCase()));
  const categories = await prisma.category.findMany({ select: { name: true } });
  const categoryNames = new Set(categories.map(c => c.name.toLowerCase()));

  const seen = new Map(); // código -> { action, perishable, lots } (un perecedero puede repetirse con otro lote)
  const newCategories = new Set();
  const updates = [];
  const summary = { total: rows.length, create: 0, update: 0, invalid: 0 };

  for (const row of rows) {
    const mapped = Object.fromEntries(
      Object.entries(mapping)
        .filter(([, column]) => column)
        .map(([field, column]) => [field, row.raw[column]])
    );
    // Producto que ya existe: la existencia se interpreta en su unidad (no se redondea una libra a entero)
    const known = existingProducts.get(cleanText(mapped.code).toUpperCase());
    if (known && !cleanText(mapped.unit)) mapped.unit = known.unit;
    const { data, errors } = sanitizeRow(mapped, { marginPercent });

    if (!data.category && !defaultCategoryId) errors.push('Sin categoría (y no hay categoría por defecto)');
    if (data.isPerishable && !known && !perishableEnabled) errors.push('Active «Perecederos y lotes» en Configuración para importar productos perecederos');
    if (known && data.unit !== known.unit) errors.push(`La unidad del archivo (${data.unit}) no coincide con la del producto (${known.unit})`);

    // Código repetido: solo es válido como un lote adicional de un producto perecedero
    const perishable = known ? known.isPerishable : data.isPerishable;
    const prior = data.code ? seen.get(data.code) : null;
    let extraLot = false;
    if (prior) {
      if (!(prior.perishable && perishable && data.lot)) errors.push('Código duplicado dentro del archivo');
      else if (prior.lots.has(data.lot.toUpperCase())) errors.push('Lote repetido para este producto en el archivo');
      else if (prior.action === 'INVALID') errors.push('La primera fila de este producto es inválida');
      else extraLot = true;
    }

    // Presentaciones (solo al crear el producto): su código de barras no puede estar en uso
    if (!known && !extraLot) {
      for (const presentation of data.presentations) {
        const barcode = presentation.barcode;
        if (!barcode) continue;
        if (takenBarcodes.has(barcode)) errors.push(`El código de barras ${barcode} de la presentación ya está en uso`);
      }
    } else if (data.presentations.length) {
      data.presentations = []; // un producto existente (o un lote adicional) conserva las presentaciones que ya tiene
    }
    if (extraLot) data.extraLot = true;

    let action = 'INVALID';
    if (errors.length === 0) {
      action = extraLot ? prior.action : known ? 'UPDATE' : 'CREATE';
      if (data.category && !categoryNames.has(data.category.toLowerCase())) newCategories.add(data.category);
      if (!known && !extraLot) {
        takenBarcodes.add(data.code);
        data.presentations.forEach(p => p.barcode && takenBarcodes.add(p.barcode));
      }
    }
    if (data.code) {
      if (!prior) seen.set(data.code, { action, perishable, lots: new Set(data.lot ? [data.lot.toUpperCase()] : []) });
      else if (data.lot) prior.lots.add(data.lot.toUpperCase());
    }
    summary[action.toLowerCase()] += 1;
    updates.push({ id: row.id, data, action, errors: errors.length ? errors : null });
  }

  await prisma.$transaction(
    updates.map(u =>
      prisma.inventoryImportRow.update({
        where: { id: u.id },
        data: { data: u.data, action: u.action, errors: u.errors },
      })
    ),
    { timeout: 120000 }
  );

  summary.newCategories = [...newCategories];
  summary.units = updates.filter(u => u.action !== 'INVALID').reduce((sum, u) => sum + u.data.stock, 0);
  summary.value = round2(
    updates.filter(u => u.action !== 'INVALID').reduce((sum, u) => sum + u.data.stock * u.data.cost, 0)
  );

  await prisma.inventoryImport.update({
    where: { id: batch.id },
    data: {
      mapping,
      options: { marginPercent, defaultCategoryId: defaultCategoryId || null, updatePrices: !!updatePrices },
      supplierId: supplierId || null,
      summary,
    },
  });

  // Se muestran primero las filas con problemas
  const ordered = [...updates].sort((a, b) => (a.action === 'INVALID' ? -1 : 0) - (b.action === 'INVALID' ? -1 : 0));
  const byId = new Map(rows.map(r => [r.id, r.rowNumber]));
  return {
    summary,
    rows: ordered.slice(0, PREVIEW_ROWS).map(u => ({
      rowNumber: byId.get(u.id),
      action: u.action,
      errors: u.errors,
      ...u.data,
    })),
  };
}

/**
 * Paso 3: carga definitiva (upsert) de las filas válidas, con entradas de inventario.
 */
export async function applyImport(importId, requester) {
  const batch = await getStagedBatch(importId);
  if (!batch.summary || !batch.options) {
    throw AppError.badRequest('Genere la vista previa antes de aplicar la importación');
  }

  const rows = await prisma.inventoryImportRow.findMany({
    where: { importId, action: { in: ['CREATE', 'UPDATE'] } },
    orderBy: { rowNumber: 'asc' },
  });
  if (rows.length === 0) throw AppError.badRequest('No hay filas válidas para importar');

  // Sin proveedor elegido, las entradas se registran con el «Proveedor general»
  const supplier = batch.supplierId
    ? await prisma.supplier.findUnique({ where: { id: batch.supplierId } })
    : await getDefaultSupplier();
  const { defaultCategoryId, updatePrices } = batch.options;

  // Tope del plan: se importa hasta donde alcance y el resto se devuelve como rechazado con su motivo (nunca falla todo el archivo)
  const planState = await getCompanyPlanState();
  const productLimit = limitOf(planState.effectivePlan, 'products');
  let productRoom = productLimit === null ? Infinity : Math.max(0, productLimit - (await countResource('products')));
  const perishablesAllowed = planHasFeature(planState.effectivePlan, 'perishables');
  const rejected = [];
  const reject = (row, reason) => rejected.push({ rowNumber: row.rowNumber, code: row.data.code, name: row.data.name, reason });

  const result = await prisma.$transaction(
    async tx => {
      // Categorías nuevas
      const categoryIds = new Map(
        (await tx.category.findMany()).map(c => [c.name.toLowerCase(), c.id])
      );
      for (const row of rows) {
        const name = row.data.category;
        if (name && !categoryIds.has(name.toLowerCase())) {
          const created = await tx.category.create({ data: { name } });
          categoryIds.set(name.toLowerCase(), created.id);
        }
      }

      const existing = new Map(
        (await tx.product.findMany({ where: { code: { in: rows.map(r => r.data.code) } } })).map(p => [p.code, { ...p }])
      );
      const createdNow = new Set();
      const counts = { created: 0, updated: 0, entries: 0, lots: 0 };
      const reason = `Importación ${batch.fileName}${supplier ? ` (${supplier.name})` : ''}`;

      for (const row of rows) {
        const { code, name, cost, stock, price, category, unit, minStock, isPerishable, lot, expiration, presentations } = row.data;
        let product = existing.get(code);
        if (!product) {
          if (productRoom <= 0) {
            reject(row, `Tope de ${productLimit.toLocaleString('es-DO')} productos del plan ${planName(planState.effectivePlan)}`);
            continue;
          }
          if (isPerishable && !perishablesAllowed) {
            reject(row, `Los perecederos están disponibles desde el plan Starter`);
            continue;
          }
          productRoom -= 1;
        } else if (product.isPerishable && stock > 0 && !perishablesAllowed) {
          reject(row, `Sumar existencias a un perecedero (lotes) está disponible desde el plan Starter`);
          continue;
        }
        let productId;
        let productName;
        const perishable = product ? product.isPerishable : Boolean(isPerishable);
        const expirationDate = expiration ? parseExpiration(expiration) : null;
        const supplierId = supplier?.id || null;

        if (!product) {
          // Un perecedero entra por sus lotes: el producto nace en 0 y cada lote suma su existencia
          const created = await tx.product.create({
            data: {
              code,
              name,
              categoryId: category ? categoryIds.get(category.toLowerCase()) : defaultCategoryId,
              costPrice: cost,
              salePrice: price,
              stock: perishable ? 0 : stock,
              unit: unit || 'UND',
              minStock: minStock ?? 0,
              isPerishable: perishable,
            },
          });
          for (const presentation of presentations || []) {
            try {
              await tx.productPresentation.create({ data: { ...presentation, productId: created.id, companyId: created.companyId } });
            } catch (err) {
              if (err.code === 'P2002') throw AppError.conflict(`El código de barras ${presentation.barcode || ''} ya lo usa otra presentación`);
              throw err;
            }
          }
          product = { ...created, stock: perishable ? 0 : stock };
          existing.set(code, product);
          createdNow.add(code);
          productId = created.id;
          productName = created.name;
          counts.created += 1;
          if (perishable && stock > 0) {
            await addBatchStock(tx, { productId, batchNumber: lot, expiration: expirationDate, quantity: stock, costPrice: cost, supplierId });
            await tx.product.update({ where: { id: productId }, data: { stock: { increment: stock } } });
            product.stock = stock;
            counts.lots += 1;
          }
        } else {
          // Costo promedio ponderado cuando entra mercancía
          const newStock = product.stock + stock;
          const costPrice =
            stock > 0 && newStock > 0
              ? round2((product.stock * product.costPrice + stock * cost) / newStock)
              : product.costPrice;
          await tx.product.update({
            where: { id: product.id },
            data: {
              stock: newStock,
              costPrice,
              ...(updatePrices ? { salePrice: price } : {}),
            },
          });
          productId = product.id;
          productName = product.name;
          if (!createdNow.has(code)) counts.updated += 1;
          product.stock = newStock;
          product.costPrice = costPrice;
          // Perecedero: con lote y vencimiento entra a ese lote; sin ellos, como stock sin lote (SIN-LOTE)
          if (product.isPerishable && stock > 0) {
            if (lot && expirationDate) await addBatchStock(tx, { productId, batchNumber: lot, expiration: expirationDate, quantity: stock, costPrice: cost, supplierId });
            else await addUnbatchedStock(tx, { productId, quantity: stock, costPrice: cost });
            counts.lots += 1;
          }
        }

        if (stock > 0) {
          await tx.inventoryLog.create({
            data: {
              productId,
              productName,
              type: 'ENTRADA',
              quantity: stock,
              reason: perishable && lot ? `${reason} · lote ${lot}` : reason,
              userId: requester.userId,
              userName: requester.fullName,
              unitCost: cost,
              totalCost: round2(stock * cost),
              supplier: supplier?.name || null,
              supplierId: supplier?.id || null,
            },
          });
          counts.entries += 1;
        }
      }

      await tx.inventoryImport.update({
        where: { id: importId },
        data: { status: 'APPLIED', appliedAt: new Date(), summary: { ...batch.summary, applied: counts, rejectedByPlan: rejected.length } },
      });
      return { ...counts, rejected: rejected.length, rejectedRows: rejected.slice(0, 200) };
    },
    { timeout: 120000, maxWait: 10000 }
  );

  return result;
}

export async function cancelImport(importId) {
  await getStagedBatch(importId);
  await prisma.inventoryImport.update({ where: { id: importId }, data: { status: 'CANCELED' } });
  return { ok: true };
}

export function listImports() {
  return prisma.inventoryImport.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: { id: true, fileName: true, status: true, userName: true, createdAt: true, appliedAt: true, summary: true },
  });
}
