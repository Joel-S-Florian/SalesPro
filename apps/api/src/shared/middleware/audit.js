import { prisma } from '../../config/db.js';
import { logger } from '../../shared/utils/logger.js';

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

        await prisma.auditLog.create({
          data: {
            userId,
            action,
            entity,
            entityId: req.params.id || (newData?.id ? newData.id : null),
            newData,
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
    await prisma.auditLog.create({ data });
  } catch (error) {
    logger.warn('Manual audit log failed:', { error: error.message });
  }
}