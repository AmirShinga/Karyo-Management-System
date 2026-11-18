const jwt = require('jsonwebtoken');
const { unauthorized, forbidden } = require('../utils/response');
const { isAllowed } = require('../utils/permissionCache');
const { isRevoked } = require('../utils/sessions');
const { pool } = require('../config/db');

function getToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7);
  return req.headers['x-auth-token'] || null;
}

/** Rejects tokens whose session, account or token version was invalidated. */
async function isSessionCurrent(payload) {
  const [rows] = await pool.query(
    `SELECT u.active, u.token_version, s.revoked_at
       FROM users u LEFT JOIN sessions s ON s.id = ?
      WHERE u.id = ? AND u.deleted_at IS NULL LIMIT 1`,
    [payload.sid || null, payload.id]
  );
  const row = rows[0];
  if (!row || !row.active) return false;
  if (Number(row.token_version || 0) !== Number(payload.tv || 0)) return false;
  if (payload.sid && row.revoked_at) return false;
  return true;
}

/** Verifies the JWT and attaches { id, role, name, sid } to req.user. */
async function auth(req, res, next) {
  const token = getToken(req);
  if (!token) return next(unauthorized());
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return next(unauthorized('Invalid or expired token'));
  }
  if (payload.sid && isRevoked(payload.sid)) {
    return next(unauthorized('Session has been revoked'));
  }
  try {
    if (!(await isSessionCurrent(payload))) {
      return next(unauthorized('Session has been revoked'));
    }
  } catch (err) {
    return next(err);
  }
  req.user = { id: payload.id, role: payload.role, name: payload.name, sid: payload.sid };
  return next();
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

module.exports = { auth, roleCheck, requirePerm, isSessionCurrent };
