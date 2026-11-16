const { pool } = require('../../config/db');
const {
  sendData,
  notFound,
  conflict,
  badRequest,
  paginate,
  pageMeta,
} = require('../../utils/response');

function mapRoom(r) {
  return {
    id: r.id,
    roomNumber: r.room_number,
    roomType: r.room_type,
    ratePerNight: Number(r.rate_per_night),
    capacity: r.capacity,
    status: r.status,
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function emit(req, event, payload) {
  const io = req.app.get('io');
  if (io) io.emit(event, payload);
}

async function recordHistory(conn, roomId, fromStatus, toStatus, reason, userId) {
  await conn.query(
    `INSERT INTO room_status_history (room_id, from_status, to_status, reason, changed_by)
     VALUES (?, ?, ?, ?, ?)`,
    [roomId, fromStatus || null, toStatus, reason || null, userId || null]
  );
}

async function listRooms(req, res, next) {
  try {
    const { status } = req.query;
    const search = (req.query.search || '').trim();
    const { page, limit, offset } = paginate(req.query);
    const where = ['deleted_at IS NULL'];
    const params = [];
    if (status) {
      where.push('status = ?');
      params.push(status);
    }
    if (search) {
      where.push('(room_number LIKE ? OR room_type LIKE ?)');
      const like = `%${search}%`;
      params.push(like, like);
    }

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM rooms WHERE ${where.join(' AND ')}`,
      params
    );
    const [rows] = await pool.query(
      `SELECT * FROM rooms WHERE ${where.join(' AND ')} ORDER BY room_number ASC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return sendData(res, rows.map(mapRoom), pageMeta(page, limit, total));
  } catch (err) {
    next(err);
  }
}

async function createRoom(req, res, next) {
  try {
    const b = req.body;
    const [dup] = await pool.query(
      'SELECT id FROM rooms WHERE room_number = ? AND deleted_at IS NULL',
      [b.roomNumber]
    );
    if (dup.length) return next(conflict('A room with that number already exists'));

    const [result] = await pool.query(
      `INSERT INTO rooms (room_number, room_type, rate_per_night, capacity, status, notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        b.roomNumber,
        b.roomType,
        b.ratePerNight,
        b.capacity,
        b.status || 'available',
        b.notes || null,
      ]
    );
    const [rows] = await pool.query('SELECT * FROM rooms WHERE id = ?', [result.insertId]);
    await recordHistory(pool, result.insertId, null, rows[0].status, 'Room created', req.user.id);
    emit(req, 'room:updated', { id: result.insertId, status: rows[0].status });
    return sendData(res, mapRoom(rows[0]), undefined, 201);
  } catch (err) {
    next(err);
  }
}

async function updateRoom(req, res, next) {
  try {
    const { id } = req.params;
    const b = req.body;
    const map = {
      roomNumber: 'room_number',
      roomType: 'room_type',
      ratePerNight: 'rate_per_night',
      capacity: 'capacity',
      status: 'status',
      notes: 'notes',
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

    if (b.roomNumber !== undefined) {
      const [dup] = await pool.query(
        'SELECT id FROM rooms WHERE room_number = ? AND id <> ? AND deleted_at IS NULL',
        [b.roomNumber, id]
      );
      if (dup.length) return next(conflict('Another room already uses that number'));
    }

    const [beforeRows] = await pool.query('SELECT status FROM rooms WHERE id = ? AND deleted_at IS NULL', [id]);
    if (!beforeRows.length) return next(notFound('Room not found'));
    const beforeStatus = beforeRows[0].status;

    values.push(id);
    const [result] = await pool.query(
      `UPDATE rooms SET ${sets.join(', ')} WHERE id = ? AND deleted_at IS NULL`,
      values
    );
    if (!result.affectedRows) return next(notFound('Room not found'));

    const [rows] = await pool.query('SELECT * FROM rooms WHERE id = ?', [id]);
    if (rows[0].status !== beforeStatus) {
      await recordHistory(pool, id, beforeStatus, rows[0].status, b.reason || 'Room updated', req.user.id);
    }
    emit(req, 'room:updated', { id: Number(id), status: rows[0].status });
    return sendData(res, mapRoom(rows[0]));
  } catch (err) {
    next(err);
  }
}

async function setRoomStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;
    const [beforeRows] = await pool.query(
      'SELECT status FROM rooms WHERE id = ? AND deleted_at IS NULL',
      [id]
    );
    if (!beforeRows.length) return next(notFound('Room not found'));
    const beforeStatus = beforeRows[0].status;

    const [result] = await pool.query(
      'UPDATE rooms SET status = ? WHERE id = ? AND deleted_at IS NULL',
      [status, id]
    );
    if (!result.affectedRows) return next(notFound('Room not found'));
    if (beforeStatus !== status) {
      await recordHistory(pool, id, beforeStatus, status, reason, req.user.id);
    }
    emit(req, 'room:updated', { id: Number(id), status });
    return sendData(res, { id: Number(id), status });
  } catch (err) {
    next(err);
  }
}

async function listRoomHistory(req, res, next) {
  try {
    const { id } = req.params;
    const { page, limit, offset } = paginate(req.query);
    const [[{ total }]] = await pool.query(
      'SELECT COUNT(*) AS total FROM room_status_history WHERE room_id = ?',
      [id]
    );
    const [rows] = await pool.query(
      `SELECT h.*, u.name AS changed_by_name FROM room_status_history h
       LEFT JOIN users u ON u.id = h.changed_by
       WHERE h.room_id = ? ORDER BY h.created_at DESC, h.id DESC LIMIT ? OFFSET ?`,
      [id, limit, offset]
    );
    const data = rows.map((r) => ({
      id: r.id,
      roomId: r.room_id,
      fromStatus: r.from_status,
      toStatus: r.to_status,
      reason: r.reason,
      changedBy: r.changed_by,
      changedByName: r.changed_by_name || null,
      createdAt: r.created_at,
    }));
    return sendData(res, data, pageMeta(page, limit, total));
  } catch (err) {
    next(err);
  }
}

async function deleteRoom(req, res, next) {
  try {
    const { id } = req.params;
    const [active] = await pool.query(
      `SELECT COUNT(*) AS c FROM bookings
       WHERE room_id = ? AND deleted_at IS NULL AND status IN ('reserved','checked_in')`,
      [id]
    );
    if (active[0].c > 0) {
      return next(conflict('Cannot delete a room with active reservations or guests'));
    }
    const [result] = await pool.query(
      'UPDATE rooms SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL',
      [id]
    );
    if (!result.affectedRows) return next(notFound('Room not found'));
    return sendData(res, { deleted: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { listRooms, createRoom, updateRoom, setRoomStatus, listRoomHistory, deleteRoom };
