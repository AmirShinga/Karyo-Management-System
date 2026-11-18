const { pool } = require('../../config/db');
const { sendData, badRequest } = require('../../utils/response');

/** Aggregate income and expenses by day for a date window. */
async function dailySeries(from, to) {
  const [incomeRows] = await pool.query(
    `SELECT DATE(income_date) AS day, COALESCE(SUM(amount), 0) AS total
     FROM income
     WHERE income_date BETWEEN ? AND ?
     GROUP BY DATE(income_date)`,
    [from, to]
  );
  const [expenseRows] = await pool.query(
    `SELECT DATE(expense_date) AS day, COALESCE(SUM(amount), 0) AS total
     FROM expenses
     WHERE deleted_at IS NULL AND expense_date BETWEEN ? AND ?
     GROUP BY DATE(expense_date)`,
    [from, to]
  );
  const incomeByDay = new Map(incomeRows.map((r) => [String(r.day), Number(r.total)]));
  const expenseByDay = new Map(expenseRows.map((r) => [String(r.day), Number(r.total)]));

  const series = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cursor <= end) {
    const key = cursor.toISOString().slice(0, 10);
    const income = incomeByDay.get(key) || 0;
    const expense = expenseByDay.get(key) || 0;
    series.push({ date: key, income, expense, profit: Math.round((income - expense) * 100) / 100 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return series;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoStr(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/** Top-level dashboard numbers. */
async function dashboard(req, res, next) {
  try {
    const today = todayStr();
    const weekFrom = daysAgoStr(6);
    const monthFrom = daysAgoStr(29);

    const [[todayRow]] = await pool.query(
      'SELECT COALESCE(SUM(amount),0) AS total FROM income WHERE income_date = ?',
      [today]
    );
    const [[weekRow]] = await pool.query(
      'SELECT COALESCE(SUM(amount),0) AS total FROM income WHERE income_date BETWEEN ? AND ?',
      [weekFrom, today]
    );
    const [[monthRow]] = await pool.query(
      'SELECT COALESCE(SUM(amount),0) AS total FROM income WHERE income_date BETWEEN ? AND ?',
      [monthFrom, today]
    );
    const [[monthExpense]] = await pool.query(
      'SELECT COALESCE(SUM(amount),0) AS total FROM expenses WHERE deleted_at IS NULL AND expense_date BETWEEN ? AND ?',
      [monthFrom, today]
    );

    const [[rooms]] = await pool.query(
      "SELECT COUNT(*) AS total FROM rooms WHERE deleted_at IS NULL"
    );
    const [[occupied]] = await pool.query(
      "SELECT COUNT(*) AS total FROM rooms WHERE deleted_at IS NULL AND status = 'occupied'"
    );
    const [[activeBookings]] = await pool.query(
      "SELECT COUNT(*) AS total FROM bookings WHERE deleted_at IS NULL AND status IN ('reserved','checked_in')"
    );
    const [[todayOrders]] = await pool.query(
      "SELECT COUNT(*) AS total FROM restaurant_orders WHERE deleted_at IS NULL AND status = 'paid' AND DATE(created_at) = ?",
      [today]
    );

    const occupancy = rooms.total ? Math.round((occupied.total / rooms.total) * 1000) / 10 : 0;

    return sendData(res, {
      income: {
        today: Number(todayRow.total),
        week: Number(weekRow.total),
        month: Number(monthRow.total),
      },
      expenses: { month: Number(monthExpense.total) },
      profit: { month: Math.round((Number(monthRow.total) - Number(monthExpense.total)) * 100) / 100 },
      rooms: { total: rooms.total, occupied: occupied.total, occupancy },
      activeBookings: activeBookings.total,
      restaurantOrdersToday: todayOrders.total,
    });
  } catch (err) {
    next(err);
  }
}

/** Revenue series (income vs expense vs profit) for a window. */
async function revenue(req, res, next) {
  try {
    const to = req.query.to || todayStr();
    const from = req.query.from || daysAgoStr(29);
    if (from > to) return next(badRequest('from must be on or before to'));
    const series = await dailySeries(from, to);
    const totals = series.reduce(
      (acc, d) => {
        acc.income += d.income;
        acc.expense += d.expense;
        acc.profit += d.profit;
        return acc;
      },
      { income: 0, expense: 0, profit: 0 }
    );
    return sendData(res, { from, to, series, totals });
  } catch (err) {
    next(err);
  }
}

/** Revenue broken down by source for a window. */
async function revenueBySource(req, res, next) {
  try {
    const to = req.query.to || todayStr();
    const from = req.query.from || daysAgoStr(29);
    const [rows] = await pool.query(
      `SELECT source, COALESCE(SUM(amount),0) AS total, COUNT(*) AS count
       FROM income WHERE income_date BETWEEN ? AND ?
       GROUP BY source ORDER BY total DESC`,
      [from, to]
    );
    return sendData(res, {
      from,
      to,
      bySource: rows.map((r) => ({ source: r.source, total: Number(r.total), count: r.count })),
    });
  } catch (err) {
    next(err);
  }
}

/** Occupancy over a window based on check-ins per day. */
async function occupancy(req, res, next) {
  try {
    const to = req.query.to || todayStr();
    const from = req.query.from || daysAgoStr(29);
    const [[roomCountRow]] = await pool.query(
      'SELECT COUNT(*) AS total FROM rooms WHERE deleted_at IS NULL'
    );
    const totalRooms = roomCountRow.total || 0;

    const [rows] = await pool.query(
      `SELECT DATE(check_in_date) AS day, COUNT(*) AS bookings
       FROM bookings
       WHERE deleted_at IS NULL AND status <> 'cancelled'
         AND check_in_date BETWEEN ? AND ?
       GROUP BY DATE(check_in_date)`,
      [from, to]
    );
    const byDay = new Map(rows.map((r) => [String(r.day), r.bookings]));

    const series = [];
    const cursor = new Date(`${from}T00:00:00Z`);
    const end = new Date(`${to}T00:00:00Z`);
    while (cursor <= end) {
      const key = cursor.toISOString().slice(0, 10);
      const booked = byDay.get(key) || 0;
      series.push({
        date: key,
        bookings: booked,
        occupancy: totalRooms ? Math.round((booked / totalRooms) * 1000) / 10 : 0,
      });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return sendData(res, { from, to, totalRooms, series });
  } catch (err) {
    next(err);
  }
}

/** Top-selling menu items by revenue for a window. */
async function sales(req, res, next) {
  try {
    const to = req.query.to || todayStr();
    const from = req.query.from || daysAgoStr(29);
    const [rows] = await pool.query(
      `SELECT i.item_name AS name, SUM(i.quantity) AS qty, COALESCE(SUM(i.line_total),0) AS revenue
       FROM restaurant_order_items i
       JOIN restaurant_orders o ON o.id = i.order_id
       WHERE o.deleted_at IS NULL AND o.status = 'paid'
         AND DATE(o.created_at) BETWEEN ? AND ?
       GROUP BY i.item_name
       ORDER BY revenue DESC
       LIMIT 10`,
      [from, to]
    );
    return sendData(res, {
      from,
      to,
      topItems: rows.map((r) => ({ name: r.name, quantity: Number(r.qty), revenue: Number(r.revenue) })),
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { dashboard, revenue, revenueBySource, occupancy, sales };
