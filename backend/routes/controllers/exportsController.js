const { pool } = require('../../config/db');
const { streamXlsx } = require('../../utils/excel');
const { loadPaymentSplits } = require('../../utils/payments');

function paymentText(method, splits = []) {
  if (splits.length) {
    return splits.map((split) => `${split.method} ${split.amount}`).join(' + ');
  }
  return method || '';
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoStr(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function windowFrom(req) {
  return { from: req.query.from || daysAgoStr(29), to: req.query.to || todayStr() };
}

/** GET /api/reports/export/income.xlsx */
async function incomeExport(req, res, next) {
  try {
    const { from, to } = windowFrom(req);
    const [rows] = await pool.query(
      `SELECT id, income_date, source, description, amount, payment_method
       FROM income WHERE income_date BETWEEN ? AND ?
       ORDER BY income_date ASC`,
      [from, to]
    );
    const splitsByIncome = await loadPaymentSplits(pool, rows.map((r) => r.id));
    await streamXlsx(
      res,
      `income-${from}_${to}.xlsx`,
      'Income',
      [
        { header: 'Date', key: 'income_date', width: 14 },
        { header: 'Source', key: 'source', width: 16 },
        { header: 'Description', key: 'description', width: 40 },
        { header: 'Payment method', key: 'payment_method', width: 28 },
        { header: 'Amount', key: 'amount', width: 16 },
      ],
      rows.map((r) => ({
        income_date: String(r.income_date).slice(0, 10),
        source: r.source,
        description: r.description || '',
        payment_method: paymentText(r.payment_method, splitsByIncome.get(r.id)),
        amount: Number(r.amount),
      }))
    );
  } catch (err) {
    next(err);
  }
}

/** GET /api/reports/export/expenses.xlsx */
async function expensesExport(req, res, next) {
  try {
    const { from, to } = windowFrom(req);
    const [rows] = await pool.query(
      `SELECT id, expense_date, category, description, amount
       FROM expenses WHERE deleted_at IS NULL AND expense_date BETWEEN ? AND ?
       ORDER BY expense_date ASC`,
      [from, to]
    );
    await streamXlsx(
      res,
      `expenses-${from}_${to}.xlsx`,
      'Expenses',
      [
        { header: 'Date', key: 'expense_date', width: 14 },
        { header: 'Category', key: 'category', width: 20 },
        { header: 'Description', key: 'description', width: 40 },
        { header: 'Amount', key: 'amount', width: 16 },
      ],
      rows.map((r) => ({
        expense_date: String(r.expense_date).slice(0, 10),
        category: r.category,
        description: r.description || '',
        amount: Number(r.amount),
      }))
    );
  } catch (err) {
    next(err);
  }
}

/** GET /api/reports/export/sales.xlsx */
async function salesExport(req, res, next) {
  try {
    const { from, to } = windowFrom(req);
    const [rows] = await pool.query(
      `SELECT o.id, o.receipt_no, o.order_type, o.total, DATE(o.created_at) AS day,
              i.item_name, i.quantity, i.line_total
       FROM restaurant_orders o
       JOIN restaurant_order_items i ON i.order_id = o.id
       WHERE o.deleted_at IS NULL AND o.status = 'paid'
         AND DATE(o.created_at) BETWEEN ? AND ?
       ORDER BY o.created_at ASC, i.id ASC`,
      [from, to]
    );
    await streamXlsx(
      res,
      `sales-${from}_${to}.xlsx`,
      'Sales',
      [
        { header: 'Date', key: 'day', width: 14 },
        { header: 'Receipt', key: 'receipt_no', width: 16 },
        { header: 'Order Type', key: 'order_type', width: 14 },
        { header: 'Item', key: 'item_name', width: 30 },
        { header: 'Qty', key: 'quantity', width: 8 },
        { header: 'Line Total', key: 'line_total', width: 16 },
        { header: 'Order Total', key: 'total', width: 16 },
      ],
      rows.map((r) => ({
        day: String(r.day).slice(0, 10),
        receipt_no: r.receipt_no || `#${r.id}`,
        order_type: r.order_type,
        item_name: r.item_name,
        quantity: r.quantity,
        line_total: Number(r.line_total),
        total: Number(r.total),
      }))
    );
  } catch (err) {
    next(err);
  }
}

module.exports = { incomeExport, expensesExport, salesExport };
