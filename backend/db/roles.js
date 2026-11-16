const BUILTIN_ROLES = [
  { code: 'admin', label: 'Admin', sortOrder: 10 },
  { code: 'owner', label: 'Owner', sortOrder: 20 },
  { code: 'hotel', label: 'Hotel Staff', sortOrder: 30 },
  { code: 'restaurant', label: 'Restaurant Staff', sortOrder: 40 },
  { code: 'staff', label: 'Staff', sortOrder: 50 },
];

const ROLE_CODE_PATTERN = /^[a-z][a-z0-9_]{1,39}$/;

function slugifyRole(label) {
  const code = String(label || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_{2,}/g, '_');
  const safe = /^[a-z]/.test(code) ? code : `role_${code}`;
  return safe.slice(0, 40).replace(/_+$/g, '');
}

async function ensureRolesSchema(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS roles (
      code        VARCHAR(40) NOT NULL,
      label       VARCHAR(80) NOT NULL,
      sort_order  INT NOT NULL DEFAULT 0,
      is_system   TINYINT(1) NOT NULL DEFAULT 0,
      created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  for (const role of BUILTIN_ROLES) {
    await db.query(
      `INSERT INTO roles (code, label, sort_order, is_system)
       VALUES (?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE label = VALUES(label), is_system = 1`,
      [role.code, role.label, role.sortOrder]
    );
  }

  await db.query('ALTER TABLE users MODIFY role VARCHAR(40) NOT NULL');
  await db.query('ALTER TABLE role_permissions MODIFY role VARCHAR(40) NOT NULL');
}

async function listRoles(db) {
  const [rows] = await db.query(
    'SELECT code, label, sort_order AS sortOrder, is_system AS isSystem FROM roles ORDER BY sort_order, code'
  );
  return rows.map((row) => ({ ...row, isSystem: !!row.isSystem }));
}

async function roleExists(db, code) {
  const [rows] = await db.query('SELECT code FROM roles WHERE code = ? LIMIT 1', [code]);
  return rows.length > 0;
}

module.exports = {
  BUILTIN_ROLES,
  ROLE_CODE_PATTERN,
  slugifyRole,
  ensureRolesSchema,
  listRoles,
  roleExists,
};
