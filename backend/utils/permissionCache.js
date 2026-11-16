/**
 * In-memory cache of role -> allowed permission codes.
 * The catalog and matrix live in the database; this avoids a query per request.
 */
const { pool } = require('../config/db');

let cache = null;

async function load() {
  if (cache) return cache;

  const [rows] = await pool.query(
    'SELECT role, permission_code FROM role_permissions WHERE allowed = 1'
  );

  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.role)) map.set(row.role, new Set());
    map.get(row.role).add(row.permission_code);
  }

  cache = map;
  return cache;
}

/** Drops the cache so the next check re-reads the matrix. */
function invalidate() {
  cache = null;
}

/** Returns the list of permission codes granted to the role. Admin has all. */
async function getPermissions(role) {
  if (role === 'admin') {
    const [rows] = await pool.query('SELECT code FROM permissions ORDER BY sort_order, code');
    return rows.map((row) => row.code);
  }
  const map = await load();
  return [...(map.get(role) || [])];
}

/** True if the role may perform the permission code. Admin always may. */
async function isAllowed(role, code) {
  if (role === 'admin') return true;
  const map = await load();
  return map.get(role)?.has(code) || false;
}

module.exports = { getPermissions, isAllowed, invalidate };
