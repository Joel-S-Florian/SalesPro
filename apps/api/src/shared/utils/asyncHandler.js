/**
 * Wrapper for async route handlers to catch errors automatically
 * @param {Function} fn - Async route handler
 * @returns {Function} Express middleware
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Wrapper for async middleware
 * @param {Function} fn - Async middleware
 * @returns {Function} Express middleware
 */
export function asyncMiddleware(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}