const { pool } = require('../../config/db');
const { sendData, badRequest } = require('../../utils/response');
const { invalidate } = require('../../utils/permissionCache');
const { listRoles } = require('../../db/roles');

async function getMatrix(req, res, next) {
  try {
    const [permissions] = await pool.query(
      'SELECT code, label, module, sort_order AS sortOrder FROM permissions ORDER BY sort_order, code'
    );
    const roles = await listRoles(pool);
    const [rows] = await pool.query(
      'SELECT role, permission_code FROM role_permissions WHERE allowed = 1'
    );

    const matrix = Object.fromEntries(roles.map((role) => [role.code, []]));
    for (const row of rows) {
      if (matrix[row.role]) matrix[row.role].push(row.permission_code);
    }
    // Admin always has every permission; its stored rows are for display only.
    matrix.admin = permissions.map((p) => p.code);

    return sendData(res, {
      roles,
      editableRoles: roles.filter((role) => role.code !== 'admin').map((role) => role.code),
      permissions,
      matrix,
    });
  } catch (err) {
    next(err);
  }
}

async function updateRole(req, res, next) {
  const { role } = req.params;
  const codes = [...new Set(req.body.permissions)];
  let connection;
  try {
    const [roleRows] = await pool.query('SELECT code FROM roles WHERE code = ? LIMIT 1', [role]);
    if (!roleRows.length || role === 'admin') {
      return next(badRequest('This role cannot be modified'));
    }

    if (codes.length) {
      const [known] = await pool.query(
        `SELECT code FROM permissions WHERE code IN (${codes.map(() => '?').join(', ')})`,
        codes
      );
      if (known.length !== codes.length) {
        return next(badRequest('One or more permissions do not exist'));
      }
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();
    await connection.query('DELETE FROM role_permissions WHERE role = ?', [role]);
    for (const code of codes) {
      await connection.query(
        'INSERT INTO role_permissions (role, permission_code, allowed) VALUES (?, ?, 1)',
        [role, code]
      );
    }
    await connection.commit();

    invalidate();

    const io = req.app.get('io');
    if (io) io.to(`role:${role}`).emit('permissions:updated', { role });

    return sendData(res, { role, permissions: codes });
  } catch (err) {
    if (connection) await connection.rollback();
    next(err);
  } finally {
    if (connection) connection.release();
  }
}

module.exports = { getMatrix, updateRole };
