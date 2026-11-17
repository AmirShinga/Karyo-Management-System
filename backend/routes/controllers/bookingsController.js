const { pool, withTransaction } = require('../../config/db');
const {
  sendData,
  notFound,
  conflict,
  badRequest,
  paginate,
  pageMeta,
} = require('../../utils/response');
const {
  summarizePayments,
  recordPaymentSplits,
  paymentSummariesFor,
  paymentSummaryFor,
  roundMoney,
} = require('../../utils/payments');

function mapBooking(b, payment = {}) {
  const balance = Number(b.total_amount) - Number(b.amount_paid);
  return {
    id: b.id,
    roomId: b.room_id,
    roomNumber: b.room_number || null,
    roomType: b.room_type || null,
    guestName: b.guest_name,
    guestPhone: b.guest_phone,
    guestEmail: b.guest_email,
    guestAddress: b.guest_address,
    guestOccupation: b.guest_occupation,
    stayPurpose: b.stay_purpose,
    guestContactName: b.guest_contact_name,
    guestContactPhone: b.guest_contact_phone,
    guestIdType: b.guest_id_type,
    guestIdDocument: b.guest_id_document,
    vehicleNo: b.vehicle_no,
    arrivalFrom: b.arrival_from,
    arrivalTime: b.arrival_time,
    destination: b.destination,
    departureTime: b.departure_time,
    guestIdNumber: b.guest_id_number,
    checkInDate: b.check_in_date,
    checkOutDate: b.check_out_date,
    nights: b.nights,
    ratePerNight: Number(b.rate_per_night),
    discountAmount: Number(b.discount_amount || 0),
    totalAmount: Number(b.total_amount),
    amountPaid: Number(b.amount_paid),
    balance,
    paymentStatus: balance > 0 ? 'pending' : 'paid',
    paymentMethod: payment.method || null,
    paymentSplits: payment.splits || [],
    status: b.status,
    actualCheckIn: b.actual_check_in,
    actualCheckOut: b.actual_check_out,
    createdBy: b.created_by,
    createdByName: b.created_by_name || null,
    createdAt: b.created_at,
  };
}

const SELECT_BOOKING = `
  SELECT b.*, r.room_number, r.room_type, u.name AS created_by_name
  FROM bookings b
  JOIN rooms r ON r.id = b.room_id
  LEFT JOIN users u ON u.id = b.created_by
`;

function nightsBetween(checkIn, checkOut) {
  const inDate = new Date(`${checkIn}T00:00:00Z`);
  const outDate = new Date(`${checkOut}T00:00:00Z`);
  return Math.round((outDate - inDate) / (1000 * 60 * 60 * 24));
}

function guestIdFor(bookingId) {
  return `G-${String(bookingId).padStart(6, '0')}`;
}

function nullIfEmpty(value) {
  if (value === undefined || value === null) return null;
  return String(value).trim() === '' ? null : value;
}

async function listBookings(req, res, next) {
  try {
    const { status, roomId, from, to } = req.query;
    const search = (req.query.search || '').trim();
    const { page, limit, offset } = paginate(req.query);
    const where = ['b.deleted_at IS NULL'];
    const params = [];
    if (status) {
      where.push('b.status = ?');
      params.push(status);
    }
    if (roomId) {
      where.push('b.room_id = ?');
      params.push(roomId);
    }
    if (from) {
      where.push('b.check_in_date >= ?');
      params.push(from);
    }
    if (to) {
      where.push('b.check_in_date <= ?');
      params.push(to);
    }
    if (search) {
      where.push(
        '(b.guest_name LIKE ? OR b.guest_phone LIKE ? OR b.guest_email LIKE ? OR b.guest_id_number LIKE ? OR b.guest_id_document LIKE ? OR b.vehicle_no LIKE ? OR r.room_number LIKE ?)'
      );
      const like = `%${search}%`;
      params.push(like, like, like, like, like, like, like);
    }

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM bookings b
       JOIN rooms r ON r.id = b.room_id
       WHERE ${where.join(' AND ')}`,
      params
    );
    const [rows] = await pool.query(
      `${SELECT_BOOKING} WHERE ${where.join(' AND ')} ORDER BY b.created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const paymentMap = await paymentSummariesFor(pool, 'room', rows.map((r) => r.id));
    return sendData(
      res,
      rows.map((r) => mapBooking(r, paymentMap.get(r.id))),
      pageMeta(page, limit, total)
    );
  } catch (err) {
    next(err);
  }
}

async function getBooking(req, res, next) {
  try {
    const [rows] = await pool.query(`${SELECT_BOOKING} WHERE b.id = ? AND b.deleted_at IS NULL`, [
      req.params.id,
    ]);
    if (!rows.length) return next(notFound('Booking not found'));
    const payment = await paymentSummaryFor(pool, 'room', rows[0].id);
    return sendData(res, mapBooking(rows[0], payment));
  } catch (err) {
    next(err);
  }
}

/** Availability: which rooms are free for the requested window. */
async function availability(req, res, next) {
  try {
    const { checkInDate, checkOutDate } = req.query;
    if (!checkInDate || !checkOutDate) {
      return next(badRequest('checkInDate and checkOutDate are required'));
    }
    const nights = nightsBetween(checkInDate, checkOutDate);
    if (nights <= 0) return next(badRequest('checkOutDate must be after checkInDate'));

    // A room is unavailable if it has a non-cancelled booking that overlaps the window.
    const [rooms] = await pool.query(
      `SELECT r.* FROM rooms r
       WHERE r.deleted_at IS NULL
         AND r.status <> 'maintenance'
         AND r.id NOT IN (
           SELECT b.room_id FROM bookings b
           WHERE b.deleted_at IS NULL
             AND b.status IN ('reserved','checked_in')
             AND b.check_in_date < ?
             AND b.check_out_date > ?
         )
       ORDER BY r.room_number ASC`,
      [checkOutDate, checkInDate]
    );

    return sendData(
      res,
      rooms.map((r) => ({
        id: r.id,
        roomNumber: r.room_number,
        roomType: r.room_type,
        ratePerNight: Number(r.rate_per_night),
        capacity: r.capacity,
        status: r.status,
      })),
      { nights }
    );
  } catch (err) {
    next(err);
  }
}

/**
 * Create a booking. Server recomputes nights and total from the room rate.
 * Runs inside a transaction and re-checks availability atomically.
 */
async function createBooking(req, res, next) {
  try {
    const b = req.body;
    const nights = nightsBetween(b.checkInDate, b.checkOutDate);
    if (nights <= 0) return next(badRequest('Check-out must be after check-in'));
    const payment = summarizePayments(b.payments, b.amountPaid || 0);
    const amountPaid = payment.total;

    const created = await withTransaction(async (conn) => {
      const [roomRows] = await conn.query(
        'SELECT * FROM rooms WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
        [b.roomId]
      );
      if (!roomRows.length) throw notFound('Room not found');
      const room = roomRows[0];
      if (room.status === 'maintenance') throw conflict('Room is under maintenance');

      const [overlaps] = await conn.query(
        `SELECT id FROM bookings
         WHERE room_id = ? AND deleted_at IS NULL
           AND status IN ('reserved','checked_in')
           AND check_in_date < ? AND check_out_date > ?
         LIMIT 1`,
        [b.roomId, b.checkOutDate, b.checkInDate]
      );
      if (overlaps.length) throw conflict('Room is not available for those dates');

      const grossTotal = roundMoney(nights * Number(room.rate_per_night));
      const discountAmount = roundMoney(b.discountAmount || 0);
      if (discountAmount > grossTotal) {
        throw badRequest('Discount cannot exceed the booking amount');
      }
      const total = roundMoney(grossTotal - discountAmount);
      if (amountPaid > total) {
        throw badRequest('Amount paid cannot exceed the booking total');
      }

      const [result] = await conn.query(
        `INSERT INTO bookings
          (room_id, guest_name, guest_phone, guest_email, guest_address,
           guest_occupation, stay_purpose, guest_contact_name, guest_contact_phone,
           guest_id_type, guest_id_document, vehicle_no,
           arrival_from, arrival_time, destination, departure_time,
           check_in_date, check_out_date, nights, rate_per_night, discount_amount, total_amount,
           amount_paid, status, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'reserved', ?)`,
        [
          b.roomId,
          b.guestName,
          nullIfEmpty(b.guestPhone),
          nullIfEmpty(b.guestEmail),
          nullIfEmpty(b.guestAddress),
          nullIfEmpty(b.guestOccupation),
          nullIfEmpty(b.stayPurpose),
          nullIfEmpty(b.guestContactName),
          nullIfEmpty(b.guestContactPhone),
          nullIfEmpty(b.guestIdType),
          nullIfEmpty(b.guestIdDocument),
          nullIfEmpty(b.vehicleNo),
          nullIfEmpty(b.arrivalFrom),
          nullIfEmpty(b.arrivalTime),
          nullIfEmpty(b.destination),
          nullIfEmpty(b.departureTime),
          b.checkInDate,
          b.checkOutDate,
          nights,
          room.rate_per_night,
          discountAmount,
          total,
          amountPaid,
          req.user.id,
        ]
      );

      await conn.query('UPDATE bookings SET guest_id_number = ? WHERE id = ?', [
        guestIdFor(result.insertId),
        result.insertId,
      ]);

      if (amountPaid > 0) {
        const [incomeResult] = await conn.query(
          `INSERT INTO income
            (source, reference_id, description, amount, payment_method, income_date, recorded_by)
           VALUES ('room', ?, ?, ?, ?, CURDATE(), ?)`,
          [
            result.insertId,
            `Advance payment for booking #${result.insertId}`,
            amountPaid,
            payment.method,
            req.user.id,
          ]
        );
        await recordPaymentSplits(conn, incomeResult.insertId, payment.splits);
      }

      const [rows] = await conn.query(`${SELECT_BOOKING} WHERE b.id = ?`, [result.insertId]);
      return rows[0];
    });

    const io = req.app.get('io');
    if (io) io.emit('booking:updated', { id: created.id, status: created.status });
    return sendData(res, mapBooking(created, payment), undefined, 201);
  } catch (err) {
    next(err);
  }
}

/** Check in: reserved -> checked_in; room becomes occupied. */
async function checkIn(req, res, next) {
  try {
    const { id } = req.params;
    const updated = await withTransaction(async (conn) => {
      const [rows] = await conn.query('SELECT * FROM bookings WHERE id = ? AND deleted_at IS NULL FOR UPDATE', [id]);
      if (!rows.length) throw notFound('Booking not found');
      const bk = rows[0];
      if (bk.status !== 'reserved') throw conflict('Only reserved bookings can be checked in');
      await conn.query(
        'UPDATE bookings SET status = \'checked_in\', actual_check_in = NOW() WHERE id = ?',
        [id]
      );
      await conn.query('UPDATE rooms SET status = \'occupied\' WHERE id = ?', [bk.room_id]);
      const [fresh] = await conn.query(`${SELECT_BOOKING} WHERE b.id = ?`, [id]);
      return fresh[0];
    });
    const io = req.app.get('io');
    if (io) {
      io.emit('booking:updated', { id: Number(id), status: 'checked_in' });
      io.emit('room:status', { id: updated.room_id, status: 'occupied' });
    }
    return sendData(res, mapBooking(updated));
  } catch (err) {
    next(err);
  }
}

/** Check out: any outstanding balance is recorded as income; room becomes available. */
async function checkOut(req, res, next) {
  try {
    const { id } = req.params;
    const updated = await withTransaction(async (conn) => {
      const [rows] = await conn.query('SELECT * FROM bookings WHERE id = ? AND deleted_at IS NULL FOR UPDATE', [id]);
      if (!rows.length) throw notFound('Booking not found');
      const bk = rows[0];
      if (bk.status === 'checked_out') throw conflict('Booking already checked out');
      if (bk.status === 'cancelled') throw conflict('Booking was cancelled');

      const balance = Number(bk.total_amount) - Number(bk.amount_paid);
      const payment = summarizePayments(req.body?.payments, Math.max(balance, 0));
      if (balance > 0 && Math.abs(payment.total - balance) > 0.009) {
        throw badRequest('Payment total must equal the outstanding balance');
      }

      await conn.query(
        `UPDATE bookings SET status = 'checked_out', actual_check_out = NOW(),
           amount_paid = total_amount WHERE id = ?`,
        [id]
      );
      if (balance > 0) {
        const [incomeResult] = await conn.query(
          `INSERT INTO income
            (source, reference_id, description, amount, payment_method, income_date, recorded_by)
           VALUES ('room', ?, ?, ?, ?, CURDATE(), ?)`,
          [id, `Checkout balance for booking #${id}`, balance, payment.method, req.user.id]
        );
        await recordPaymentSplits(conn, incomeResult.insertId, payment.splits);
      }
      await conn.query('UPDATE rooms SET status = \'available\' WHERE id = ?', [bk.room_id]);
      const [fresh] = await conn.query(`${SELECT_BOOKING} WHERE b.id = ?`, [id]);
      return fresh[0];
    });
    const io = req.app.get('io');
    if (io) {
      io.emit('booking:updated', { id: Number(id), status: 'checked_out' });
      io.emit('room:status', { id: updated.room_id, status: 'available' });
    }
    const payment = await paymentSummaryFor(pool, 'room', updated.id);
    return sendData(res, mapBooking(updated, payment));
  } catch (err) {
    next(err);
  }
}

/** Collect the outstanding balance without changing the booking lifecycle status. */
async function recordPayment(req, res, next) {
  try {
    const { id } = req.params;
    const updated = await withTransaction(async (conn) => {
      const [rows] = await conn.query(
        'SELECT * FROM bookings WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
        [id]
      );
      if (!rows.length) throw notFound('Booking not found');
      const bk = rows[0];
      if (bk.status === 'cancelled') throw conflict('Booking was cancelled');
      if (bk.status === 'checked_out') throw conflict('Booking is already checked out');

      const balance = roundMoney(Number(bk.total_amount) - Number(bk.amount_paid));
      if (balance <= 0) throw conflict('Booking is already fully paid');

      const payment = summarizePayments(req.body?.payments, 0);
      if (payment.total <= 0) throw badRequest('Enter a payment amount');
      if (payment.total > balance + 0.009) {
        throw badRequest('Payment cannot exceed the outstanding balance');
      }

      const amountPaid = roundMoney(Number(bk.amount_paid) + payment.total);
      await conn.query('UPDATE bookings SET amount_paid = ? WHERE id = ?', [amountPaid, id]);
      const [incomeResult] = await conn.query(
        `INSERT INTO income
          (source, reference_id, description, amount, payment_method, income_date, recorded_by)
         VALUES ('room', ?, ?, ?, ?, CURDATE(), ?)`,
        [id, `Payment for booking #${id}`, payment.total, payment.method, req.user.id]
      );
      await recordPaymentSplits(conn, incomeResult.insertId, payment.splits);

      const [fresh] = await conn.query(`${SELECT_BOOKING} WHERE b.id = ?`, [id]);
      return fresh[0];
    });

    const io = req.app.get('io');
    if (io) {
      const paymentStatus =
        Number(updated.total_amount) - Number(updated.amount_paid) > 0 ? 'pending' : 'paid';
      io.emit('booking:updated', { id: updated.id, paymentStatus });
    }
    const payment = await paymentSummaryFor(pool, 'room', updated.id);
    return sendData(res, mapBooking(updated, payment));
  } catch (err) {
    next(err);
  }
}

async function cancelBooking(req, res, next) {
  try {
    const { id } = req.params;
    const updated = await withTransaction(async (conn) => {
      const [rows] = await conn.query('SELECT * FROM bookings WHERE id = ? AND deleted_at IS NULL FOR UPDATE', [id]);
      if (!rows.length) throw notFound('Booking not found');
      const bk = rows[0];
      if (bk.status === 'checked_out') throw conflict('Cannot cancel a completed stay');
      if (bk.status === 'cancelled') throw conflict('Booking already cancelled');

      await conn.query('UPDATE bookings SET status = \'cancelled\' WHERE id = ?', [id]);
      if (bk.status === 'checked_in') {
        await conn.query('UPDATE rooms SET status = \'available\' WHERE id = ?', [bk.room_id]);
      }
      const [fresh] = await conn.query(`${SELECT_BOOKING} WHERE b.id = ?`, [id]);
      return fresh[0];
    });
    const io = req.app.get('io');
    if (io) io.emit('booking:updated', { id: Number(id), status: 'cancelled' });
    return sendData(res, mapBooking(updated));
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listBookings,
  getBooking,
  availability,
  createBooking,
  checkIn,
  checkOut,
  recordPayment,
  cancelBooking,
};
