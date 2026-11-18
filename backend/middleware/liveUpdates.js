const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Session endpoints that should not trigger data refreshes in other clients.
const IGNORED_PREFIXES = [
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/refresh',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/auth/mfa/verify',
  '/api/auth/change-password',
  '/api/auth/mfa/setup',
  '/api/auth/mfa/enable',
  '/api/auth/mfa/disable',
  '/api/auth/sessions',
];

function isIgnored(path) {
  return IGNORED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

/**
 * Broadcasts one generic event after any successful data mutation.
 * Clients listen for `data:changed` and refresh the data they display.
 */
module.exports = function liveUpdates(req, res, next) {
  if (!MUTATING_METHODS.has(req.method) || !req.path.startsWith('/api/')) {
    return next();
  }
  if (isIgnored(req.path)) return next();

  res.on('finish', () => {
    if (res.statusCode < 200 || res.statusCode >= 300) return;
    const io = req.app.get('io');
    if (!io) return;
    io.emit('data:changed', {
      method: req.method,
      path: req.originalUrl.split('?')[0],
    });
  });

  return next();
};
