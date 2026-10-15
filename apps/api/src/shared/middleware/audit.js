import { basePrisma } from '../../config/db.js';
import { getTenantIdOrNull } from '../../config/tenant.js';
import { logger } from '../../shared/utils/logger.js';

/** Campos que NUNCA se guardan en la auditoría (contraseñas, claves temporales, tokens, secretos, certificados). */
const SECRET_KEY = /password|contrasena|temporarypassword|token|secret|passphrase|certificate|fileBase64/i;
export function redactSecrets(value, depth = 0) {
  if (value === null || typeof value !== 'object' || depth > 6) return value;
  if (Array.isArray(value)) return value.map(item => redactSecrets(item, depth + 1));
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, SECRET_KEY.test(key) ? '[oculto]' : redactSecrets(item, depth + 1)]));
}

/**
 * Audit log middleware - logs all mutating operations
 */
export function auditLog(action, entity) {
  return async (req, res, next) => {
    const originalSend = res.send;
    let responseBody;

    res.send = function (body) {
      responseBody = body;
      return originalSend.call(this, body);
    };

    res.on('finish', async () => {
      try {
        // Only audit mutating methods
        if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
          return;
        }

        // Skip health checks and similar
        if (req.path.startsWith('/health') || req.path.startsWith('/api/auth/login')) {
          return;
        }

        const userId = req.user?.userId;
        const ipAddress = req.ip;
        const userAgent = req.headers['user-agent'];

        // Try to parse response body for new data
        let newData = null;
        let oldData = null;

        if (responseBody) {
          try {
            newData = JSON.parse(responseBody);
          } catch {
            // Not JSON, skip
          }
        }

        // For updates, we could fetch old data here if needed
        // For now, just log the action

        await basePrisma.auditLog.create({
          data: {
            userId,
            companyId: req.user?.companyId ?? null,
            action,
            entity,
            entityId: req.params.id || (newData?.id ? newData.id : null),
            newData: redactSecrets(newData),
            ipAddress,
            userAgent,
          },
        });
      } catch (error) {
        // Don't let audit logging break the request
        logger.warn('Audit log failed:', { error: error.message });
      }
    });

    next();
  };
}

/**
 * Helper to manually create audit log
 */
export async function createAuditLog(data) {
  try {
    await basePrisma.auditLog.create({ data: { companyId: getTenantIdOrNull(), ...data } });
  } catch (error) {
    logger.warn('Manual audit log failed:', { error: error.message });
  }
}