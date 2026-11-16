const { pool } = require('../../config/db');
const { sendData } = require('../../utils/response');
const { isAllowed } = require('../../utils/permissionCache');
const { paymentSummariesFor, roundMoney } = require('../../utils/payments');

async function listOutstanding(req, res, next) {
  try {
    const [canOrders, canBookings] = await Promise.all([
      isAllowed(req.user.role, 'orders.view'),
      isAllowed(req.user.role, 'bookings.view'),
    ]);

    const items = [];

    if (canBookings) {
      const [bookings] = await pool.query(
        `SELECT b.id, b.guest_name, b.guest_phone, b.guest_id_number,
                b.check_in_date, b.check_out_date, b.status,
                b.total_amount, b.amount_paid,
                r.room_number, r.room_type
         FROM bookings b
         JOIN rooms r ON r.id = b.room_id
         WHERE b.deleted_at IS NULL
           AND b.status IN ('reserved','checked_in')
           AND b.total_amount > b.amount_paid
         ORDER BY b.check_in_date ASC, b.id ASC`
      );

      const bookingPaymentMap = await paymentSummariesFor(pool, 'room', bookings.map((b) => b.id));

      for (const b of bookings) {
        const payment = bookingPaymentMap.get(b.id) || {
          method: null,
          splits: [],
          total: Number(b.amount_paid),
        };
        items.push({
          type: 'booking',
          id: b.id,
          reference: b.guest_id_number || `Booking #${b.id}`,
          customer: b.guest_name,
          contact: b.guest_phone || null,
          description: `Room ${b.room_number} (${b.room_type})`,
          date: b.check_in_date,
          dueDate: b.check_out_date,
          total: Number(b.total_amount),
          amountPaid: Number(b.amount_paid),
          balance: roundMoney(Number(b.total_amount) - Number(b.amount_paid)),
          status: 'pending',
          sourceStatus: b.status,
          paymentMethod: payment.method,
          paymentSplits: payment.splits,
        });
      }
    }

    if (canOrders) {
      const [orders] = await pool.query(
        `SELECT o.*, r.room_number
         FROM restaurant_orders o
         LEFT JOIN rooms r ON r.id = o.room_id
         WHERE o.deleted_at IS NULL
           AND o.status IN ('pending','open')
         ORDER BY o.created_at ASC, o.id ASC`
      );
      const paymentMap = await paymentSummariesFor(pool, 'restaurant', orders.map((o) => o.id));

      for (const o of orders) {
        const payment = paymentMap.get(o.id) || { method: null, splits: [], total: 0 };
        const amountPaid = roundMoney(payment.total);
        const balance = roundMoney(Number(o.total) - amountPaid);
        if (balance <= 0) continue;

        items.push({
          type: 'order',
          id: o.id,
          reference: o.receipt_no || `Order #${o.id}`,
          customer: o.room_number
            ? `Room ${o.room_number}`
            : o.table_number
              ? `Table ${o.table_number}`
              : 'Walk-in',
          contact: null,
          description: o.order_type.replace('_', ' '),
          date: o.created_at,
          dueDate: null,
          total: Number(o.total),
          amountPaid,
          balance,
          status: 'pending',
          sourceStatus: o.status,
          paymentMethod: payment.method,
          paymentSplits: payment.splits,
        });
      }
    }

    items.sort((a, b) => new Date(a.date) - new Date(b.date));

    const summary = {
      count: items.length,
      totalOutstanding: roundMoney(items.reduce((sum, item) => sum + item.balance, 0)),
      bookingOutstanding: roundMoney(
        items.filter((item) => item.type === 'booking').reduce((sum, item) => sum + item.balance, 0)
      ),
      orderOutstanding: roundMoney(
        items.filter((item) => item.type === 'order').reduce((sum, item) => sum + item.balance, 0)
      ),
    };

    return sendData(res, items, summary);
  } catch (err) {
    next(err);
  }
}

module.exports = { listOutstanding };
