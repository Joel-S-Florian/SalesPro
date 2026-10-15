import { prisma } from '../../config/db.js';
import { AppError } from '../../shared/exceptions/AppError.js';
import { ERROR_CODES } from '../../shared/exceptions/AppError.js';
import { getTenantId } from '../../config/tenant.js';
import { getConfig } from '../config/config.service.js';
import { assertFeature, assertWithinPlan } from '../../shared/plans.js';
import { adjustStock as adjustInventoryStock } from '../inventory/inventory.service.js';
import { addBatchStock, addUnbatchedStock, attachNearestBatch, requireBatchFields } from '../inventory/batches.service.js';
import { DEFAULT_UNIT, isFractional, isValidUnit, quantityError, roundQty } from '../../shared/utils/units.js';
import { buildPaginationQuery, getPaginationMeta, round2, cleanFilterString } from '../../shared/utils/helpers.js';

/** Valida y normaliza las presentaciones recibidas (paquete, caja...). */
function normalizePresentations(list) {
  if (!Array.isArray(list)) return [];
  const names = new Set();
  const barcodes = new Set();
  return list.map(raw => {
    const name = String(raw.name || '').trim();
    const factor = Number(raw.factor);
    const salePrice = Number(raw.salePrice);
    const barcode = String(raw.barcode || '').trim() || null;
    if (!name || name.length > 40) throw AppError.badRequest('Cada presentación necesita un nombre (máx. 40 caracteres)');
    if (!(factor > 0) || Math.abs(factor * 100 - Math.round(factor * 100)) > 1e-6) throw AppError.badRequest(`Presentación «${name}»: la cantidad que contiene debe ser mayor que cero (máx. 2 decimales)`);
    if (!(salePrice >= 0)) throw AppError.badRequest(`Presentación «${name}»: precio inválido`);
    if (names.has(name.toLowerCase())) throw AppError.badRequest(`Presentación repetida: ${name}`);
    names.add(name.toLowerCase());
    if (barcode) {
      if (barcodes.has(barcode)) throw AppError.badRequest(`Código de barras repetido: ${barcode}`);
      barcodes.add(barcode);
    }
    return { name, factor, salePrice, barcode, active: raw.active !== false };
  });
}

/** Reemplaza las presentaciones de un producto (dentro de una transacción). */
async function savePresentations(tx, productId, presentations) {
  await tx.productPresentation.deleteMany({ where: { productId } });
  for (const p of presentations) {
    try {
      await tx.productPresentation.create({ data: { ...p, productId, companyId: getTenantId() } });
    } catch (err) {
      if (err.code === 'P2002') throw AppError.conflict(`El código de barras ${p.barcode || ''} ya lo usa otra presentación`, ERROR_CODES.DUPLICATE_ENTRY);
      throw err;
    }
  }
}

/**
 * Get all products with pagination, search, and filters
 */
export async function getProducts({ page = 1, limit = 20, sortBy = 'name', sortOrder = 'asc', q, categoryId, active, lowStock, stockStatus }) {
  const { skip, take, orderBy } = buildPaginationQuery({ page, limit, sortBy, sortOrder });

  const where = {};

  const cleanQ = cleanFilterString(q);
  if (cleanQ) {
    where.OR = [
      { name: { contains: cleanQ, mode: 'insensitive' } },
      { code: { contains: cleanQ, mode: 'insensitive' } },
      { description: { contains: cleanQ, mode: 'insensitive' } },
      { presentations: { some: { barcode: { contains: cleanQ, mode: 'insensitive' } } } }, // escanear el código de un paquete
    ];
  }

  const cleanCategory = cleanFilterString(categoryId);
  if (cleanCategory) {
    where.categoryId = cleanCategory;
  }

  if (active !== undefined) {
    where.active = active;
  }

  const onlyLowStock = lowStock === true || lowStock === 'true';

  // OUT se resuelve en la base; OK y LOW comparan dos columnas (stock vs minStock) y se filtran en memoria
  if (stockStatus === 'OUT') where.stock = 0;
  const memoryFilter = onlyLowStock
    ? p => p.stock <= p.minStock
    : stockStatus === 'LOW'
      ? p => p.stock > 0 && p.stock <= p.minStock
      : stockStatus === 'OK'
        ? p => p.stock > p.minStock
        : null;

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      skip: memoryFilter ? undefined : skip,
      take: memoryFilter ? undefined : take,
      orderBy,
      include: {
        category: { select: { id: true, name: true } },
        presentations: { where: { active: true }, orderBy: { factor: 'asc' } },
      },
    }),
    prisma.product.count({ where }),
  ]);

  const filtered = memoryFilter ? products.filter(memoryFilter) : products;
  const paginated = memoryFilter ? filtered.slice(skip, skip + take) : filtered;
  const finalTotal = memoryFilter ? filtered.length : total;

  // Calculate margin for each product
  const productsWithMargin = paginated.map(p => ({
    ...p,
    margin: p.costPrice > 0 ? round2(((Number(p.salePrice) - Number(p.costPrice)) / Number(p.salePrice)) * 100) : 0,
    marginAmount: round2(Number(p.salePrice) - Number(p.costPrice)),
    isLowStock: p.active && p.stock <= p.minStock,
  }));

  return {
    data: await attachNearestBatch(productsWithMargin),
    pagination: getPaginationMeta(page, limit, finalTotal),
  };
}

/**
 * Get product by ID
 */
export async function getProductById(id) {
  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      category: { select: { id: true, name: true } },
      presentations: { orderBy: { factor: 'asc' } },
    },
  });

  if (!product) {
    throw AppError.notFound('Producto no encontrado');
  }

  return {
    ...product,
    margin: product.costPrice > 0 ? round2(((Number(product.salePrice) - Number(product.costPrice)) / Number(product.salePrice)) * 100) : 0,
    marginAmount: round2(Number(product.salePrice) - Number(product.costPrice)),
    isLowStock: product.active && product.stock <= product.minStock,
  };
}

/**
 * Create new product
 */
export async function createProduct(data, userId, userName) {
  const { code, name, description, categoryId, costPrice, salePrice, stock, minStock, active, isPerishable } = data;
  const unit = data.unit || DEFAULT_UNIT;
  if (!isValidUnit(unit)) throw AppError.badRequest('Unidad de medida no válida');
  if (stock > 0) {
    const stockError = quantityError(stock, unit);
    if (stockError) throw AppError.badRequest(`Stock inicial: ${stockError}`);
  }
  const presentations = normalizePresentations(data.presentations);
  if (isPerishable) await assertPerishableEnabled(); // primero la función (más informativo que el tope)
  if (active !== false) await assertWithinPlan('products');
  // Perecedero con stock inicial: lote y vencimiento; sin ellos entra como stock sin lote
  const initialBatch = isPerishable && stock > 0 && (data.batchNumber || data.expirationDate) ? requireBatchFields(data) : null;

  // Check category exists
  const category = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!category) {
    throw AppError.notFound('Categoría no encontrada');
  }

  // Check code uniqueness
  const existing = await prisma.product.findFirst({
    where: { code: { equals: code, mode: 'insensitive' } },
  });
  if (existing) {
    throw AppError.conflict('El código de producto ya existe', ERROR_CODES.DUPLICATE_ENTRY);
  }

  const product = await prisma.$transaction(async tx => {
    const created = await tx.product.create({
      data: {
        code: code.toUpperCase(),
        name,
        description,
        categoryId,
        costPrice,
        salePrice,
        stock: stock || 0,
        minStock: minStock || 0,
        active: active ?? true,
        isPerishable: Boolean(isPerishable),
        unit,
      },
      include: { category: { select: { id: true, name: true } } },
    });
    await savePresentations(tx, created.id, presentations);
    if (isPerishable && stock > 0) {
      if (initialBatch) await addBatchStock(tx, { productId: created.id, ...initialBatch, quantity: stock, costPrice });
      else await addUnbatchedStock(tx, { productId: created.id, quantity: stock, costPrice });
    }
    return created;
  });

  // Create initial inventory log if stock > 0
  if (stock > 0) {
    await prisma.inventoryLog.create({
      data: {
        productId: product.id,
        productName: product.name,
        type: 'ENTRADA',
        quantity: stock,
        reason: 'Inventario Inicial',
        userId,
        userName,
      },
    });
  }

  return {
    ...product,
    margin: product.costPrice > 0 ? round2(((Number(product.salePrice) - Number(product.costPrice)) / Number(product.salePrice)) * 100) : 0,
    marginAmount: round2(Number(product.salePrice) - Number(product.costPrice)),
    isLowStock: product.active && product.stock <= product.minStock,
  };
}

/**
 * Update product
 */
export async function updateProduct(id, data, userId, userName) {
  const { name, description, costPrice, salePrice, minStock, active, isPerishable } = data;

  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) {
    throw AppError.notFound('Producto no encontrado');
  }

  // Reactivar un producto cuenta contra el tope del plan
  if (active === true && !product.active) await assertWithinPlan('products');

  const updateData = {};
  if (name) updateData.name = name;
  if (description !== undefined) updateData.description = description;
  if (costPrice !== undefined) updateData.costPrice = costPrice;
  if (salePrice !== undefined) updateData.salePrice = salePrice;
  if (minStock !== undefined) updateData.minStock = minStock;
  if (active !== undefined) updateData.active = active;

  if (data.unit !== undefined && data.unit !== product.unit) {
    if (!isValidUnit(data.unit)) throw AppError.badRequest('Unidad de medida no válida');
    // Pasar a una unidad entera con existencias fraccionarias dejaría decimales sueltos
    if (!isFractional(data.unit) && Math.abs(product.stock - Math.round(product.stock)) > 0.004) {
      throw AppError.badRequest('El producto tiene existencias con decimales; ajústelas a enteros antes de cambiar a una unidad entera');
    }
    updateData.unit = data.unit;
  }
  const presentations = data.presentations !== undefined ? normalizePresentations(data.presentations) : null;

  if (isPerishable !== undefined && isPerishable !== product.isPerishable) {
    if (isPerishable) await assertPerishableEnabled();
    else {
      const dated = await prisma.productBatch.count({ where: { productId: id, currentStock: { gt: 0 }, expirationDate: { not: null } } });
      if (dated > 0) throw AppError.badRequest('El producto tiene lotes con vencimiento y existencias; venda o dé de baja esos lotes primero');
    }
    updateData.isPerishable = isPerishable;
  }

  const updated = await prisma.$transaction(async tx => {
    const result = await tx.product.update({
      where: { id },
      data: updateData,
      include: { category: { select: { id: true, name: true } } },
    });
    if (presentations) await savePresentations(tx, id, presentations);
    // Al pasar a perecedero, el stock actual queda en un lote genérico (SIN-LOTE, sin vencimiento)
    if (isPerishable && !product.isPerishable && product.stock > 0) {
      await addUnbatchedStock(tx, { productId: id, quantity: product.stock, costPrice: Number(product.costPrice) });
    }
    return result;
  });

  return {
    ...updated,
    margin: updated.costPrice > 0 ? round2(((Number(updated.salePrice) - Number(updated.costPrice)) / Number(updated.salePrice)) * 100) : 0,
    marginAmount: round2(Number(updated.salePrice) - Number(updated.costPrice)),
    isLowStock: updated.active && updated.stock <= updated.minStock,
  };
}

/**
 * Delete product (soft delete if has sales)
 */
export async function deleteProduct(id) {
  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) {
    throw AppError.notFound('Producto no encontrado');
  }

  const salesCount = await prisma.saleDetail.count({ where: { productId: id } });

  if (salesCount > 0) {
    // Soft delete - deactivate
    await prisma.product.update({
      where: { id },
      data: { active: false },
    });
    return { message: 'El producto está asociado a ventas históricas; se ha marcado como Inactivo', active: false };
  }

  // Hard delete
  await prisma.product.delete({ where: { id } });
  return { success: true, deleted: true };
}

/**
 * Adjust stock (entrada/salida/ajuste/devolucion)
 */
export function adjustStock(data, userId, userName) {
  return adjustInventoryStock(data, userId, userName);
}

async function assertPerishableEnabled() {
  await assertFeature('perishables');
  const { perishable } = await getConfig();
  if (!perishable.enabled) throw AppError.badRequest('Active la gestión de perecederos en Configuración para marcar productos como perecederos');
}

/**
 * Get low stock products
 */
export async function getLowStockProducts() {
  const products = await prisma.product.findMany({
    where: { active: true },
    include: { category: { select: { id: true, name: true } } },
    orderBy: { stock: 'asc' },
  });

  return products
    .filter(p => p.stock <= p.minStock)
    .map(p => ({
    ...p,
    margin: p.costPrice > 0 ? round2(((Number(p.salePrice) - Number(p.costPrice)) / Number(p.salePrice)) * 100) : 0,
    isLowStock: true,
  }));
}