-- Hotel Management System — MySQL schema
-- Run via: npm run db:setup  (or paste into MySQL client)

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------------
-- Users (system login accounts)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name                VARCHAR(120) NOT NULL,
  email               VARCHAR(160) NOT NULL,
  phone               VARCHAR(30) NULL,
  password            VARCHAR(255) NOT NULL,
  role                VARCHAR(40) NOT NULL,
  active              TINYINT(1) NOT NULL DEFAULT 1,
  failed_attempts     INT UNSIGNED NOT NULL DEFAULT 0,
  locked_until        DATETIME NULL,
  mfa_enabled         TINYINT(1) NOT NULL DEFAULT 0,
  mfa_secret          VARCHAR(64) NULL,
  token_version       INT UNSIGNED NOT NULL DEFAULT 0,
  reset_token         VARCHAR(255) NULL,
  reset_token_expiry  DATETIME NULL,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at          DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- Rooms
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rooms (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  room_number     VARCHAR(20) NOT NULL,
  room_type       VARCHAR(60) NOT NULL,
  rate_per_night  DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  capacity        INT NOT NULL DEFAULT 1,
  status          ENUM('available','occupied','maintenance') NOT NULL DEFAULT 'available',
  notes           TEXT NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at      DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_rooms_number (room_number),
  KEY idx_rooms_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- Bookings (guest details entered per booking; no reusable guest profiles)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bookings (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  room_id             INT UNSIGNED NOT NULL,
  guest_name          VARCHAR(160) NOT NULL,
  guest_phone         VARCHAR(30) NULL,
  guest_email         VARCHAR(160) NULL,
  guest_address       VARCHAR(255) NULL,
  guest_id_number     VARCHAR(60) NULL,
  check_in_date       DATE NOT NULL,
  check_out_date      DATE NOT NULL,
  nights              INT NOT NULL,
  rate_per_night      DECIMAL(12,2) NOT NULL,
  discount_amount     DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  total_amount        DECIMAL(12,2) NOT NULL,
  amount_paid         DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  status              ENUM('reserved','checked_in','checked_out','cancelled') NOT NULL DEFAULT 'reserved',
  created_by          INT UNSIGNED NULL,
  actual_check_in     DATETIME NULL,
  actual_check_out    DATETIME NULL,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at          DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_bookings_room_dates (room_id, check_in_date, check_out_date),
  KEY idx_bookings_status (status),
  CONSTRAINT fk_bookings_room FOREIGN KEY (room_id) REFERENCES rooms (id),
  CONSTRAINT fk_bookings_user FOREIGN KEY (created_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- Restaurant menu items
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS menu_items (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name        VARCHAR(160) NOT NULL,
  category    VARCHAR(60) NOT NULL DEFAULT 'general',
  price       DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  cost        DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  available   TINYINT(1) NOT NULL DEFAULT 1,
  sort_order  INT NOT NULL DEFAULT 0,
  image_url   VARCHAR(255) NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at  DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_menu_available (available),
  KEY idx_menu_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- Food categories (registered list used by dishes and the POS)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS menu_categories (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name        VARCHAR(60) NOT NULL,
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at  DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_menu_categories_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- Restaurant orders (paid immediately or left pending for later settlement)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS restaurant_orders (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_type    ENUM('dine_in','takeaway','room_service') NOT NULL DEFAULT 'dine_in',
  room_id       INT UNSIGNED NULL,
  table_number  VARCHAR(20) NULL,
  subtotal      DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  tax_amount    DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  charge_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  total         DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  status        ENUM('pending','open','paid','cancelled') NOT NULL DEFAULT 'paid',
  receipt_no    VARCHAR(30) NULL,
  created_by    INT UNSIGNED NULL,
  paid_at       DATETIME NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at    DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_orders_receipt (receipt_no),
  KEY idx_orders_created (created_at),
  KEY idx_orders_status (status),
  CONSTRAINT fk_orders_room FOREIGN KEY (room_id) REFERENCES rooms (id),
  CONSTRAINT fk_orders_user FOREIGN KEY (created_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS restaurant_order_items (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id      INT UNSIGNED NOT NULL,
  menu_item_id  INT UNSIGNED NOT NULL,
  item_name     VARCHAR(160) NOT NULL,
  quantity      INT NOT NULL DEFAULT 1,
  price_at_time DECIMAL(12,2) NOT NULL,
  line_total    DECIMAL(12,2) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_order_items_order (order_id),
  CONSTRAINT fk_order_items_order FOREIGN KEY (order_id) REFERENCES restaurant_orders (id) ON DELETE CASCADE,
  CONSTRAINT fk_order_items_menu FOREIGN KEY (menu_item_id) REFERENCES menu_items (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- Income ledger (all money in: room payments, restaurant sales, other)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS income (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  source        ENUM('room','restaurant','other') NOT NULL DEFAULT 'other',
  reference_id  INT UNSIGNED NULL,
  description   VARCHAR(255) NULL,
  amount        DECIMAL(12,2) NOT NULL,
  payment_method ENUM('cash','pos','bank_transfer','mixed','other') NOT NULL DEFAULT 'other',
  income_date   DATE NOT NULL,
  recorded_by   INT UNSIGNED NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_income_date (income_date),
  KEY idx_income_source (source, reference_id),
  CONSTRAINT fk_income_user FOREIGN KEY (recorded_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS payment_splits (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  income_id   INT UNSIGNED NOT NULL,
  method      ENUM('cash','pos','bank_transfer') NOT NULL,
  amount      DECIMAL(12,2) NOT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_payment_splits_income (income_id),
  CONSTRAINT fk_payment_splits_income FOREIGN KEY (income_id) REFERENCES income (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- Expenses
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS expenses (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  category      VARCHAR(80) NOT NULL DEFAULT 'general',
  description   VARCHAR(255) NULL,
  amount        DECIMAL(12,2) NOT NULL,
  expense_date  DATE NOT NULL,
  recorded_by   INT UNSIGNED NULL,
  receipt_url   VARCHAR(255) NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at    DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_expenses_date (expense_date),
  KEY idx_expenses_category (category),
  CONSTRAINT fk_expenses_user FOREIGN KEY (recorded_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- Complaints submitted by staff and reviewed by the owner
-- ---------------------------------------------------------------------------
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- Staff records (optionally linked to a login user)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS staff (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     INT UNSIGNED NULL,
  full_name   VARCHAR(160) NOT NULL,
  position    VARCHAR(80) NOT NULL DEFAULT 'staff',
  phone       VARCHAR(30) NULL,
  salary      DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  hire_date   DATE NULL,
  active      TINYINT(1) NOT NULL DEFAULT 1,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at  DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_staff_active (active),
  CONSTRAINT fk_staff_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- Permissions (role-based permission matrix, editable by admin)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS permissions (
  code        VARCHAR(60) NOT NULL,
  label       VARCHAR(120) NOT NULL,
  module      VARCHAR(40) NOT NULL,
  sort_order  INT NOT NULL DEFAULT 0,
  PRIMARY KEY (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS role_permissions (
  role             ENUM('admin','owner','restaurant','hotel') NOT NULL,
  permission_code  VARCHAR(60) NOT NULL,
  allowed          TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (role, permission_code),
  CONSTRAINT fk_role_permissions_permission
    FOREIGN KEY (permission_code) REFERENCES permissions (code) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- Settings (key/value)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS settings (
  `key`       VARCHAR(80) NOT NULL,
  `value`     VARCHAR(255) NULL,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- Receipt counters (atomic per-year numbering: REC-YYYY-NNNN)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS receipt_counters (
  year      SMALLINT UNSIGNED NOT NULL,
  last_seq  INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- Immutable receipt snapshots (what was actually issued/printed)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS receipt_snapshots (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  kind          ENUM('booking','order') NOT NULL,
  reference_id  INT UNSIGNED NOT NULL,
  payload       JSON NOT NULL,
  created_by    INT UNSIGNED NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_receipt_snapshots_ref (kind, reference_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- Refresh-token sessions (rotating; revocable before the access token expires)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- Room status history (audit of every status transition)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS room_status_history (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- Maintenance requests
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS maintenance_requests (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- Inventory (raw materials / supplies) and stock movements (incl. wastage)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_items (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS inventory_transactions (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS = 1;
