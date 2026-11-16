/**
 * Generates sequential receipt numbers in the form REC-YYYY-NNNN.
 * Uses the receipt_counters table with an atomic UPSERT + row lock so two
 * concurrent orders can never receive the same number.
 *
 * Must be called with a dedicated transaction connection (conn).
 */
async function nextReceiptNo(conn) {
  const year = new Date().getFullYear();
  await conn.query(
    `INSERT INTO receipt_counters (year, last_seq) VALUES (?, 1)
     ON DUPLICATE KEY UPDATE last_seq = last_seq + 1`,
    [year]
  );
  const [rows] = await conn.query('SELECT last_seq FROM receipt_counters WHERE year = ? FOR UPDATE', [year]);
  const seq = rows[0].last_seq;
  return `REC-${year}-${String(seq).padStart(4, '0')}`;
}

module.exports = { nextReceiptNo };
