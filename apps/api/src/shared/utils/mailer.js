import nodemailer from 'nodemailer';
import { env } from '../../config/env.js';
import { logger } from './logger.js';

let transporter;

/** El correo está configurado cuando hay servidor SMTP y remitente. */
export const mailConfigured = () => Boolean(env.SMTP_HOST && env.MAIL_FROM);

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE ?? env.SMTP_PORT === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
  }
  return transporter;
}

/**
 * Envía un correo de texto. Nunca lanza: devuelve `{ sent }` para que un fallo del correo no tumbe la operación
 * (la solicitud de la landing, por ejemplo, ya quedó guardada). Sin SMTP configurado solo deja constancia en el log.
 */
export async function sendMail({ to, subject, text, replyTo }) {
  if (!to) return { sent: false, reason: 'sin-destinatario' };
  if (!mailConfigured()) {
    logger.warn(`Correo no configurado (SMTP_HOST/MAIL_FROM): no se envió «${subject}»`);
    return { sent: false, reason: 'no-configurado' };
  }
  try {
    await getTransporter().sendMail({ from: env.MAIL_FROM, to, subject, text, replyTo });
    return { sent: true };
  } catch (err) {
    logger.error(`No se pudo enviar el correo «${subject}»: ${err.message}`);
    return { sent: false, reason: 'error' };
  }
}
