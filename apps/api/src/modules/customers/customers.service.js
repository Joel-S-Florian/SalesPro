import { prisma } from '../../config/db.js';
import { AppError } from '../../shared/exceptions/AppError.js';
import { ERROR_CODES } from '../../shared/exceptions/AppError.js';
import { buildPaginationQuery, getPaginationMeta, cleanFilterString } from '../../shared/utils/helpers.js';
import { getDocumentType, formatRNC, formatCedula } from '../../shared/utils/dgii.js';

/**
 * Get all customers with pagination and search
 */
export async function getCustomers({ page = 1, limit = 20, sortBy = 'name', sortOrder = 'asc', q }) {
  const { skip, take, orderBy } = buildPaginationQuery({ page, limit, sortBy, sortOrder });

  const cleanQ = cleanFilterString(q);
  const where = cleanQ ? {
    OR: [
      { name: { contains: cleanQ, mode: 'insensitive' } },
      { documentId: { contains: cleanQ, mode: 'insensitive' } },
      { email: { contains: cleanQ, mode: 'insensitive' } },
      { phone: { contains: cleanQ, mode: 'insensitive' } },
      { rnc: { contains: cleanQ, mode: 'insensitive' } },
    ],
  } : {};

  const [customers, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      skip,
      take,
      orderBy,
      include: {
        _count: { select: { sales: true } },
      },
    }),
    prisma.customer.count({ where }),
  ]);

  // Format document IDs for display
  const formatted = customers.map(c => ({
    ...c,
    documentType: getDocumentType(c.documentId),
    formattedDocumentId: c.documentId.length === 11 ? formatCedula(c.documentId) : formatRNC(c.documentId),
  }));

  return {
    data: formatted,
    pagination: getPaginationMeta(page, limit, total),
  };
}

/**
 * Get customer by ID
 */
export async function getCustomerById(id) {
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      sales: {
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          invoiceNumber: true,
          total: true,
          createdAt: true,
          paymentMethod: true,
        },
      },
    },
  });

  if (!customer) {
    throw AppError.notFound('Cliente no encontrado');
  }

  return {
    ...customer,
    documentType: getDocumentType(customer.documentId),
    formattedDocumentId: customer.documentId.length === 11 ? formatCedula(customer.documentId) : formatRNC(customer.documentId),
  };
}

/**
 * Create new customer
 */
export async function createCustomer(data) {
  const { documentId, name, email, phone, address, rnc } = data;

  // Check documentId uniqueness (except consumidor final)
  if (documentId !== '000000000') {
    const existing = await prisma.customer.findUnique({ where: { documentId } });
    if (existing) {
      throw AppError.conflict('El Documento de Identidad ya existe', ERROR_CODES.DUPLICATE_ENTRY);
    }
  }

  const customer = await prisma.customer.create({
    data: {
      documentId,
      name,
      email: email || null,
      phone: phone || null,
      address: address || null,
      rnc: rnc || null,
    },
  });

  return {
    ...customer,
    documentType: getDocumentType(customer.documentId),
    formattedDocumentId: customer.documentId.length === 11 ? formatCedula(customer.documentId) : formatRNC(customer.documentId),
  };
}

/**
 * Update customer
 */
export async function updateCustomer(id, data) {
  const { documentId, name, email, phone, address, rnc } = data;

  const customer = await prisma.customer.findUnique({ where: { id } });
  if (!customer) {
    throw AppError.notFound('Cliente no encontrado');
  }

  // Prevent modification of consumidor final
  if (id === 'cust_final' || customer.documentId === '000000000') {
    throw AppError.badRequest('No se puede modificar el cliente comodín Consumidor Final');
  }

  if (documentId && documentId !== customer.documentId && documentId !== '000000000') {
    const existing = await prisma.customer.findFirst({
      where: { documentId, NOT: { id } },
    });
    if (existing) {
      throw AppError.conflict('El Documento de Identidad ya está asignado a otro cliente', ERROR_CODES.DUPLICATE_ENTRY);
    }
  }

  const updated = await prisma.customer.update({
    where: { id },
    data: {
      documentId: documentId || customer.documentId,
      name: name || customer.name,
      email: email !== undefined ? email : customer.email,
      phone: phone !== undefined ? phone : customer.phone,
      address: address !== undefined ? address : customer.address,
      rnc: rnc !== undefined ? rnc : customer.rnc,
    },
  });

  return {
    ...updated,
    documentType: getDocumentType(updated.documentId),
    formattedDocumentId: updated.documentId.length === 11 ? formatCedula(updated.documentId) : formatRNC(updated.documentId),
  };
}

/**
 * Delete customer
 */
export async function deleteCustomer(id) {
  // Prevent deletion of consumidor final
  const customer = await prisma.customer.findUnique({ where: { id } });
  if (!customer) {
    throw AppError.notFound('Cliente no encontrado');
  }

  if (customer.documentId === '000000000') {
    throw AppError.badRequest('No se puede eliminar el cliente comodín Consumidor Final');
  }

  const salesCount = await prisma.sale.count({ where: { customerId: id } });
  if (salesCount > 0) {
    throw AppError.badRequest('No se puede eliminar porque tiene historial de compras asociado', ERROR_CODES.CUSTOMER_HAS_SALES);
  }

  await prisma.customer.delete({ where: { id } });
  return { success: true };
}

/**
 * Get customer for POS (lightweight)
 */
export async function getCustomersForPOS() {
  const customers = await prisma.customer.findMany({
    select: { id: true, documentId: true, name: true, rnc: true },
    orderBy: { name: 'asc' },
  });

  return customers.map(c => ({
    ...c,
    documentType: getDocumentType(c.documentId),
    displayName: `${c.name} (${c.documentId})`,
  }));
}