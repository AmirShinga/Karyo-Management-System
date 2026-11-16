const { pool, withTransaction } = require('../../config/db');
const { sendData, notFound, conflict, badRequest, paginate, pageMeta } = require('../../utils/response');
const { nextReceiptNo } = require('../../utils/receipts');
const {
  summarizePayments,
  recordPaymentSplits,
  paymentSummariesFor,
  paymentSummaryFor,
  roundMoney,
} = require('../../utils/payments');

function mapOrder(o, items = [], payment = {}) {
  const total = Number(o.total);
  const amountPaid = roundMoney(payment.total || 0);
  const balance = Math.max(roundMoney(total - amountPaid), 0);
  return {
    id: o.id,
    orderType: o.order_type,
    roomId: o.room_id,
    roomNumber: o.room_number || null,
    tableNumber: o.table_number,
    subtotal: Number(o.subtotal),
    taxAmount: Number(o.tax_amount),
    chargeAmount: Number(o.charge_amount),
    discountAmount: Number(o.discount_amount || 0),
    total,
    amountPaid,
    balance,
    paymentStatus: balance > 0 ? 'pending' : 'paid',
    paymentMethod: payment.method || null,
    paymentSplits: payment.splits || [],
    status: o.status,
    receiptNo: o.receipt_no,
    createdBy: o.created_by,
    cashierName: o.cashier_name || null,
    paidAt: o.paid_at,
    createdAt: o.created_at,
    items,
  };
}

function mapItemRow(i) {
  return {
    id: i.id,
    menuItemId: i.menu_item_id,
    name: i.item_name,
    quantity: i.quantity,
    priceAtTime: Number(i.price_at_time),
    lineTotal: Number(i.line_total),
  };
}

const SELECT_ORDER = `
  SELECT o.*, r.room_number, u.name AS cashier_name
  FROM restaurant_orders o
  LEFT JOIN rooms r ON r.id = o.room_id
  LEFT JOIN users u ON u.id = o.created_by
`;

async function loadItems(orderIds) {
  if (!orderIds.length) return new Map();
  const [rows] = await pool.query(
    `SELECT * FROM restaurant_order_items WHERE order_id IN (${orderIds.map(() => '?').join(',')}) ORDER BY id ASC`,
    orderIds
  );
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.order_id)) map.set(row.order_id, []);
    map.get(row.order_id).push(mapItemRow(row));
  }
  return map;
}

async function listOrders(req, res, next) {
  try {
    const { status, type, from, to } = req.query;
    const search = (req.query.search || '').trim();
    const { page, limit, offset } = paginate(req.query);
    const where = ['o.deleted_at IS NULL'];
    const params = [];
    if (status) {
      where.push('o.status = ?');
      params.push(status);
    }
    if (type) {
      where.push('o.order_type = ?');
      params.push(type);
    }
    if (from) {
      where.push('o.created_at >= ?');
      params.push(`${from} 00:00:00`);
    }
    if (to) {
      where.push('o.created_at <= ?');
      params.push(`${to} 23:59:59`);
    }
    if (search) {
      where.push('(o.receipt_no LIKE ? OR o.table_number LIKE ? OR r.room_number LIKE ?)');
      const like = `%${search}%`;
      params.push(like, like, like);
    }

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM restaurant_orders o
       LEFT JOIN rooms r ON r.id = o.room_id
       WHERE ${where.join(' AND ')}`,
      params
    );
    const [rows] = await pool.query(
      `${SELECT_ORDER} WHERE ${where.join(' AND ')} ORDER BY o.created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const itemsByOrder = await loadItems(rows.map((r) => r.id));
    const paymentMap = await paymentSummariesFor(pool, 'restaurant', rows.map((r) => r.id));
    const data = rows.map((o) =>
      mapOrder(o, itemsByOrder.get(o.id) || [], paymentMap.get(o.id))
    );
    return sendData(res, data, pageMeta(page, limit, total));
  } catch (err) {
    next(err);
  }
}

async function getOrder(req, res, next) {
  try {
    const [rows] = await pool.query(`${SELECT_ORDER} WHERE o.id = ? AND o.deleted_at IS NULL`, [
      req.params.id,
    ]);
    if (!rows.length) return next(notFound('Order not found'));
    const itemsByOrder = await loadItems([rows[0].id]);
    const payment = await paymentSummaryFor(pool, 'restaurant', rows[0].id);
    return sendData(
      res,
      mapOrder(rows[0], itemsByOrder.get(rows[0].id) || [], payment)
    );
  } catch (err) {
    next(err);
  }
}

/**
 * Create an order. Prices are read from the DB and line totals recomputed
 * server-side; the client never supplies prices or totals. Receipt number and
 * income entry are written in the same transaction.
 */
async function createOrder(req, res, next) {
  try {
    const b = req.body;
    const taxRate = b.taxRate === undefined ? 0 : b.taxRate;

    const created = await withTransaction(async (conn) => {
      // Load and lock the requested menu items.
      const ids = b.items.map((i) => i.menuItemId);
      const [menuRows] = await conn.query(
        `SELECT * FROM menu_items WHERE id IN (${ids.map(() => '?').join(',')}) AND deleted_at IS NULL FOR UPDATE`,
        ids
      );
      const menuById = new Map(menuRows.map((m) => [m.id, m]));

      for (const line of b.items) {
        const menuItem = menuById.get(line.menuItemId);
        if (!menuItem) throw badRequest(`Menu item ${line.menuItemId} not found`);
        if (!menuItem.available) throw conflict(`"${menuItem.name}" is not available`);
      }

      let subtotal = 0;
      const lines = b.items.map((line) => {
        const menuItem = menuById.get(line.menuItemId);
        const lineTotal = Number(menuItem.price) * line.quantity;
        subtotal += lineTotal;
        return {
          menuItemId: line.menuItemId,
          name: menuItem.name,
          quantity: line.quantity,
          priceAtTime: Number(menuItem.price),
          lineTotal,
        };
      });
      subtotal = roundMoney(subtotal);
      const taxAmount = roundMoney(subtotal * (taxRate / 100));
      const chargeApplies = b.orderType === 'takeaway' || b.orderType === 'room_service';
      const chargeAmount = chargeApplies ? roundMoney(Number(b.chargeAmount) || 0) : 0;
      const discountAmount = roundMoney(b.discountAmount || 0);
      const grossTotal = roundMoney(subtotal + taxAmount + chargeAmount);
      if (discountAmount > grossTotal) {
        throw badRequest('Discount cannot exceed the order total');
      }
      const total = roundMoney(grossTotal - discountAmount);
      const fallbackPaid = b.amountPaid === undefined ? 0 : b.amountPaid;
      const payment = summarizePayments(b.payments, fallbackPaid);
      const amountPaid = payment.total;
      if (amountPaid > total) {
        throw badRequest('Amount paid cannot exceed the order total');
      }
      const paymentStatus = amountPaid >= total ? 'paid' : 'pending';

      // Room existence check for room service
      if (b.orderType === 'room_service') {
        const [roomRows] = await conn.query('SELECT id FROM rooms WHERE id = ? AND deleted_at IS NULL', [b.roomId]);
        if (!roomRows.length) throw notFound('Room not found');
      }

      const receiptNo = await nextReceiptNo(conn);

      const [result] = await conn.query(
        `INSERT INTO restaurant_orders
          (order_type, room_id, table_number, subtotal, tax_amount, charge_amount, discount_amount, total, status, receipt_no, created_by, paid_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, IF(? = 'paid', NOW(), NULL))`,
        [
          b.orderType,
          b.orderType === 'room_service' ? b.roomId : null,
          b.tableNumber || null,
          subtotal,
          taxAmount,
          chargeAmount,
          discountAmount,
          total,
          paymentStatus,
          receiptNo,
          req.user.id,
          paymentStatus,
        ]
      );

      for (const line of lines) {
        await conn.query(
          `INSERT INTO restaurant_order_items
            (order_id, menu_item_id, item_name, quantity, price_at_time, line_total)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [result.insertId, line.menuItemId, line.name, line.quantity, line.priceAtTime, line.lineTotal]
        );
      }

      if (amountPaid > 0) {
        const [incomeResult] = await conn.query(
          `INSERT INTO income
            (source, reference_id, description, amount, payment_method, income_date, recorded_by)
           VALUES ('restaurant', ?, ?, ?, ?, CURDATE(), ?)`,
          [result.insertId, `Restaurant order ${receiptNo}`, amountPaid, payment.method, req.user.id]
        );
        await recordPaymentSplits(conn, incomeResult.insertId, payment.splits);
      }

      const [orderRows] = await conn.query(`${SELECT_ORDER} WHERE o.id = ?`, [result.insertId]);
      const itemsByOrder = new Map();
      const [itemRows] = await conn.query('SELECT * FROM restaurant_order_items WHERE order_id = ?', [
        result.insertId,
      ]);
      itemsByOrder.set(result.insertId, itemRows.map(mapItemRow));
      return mapOrder(orderRows[0], itemsByOrder.get(result.insertId), payment);
    });

    const io = req.app.get('io');
    if (io) io.emit('order:created', { id: created.id, receiptNo: created.receiptNo, total: created.total });
    return sendData(res, created, undefined, 201);
  } catch (err) {
    next(err);
  }
}

/** Collect the outstanding balance on a pending order and mark it paid. */
async function completePayment(req, res, next) {
  try {
    const { id } = req.params;
    const updated = await withTransaction(async (conn) => {
      const [rows] = await conn.query(
        'SELECT * FROM restaurant_orders WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
        [id]
      );
      if (!rows.length) throw notFound('Order not found');
      if (rows[0].status === 'cancelled') throw conflict('Order was cancelled');

      const current = await paymentSummaryFor(conn, 'restaurant', id);
      const balance = roundMoney(Number(rows[0].total) - current.total);

      if (balance > 0) {
        const payment = summarizePayments(req.body?.payments, 0);
        if (payment.total <= 0) throw badRequest('Enter a payment amount');
        if (payment.total > balance + 0.009) {
          throw badRequest('Payment cannot exceed the outstanding balance');
        }

        const [incomeResult] = await conn.query(
          `INSERT INTO income
            (source, reference_id, description, amount, payment_method, income_date, recorded_by)
           VALUES ('restaurant', ?, ?, ?, ?, CURDATE(), ?)`,
          [
            id,
            `Payment for restaurant order ${rows[0].receipt_no}`,
            payment.total,
            payment.method,
            req.user.id,
          ]
        );
        await recordPaymentSplits(conn, incomeResult.insertId, payment.splits);

        const status = payment.total >= balance - 0.009 ? 'paid' : 'pending';
        await conn.query(
          `UPDATE restaurant_orders
           SET status = ?, paid_at = IF(? = 'paid', NOW(), paid_at)
           WHERE id = ?`,
          [status, status, id]
        );
      } else if (rows[0].status !== 'paid') {
        await conn.query(
          "UPDATE restaurant_orders SET status = 'paid', paid_at = COALESCE(paid_at, NOW()) WHERE id = ?",
          [id]
        );
      }

      const [fresh] = await conn.query(`${SELECT_ORDER} WHERE o.id = ?`, [id]);
      const [itemRows] = await conn.query(
        'SELECT * FROM restaurant_order_items WHERE order_id = ? ORDER BY id ASC',
        [id]
      );
      const combined = await paymentSummaryFor(conn, 'restaurant', id);
      return mapOrder(fresh[0], itemRows.map(mapItemRow), combined);
    });

    const io = req.app.get('io');
    if (io) io.emit('order:updated', { id: updated.id, status: updated.status });
    return sendData(res, updated);
  } catch (err) {
    next(err);
  }
}

/** Cancel an order (manager correction). Does not delete the income entry; adds a reversal note. */
async function cancelOrder(req, res, next) {
  try {
    const { id } = req.params;
    const updated = await withTransaction(async (conn) => {
      const [rows] = await conn.query('SELECT * FROM restaurant_orders WHERE id = ? AND deleted_at IS NULL FOR UPDATE', [id]);
      if (!rows.length) throw notFound('Order not found');
      if (rows[0].status === 'cancelled') throw conflict('Order already cancelled');

      const current = await paymentSummaryFor(conn, 'restaurant', id);
      const paidTotal = roundMoney(current.total);
      await conn.query("UPDATE restaurant_orders SET status = 'cancelled' WHERE id = ?", [id]);
      if (paidTotal > 0) {
        await conn.query(
          `INSERT INTO income (source, reference_id, description, amount, income_date, recorded_by)
           VALUES ('restaurant', ?, ?, ?, CURDATE(), ?)`,
          [id, `Reversal of cancelled order ${rows[0].receipt_no}`, -paidTotal, req.user.id]
        );
      }
      const [fresh] = await conn.query(`${SELECT_ORDER} WHERE o.id = ?`, [id]);
      const [itemRows] = await conn.query(
        'SELECT * FROM restaurant_order_items WHERE order_id = ? ORDER BY id ASC',
        [id]
      );
      return mapOrder(fresh[0], itemRows.map(mapItemRow), current);
    });
    const io = req.app.get('io');
    if (io) io.emit('order:updated', { id: Number(id), status: 'cancelled' });
    return sendData(res, updated);
  } catch (err) {
    next(err);
  }
}

module.exports = { listOrders, getOrder, createOrder, completePayment, cancelOrder };
