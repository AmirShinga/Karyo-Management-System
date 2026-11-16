const { pool } = require('../../config/db');
const { sendData, notFound, badRequest, paginate, pageMeta } = require('../../utils/response');

function mapStaff(r) {
  return {
    id: r.id,
    userId: r.user_id,
    fullName: r.full_name,
    position: r.position,
    phone: r.phone,
    salary: Number(r.salary),
    hireDate: r.hire_date,
    active: !!r.active,
    createdAt: r.created_at,
  };
}

async function listStaff(req, res, next) {
  try {
    const { active } = req.query;
    const search = (req.query.search || '').trim();
    const { page, limit, offset } = paginate(req.query);
    const where = ['deleted_at IS NULL'];
    const params = [];
    if (active === 'true' || active === 'false') {
      where.push('active = ?');
      params.push(active === 'true' ? 1 : 0);
    }
    if (search) {
      where.push('(full_name LIKE ? OR position LIKE ? OR phone LIKE ?)');
      const like = `%${search}%`;
      params.push(like, like, like);
    }
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM staff WHERE ${where.join(' AND ')}`,
      params
    );
    const [rows] = await pool.query(
      `SELECT * FROM staff WHERE ${where.join(' AND ')} ORDER BY full_name ASC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    return sendData(res, rows.map(mapStaff), pageMeta(page, limit, total));
  } catch (err) {
    next(err);
  }
}

async function createStaff(req, res, next) {
  try {
    const b = req.body;
    const [result] = await pool.query(
      `INSERT INTO staff (user_id, full_name, position, phone, salary, hire_date, active)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [b.userId || null, b.fullName, b.position, b.phone || null, b.salary || 0, b.hireDate || null, 1]
    );
    const [rows] = await pool.query('SELECT * FROM staff WHERE id = ?', [result.insertId]);
    return sendData(res, mapStaff(rows[0]), undefined, 201);
  } catch (err) {
    next(err);
  }
}

async function updateStaff(req, res, next) {
  try {
    const { id } = req.params;
    const b = req.body;
    const map = {
      fullName: 'full_name',
      position: 'position',
      phone: 'phone',
      salary: 'salary',
      hireDate: 'hire_date',
      active: 'active',
      userId: 'user_id',
    };
    const sets = [];
    const values = [];
    for (const [key, col] of Object.entries(map)) {
      if (b[key] !== undefined) {
        sets.push(`${col} = ?`);
        values.push(key === 'active' ? (b[key] ? 1 : 0) : b[key]);
      }
    }
    if (!sets.length) return next(badRequest('No fields to update'));
    values.push(id);
    const [result] = await pool.query(
      `UPDATE staff SET ${sets.join(', ')} WHERE id = ? AND deleted_at IS NULL`,
      values
    );
    if (!result.affectedRows) return next(notFound('Staff member not found'));
    const [rows] = await pool.query('SELECT * FROM staff WHERE id = ?', [id]);
    return sendData(res, mapStaff(rows[0]));
  } catch (err) {
    next(err);
  }
}

async function deleteStaff(req, res, next) {
  try {
    const { id } = req.params;
    const [result] = await pool.query(
      'UPDATE staff SET active = 0, deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL',
      [id]
    );
    if (!result.affectedRows) return next(notFound('Staff member not found'));
    return sendData(res, { deleted: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { listStaff, createStaff, updateStaff, deleteStaff };
