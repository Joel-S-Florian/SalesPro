import { prisma } from '../../config/db.js';
import { AppError } from '../../shared/exceptions/AppError.js';
import { ERROR_CODES } from '../../shared/exceptions/AppError.js';
import { buildPaginationQuery, getPaginationMeta } from '../../shared/utils/helpers.js';

/**
 * Get all categories with pagination
 */
export async function getCategories({ page = 1, limit = 20, sortBy = 'name', sortOrder = 'asc', q }) {
  const { skip, take, orderBy } = buildPaginationQuery({ page, limit, sortBy, sortOrder });

  const where = q ? {
    OR: [
      { name: { contains: q, mode: 'insensitive' } },
      { description: { contains: q, mode: 'insensitive' } },
    ],
  } : {};

  const [categories, total] = await Promise.all([
    prisma.category.findMany({
      where,
      skip,
      take,
      orderBy,
      include: {
        _count: { select: { products: true } },
      },
    }),
    prisma.category.count({ where }),
  ]);

  return {
    data: categories,
    pagination: getPaginationMeta(page, limit, total),
  };
}

/**
 * Get category by ID
 */
export async function getCategoryById(id) {
  const category = await prisma.category.findUnique({
    where: { id },
    include: {
      products: {
        select: { id: true, code: true, name: true, stock: true, salePrice: true, active: true },
      },
    },
  });

  if (!category) {
    throw AppError.notFound('Categoría no encontrada');
  }

  return category;
}

/**
 * Create new category
 */
export async function createCategory(data) {
  const { name, description } = data;

  const existing = await prisma.category.findFirst({
    where: { name: { equals: name, mode: 'insensitive' } },
  });

  if (existing) {
    throw AppError.conflict('Ya existe una categoría con ese nombre', ERROR_CODES.DUPLICATE_ENTRY);
  }

  return prisma.category.create({
    data: { name, description },
  });
}

/**
 * Update category
 */
export async function updateCategory(id, data) {
  const { name, description } = data;

  const category = await prisma.category.findUnique({ where: { id } });
  if (!category) {
    throw AppError.notFound('Categoría no encontrada');
  }

  if (name && name !== category.name) {
    const existing = await prisma.category.findFirst({
      where: { name: { equals: name, mode: 'insensitive' }, NOT: { id } },
    });
    if (existing) {
      throw AppError.conflict('Ya existe una categoría con ese nombre', ERROR_CODES.DUPLICATE_ENTRY);
    }
  }

  return prisma.category.update({
    where: { id },
    data: { name, description },
  });
}

/**
 * Delete category
 */
export async function deleteCategory(id) {
  const category = await prisma.category.findUnique({ where: { id } });
  if (!category) {
    throw AppError.notFound('Categoría no encontrada');
  }

  const productsCount = await prisma.product.count({ where: { categoryId: id } });
  if (productsCount > 0) {
    throw AppError.badRequest('No se puede eliminar la categoría porque tiene productos asignados', ERROR_CODES.CATEGORY_HAS_PRODUCTS);
  }

  await prisma.category.delete({ where: { id } });
  return { success: true };
}