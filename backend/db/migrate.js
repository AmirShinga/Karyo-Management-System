/**
 * Migrates an existing database to the current schema.
 * Usage: npm run db:migrate
 *
 * Safe to run multiple times.
 * Adds role/permission tables and guest booking fields, backfills guest IDs,
 * and maps legacy user roles:
 *   owner      -> admin
 *   frontdesk  -> hotel
 *   accountant -> owner (read-only)
 *   restaurant -> restaurant
 */
require('dotenv').config();
const { pool } = require('../config/db');
const {
  seedPermissions,
  PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
} = require('./permissions');

async function ensureBookingGuestFields() {
  const [columns] = await pool.query("SHOW COLUMNS FROM bookings LIKE 'guest_address'");
  if (!columns.length) {
    await pool.query(
      'ALTER TABLE bookings ADD COLUMN guest_address VARCHAR(255) NULL AFTER guest_email'
    );
    console.log('  bookings.guest_address: added');
  } else {
    console.log('  bookings.guest_address: already exists');
  }

  const [result] = await pool.query(
    `UPDATE bookings
     SET guest_id_number = CONCAT('G-', LPAD(id, 6, '0'))
     WHERE guest_id_number IS NULL OR TRIM(guest_id_number) = ''`
  );
  console.log(`  guest ID numbers backfilled: ${result.affectedRows}`);
}

async function ensureGuestReportFields() {
  const fields = [
    ['guest_occupation', 'guest_occupation VARCHAR(120) NULL AFTER guest_address'],
    ['stay_purpose', 'stay_purpose VARCHAR(255) NULL AFTER guest_occupation'],
    ['guest_contact_name', 'guest_contact_name VARCHAR(160) NULL AFTER stay_purpose'],
    ['guest_contact_phone', 'guest_contact_phone VARCHAR(30) NULL AFTER guest_contact_name'],
    ['guest_id_type', 'guest_id_type VARCHAR(60) NULL AFTER guest_contact_phone'],
    ['guest_id_document', 'guest_id_document VARCHAR(80) NULL AFTER guest_id_type'],
    ['vehicle_no', 'vehicle_no VARCHAR(60) NULL AFTER guest_id_document'],
    ['arrival_from', 'arrival_from VARCHAR(160) NULL AFTER vehicle_no'],
    ['arrival_time', 'arrival_time TIME NULL AFTER arrival_from'],
    ['destination', 'destination VARCHAR(160) NULL AFTER arrival_time'],
    ['departure_time', 'departure_time TIME NULL AFTER destination'],
  ];
  for (const [column, definition] of fields) {
    await addColumn('bookings', column, definition);
  }
}

async function ensurePaymentSchema() {
  const [columns] = await pool.query("SHOW COLUMNS FROM income LIKE 'payment_method'");
  if (!columns.length) {
    await pool.query(
      `ALTER TABLE income
       ADD COLUMN payment_method ENUM('cash','pos','bank_transfer','mixed','other')
       NOT NULL DEFAULT 'other' AFTER amount`
    );
    console.log('  income.payment_method: added');
  } else {
    console.log('  income.payment_method: already exists');
  }

  await pool.query(
    `CREATE TABLE IF NOT EXISTS payment_splits (
      id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
      income_id   INT UNSIGNED NOT NULL,
      method      ENUM('cash','pos','bank_transfer') NOT NULL,
      amount      DECIMAL(12,2) NOT NULL,
      created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_payment_splits_income (income_id),
      CONSTRAINT fk_payment_splits_income FOREIGN KEY (income_id) REFERENCES income (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );
  console.log('  payment_splits: ensured');
}

async function ensureExpensePaymentSchema() {
  await pool.query('DROP TABLE IF EXISTS expense_payment_splits');

  const [columns] = await pool.query("SHOW COLUMNS FROM expenses LIKE 'payment_method'");
  if (columns.length) {
    await pool.query('ALTER TABLE expenses DROP COLUMN payment_method');
    console.log('  expenses.payment_method: removed');
  } else {
    console.log('  expenses.payment_method: already removed');
  }
  console.log('  expense_payment_splits: removed');
}

async function ensureMenuSortOrder() {
  const [columns] = await pool.query("SHOW COLUMNS FROM menu_items LIKE 'sort_order'");
  if (!columns.length) {
    await pool.query(
      `ALTER TABLE menu_items
       ADD COLUMN sort_order INT NOT NULL DEFAULT 0 AFTER available`
    );
    console.log('  menu_items.sort_order: added');
  } else {
    console.log('  menu_items.sort_order: already exists');
  }
}

async function ensureMenuCategoriesSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS menu_categories (
      id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
      name        VARCHAR(60) NOT NULL,
      sort_order  INT NOT NULL DEFAULT 0,
      created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      deleted_at  DATETIME NULL,
      PRIMARY KEY (id),
      KEY idx_menu_categories_name (name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  const [result] = await pool.query(
    `INSERT INTO menu_categories (name, sort_order)
     SELECT DISTINCT m.category, 0 FROM menu_items m
     WHERE m.deleted_at IS NULL AND m.category IS NOT NULL AND m.category <> ''
       AND NOT EXISTS (SELECT 1 FROM menu_categories c WHERE c.name = m.category)`
  );
  console.log(`  menu_categories: ensured (backfilled ${result.affectedRows})`);
}

async function ensureOrderChargeColumn() {
  const [columns] = await pool.query("SHOW COLUMNS FROM restaurant_orders LIKE 'charge_amount'");
  if (!columns.length) {
    await pool.query(
      `ALTER TABLE restaurant_orders
       ADD COLUMN charge_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER tax_amount`
    );
    console.log('  restaurant_orders.charge_amount: added');
  } else {
    console.log('  restaurant_orders.charge_amount: already exists');
  }
}

async function ensureOrderPendingStatus() {
  const [columns] = await pool.query("SHOW COLUMNS FROM restaurant_orders LIKE 'status'");
  const type = columns[0]?.Type || '';
  if (!type.includes("'pending'")) {
    await pool.query(
      `ALTER TABLE restaurant_orders
       MODIFY COLUMN status ENUM('pending','open','paid','cancelled') NOT NULL DEFAULT 'paid'`
    );
    console.log('  restaurant_orders.status: pending added');
  } else {
    console.log('  restaurant_orders.status: pending already supported');
  }

  const [result] = await pool.query(
    "UPDATE restaurant_orders SET status = 'pending' WHERE status = 'open'"
  );
  if (result.affectedRows) {
    console.log(`  open orders moved to pending: ${result.affectedRows}`);
  }
}

async function ensureDiscountColumns() {
  const [bookingCols] = await pool.query("SHOW COLUMNS FROM bookings LIKE 'discount_amount'");
  if (!bookingCols.length) {
    await pool.query(
      'ALTER TABLE bookings ADD COLUMN discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER rate_per_night'
    );
    console.log('  bookings.discount_amount: added');
  } else {
    console.log('  bookings.discount_amount: already exists');
  }

  const [orderCols] = await pool.query("SHOW COLUMNS FROM restaurant_orders LIKE 'discount_amount'");
  if (!orderCols.length) {
    await pool.query(
      'ALTER TABLE restaurant_orders ADD COLUMN discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER charge_amount'
    );
    console.log('  restaurant_orders.discount_amount: added');
  } else {
    console.log('  restaurant_orders.discount_amount: already exists');
  }
}

async function ensureReceiptSchema() {
  // The audit trail was removed; drop its table on existing databases.
  await pool.query('DROP TABLE IF EXISTS audit_logs');
  await pool.query(
    `CREATE TABLE IF NOT EXISTS receipt_snapshots (
      id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      kind          ENUM('booking','order') NOT NULL,
      reference_id  INT UNSIGNED NOT NULL,
      payload       JSON NOT NULL,
      created_by    INT UNSIGNED NULL,
      created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_receipt_snapshots_ref (kind, reference_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );
  console.log('  receipt_snapshots: ensured (audit_logs removed)');
}

async function columnExists(table, column) {
  const [columns] = await pool.query(`SHOW COLUMNS FROM \`${table}\` LIKE ?`, [column]);
  return columns.length > 0;
}

async function addColumn(table, column, definition) {
  if (await columnExists(table, column)) {
    console.log(`  ${table}.${column}: already exists`);
    return;
  }
  await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN ${definition}`);
  console.log(`  ${table}.${column}: added`);
}

async function ensureUserSecurityColumns() {
  await addColumn('users', 'failed_attempts', 'failed_attempts INT UNSIGNED NOT NULL DEFAULT 0');
  await addColumn('users', 'locked_until', 'locked_until DATETIME NULL');
  await addColumn('users', 'mfa_enabled', 'mfa_enabled TINYINT(1) NOT NULL DEFAULT 0');
  await addColumn('users', 'mfa_secret', 'mfa_secret VARCHAR(64) NULL');
  await addColumn('users', 'token_version', 'token_version INT UNSIGNED NOT NULL DEFAULT 0');
}

async function ensureSessionsTable() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS sessions (
      id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id      INT UNSIGNED NOT NULL,
      token_hash   CHAR(64) NOT NULL,
      ip           VARCHAR(64) NULL,
      user_agent   VARCHAR(255) NULL,
      created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_used_at DATETIME NULL,
      expires_at   DATETIME NOT NULL,
      revoked_at   DATETIME NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_sessions_token (token_hash),
      KEY idx_sessions_user (user_id, revoked_at),
      CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );
  console.log('  sessions: ensured');
}

async function indexExists(table, indexName) {
  const [rows] = await pool.query(`SHOW INDEX FROM \`${table}\` WHERE Key_name = ?`, [indexName]);
  return rows.length > 0;
}

async function addIndex(table, indexName, columnsSql) {
  if (await indexExists(table, indexName)) {
    console.log(`  ${table}.${indexName}: already exists`);
    return;
  }
  await pool.query(`ALTER TABLE \`${table}\` ADD INDEX ${indexName} (${columnsSql})`);
  console.log(`  ${table}.${indexName}: added`);
}

async function ensureSearchIndexes() {
  await addIndex('bookings', 'idx_bookings_guest', 'guest_name, guest_phone');
  await addIndex('income', 'idx_income_description', 'description');
  await addIndex('expenses', 'idx_expenses_description', 'description');
  await addIndex('menu_items', 'idx_menu_name', 'name');
  await addIndex('staff', 'idx_staff_name', 'full_name');
}

async function ensureOperationsSchema() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS room_status_history (
      id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      room_id     INT UNSIGNED NOT NULL,
      from_status VARCHAR(20) NULL,
      to_status   VARCHAR(20) NOT NULL,
      reason      VARCHAR(255) NULL,
      changed_by  INT UNSIGNED NULL,
      created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_room_history_room (room_id, created_at),
      CONSTRAINT fk_room_history_room FOREIGN KEY (room_id) REFERENCES rooms (id) ON DELETE CASCADE,
      CONSTRAINT fk_room_history_user FOREIGN KEY (changed_by) REFERENCES users (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );
  await pool.query(
    `CREATE TABLE IF NOT EXISTS maintenance_requests (
      id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
      room_id      INT UNSIGNED NULL,
      title        VARCHAR(160) NOT NULL,
      description  TEXT NULL,
      category     VARCHAR(60) NOT NULL DEFAULT 'general',
      priority     ENUM('low','medium','high','urgent') NOT NULL DEFAULT 'medium',
      status       ENUM('open','in_progress','resolved','closed') NOT NULL DEFAULT 'open',
      cost         DECIMAL(12,2) NOT NULL DEFAULT 0.00,
      reported_by  INT UNSIGNED NULL,
      assigned_to  INT UNSIGNED NULL,
      resolved_at  DATETIME NULL,
      created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_maintenance_status (status, priority),
      KEY idx_maintenance_room (room_id),
      CONSTRAINT fk_maintenance_room FOREIGN KEY (room_id) REFERENCES rooms (id) ON DELETE SET NULL,
      CONSTRAINT fk_maintenance_reporter FOREIGN KEY (reported_by) REFERENCES users (id),
      CONSTRAINT fk_maintenance_assignee FOREIGN KEY (assigned_to) REFERENCES users (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );
  await pool.query(
    `CREATE TABLE IF NOT EXISTS inventory_items (
      id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
      name          VARCHAR(160) NOT NULL,
      unit          VARCHAR(20) NOT NULL DEFAULT 'unit',
      quantity      DECIMAL(12,2) NOT NULL DEFAULT 0.00,
      reorder_level DECIMAL(12,2) NOT NULL DEFAULT 0.00,
      unit_cost     DECIMAL(12,2) NOT NULL DEFAULT 0.00,
      active        TINYINT(1) NOT NULL DEFAULT 1,
      created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      deleted_at    DATETIME NULL,
      PRIMARY KEY (id),
      KEY idx_inventory_name (name),
      KEY idx_inventory_active (active)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );
  await pool.query(
    `CREATE TABLE IF NOT EXISTS inventory_transactions (
      id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      item_id     INT UNSIGNED NOT NULL,
      type        ENUM('purchase','usage','wastage','adjustment','return') NOT NULL,
      quantity    DECIMAL(12,2) NOT NULL,
      unit_cost   DECIMAL(12,2) NOT NULL DEFAULT 0.00,
      reason      VARCHAR(255) NULL,
      reference   VARCHAR(80) NULL,
      recorded_by INT UNSIGNED NULL,
      created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_inventory_tx_item (item_id, created_at),
      KEY idx_inventory_tx_type (type),
      CONSTRAINT fk_inventory_tx_item FOREIGN KEY (item_id) REFERENCES inventory_items (id) ON DELETE CASCADE,
      CONSTRAINT fk_inventory_tx_user FOREIGN KEY (recorded_by) REFERENCES users (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );
  console.log('  operations tables: ensured');
}

async function permissionExists(code) {
  try {
    const [rows] = await pool.query('SELECT code FROM permissions WHERE code = ? LIMIT 1', [code]);
    return rows.length > 0;
  } catch {
    return false;
  }
}

async function backfillOutstandingPermission() {
  const [result] = await pool.query(
    `INSERT IGNORE INTO role_permissions (role, permission_code, allowed)
     SELECT DISTINCT rp.role, 'outstanding.view', 1
     FROM role_permissions rp
     JOIN roles r ON r.code = rp.role
     WHERE rp.allowed = 1
       AND rp.permission_code IN ('bookings.view', 'orders.view')
       AND rp.role <> 'admin'`
  );
  console.log(`  outstanding.view granted to existing roles: ${result.affectedRows}`);
}

async function existingPermissionCodes() {
  try {
    const [rows] = await pool.query('SELECT code FROM permissions');
    return new Set(rows.map((r) => r.code));
  } catch {
    return new Set();
  }
}

/**
 * Removes permission codes that are no longer part of the catalog (e.g. after
 * a feature was removed), together with their role grants. Keeps the
 * Permissions page in sync with the code.
 */
async function pruneRemovedPermissions() {
  const known = PERMISSIONS.map((p) => p.code);
  if (!known.length) return;
  const placeholders = known.map(() => '?').join(', ');
  const [grants] = await pool.query(
    `DELETE FROM role_permissions WHERE permission_code NOT IN (${placeholders})`,
    known
  );
  const [perms] = await pool.query(
    `DELETE FROM permissions WHERE code NOT IN (${placeholders})`,
    known
  );
  console.log(`  stale permissions removed: ${perms.affectedRows} (role grants: ${grants.affectedRows})`);
}

/**
 * Grants brand-new permission codes to each role according to the default
 * matrix. Only used for codes that did not exist before this migration, so an
 * admin's deliberate removals are never re-granted.
 */
async function backfillNewPermissions(newCodes) {
  if (!newCodes.length) return;
  let granted = 0;
  for (const role of Object.keys(DEFAULT_ROLE_PERMISSIONS)) {
    if (role === 'admin') continue;
    const defaults = DEFAULT_ROLE_PERMISSIONS[role] || [];
    for (const code of newCodes) {
      if (!defaults.includes(code)) continue;
      const [result] = await pool.query(
        'INSERT IGNORE INTO role_permissions (role, permission_code, allowed) VALUES (?, ?, 1)',
        [role, code]
      );
      granted += result.affectedRows;
    }
  }
  console.log(`  new permissions granted: ${granted}`);
}

async function main() {
  console.log('Ensuring roles and permissions schema...');
  const hadOutstandingPermission = await permissionExists('outstanding.view');
  const knownCodes = await existingPermissionCodes();
  await seedPermissions(pool);
  if (!hadOutstandingPermission) {
    await backfillOutstandingPermission();
  }
  const newCodes = PERMISSIONS.filter((p) => !knownCodes.has(p.code)).map((p) => p.code);
  await backfillNewPermissions(newCodes);
  await pruneRemovedPermissions();

  console.log('Ensuring receipt snapshot table...');
  await ensureReceiptSchema();

  console.log('Ensuring user security columns and sessions...');
  await ensureUserSecurityColumns();
  await ensureSessionsTable();

  console.log('Ensuring operational tables...');
  await ensureOperationsSchema();

  console.log('Ensuring search indexes...');
  await ensureSearchIndexes();

  console.log('Ensuring booking guest fields...');
  await ensureBookingGuestFields();

  console.log('Ensuring guest report fields...');
  await ensureGuestReportFields();

  console.log('Ensuring payment schema...');
  await ensurePaymentSchema();

  console.log('Removing expense payment schema...');
  await ensureExpensePaymentSchema();

  console.log('Ensuring menu sort order...');
  await ensureMenuSortOrder();

  console.log('Ensuring menu categories...');
  await ensureMenuCategoriesSchema();

  console.log('Ensuring order charge column...');
  await ensureOrderChargeColumn();

  console.log('Ensuring pending order status...');
  await ensureOrderPendingStatus();

  console.log('Ensuring discount columns...');
  await ensureDiscountColumns();

  console.log('Migrating user roles...');
  const mappings = [
    ['admin', 'owner'],
    ['hotel', 'frontdesk'],
    ['owner', 'accountant'],
  ];
  for (const [next, prev] of mappings) {
    // Skip when the target role already has accounts: that means the database
    // is already on the current model, so the legacy role is not a leftover.
    const [[{ existing }]] = await pool.query(
      'SELECT COUNT(*) AS existing FROM users WHERE role = ?',
      [next]
    );
    if (existing > 0) {
      console.log(`  ${prev} -> ${next}: skipped (${next} accounts already exist)`);
      continue;
    }
    const [result] = await pool.query('UPDATE users SET role = ? WHERE role = ?', [next, prev]);
    if (result.affectedRows) {
      console.log(`  ${prev} -> ${next}: ${result.affectedRows} user(s)`);
    }
  }
}

main()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error('Migration failed:', err.message);
    try {
      await pool.end();
    } catch {
      // ignore
    }
    process.exit(1);
  });
