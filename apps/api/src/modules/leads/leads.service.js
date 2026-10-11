import { randomBytes, randomInt } from 'node:crypto';
import { basePrisma } from '../../config/db.js';
import { AppError } from '../../shared/exceptions/AppError.js';
import { buildPaginationQuery, getPaginationMeta } from '../../shared/utils/helpers.js';
import { createCompany } from '../platform/platform.service.js';

/** Alta pública de una solicitud de acceso (la página de promoción). */
export async function createLead(data, ipAddress) {
  return basePrisma.lead.create({
    data: {
      name: data.name,
      business: data.business,
      businessType: data.businessType || null,
      contact: data.contact,
      note: data.note || null,
      ipAddress: ipAddress || null,
    },
    select: { id: true },
  });
}

export async function listLeads({ page = 1, limit = 10, status }) {
  const { skip, take } = buildPaginationQuery({ page, limit });
  const where = status ? { status } : {};
  const [data, total] = await Promise.all([
    basePrisma.lead.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
    basePrisma.lead.count({ where }),
  ]);
  return { data, pagination: getPaginationMeta(page, limit, total) };
}

export const countNewLeads = () => basePrisma.lead.count({ where: { status: 'NEW' } });

const slug = text =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 14) || 'empresa';

/** Contraseña temporal legible (sin caracteres ambiguos): 12 caracteres con mayúsculas, minúsculas y dígitos. */
function temporaryPassword() {
  const alphabet = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(12);
  return Array.from(bytes, byte => alphabet[byte % alphabet.length]).join('');
}

async function availableUsername(base) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = attempt === 0 ? `${base}.admin` : `${base}.admin${randomInt(10, 99)}`;
    if (!(await basePrisma.user.findUnique({ where: { username: candidate } }))) return candidate;
  }
  return `${base}.admin${randomInt(1000, 9999)}`;
}

/**
 * Aprueba una solicitud: crea la empresa (con prueba gratuita) y su administrador con una contraseña
 * temporal que se devuelve UNA sola vez. El correo o WhatsApp del solicitante se guarda como contacto.
 */
export async function approveLead(id, { plan = 'STARTER', trialDays = 14 } = {}) {
  const lead = await basePrisma.lead.findUnique({ where: { id } });
  if (!lead) throw AppError.notFound('Solicitud no encontrada');
  if (lead.status !== 'NEW') throw AppError.conflict('Esta solicitud ya fue atendida');

  const username = await availableUsername(slug(lead.business));
  const password = temporaryPassword();
  const looksLikeEmail = /^\S+@\S+\.\S+$/.test(lead.contact);

  const company = await createCompany({
    name: lead.business,
    email: looksLikeEmail ? lead.contact : '',
    phone: looksLikeEmail ? '' : lead.contact,
    plan,
    trialDays,
    admin: { fullName: lead.name, username, password },
  });

  await basePrisma.lead.update({
    where: { id },
    data: { status: 'APPROVED', companyId: company.id, handledAt: new Date() },
  });

  return { company, credentials: { username, password } };
}

export async function rejectLead(id) {
  const lead = await basePrisma.lead.findUnique({ where: { id } });
  if (!lead) throw AppError.notFound('Solicitud no encontrada');
  if (lead.status !== 'NEW') throw AppError.conflict('Esta solicitud ya fue atendida');
  return basePrisma.lead.update({ where: { id }, data: { status: 'REJECTED', handledAt: new Date() } });
}
