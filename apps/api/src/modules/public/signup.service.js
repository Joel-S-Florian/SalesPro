import { basePrisma } from '../../config/db.js';
import { AppError, ERROR_CODES } from '../../shared/exceptions/AppError.js';
import { hashPassword } from '../../shared/utils/crypto.js';
import { bootstrapCompany } from '../platform/bootstrap.js';
import { login } from '../auth/auth.service.js';

/** Planes que se pueden contratar solos hoy. Los de pago llegarán con la pasarela de cobro. */
const SELF_SERVICE_PLANS = ['FREE'];

/**
 * Registro autónomo: crea la empresa, su administrador y su configuración inicial (datos del negocio,
 * ITBIS, métodos de pago, formato de comprobante y primera caja) y devuelve la sesión ya iniciada.
 * El correo del administrador es su usuario de acceso.
 */
export async function signup({ plan, account, company, settings }) {
  if (!SELF_SERVICE_PLANS.includes(plan)) {
    throw AppError.badRequest('Ese plan todavía no está disponible para contratación en línea');
  }

  const username = account.email.toLowerCase();
  if (await basePrisma.user.findUnique({ where: { username } })) {
    throw AppError.conflict('Ya existe una cuenta con ese correo. Inicia sesión.', ERROR_CODES.DUPLICATE_ENTRY);
  }
  if (company.rnc && (await basePrisma.company.findUnique({ where: { rnc: company.rnc } }))) {
    throw AppError.conflict('Ya hay una empresa registrada con ese RNC. Si es tuya, escríbenos.', ERROR_CODES.DUPLICATE_ENTRY);
  }

  const passwordHash = await hashPassword(account.password);
  const business = {
    name: company.name,
    rnc: company.rnc || '',
    address: company.address || '',
    phone: company.phone || '',
    email: account.email,
  };

  const created = await basePrisma.$transaction(async tx => {
    const newCompany = await tx.company.create({
      data: {
        name: company.name,
        rnc: company.rnc || null,
        email: account.email,
        phone: company.phone || null,
        address: company.address || null,
        plan,
      },
    });

    await tx.user.create({
      data: { companyId: newCompany.id, username, fullName: account.fullName, passwordHash, role: 'ADMINISTRADOR' },
    });

    await tx.systemConfig.createMany({
      data: [
        { key: 'business', value: business },
        { key: 'taxRate', value: settings.taxRate },
        { key: 'paymentMethods', value: settings.paymentMethods },
        { key: 'receiptFormat', value: settings.receiptFormat },
      ].map(row => ({ ...row, companyId: newCompany.id })),
    });

    await tx.terminal.create({ data: { companyId: newCompany.id, name: settings.terminalName } });
    return newCompany;
  });

  await bootstrapCompany(created.id);

  // Sesión iniciada: el usuario entra al sistema sin volver a escribir sus datos
  return login(username, account.password);
}
