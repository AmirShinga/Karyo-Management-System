const { pool, withTransaction } = require('../config/db');

const CLEAR_PIN = process.env.CLEAR_DATA_PIN || '5858';

function isValidClearPin(pin) {
  return typeof pin === 'string' && pin === CLEAR_PIN;
}

async function count(sql, params = []) {
  const [[row]] = await pool.query(sql, params);
  return Number(row.n);
}

async function clearOrders() {
  const orders = await count('SELECT COUNT(*) AS n FROM restaurant_orders');
  const income = await count("SELECT COUNT(*) AS n FROM income WHERE source = 'restaurant'");
  const receipts = await count(
    "SELECT COUNT(*) AS n FROM receipt_snapshots WHERE kind = 'order'"
  );

  await withTransaction(async (conn) => {
    await conn.query('DELETE FROM restaurant_orders');
    await conn.query("DELETE FROM income WHERE source = 'restaurant'");
    await conn.query("DELETE FROM receipt_snapshots WHERE kind = 'order'");
  });

  return { orders, income, receipts };
}

async function clearBookings() {
  const bookings = await count('SELECT COUNT(*) AS n FROM bookings');
  const income = await count("SELECT COUNT(*) AS n FROM income WHERE source = 'room'");
  const receipts = await count(
    "SELECT COUNT(*) AS n FROM receipt_snapshots WHERE kind = 'booking'"
  );
  const history = await count('SELECT COUNT(*) AS n FROM room_status_history');

  await withTransaction(async (conn) => {
    await conn.query('DELETE FROM bookings');
    await conn.query("DELETE FROM income WHERE source = 'room'");
    await conn.query('DELETE FROM room_status_history');
    await conn.query("DELETE FROM receipt_snapshots WHERE kind = 'booking'");
    await conn.query("UPDATE rooms SET status = 'available' WHERE status = 'occupied'");
  });

  return { bookings, income, receipts, history };
}

module.exports = { clearOrders, clearBookings, isValidClearPin };
