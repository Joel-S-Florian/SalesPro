import { z } from 'zod';
import { AppError } from '../exceptions/AppError.js';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH_PRIVILEGED, minLengthFor, passwordProblem } from '@factos/shared/passwordPolicy.js';

/** La política vive en `packages/shared/passwordPolicy.js` (misma copia para el API y el navegador). */
export { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH_PRIVILEGED, minLengthFor, passwordProblem };

/** Lanza un error 400 si la contraseña no cumple la política. `context` = { role, username, email, companyName }. */
export function assertPasswordAllowed(password, context) {
  const problem = passwordProblem(password, context);
  if (problem) throw AppError.badRequest(`La contraseña no sirve: ${problem.charAt(0).toLowerCase()}${problem.slice(1)}`);
}

/** Campo zod con la política básica (sin contexto: el servicio revisa rol, usuario, correo y empresa). */
export const passwordSchema = z
  .string()
  .max(MAX_PASSWORD_LENGTH, `La contraseña no puede pasar de ${MAX_PASSWORD_LENGTH} caracteres`)
  .superRefine((value, ctx) => {
    const problem = passwordProblem(value);
    if (problem) ctx.addIssue({ code: 'custom', message: `La contraseña no sirve: ${problem.charAt(0).toLowerCase()}${problem.slice(1)}` });
  });
