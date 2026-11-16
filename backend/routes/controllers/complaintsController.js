const { pool } = require('../../config/db');
const { sendData, badRequest, notFound, paginate, pageMeta } = require('../../utils/response');
const { isAllowed } = require('../../utils/permissionCache');

const SELECT_COMPLAINT = `
  SELECT c.*, u.name AS creator_name, u.role AS creator_role, r.name AS resolver_name
  FROM complaints c
  JOIN users u ON u.id = c.created_by
  LEFT JOIN users r ON r.id = c.resolved_by
`;

function mapComplaint(row) {
  return {
    id: row.id,
    subject: row.subject,
    message: row.message,
    status: row.status,
    ownerNote: row.owner_note,
    createdBy: row.created_by,
    creatorName: row.creator_name || null,
    creatorRole: row.creator_role || null,
    resolvedBy: row.resolved_by,
    resolverName: row.resolver_name || null,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listComplaints(req, res, next) {
  try {
    const { status } = req.query;
    const search = (req.query.search || '').trim();
    const { page, limit, offset } = paginate(req.query);
    const where = [];
    const params = [];

    if (!(await isAllowed(req.user.role, 'complaints.manage'))) {
      where.push('c.created_by = ?');
      params.push(req.user.id);
    }
    if (status) {
      where.push('c.status = ?');
      params.push(status);
    }
    if (search) {
      where.push('(c.subject LIKE ? OR c.message LIKE ?)');
      const like = `%${search}%`;
      params.push(like, like);
    }

    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM complaints c ${clause}`,
      params
    );
    const [rows] = await pool.query(
      `${SELECT_COMPLAINT} ${clause} ORDER BY c.created_at DESC, c.id DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    return sendData(res, rows.map(mapComplaint), pageMeta(page, limit, total));
  } catch (err) {
    next(err);
  }
}

async function createComplaint(req, res, next) {
  try {
    const b = req.body;
    const [result] = await pool.query(
      'INSERT INTO complaints (created_by, subject, message) VALUES (?, ?, ?)',
      [req.user.id, b.subject, b.message]
    );
    const [rows] = await pool.query(`${SELECT_COMPLAINT} WHERE c.id = ?`, [result.insertId]);
    return sendData(res, mapComplaint(rows[0]), undefined, 201);
  } catch (err) {
    next(err);
  }
}

async function updateComplaint(req, res, next) {
  try {
    const { id } = req.params;
    const b = req.body;
    const sets = [];
    const values = [];

    if (b.ownerNote !== undefined) {
      sets.push('owner_note = ?');
      values.push(b.ownerNote || null);
    }
    if (b.status) {
      sets.push('status = ?');
      values.push(b.status);
      if (b.status === 'resolved') {
        sets.push('resolved_by = ?', 'resolved_at = NOW()');
        values.push(req.user.id);
      } else {
        sets.push('resolved_by = NULL', 'resolved_at = NULL');
      }
    }
    if (!sets.length) return next(badRequest('No fields to update'));

    values.push(id);
    const [result] = await pool.query(
      `UPDATE complaints SET ${sets.join(', ')} WHERE id = ?`,
      values
    );
    if (!result.affectedRows) return next(notFound('Complaint not found'));

    const [rows] = await pool.query(`${SELECT_COMPLAINT} WHERE c.id = ?`, [id]);
    return sendData(res, mapComplaint(rows[0]));
  } catch (err) {
    next(err);
  }
}

module.exports = { listComplaints, createComplaint, updateComplaint };
