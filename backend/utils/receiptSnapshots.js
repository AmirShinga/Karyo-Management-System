const { pool } = require('../config/db');

/**
 * Persist the exact receipt payload that was issued. The snapshot is immutable
 * and can be used to reprint or investigate a historic receipt even after the
 * underlying booking/order changes.
 */
async function saveReceiptSnapshot(db, kind, referenceId, payload, userId = null) {
  if (!['booking', 'order'].includes(kind)) {
    throw new Error(`Invalid receipt snapshot kind: ${kind}`);
  }
  const [result] = await db.query(
    'INSERT INTO receipt_snapshots (kind, reference_id, payload, created_by) VALUES (?, ?, ?, ?)',
    [kind, referenceId, JSON.stringify(payload), userId]
  );
  return result.insertId;
}

async function listReceiptSnapshots(db, kind, referenceId, limit = 20) {
  const [rows] = await db.query(
    `SELECT id, kind, reference_id, payload, created_by, created_at
     FROM receipt_snapshots
     WHERE kind = ? AND reference_id = ?
     ORDER BY id DESC
     LIMIT ?`,
    [kind, referenceId, Math.min(Math.max(Number(limit) || 20, 1), 100)]
  );
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    referenceId: row.reference_id,
    payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
    createdBy: row.created_by,
    createdAt: row.created_at,
  }));
}

module.exports = { saveReceiptSnapshot, listReceiptSnapshots, pool };
