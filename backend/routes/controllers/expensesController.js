const { pool } = require('../../config/db');
const { sendData, notFound, badRequest, paginate, pageMeta } = require('../../utils/response');

function mapExpense(r) {
  return {
    id: r.id,
    category: r.category,
    description: r.description,
    amount: Number(r.amount),
    expenseDate: r.expense_date,
    recordedBy: r.recorded_by,
    recorderName: r.recorder_name || null,
    receiptUrl: r.receipt_url,
    createdAt: r.created_at,
  };
}

const SELECT_EXPENSE = `
  SELECT e.*, u.name AS recorder_name
  FROM expenses e
  LEFT JOIN users u ON u.id = e.recorded_by
`;

async function listExpenses(req, res, next) {
  try {
    const { category, from, to } = req.query;
    const search = (req.query.search || '').trim();
    const { page, limit, offset } = paginate(req.query);
    const where = ['e.deleted_at IS NULL'];
    const params = [];
    if (category) {
      where.push('e.category = ?');
      params.push(category);
    }
    if (from) {
      where.push('e.expense_date >= ?');
      params.push(from);
    }
    if (to) {
      where.push('e.expense_date <= ?');
      params.push(to);
    }
    if (search) {
      where.push('(e.description LIKE ? OR e.category LIKE ?)');
      const like = `%${search}%`;
      params.push(like, like);
    }

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM expenses e WHERE ${where.join(' AND ')}`,
      params
    );
    const [rows] = await pool.query(
      `${SELECT_EXPENSE} WHERE ${where.join(' AND ')} ORDER BY e.expense_date DESC, e.id DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    return sendData(res, rows.map(mapExpense), pageMeta(page, limit, total));
  } catch (err) {
    next(err);
  }
}

async function createExpense(req, res, next) {
  try {
    const b = req.body;
    const [result] = await pool.query(
      `INSERT INTO expenses
        (category, description, amount, expense_date, recorded_by, receipt_url)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        b.category,
        b.description || null,
        b.amount,
        b.expenseDate || new Date().toISOString().slice(0, 10),
        req.user.id,
        b.receiptUrl || null,
      ]
    );
    const [rows] = await pool.query(`${SELECT_EXPENSE} WHERE e.id = ?`, [result.insertId]);
    return sendData(res, mapExpense(rows[0]), undefined, 201);
  } catch (err) {
    next(err);
  }
}

async function updateExpense(req, res, next) {
  try {
    const { id } = req.params;
    const b = req.body;
    const map = {
      category: 'category',
      description: 'description',
      amount: 'amount',
      expenseDate: 'expense_date',
      receiptUrl: 'receipt_url',
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

    values.push(id);
    const [result] = await pool.query(
      `UPDATE expenses SET ${sets.join(', ')} WHERE id = ? AND deleted_at IS NULL`,
      values
    );
    if (!result.affectedRows) return next(notFound('Expense not found'));

    const [rows] = await pool.query(`${SELECT_EXPENSE} WHERE e.id = ?`, [id]);
    return sendData(res, mapExpense(rows[0]));
  } catch (err) {
    next(err);
  }
}

async function deleteExpense(req, res, next) {
  try {
    const { id } = req.params;
    const [result] = await pool.query(
      'UPDATE expenses SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL',
      [id]
    );
    if (!result.affectedRows) return next(notFound('Expense not found'));
    return sendData(res, { deleted: true });
  } catch (err) {
    next(err);
  }
}

async function expenseSummary(req, res, next) {
  try {
    const { from, to } = req.query;
    const where = ['deleted_at IS NULL'];
    const params = [];
    if (from) {
      where.push('expense_date >= ?');
      params.push(from);
    }
    if (to) {
      where.push('expense_date <= ?');
      params.push(to);
    }
    const [rows] = await pool.query(
      `SELECT category, COUNT(*) AS count, COALESCE(SUM(amount), 0) AS total
       FROM expenses WHERE ${where.join(' AND ')} GROUP BY category ORDER BY total DESC`,
      params
    );
    const byCategory = rows.map((r) => ({ category: r.category, count: r.count, total: Number(r.total) }));
    const grand = byCategory.reduce((s, r) => s + r.total, 0);
    return sendData(res, { byCategory, total: Math.round(grand * 100) / 100 });
  } catch (err) {
    next(err);
  }
}

module.exports = { listExpenses, createExpense, updateExpense, deleteExpense, expenseSummary };
