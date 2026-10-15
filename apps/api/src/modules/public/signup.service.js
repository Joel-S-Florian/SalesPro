import { PLANS, PLAN_IDS } from '@factos/shared/plans.js';
import { TERMS_VERSION } from '@factos/shared/legal.js';
import { basePrisma } from '../../config/db.js';
import { AppError, ERROR_CODES } from '../../shared/exceptions/AppError.js';
import { hashPassword } from '../../shared/utils/crypto.js';
import { bootstrapCompany } from '../platform/bootstrap.js';
import { login } from '../auth/auth.service.js';
import { sendMail } from '../../shared/utils/mailer.js';
import { env } from '../../config/env.js';

/** Planes que se pueden contratar solos hoy. Los de pago llegarán con la pasarela de cobro. */
const SELF_SERVICE_PLANS = PLAN_IDS.filter(id => PLANS[id].selfService);

/**
 * Registro autónomo: crea la empresa, su administrador y su configuración inicial (datos del negocio,
 * ITBIS, métodos de pago, formato de comprobante y primera caja) y devuelve la sesión ya iniciada.
 * El correo del administrador es su usuario de acceso.
 */
export async function signup({ plan, account, company, settings, termsVersion }) {
  // La versión aceptada debe ser la vigente: si los términos cambiaron mientras la persona llenaba el formulario, vuelve a aceptarlos
  if (termsVersion !== TERMS_VERSION) {
    throw AppError.badRequest('Los términos de servicio cambiaron. Recarga la página y vuelve a aceptarlos.');
  }

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
        termsAcceptedAt: new Date(),
        termsVersion: TERMS_VERSION,
      },
    });

    await tx.user.create({
      data: { companyId: newCompany.id, username, email: username, fullName: account.fullName, passwordHash, role: 'ADMINISTRADOR' },
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

  // Aviso al equipo de la cuenta nueva (no espera ni afecta el registro)
  void sendMail({
    to: env.NOTIFY_EMAIL,
    subject: `Cuenta nueva en FACTOS: ${company.name}`,
    text: [`Se registró una empresa nueva.`, '', `Negocio: ${company.name}${company.businessType ? ` (${company.businessType})` : ''}`, `Administrador: ${account.fullName} <${account.email}>`, company.phone ? `Teléfono: ${company.phone}` : '', `Plan: ${plan}`].filter(Boolean).join('\n'),
  });

  // Sesión iniciada: el usuario entra al sistema sin volver a escribir sus datos
  return login(username, account.password);
}
