/**
 * Clear test transaction data.
 *
 * Usage:
 *   node clear-data.js --orders --pin 5858
 *   node clear-data.js --bookings --pin 5858
 *   npm run db:clear-orders
 *   npm run db:clear-bookings
 *
 * Set CLEAR_DATA_PIN in .env to override the default PIN.
 */
require('dotenv').config();
const readline = require('readline');
const { pool, withTransaction } = require('./config/db');

const CLEAR_PIN = process.env.CLEAR_DATA_PIN || '5858';
const args = process.argv.slice(2);

function hasFlag(name) {
  return args.includes(`--${name}`);
}

function argValue(name) {
  const inline = args.find((arg) => arg.startsWith(`--${name}=`));
  if (inline) return inline.split('=').slice(1).join('=');
  const index = args.indexOf(`--${name}`);
  if (index !== -1 && args[index + 1] && !args[index + 1].startsWith('--')) {
    return args[index + 1];
  }
  return '';
}

function ask(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function printUsage() {
  console.log('Clear test data');
  console.log('');
  console.log('  node clear-data.js --orders --pin 5858');
  console.log('  node clear-data.js --bookings --pin 5858');
  console.log('');
  console.log('  --orders    Delete all restaurant orders and restaurant income');
  console.log('  --bookings  Delete all bookings, room income and room status history');
  console.log('  --pin       Clear-data PIN (prompted if omitted)');
}

async function count(sql, params = []) {
  const [[row]] = await pool.query(sql, params);
  return Number(row.n);
}

async function clearOrders() {
  const orders = await count('SELECT COUNT(*) AS n FROM restaurant_orders');
  const income = await count("SELECT COUNT(*) AS n FROM income WHERE source = 'restaurant'");
  const receipts = await count(
    "SELECT COUNT(*) AS n FROM receipt_snapshots WHERE kind = 'order'"
  );

  console.log(
    `Deleting ${orders} order(s), ${income} restaurant income record(s) and ${receipts} order receipt snapshot(s)...`
  );

  await withTransaction(async (conn) => {
    await conn.query('DELETE FROM restaurant_orders');
    await conn.query("DELETE FROM income WHERE source = 'restaurant'");
    await conn.query("DELETE FROM receipt_snapshots WHERE kind = 'order'");
  });

  console.log('Restaurant order data cleared.');
}

async function clearBookings() {
  const bookings = await count('SELECT COUNT(*) AS n FROM bookings');
  const income = await count("SELECT COUNT(*) AS n FROM income WHERE source = 'room'");
  const receipts = await count(
    "SELECT COUNT(*) AS n FROM receipt_snapshots WHERE kind = 'booking'"
  );
  const history = await count('SELECT COUNT(*) AS n FROM room_status_history');

  console.log(
    `Deleting ${bookings} booking(s), ${income} room income record(s), ${history} room status history row(s) and ${receipts} booking receipt snapshot(s)...`
  );

  await withTransaction(async (conn) => {
    await conn.query('DELETE FROM bookings');
    await conn.query("DELETE FROM income WHERE source = 'room'");
    await conn.query('DELETE FROM room_status_history');
    await conn.query("DELETE FROM receipt_snapshots WHERE kind = 'booking'");
    await conn.query("UPDATE rooms SET status = 'available' WHERE status = 'occupied'");
  });

  console.log('Booking data cleared and occupied rooms released.');
}

async function main() {
  if (hasFlag('help') || args.length === 0) {
    printUsage();
    return;
  }

  const orders = hasFlag('orders');
  const bookings = hasFlag('bookings');
  if (orders === bookings) {
    console.error('Choose exactly one: --orders or --bookings.');
    printUsage();
    process.exitCode = 1;
    return;
  }

  const pin = argValue('pin') || (await ask('Enter clear-data PIN: '));
  if (pin !== CLEAR_PIN) {
    console.error('Invalid clear-data PIN. Nothing was deleted.');
    process.exitCode = 1;
    return;
  }

  if (orders) {
    await clearOrders();
  } else {
    await clearBookings();
  }
}

main()
  .catch((err) => {
    console.error('Clear data failed:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
