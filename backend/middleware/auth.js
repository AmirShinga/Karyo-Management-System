const jwt = require('jsonwebtoken');
const { unauthorized, forbidden } = require('../utils/response');
const { isAllowed } = require('../utils/permissionCache');
const { isRevoked } = require('../utils/sessions');

function getToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7);
  return req.headers['x-auth-token'] || null;
}

/** Verifies the JWT and attaches { id, role, name, sid } to req.user. */
function auth(req, res, next) {
  const token = getToken(req);
  if (!token) return next(unauthorized());
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    // Reject tokens whose session has been revoked (logout, role change, reset).
    if (payload.sid && isRevoked(payload.sid)) {
      return next(unauthorized('Session has been revoked'));
    }
    req.user = { id: payload.id, role: payload.role, name: payload.name, sid: payload.sid };
    next();
  } catch {
    next(unauthorized('Invalid or expired token'));
  }
}

/** Restricts a route to the given roles. Use after `auth`. */
function roleCheck(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) return next(forbidden());
    next();
  };
}

/**
 * Restricts a route to holders of a permission code.
 * Admin always passes; other roles are checked against the DB-backed matrix.
 * Must be used after `auth`.
 */
function requirePerm(code) {
  return async (req, res, next) => {
    try {
      if (!req.user) return next(unauthorized());
      if (await isAllowed(req.user.role, code)) return next();
      return next(forbidden());
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { auth, roleCheck, requirePerm };
