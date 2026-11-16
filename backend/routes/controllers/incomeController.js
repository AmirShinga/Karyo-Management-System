const { pool, withTransaction } = require('../../config/db');
const { sendData, badRequest, paginate, pageMeta } = require('../../utils/response');
const {
  summarizePayments,
  recordPaymentSplits,
  loadPaymentSplits,
} = require('../../utils/payments');

function mapIncome(r, paymentSplits = []) {
  return {
    id: r.id,
    source: r.source,
    referenceId: r.reference_id,
    description: r.description,
    amount: Number(r.amount),
    paymentMethod: r.payment_method,
    paymentSplits: paymentSplits.map((s) => ({ method: s.method, amount: Number(s.amount) })),
    incomeDate: r.income_date,
    recordedBy: r.recorded_by,
    recorderName: r.recorder_name || null,
    createdAt: r.created_at,
  };
}

const SELECT_INCOME = `
  SELECT i.*, u.name AS recorder_name
  FROM income i
  LEFT JOIN users u ON u.id = i.recorded_by
`;

async function listIncome(req, res, next) {
  try {
    const { source, from, to } = req.query;
    const search = (req.query.search || '').trim();
    const { page, limit, offset } = paginate(req.query);
    const where = ['1 = 1'];
    const params = [];
    if (source) {
      where.push('i.source = ?');
      params.push(source);
    }
    if (from) {
      where.push('i.income_date >= ?');
      params.push(from);
    }
    if (to) {
      where.push('i.income_date <= ?');
      params.push(to);
    }
    if (search) {
      where.push('(i.description LIKE ? OR u.name LIKE ?)');
      const like = `%${search}%`;
      params.push(like, like);
    }

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM income i LEFT JOIN users u ON u.id = i.recorded_by WHERE ${where.join(' AND ')}`,
      params
    );
    const [rows] = await pool.query(
      `${SELECT_INCOME} WHERE ${where.join(' AND ')} ORDER BY i.income_date DESC, i.id DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const splitsByIncome = await loadPaymentSplits(pool, rows.map((r) => r.id));
    return sendData(
      res,
      rows.map((r) => mapIncome(r, splitsByIncome.get(r.id) || [])),
      pageMeta(page, limit, total)
    );
  } catch (err) {
    next(err);
  }
}

async function createIncome(req, res, next) {
  try {
    const b = req.body;
    const payment = summarizePayments(b.payments, b.amount);
    if (b.payments && Math.abs(payment.total - b.amount) > 0.009) {
      return next(badRequest('Payment total must equal the income amount'));
    }

    const created = await withTransaction(async (conn) => {
      const [result] = await conn.query(
        `INSERT INTO income
          (source, description, amount, payment_method, income_date, recorded_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          b.source,
          b.description || null,
          payment.total,
          payment.method,
          b.incomeDate || new Date().toISOString().slice(0, 10),
          req.user.id,
        ]
      );
      await recordPaymentSplits(conn, result.insertId, payment.splits);
      const [rows] = await conn.query(`${SELECT_INCOME} WHERE i.id = ?`, [result.insertId]);
      const splitsByIncome = await loadPaymentSplits(conn, [result.insertId]);
      return mapIncome(rows[0], splitsByIncome.get(result.insertId) || []);
    });

    return sendData(res, created, undefined, 201);
  } catch (err) {
    next(err);
  }
}

async function incomeSummary(req, res, next) {
  try {
    const { from, to } = req.query;
    const where = ['1 = 1'];
    const params = [];
    if (from) {
      where.push('income_date >= ?');
      params.push(from);
    }
    if (to) {
      where.push('income_date <= ?');
      params.push(to);
    }
    const [rows] = await pool.query(
      `SELECT source, COUNT(*) AS count, COALESCE(SUM(amount), 0) AS total
       FROM income WHERE ${where.join(' AND ')} GROUP BY source`,
      params
    );
    const bySource = {};
    let grand = 0;
    for (const r of rows) {
      bySource[r.source] = { count: r.count, total: Number(r.total) };
      grand += Number(r.total);
    }
    return sendData(res, { bySource, total: Math.round(grand * 100) / 100 });
  } catch (err) {
    next(err);
  }
}

module.exports = { listIncome, createIncome, incomeSummary };
