import { basePrisma } from '../../config/db.js';
import { AppError, ERROR_CODES } from '../../shared/exceptions/AppError.js';
import { hashPassword } from '../../shared/utils/crypto.js';
import { bootstrapCompany } from './bootstrap.js';

/**
 * Operaciones de plataforma (super-admin). Usan `basePrisma` a propósito: ven todas las empresas.
 */

const companySelect = {
  id: true,
  name: true,
  rnc: true,
  email: true,
  phone: true,
  address: true,
  active: true,
  plan: true,
  trialEndsAt: true,
  createdAt: true,
  _count: { select: { users: true, products: true, sales: true } },
};

export async function listCompanies({ q } = {}) {
  const where = q
    ? {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { rnc: { contains: q, mode: 'insensitive' } },
        ],
      }
    : {};
  return basePrisma.company.findMany({ where, orderBy: { createdAt: 'desc' }, select: companySelect });
}

export async function getCompany(id) {
  const company = await basePrisma.company.findUnique({
    where: { id },
    select: {
      ...companySelect,
      users: {
        select: { id: true, username: true, fullName: true, role: true, active: true },
        orderBy: { createdAt: 'asc' },
      },
    },
  });
  if (!company) throw AppError.notFound('Empresa no encontrada');
  return company;
}

async function assertRncAvailable(rnc, exceptId) {
  if (!rnc) return;
  const existing = await basePrisma.company.findUnique({ where: { rnc } });
  if (existing && existing.id !== exceptId) {
    throw AppError.conflict('Ya existe una empresa con ese RNC', ERROR_CODES.DUPLICATE_ENTRY);
  }
}

const clean = data =>
  Object.fromEntries(Object.entries(data).map(([key, value]) => [key, value === '' ? null : value]));

/**
 * Crea una empresa con su primer administrador y sus secuencias NCF.
 */
export async function createCompany({ admin, trialDays, ...companyData }) {
  const data = clean(companyData);
  if (trialDays) data.trialEndsAt = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000);
  await assertRncAvailable(data.rnc);

  const username = admin.username.toLowerCase();
  if (await basePrisma.user.findUnique({ where: { username } })) {
    throw AppError.conflict('El nombre de usuario ya está registrado', ERROR_CODES.DUPLICATE_ENTRY);
  }

  const passwordHash = await hashPassword(admin.password);

  const company = await basePrisma.$transaction(async tx => {
    const created = await tx.company.create({ data });
    await tx.user.create({
      data: {
        companyId: created.id,
        username,
        fullName: admin.fullName,
        passwordHash,
        role: 'ADMINISTRADOR',
      },
    });
    return created;
  });

  await bootstrapCompany(company.id);
  return getCompany(company.id);
}

export async function updateCompany(id, data) {
  await getCompany(id);
  const clean_ = clean(data);
  if ('trialEndsAt' in clean_) clean_.trialEndsAt = clean_.trialEndsAt ? new Date(clean_.trialEndsAt) : null;
  await assertRncAvailable(clean_.rnc, id);
  await basePrisma.company.update({ where: { id }, data: clean_ });

  // Al suspender una empresa se cierran sus sesiones activas
  if (clean_.active === false) {
    await basePrisma.session.deleteMany({ where: { user: { companyId: id } } });
  }
  return getCompany(id);
}

export async function resetCompanyUserPassword(companyId, userId, newPassword) {
  const user = await basePrisma.user.findFirst({ where: { id: userId, companyId } });
  if (!user) throw AppError.notFound('Usuario no encontrado en esa empresa');
  await basePrisma.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(newPassword) } });
  await basePrisma.session.deleteMany({ where: { userId } });
  return { ok: true };
}

export async function getPlatformStats() {
  const [companies, activeCompanies, users, sales, revenue, newLeads] = await Promise.all([
    basePrisma.company.count(),
    basePrisma.company.count({ where: { active: true } }),
    basePrisma.user.count({ where: { companyId: { not: null } } }),
    basePrisma.sale.count(),
    basePrisma.sale.aggregate({ _sum: { total: true } }),
    basePrisma.lead.count({ where: { status: 'NEW' } }),
  ]);
  return { companies, activeCompanies, users, sales, salesVolume: revenue._sum.total || 0, newLeads };
}
