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
const { pool } = require('./config/db');
const { clearOrders, clearBookings, isValidClearPin } = require('./utils/clearData');

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
  if (!isValidClearPin(pin)) {
    console.error('Invalid clear-data PIN. Nothing was deleted.');
    process.exitCode = 1;
    return;
  }

  if (orders) {
    const result = await clearOrders();
    console.log(
      `Deleted ${result.orders} order(s), ${result.income} restaurant income record(s) and ${result.receipts} order receipt snapshot(s).`
    );
    console.log('Restaurant order data cleared.');
  } else {
    const result = await clearBookings();
    console.log(
      `Deleted ${result.bookings} booking(s), ${result.income} room income record(s), ${result.history} room status history row(s) and ${result.receipts} booking receipt snapshot(s).`
    );
    console.log('Booking data cleared and occupied rooms released.');
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
