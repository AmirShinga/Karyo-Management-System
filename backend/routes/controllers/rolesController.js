const { pool } = require('../../config/db');
const { sendData, badRequest, conflict } = require('../../utils/response');
const { ROLE_CODE_PATTERN, slugifyRole, listRoles } = require('../../db/roles');

async function getRoles(req, res, next) {
  try {
    return sendData(res, await listRoles(pool));
  } catch (err) {
    next(err);
  }
}

async function createRole(req, res, next) {
  try {
    const label = req.body.label.trim();
    const code = (req.body.code || slugifyRole(label)).toLowerCase();

    if (!ROLE_CODE_PATTERN.test(code)) {
      return next(
        badRequest('Role key must start with a letter and use only lowercase letters, numbers and underscores')
      );
    }

    const [existing] = await pool.query('SELECT code FROM roles WHERE code = ? LIMIT 1', [code]);
    if (existing.length) return next(conflict('A role with that key already exists'));

    const [[{ nextOrder }]] = await pool.query(
      'SELECT COALESCE(MAX(sort_order), 0) + 10 AS nextOrder FROM roles'
    );

    await pool.query(
      'INSERT INTO roles (code, label, sort_order, is_system) VALUES (?, ?, ?, 0)',
      [code, label, nextOrder]
    );
    await pool.query(
      'INSERT IGNORE INTO role_permissions (role, permission_code, allowed) VALUES (?, ?, 1)',
      [code, 'dashboard.view']
    );

    return sendData(
      res,
      { code, label, sortOrder: nextOrder, isSystem: false },
      undefined,
      201
    );
  } catch (err) {
    next(err);
  }
}

module.exports = { getRoles, createRole };
