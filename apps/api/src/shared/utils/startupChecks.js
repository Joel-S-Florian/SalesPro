import { basePrisma } from '../../config/db.js';
import { isProd } from '../../config/env.js';
import { comparePassword } from './crypto.js';

/** Contraseñas de desarrollo conocidas de las cuentas de plataforma. */
const DEV_SUPERADMIN_PASSWORDS = ['superadmin'];

/**
 * En producción, el API se niega a iniciar si existe un SUPERADMIN con la contraseña de desarrollo.
 * (Solo revisa a los SUPERADMIN: son pocos, así que el costo de comparar es insignificante.)
 * @returns {Promise<string[]>} nombres de usuario inseguros (vacío si todo está bien)
 */
export async function findDevSuperadmins() {
  const superadmins = await basePrisma.user.findMany({ where: { role: 'SUPERADMIN' }, select: { username: true, passwordHash: true } });
  const unsafe = [];
  for (const user of superadmins) {
    for (const candidate of DEV_SUPERADMIN_PASSWORDS) {
      if (await comparePassword(candidate, user.passwordHash)) {
        unsafe.push(user.username);
        break;
      }
    }
  }
  return unsafe;
}

/** Lanza un error claro si, en producción, hay un SUPERADMIN con la contraseña de desarrollo. */
export async function assertNoDevSuperadmin() {
  if (!isProd) return;
  const unsafe = await findDevSuperadmins();
  if (unsafe.length) {
    throw new Error(
      `El usuario de plataforma «${unsafe.join('», «')}» todavía usa la contraseña de desarrollo. ` +
        'Cámbiala antes de iniciar en producción (por ejemplo: inicia sesión en un entorno de desarrollo y usa «Cambiar mi contraseña»).'
    );
  }
}
