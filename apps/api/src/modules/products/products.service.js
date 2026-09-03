import { prisma } from '../../config/db.js';
import { AppError } from '../../shared/exceptions/AppError.js';
import { ERROR_CODES } from '../../shared/exceptions/AppError.js';
import { buildPaginationQuery, getPaginationMeta, round2, cleanFilterString } from '../../shared/utils/helpers.js';

/**
 * Get all products with pagination, search, and filters
 */
export async function getProducts({ page = 1, limit = 20, sortBy = 'name', sortOrder = 'asc', q, categoryId, active, lowStock }) {
  const { skip, take, orderBy } = buildPaginationQuery({ page, limit, sortBy, sortOrder });

  const where = {};

  const cleanQ = cleanFilterString(q);
  if (cleanQ) {
    where.OR = [
      { name: { contains: cleanQ, mode: 'insensitive' } },
      { code: { contains: cleanQ, mode: 'insensitive' } },
      { description: { contains: cleanQ, mode: 'insensitive' } },
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

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      skip: onlyLowStock ? undefined : skip,
      take: onlyLowStock ? undefined : take,
      orderBy,
      include: {
        category: { select: { id: true, name: true } },
      },
    }),
    prisma.product.count({ where }),
  ]);

  const filtered = onlyLowStock ? products.filter(p => p.stock <= p.minStock) : products;
  const paginated = onlyLowStock ? filtered.slice(skip, skip + take) : filtered;
  const finalTotal = onlyLowStock ? filtered.length : total;

  // Calculate margin for each product
  const productsWithMargin = paginated.map(p => ({
    ...p,
    margin: p.costPrice > 0 ? round2(((Number(p.salePrice) - Number(p.costPrice)) / Number(p.salePrice)) * 100) : 0,
    marginAmount: round2(Number(p.salePrice) - Number(p.costPrice)),
    isLowStock: p.active && p.stock <= p.minStock,
  }));

  return {
    data: productsWithMargin,
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
  const { code, name, description, categoryId, costPrice, salePrice, stock, minStock, active } = data;

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

  const product = await prisma.product.create({
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
    },
    include: { category: { select: { id: true, name: true } } },
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
  const { name, description, costPrice, salePrice, minStock, active } = data;

  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) {
    throw AppError.notFound('Producto no encontrado');
  }

  const updateData = {};
  if (name) updateData.name = name;
  if (description !== undefined) updateData.description = description;
  if (costPrice !== undefined) updateData.costPrice = costPrice;
  if (salePrice !== undefined) updateData.salePrice = salePrice;
  if (minStock !== undefined) updateData.minStock = minStock;
  if (active !== undefined) updateData.active = active;

  const updated = await prisma.product.update({
    where: { id },
    data: updateData,
    include: { category: { select: { id: true, name: true } } },
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
export async function adjustStock(data, userId, userName) {
  const { productId, type, quantity, reason } = data;

  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) {
    throw AppError.notFound('Producto no encontrado');
  }

  if (type === 'SALIDA' && product.stock < quantity) {
    throw AppError.badRequest('El stock disponible no cubre la salida', ERROR_CODES.INSUFFICIENT_STOCK);
  }

  return prisma.$transaction(async (tx) => {
    let newStock = product.stock;
    if (type === 'ENTRADA') newStock += quantity;
    else if (type === 'SALIDA') newStock -= quantity;
    else if (type === 'AJUSTE') newStock = quantity; // Set exact quantity
    else if (type === 'DEVOLUCION') newStock += quantity;

    const updated = await tx.product.update({
      where: { id: productId },
      data: { stock: newStock },
    });

    const log = await tx.inventoryLog.create({
      data: {
        productId,
        productName: product.name,
        type,
        quantity,
        reason: `Ajuste: ${reason}`,
        userId,
        userName,
      },
    });

    return { success: true, updatedStock: newStock, log };
  });
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