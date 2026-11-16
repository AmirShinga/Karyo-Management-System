const PDFDocument = require('pdfkit');
const { pool } = require('../config/db');
const { notFound } = require('./response');
const { paymentSummaryFor, roundMoney } = require('./payments');
const { saveReceiptSnapshot } = require('./receiptSnapshots');

const CURRENCY = 'NGN';
const BRAND = 'Hotel Management System';
const PAYMENT_LABEL = {
  cash: 'Cash',
  pos: 'POS',
  bank_transfer: 'Bank transfer',
  mixed: 'Mixed',
  other: 'Not recorded',
};

const DEFAULT_SETTINGS = {
  business_name: BRAND,
  currency: CURRENCY,
  currency_symbol: '\u20A6',
  receipt_footer: 'Thank you for your business.',
};

function fmtMoney(n) {
  return `${CURRENCY} ${Number(n || 0).toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return String(d);
  return dt.toISOString().slice(0, 10);
}

function paymentText(payment) {
  if (payment?.splits?.length) {
    return payment.splits
      .map((split) => `${PAYMENT_LABEL[split.method] || split.method} ${fmtMoney(split.amount)}`)
      .join(' + ');
  }
  return PAYMENT_LABEL[payment?.method] || '—';
}

/** Load the key/value settings row as a flat object with sensible defaults. */
async function loadSettings() {
  const map = { ...DEFAULT_SETTINGS };
  try {
    const [rows] = await pool.query('SELECT `key`, `value` FROM settings');
    for (const row of rows) {
      if (row.value !== null && row.value !== undefined) map[row.key] = row.value;
    }
  } catch {
    /* settings table may not exist on a very old DB — fall back to defaults */
  }
  return map;
}

function businessInfo(settings) {
  return {
    name: settings.business_name || DEFAULT_SETTINGS.business_name,
    currency: settings.currency || DEFAULT_SETTINGS.currency,
    currencySymbol: settings.currency_symbol || DEFAULT_SETTINGS.currency_symbol,
    footer: settings.receipt_footer || DEFAULT_SETTINGS.receipt_footer,
  };
}

/** Structured receipt data for a booking (used by PDF and thermal print). */
async function getBookingReceiptData(id) {
  const [rows] = await pool.query(
    `SELECT b.*, r.room_number, r.room_type
     FROM bookings b JOIN rooms r ON r.id = b.room_id
     WHERE b.id = ? AND b.deleted_at IS NULL`,
    [id]
  );
  if (!rows.length) throw notFound('Booking not found');
  const b = rows[0];
  const settings = await loadSettings();
  const payment = await paymentSummaryFor(pool, 'room', b.id);
  const amountPaid = roundMoney(b.amount_paid);
  const balance = roundMoney(Number(b.total_amount) - amountPaid);

  return {
    kind: 'booking',
    business: businessInfo(settings),
    receipt: {
      id: b.id,
      guestName: b.guest_name,
      guestPhone: b.guest_phone || null,
      guestEmail: b.guest_email || null,
      guestAddress: b.guest_address || null,
      guestIdNumber: b.guest_id_number || null,
      roomNumber: b.room_number,
      roomType: b.room_type,
      checkInDate: fmtDate(b.check_in_date),
      checkOutDate: fmtDate(b.check_out_date),
      nights: b.nights,
      ratePerNight: Number(b.rate_per_night),
      discountAmount: Number(b.discount_amount || 0),
      totalAmount: Number(b.total_amount),
      amountPaid,
      balance,
      paymentStatus: balance <= 0.009 ? 'complete' : 'incomplete',
      paymentMethod: payment.method,
      paymentSplits: payment.splits,
      status: b.status,
      createdAt: b.created_at,
    },
  };
}

/** Structured receipt data for a restaurant order (used by PDF and thermal print). */
async function getOrderReceiptData(id) {
  const [orders] = await pool.query(
    `SELECT o.*, r.room_number, u.name AS cashier_name
     FROM restaurant_orders o
     LEFT JOIN rooms r ON r.id = o.room_id
     LEFT JOIN users u ON u.id = o.created_by
     WHERE o.id = ? AND o.deleted_at IS NULL`,
    [id]
  );
  if (!orders.length) throw notFound('Order not found');
  const o = orders[0];

  const [items] = await pool.query(
    'SELECT item_name, quantity, price_at_time, line_total FROM restaurant_order_items WHERE order_id = ? ORDER BY id ASC',
    [o.id]
  );
  const settings = await loadSettings();
  const payment = await paymentSummaryFor(pool, 'restaurant', o.id);
  const amountPaid = roundMoney(payment.total);
  const balance = roundMoney(Number(o.total) - amountPaid);

  return {
    kind: 'order',
    business: businessInfo(settings),
    receipt: {
      id: o.id,
      receiptNo: o.receipt_no,
      orderType: o.order_type,
      tableNumber: o.table_number || null,
      roomNumber: o.room_number || null,
      status: o.status,
      subtotal: Number(o.subtotal),
      taxAmount: Number(o.tax_amount),
      chargeAmount: Number(o.charge_amount),
      discountAmount: Number(o.discount_amount || 0),
      total: Number(o.total),
      amountPaid,
      balance,
      paymentStatus: balance <= 0.009 ? 'complete' : 'incomplete',
      paymentMethod: payment.method,
      paymentSplits: payment.splits,
      cashierName: o.cashier_name || null,
      date: o.paid_at || o.created_at,
      items: items.map((it) => ({
        name: it.item_name,
        quantity: it.quantity,
        priceAtTime: Number(it.price_at_time),
        lineTotal: Number(it.line_total),
      })),
    },
  };
}

/** Stream a simple receipt/invoice PDF to the response. */
function streamPdf(res, { title, meta, columns, rows, totals }) {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `inline; filename="${title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.pdf"`
  );
  doc.pipe(res);

  doc.fontSize(20).text(BRAND, { align: 'center' });
  doc.moveDown(0.3);
  doc.fontSize(14).text(title, { align: 'center' });
  doc.moveDown(1);

  doc.fontSize(10);
  Object.entries(meta).forEach(([label, value]) => {
    doc.text(`${label}: ${value}`);
  });
  doc.moveDown(1);

  const startX = 50;
  const pageRight = 545;
  const colWidth = (pageRight - startX) / columns.length;

  columns.forEach((col, i) => {
    doc.font('Helvetica-Bold').text(col, startX + i * colWidth, doc.y, {
      width: colWidth,
      continued: i < columns.length - 1,
    });
  });
  doc.font('Helvetica').moveDown(0.5);

  rows.forEach((row) => {
    const rowY = doc.y;
    row.forEach((cell, i) => {
      doc.text(String(cell), startX + i * colWidth, rowY, { width: colWidth });
    });
    doc.moveDown(0.4);
  });

  doc.moveDown(0.6);
  doc.font('Helvetica-Bold');
  Object.entries(totals).forEach(([label, value]) => {
    doc.text(`${label}: ${value}`, { align: 'right' });
  });

  doc.moveDown(2);
  doc.font('Helvetica-Oblique').fontSize(9).text('Thank you for your business.', {
    align: 'center',
  });

  doc.end();
}

/** GET /api/receipts/booking/:id.pdf */
async function bookingReceipt(req, res, next) {
  try {
    const data = await getBookingReceiptData(req.params.id);
    const { receipt: b } = data;
    try {
      const snapshotId = await saveReceiptSnapshot(
        pool,
        'booking',
        b.id,
        data,
        req.user?.id || null
      );
      res.setHeader('X-Receipt-Snapshot-Id', String(snapshotId));
    } catch (err) {
      console.error('Receipt snapshot failed:', err.message);
    }

    streamPdf(res, {
      title: `Booking Invoice #${b.id}`,
      meta: {
        'Guest': b.guestName,
        'Guest ID': b.guestIdNumber || '—',
        'Phone': b.guestPhone || '—',
        'Address': b.guestAddress || '—',
        'Payment': paymentText({ method: b.paymentMethod, splits: b.paymentSplits }),
        'Room': `${b.roomNumber} (${b.roomType})`,
        'Check-in': fmtDate(b.checkInDate),
        'Check-out': fmtDate(b.checkOutDate),
        'Nights': b.nights,
        'Status': b.status,
        'Payment status': b.paymentStatus === 'complete' ? 'Complete' : 'Incomplete',
        'Issued': fmtDate(new Date()),
      },
      columns: ['Description', 'Rate/night', 'Nights', 'Amount'],
      rows: [
        [
          `Room ${b.roomNumber}`,
          fmtMoney(b.ratePerNight),
          String(b.nights),
          fmtMoney(b.totalAmount),
        ],
      ],
      totals: {
        ...(b.discountAmount > 0 ? { 'Discount': `- ${fmtMoney(b.discountAmount)}` } : {}),
        'Total': fmtMoney(b.totalAmount),
        'Paid': fmtMoney(b.amountPaid),
        'Balance': fmtMoney(b.balance),
        'Payment status': b.paymentStatus === 'complete' ? 'Complete' : 'Incomplete',
      },
    });
  } catch (err) {
    next(err);
  }
}

/** GET /api/receipts/order/:id.pdf */
async function orderReceipt(req, res, next) {
  try {
    const data = await getOrderReceiptData(req.params.id);
    const { receipt: o } = data;
    try {
      const snapshotId = await saveReceiptSnapshot(
        pool,
        'order',
        o.id,
        data,
        req.user?.id || null
      );
      res.setHeader('X-Receipt-Snapshot-Id', String(snapshotId));
    } catch (err) {
      console.error('Receipt snapshot failed:', err.message);
    }

    streamPdf(res, {
      title: `Restaurant Receipt ${o.receiptNo || `#${o.id}`}`,
      meta: {
        'Receipt No': o.receiptNo || '—',
        'Order Type': o.orderType,
        'Table': o.tableNumber || '—',
        'Status': o.status,
        'Payment status': o.paymentStatus === 'complete' ? 'Complete' : 'Incomplete',
        'Payment': paymentText({ method: o.paymentMethod, splits: o.paymentSplits }),
        'Date': fmtDate(o.date),
      },
      columns: ['Item', 'Qty', 'Price', 'Line total'],
      rows: o.items.map((it) => [
        it.name,
        String(it.quantity),
        fmtMoney(it.priceAtTime),
        fmtMoney(it.lineTotal),
      ]),
      totals: {
        'Subtotal': fmtMoney(o.subtotal),
        ...(o.chargeAmount > 0
          ? {
              [o.orderType === 'room_service' ? 'Room service charge' : 'Takeaway charge']: fmtMoney(
                o.chargeAmount
              ),
            }
          : {}),
        ...(o.discountAmount > 0 ? { 'Discount': `- ${fmtMoney(o.discountAmount)}` } : {}),
        'Tax': fmtMoney(o.taxAmount),
        'Total': fmtMoney(o.total),
        'Paid': fmtMoney(o.amountPaid),
        'Balance': fmtMoney(o.balance),
        'Payment status': o.paymentStatus === 'complete' ? 'Complete' : 'Incomplete',
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  bookingReceipt,
  orderReceipt,
  getBookingReceiptData,
  getOrderReceiptData,
};
