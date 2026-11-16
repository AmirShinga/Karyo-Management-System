const { badRequest } = require('./response');

const PAYMENT_METHODS = ['cash', 'pos', 'bank_transfer'];

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function summarizePayments(payments, fallbackAmount = 0) {
  if (!Array.isArray(payments) || !payments.length) {
    const total = roundMoney(fallbackAmount);
    if (total > 0) {
      return { method: 'cash', splits: [{ method: 'cash', amount: total }], total };
    }
    return { method: 'other', splits: [], total: 0 };
  }

  const totals = new Map();
  for (const payment of payments) {
    if (!PAYMENT_METHODS.includes(payment?.method)) {
      throw badRequest('Invalid payment method');
    }
    const amount = roundMoney(payment.amount);
    if (amount <= 0) continue;
    totals.set(payment.method, roundMoney((totals.get(payment.method) || 0) + amount));
  }

  const splits = [...totals.entries()].map(([method, amount]) => ({ method, amount }));
  if (!splits.length) throw badRequest('At least one payment amount is required');
  const total = roundMoney(splits.reduce((sum, split) => sum + split.amount, 0));
  return { method: splits.length > 1 ? 'mixed' : splits[0].method, splits, total };
}

async function recordPaymentSplits(conn, incomeId, splits) {
  for (const split of splits) {
    await conn.query('INSERT INTO payment_splits (income_id, method, amount) VALUES (?, ?, ?)', [
      incomeId,
      split.method,
      split.amount,
    ]);
  }
}

async function loadPaymentSplits(db, incomeIds) {
  if (!incomeIds.length) return new Map();
  const [rows] = await db.query(
    `SELECT income_id, method, amount
     FROM payment_splits
     WHERE income_id IN (${incomeIds.map(() => '?').join(',')})
     ORDER BY id ASC`,
    incomeIds
  );
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.income_id)) map.set(row.income_id, []);
    map.get(row.income_id).push({ method: row.method, amount: Number(row.amount) });
  }
  return map;
}

function addAmount(totals, method, amount) {
  totals.set(method, roundMoney((totals.get(method) || 0) + amount));
}

function finalizeSummary(totals, hasOther = false) {
  const splits = [...totals.entries()].map(([method, amount]) => ({ method, amount }));
  const total = roundMoney(splits.reduce((sum, split) => sum + split.amount, 0));
  return {
    method: splits.length > 1 ? 'mixed' : splits[0]?.method || (hasOther ? 'other' : null),
    splits,
    total,
  };
}

async function paymentSummariesFor(db, source, referenceIds) {
  const result = new Map();
  if (!referenceIds.length) return result;
  const [rows] = await db.query(
    `SELECT id, reference_id, amount, payment_method
     FROM income
     WHERE source = ? AND reference_id IN (${referenceIds.map(() => '?').join(',')})
       AND amount > 0
     ORDER BY id ASC`,
    [source, ...referenceIds]
  );
  const splitsByIncome = await loadPaymentSplits(db, rows.map((row) => row.id));
  const state = new Map();

  for (const row of rows) {
    if (!state.has(row.reference_id)) {
      state.set(row.reference_id, { totals: new Map(), hasOther: false });
    }
    const entry = state.get(row.reference_id);
    const splits = splitsByIncome.get(row.id) || [];
    if (splits.length) {
      for (const split of splits) addAmount(entry.totals, split.method, split.amount);
    } else if (PAYMENT_METHODS.includes(row.payment_method)) {
      addAmount(entry.totals, row.payment_method, Number(row.amount));
    } else {
      entry.hasOther = true;
    }
  }

  for (const [referenceId, entry] of state) {
    result.set(referenceId, finalizeSummary(entry.totals, entry.hasOther));
  }
  return result;
}

async function paymentSummaryFor(db, source, referenceId) {
  const map = await paymentSummariesFor(db, source, [referenceId]);
  const key = String(referenceId);
  for (const [id, summary] of map) {
    if (String(id) === key) return summary;
  }
  return { method: null, splits: [], total: 0 };
}

module.exports = {
  PAYMENT_METHODS,
  roundMoney,
  summarizePayments,
  recordPaymentSplits,
  loadPaymentSplits,
  paymentSummariesFor,
  paymentSummaryFor,
};
