/**
 * Seeds default settings, the permission catalog, and the first accounts.
 * Usage: npm run db:seed
 * Reads SEED_ADMIN_* / SEED_OWNER_* from env, with sensible fallbacks.
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');
const { seedPermissions } = require('./permissions');
const { ensureComplaintsTable } = require('./ensureComplaintsTable');

async function userExists(email) {
  const [rows] = await pool.query('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);
  return rows.length > 0;
}

async function hasRole(role) {
  const [rows] = await pool.query('SELECT id FROM users WHERE role = ? AND deleted_at IS NULL LIMIT 1', [role]);
  return rows.length > 0;
}

async function createUser({ name, email, password, role }) {
  const hash = await bcrypt.hash(password, 10);
  await pool.query('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)', [
    name,
    email.toLowerCase(),
    hash,
    role,
  ]);
  console.log(`${role} account created: ${email} / ${password}`);
}

/**
 * Ensures an account exists for the role. If the preferred email is taken by a
 * different account, a numbered fallback (e.g. owner2@example.com) is used.
 */
async function ensureRoleAccount(role, { name, email, password, fallbackPrefix }) {
  if (await hasRole(role)) {
    console.log(`${role} account already exists.`);
    return;
  }

  let candidate = email.toLowerCase();
  if (await userExists(candidate)) {
    const [local, domain] = candidate.split('@');
    let n = 2;
    while (await userExists(candidate)) {
      candidate = `${fallbackPrefix || local}${n}@${domain}`;
      n += 1;
    }
  }

  await createUser({ name, email: candidate, password, role });
  if (role === 'owner') console.log('IMPORTANT: change this password after first login.');
}

async function main() {
  const settings = {
    business_name: process.env.BUSINESS_NAME || 'Karyo Guest Palace',
    currency: process.env.CURRENCY || 'NGN',
    currency_symbol: process.env.CURRENCY_SYMBOL || '\u20A6',
    tax_rate: '0',
    receipt_prefix: 'REC',
    receipt_footer: 'Thank you for your patronage.',
  };

  for (const [key, value] of Object.entries(settings)) {
    await pool.query(
      'INSERT INTO settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)',
      [key, value]
    );
  }
  console.log('Settings seeded.');

  await ensureComplaintsTable(pool);
  await seedPermissions(pool);
  console.log('Permissions seeded.');

  await ensureRoleAccount('admin', {
    name: 'Admin',
    email: process.env.SEED_ADMIN_EMAIL || 'admin@example.com',
    password: process.env.SEED_ADMIN_PASSWORD || 'Admin@1234',
    fallbackPrefix: 'admin',
  });

  await ensureRoleAccount('owner', {
    name: 'Owner',
    email: process.env.SEED_OWNER_EMAIL || 'owner@example.com',
    password: process.env.SEED_OWNER_PASSWORD || 'Owner@1234',
    fallbackPrefix: 'owner',
  });

  await ensureRoleAccount('staff', {
    name: 'Restaurant Staff',
    email: process.env.SEED_STAFF_EMAIL || 'staff@example.com',
    password: process.env.SEED_STAFF_PASSWORD || 'Staff@1234',
    fallbackPrefix: 'staff',
  });

  await pool.end();
}

main().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
