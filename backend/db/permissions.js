/**
 * Permission catalog and default role matrix.
 * Shared by db/seed.js (fresh installs) and db/migrate.js (existing installs).
 * Admin bypasses all permission checks; its rows are stored for display only.
 */
const { ensureRolesSchema } = require('./roles');

const ROLES = ['admin', 'owner', 'restaurant', 'hotel', 'staff'];
const MANAGEABLE_ROLES = ['owner', 'restaurant', 'hotel', 'staff'];

const PERMISSIONS = [
  { code: 'dashboard.view', label: 'View dashboard', module: 'Dashboard', sort_order: 10 },

  { code: 'users.view', label: 'View users', module: 'Users', sort_order: 20 },
  { code: 'users.manage', label: 'Create / edit / disable / delete users', module: 'Users', sort_order: 21 },
  { code: 'users.password', label: "Change any user's password", module: 'Users', sort_order: 22 },

  { code: 'rooms.view', label: 'View rooms', module: 'Rooms', sort_order: 30 },
  { code: 'rooms.create', label: 'Create rooms', module: 'Rooms', sort_order: 31 },
  { code: 'rooms.update', label: 'Edit rooms', module: 'Rooms', sort_order: 32 },
  { code: 'rooms.delete', label: 'Delete rooms', module: 'Rooms', sort_order: 33 },
  { code: 'rooms.status', label: 'Change room status', module: 'Rooms', sort_order: 34 },
  { code: 'rooms.history', label: 'View room status history', module: 'Rooms', sort_order: 35 },

  { code: 'bookings.view', label: 'View bookings', module: 'Bookings', sort_order: 40 },
  { code: 'bookings.create', label: 'Create bookings', module: 'Bookings', sort_order: 41 },
  { code: 'bookings.checkin', label: 'Check guests in', module: 'Bookings', sort_order: 42 },
  { code: 'bookings.checkout', label: 'Check guests out', module: 'Bookings', sort_order: 43 },
  { code: 'bookings.cancel', label: 'Cancel bookings', module: 'Bookings', sort_order: 44 },

  { code: 'menu.view', label: 'View menu', module: 'Restaurant', sort_order: 50 },
  { code: 'menu.create', label: 'Create dishes', module: 'Restaurant', sort_order: 51 },
  { code: 'menu.update', label: 'Edit dishes', module: 'Restaurant', sort_order: 52 },
  { code: 'menu.delete', label: 'Delete dishes', module: 'Restaurant', sort_order: 53 },
  { code: 'categories.view', label: 'View food categories', module: 'Restaurant', sort_order: 54 },
  { code: 'categories.create', label: 'Create food categories', module: 'Restaurant', sort_order: 55 },
  { code: 'categories.update', label: 'Edit food categories', module: 'Restaurant', sort_order: 56 },
  { code: 'categories.delete', label: 'Delete food categories', module: 'Restaurant', sort_order: 57 },
  { code: 'orders.view', label: 'View sales records', module: 'Restaurant', sort_order: 58 },
  { code: 'orders.create', label: 'Record sales', module: 'Restaurant', sort_order: 59 },
  { code: 'orders.cancel', label: 'Cancel sales', module: 'Restaurant', sort_order: 60 },

  { code: 'income.view', label: 'View income', module: 'Finance', sort_order: 60 },
  { code: 'income.create', label: 'Record income', module: 'Finance', sort_order: 61 },
  { code: 'expenses.view', label: 'View expenses', module: 'Finance', sort_order: 62 },
  { code: 'expenses.create', label: 'Record expenses', module: 'Finance', sort_order: 63 },
  { code: 'expenses.update', label: 'Edit expenses', module: 'Finance', sort_order: 64 },
  { code: 'expenses.delete', label: 'Delete expenses', module: 'Finance', sort_order: 65 },
  {
    code: 'outstanding.view',
    label: 'View outstanding payments',
    module: 'Finance',
    sort_order: 66,
  },
  { code: 'staff.view', label: 'View staff records', module: 'Staff', sort_order: 70 },
  { code: 'staff.manage', label: 'Manage staff records', module: 'Staff', sort_order: 71 },

  { code: 'complaints.view', label: 'View complaints', module: 'Complaints', sort_order: 75 },
  { code: 'complaints.create', label: 'Submit complaints', module: 'Complaints', sort_order: 76 },
  { code: 'complaints.manage', label: 'Resolve complaints', module: 'Complaints', sort_order: 77 },

  { code: 'reports.view', label: 'View reports', module: 'Reports', sort_order: 80 },
  { code: 'reports.export', label: 'Export reports (xlsx)', module: 'Reports', sort_order: 81 },

  { code: 'settings.manage', label: 'Manage settings', module: 'Settings', sort_order: 90 },

  { code: 'maintenance.view', label: 'View maintenance requests', module: 'Maintenance', sort_order: 105 },
  { code: 'maintenance.manage', label: 'Manage maintenance requests', module: 'Maintenance', sort_order: 106 },

  { code: 'inventory.view', label: 'View inventory & stock', module: 'Inventory', sort_order: 110 },
  { code: 'inventory.manage', label: 'Manage inventory, stock & wastage', module: 'Inventory', sort_order: 111 },
];

const ALL_CODES = PERMISSIONS.map((p) => p.code);

const VIEW_CODES = ALL_CODES.filter(
  (code) => code.endsWith('.view') || code === 'reports.export'
);

const DEFAULT_ROLE_PERMISSIONS = {
  admin: ALL_CODES,
  owner: [
    ...VIEW_CODES,
    'complaints.manage',
    'rooms.history',
    'maintenance.manage',
    'inventory.manage',
    'categories.create',
    'categories.update',
    'categories.delete',
  ],
  restaurant: [
    'dashboard.view',
    'rooms.view', // room list for room-service sales in POS
    'menu.view',
    'menu.create',
    'menu.update',
    'menu.delete',
    'categories.view',
    'categories.create',
    'categories.update',
    'categories.delete',
    'orders.view',
    'orders.create',
    'orders.cancel',
    'outstanding.view',
    'inventory.view',
    'inventory.manage',
  ],
  hotel: [
    'dashboard.view',
    'rooms.view',
    'rooms.create',
    'rooms.update',
    'rooms.status',
    'rooms.history',
    'bookings.view',
    'bookings.create',
    'bookings.checkin',
    'bookings.checkout',
    'bookings.cancel',
    'expenses.view',
    'expenses.create',
    'outstanding.view',
    'complaints.view',
    'complaints.create',
    'maintenance.view',
    'maintenance.manage',
  ],
  staff: [
    'dashboard.view',
    'menu.view',
    'menu.create',
    'categories.view',
    'orders.view',
    'orders.create',
    'outstanding.view',
    'maintenance.view',
  ],
};

/** Creates the permission tables (idempotent) and seeds catalog + defaults. */
async function seedPermissions(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS permissions (
      code        VARCHAR(60) NOT NULL,
      label       VARCHAR(120) NOT NULL,
      module      VARCHAR(40) NOT NULL,
      sort_order  INT NOT NULL DEFAULT 0,
      PRIMARY KEY (code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS role_permissions (
      role             VARCHAR(40) NOT NULL,
      permission_code  VARCHAR(60) NOT NULL,
      allowed          TINYINT(1) NOT NULL DEFAULT 0,
      PRIMARY KEY (role, permission_code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await ensureRolesSchema(db);

  for (const p of PERMISSIONS) {
    await db.query(
      `INSERT INTO permissions (code, label, module, sort_order)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE label = VALUES(label), module = VALUES(module), sort_order = VALUES(sort_order)`,
      [p.code, p.label, p.module, p.sort_order]
    );
  }

  for (const role of ROLES) {
    const [[{ existing }]] = await db.query(
      'SELECT COUNT(*) AS existing FROM role_permissions WHERE role = ?',
      [role]
    );
    if (existing > 0) continue;

    for (const code of DEFAULT_ROLE_PERMISSIONS[role] || []) {
      await db.query(
        'INSERT IGNORE INTO role_permissions (role, permission_code, allowed) VALUES (?, ?, 1)',
        [role, code]
      );
    }
  }
}

module.exports = {
  ROLES,
  MANAGEABLE_ROLES,
  PERMISSIONS,
  ALL_CODES,
  DEFAULT_ROLE_PERMISSIONS,
  seedPermissions,
};
