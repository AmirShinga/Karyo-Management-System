/** Creates the complaints table (idempotent) for existing databases. */
async function ensureComplaintsTable(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS complaints (
      id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
      created_by  INT UNSIGNED NOT NULL,
      subject     VARCHAR(160) NOT NULL,
      message     TEXT NOT NULL,
      status      ENUM('open','resolved') NOT NULL DEFAULT 'open',
      owner_note  TEXT NULL,
      resolved_by INT UNSIGNED NULL,
      resolved_at DATETIME NULL,
      created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_complaints_status (status),
      KEY idx_complaints_created_by (created_by),
      CONSTRAINT fk_complaints_creator FOREIGN KEY (created_by) REFERENCES users (id),
      CONSTRAINT fk_complaints_resolver FOREIGN KEY (resolved_by) REFERENCES users (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

module.exports = { ensureComplaintsTable };
