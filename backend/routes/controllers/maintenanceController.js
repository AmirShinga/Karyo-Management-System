const { pool } = require('../../config/db');
const { sendData, notFound, badRequest, paginate, pageMeta } = require('../../utils/response');

const SELECT_REQUEST = `
  SELECT m.*, r.room_number, a.name AS assignee_name, rep.name AS reporter_name
  FROM maintenance_requests m
  LEFT JOIN rooms r ON r.id = m.room_id
  LEFT JOIN users a ON a.id = m.assigned_to
  LEFT JOIN users rep ON rep.id = m.reported_by
`;

function mapRequest(row) {
  return {
    id: row.id,
    roomId: row.room_id,
    roomNumber: row.room_number || null,
    title: row.title,
    description: row.description,
    category: row.category,
    priority: row.priority,
    status: row.status,
    cost: Number(row.cost),
    reportedBy: row.reported_by,
    reporterName: row.reporter_name || null,
    assignedTo: row.assigned_to,
    assigneeName: row.assignee_name || null,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listRequests(req, res, next) {
  try {
    const { status, priority, category, roomId, assignedTo } = req.query;
    const search = (req.query.search || '').trim();
    const { page, limit, offset } = paginate(req.query);
    const where = ['1 = 1'];
    const params = [];
    if (status) {
      where.push('m.status = ?');
      params.push(status);
    }
    if (priority) {
      where.push('m.priority = ?');
      params.push(priority);
    }
    if (category) {
      where.push('m.category = ?');
      params.push(category);
    }
    if (roomId) {
      where.push('m.room_id = ?');
      params.push(roomId);
    }
    if (assignedTo) {
      where.push('m.assigned_to = ?');
      params.push(assignedTo);
    }
    if (search) {
      where.push('(m.title LIKE ? OR m.description LIKE ? OR r.room_number LIKE ?)');
      const like = `%${search}%`;
      params.push(like, like, like);
    }

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM maintenance_requests m
       LEFT JOIN rooms r ON r.id = m.room_id
       WHERE ${where.join(' AND ')}`,
      params
    );
    const [rows] = await pool.query(
      `${SELECT_REQUEST} WHERE ${where.join(' AND ')}
       ORDER BY FIELD(m.status, 'open','in_progress','resolved','closed'),
                FIELD(m.priority, 'urgent','high','medium','low'), m.id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    return sendData(res, rows.map(mapRequest), pageMeta(page, limit, total));
  } catch (err) {
    next(err);
  }
}

async function createRequest(req, res, next) {
  try {
    const b = req.body;
    const [result] = await pool.query(
      `INSERT INTO maintenance_requests (room_id, title, description, category, priority, cost, reported_by, assigned_to)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        b.roomId || null,
        b.title,
        b.description || null,
        b.category,
        b.priority,
        b.cost,
        req.user.id,
        b.assignedTo || null,
      ]
    );
    const [rows] = await pool.query(`${SELECT_REQUEST} WHERE m.id = ?`, [result.insertId]);
    return sendData(res, mapRequest(rows[0]), undefined, 201);
  } catch (err) {
    next(err);
  }
}

async function updateRequest(req, res, next) {
  try {
    const { id } = req.params;
    const b = req.body;
    const map = {
      roomId: 'room_id',
      title: 'title',
      description: 'description',
      category: 'category',
      priority: 'priority',
      status: 'status',
      cost: 'cost',
      assignedTo: 'assigned_to',
    };
    const sets = [];
    const values = [];
    for (const [key, col] of Object.entries(map)) {
      if (b[key] !== undefined) {
        sets.push(`${col} = ?`);
        values.push(b[key]);
      }
    }
    if (!sets.length) return next(badRequest('No fields to update'));
    if (b.status === 'resolved') {
      sets.push('resolved_at = NOW()');
    } else if (b.status !== undefined) {
      sets.push('resolved_at = NULL');
    }
    values.push(id);
    const [result] = await pool.query(
      `UPDATE maintenance_requests SET ${sets.join(', ')} WHERE id = ?`,
      values
    );
    if (!result.affectedRows) return next(notFound('Maintenance request not found'));
    const [rows] = await pool.query(`${SELECT_REQUEST} WHERE m.id = ?`, [id]);
    return sendData(res, mapRequest(rows[0]));
  } catch (err) {
    next(err);
  }
}

async function setRequestStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { status, cost } = req.body;
    const sets = ['status = ?'];
    const values = [status];
    if (cost !== undefined) {
      sets.push('cost = ?');
      values.push(cost);
    }
    sets.push(status === 'resolved' ? 'resolved_at = NOW()' : 'resolved_at = NULL');
    values.push(id);
    const [result] = await pool.query(
      `UPDATE maintenance_requests SET ${sets.join(', ')} WHERE id = ?`,
      values
    );
    if (!result.affectedRows) return next(notFound('Maintenance request not found'));
    const [rows] = await pool.query(`${SELECT_REQUEST} WHERE m.id = ?`, [id]);
    return sendData(res, mapRequest(rows[0]));
  } catch (err) {
    next(err);
  }
}

async function deleteRequest(req, res, next) {
  try {
    const { id } = req.params;
    const [result] = await pool.query('DELETE FROM maintenance_requests WHERE id = ?', [id]);
    if (!result.affectedRows) return next(notFound('Maintenance request not found'));
    return sendData(res, { deleted: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { listRequests, createRequest, updateRequest, setRequestStatus, deleteRequest };
