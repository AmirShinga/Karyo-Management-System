const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { pool } = require('../config/db');
const { notFound } = require('./response');
const { paymentSummaryFor, roundMoney } = require('./payments');
const { saveReceiptSnapshot } = require('./receiptSnapshots');

const CURRENCY = 'NGN';
const BRAND = 'Karyo Guest Palace';
const LOGO_PATH = path.join(__dirname, '..', 'assets', 'logo.png');
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
  if (!d) return '�?"';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return String(d);
  return dt.toISOString().slice(0, 10);
}

function fmtTime(value) {
  if (!value) return '';
  const text = String(value);
  return text.length > 5 ? text.slice(0, 5) : text;
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
      guestOccupation: b.guest_occupation || null,
      stayPurpose: b.stay_purpose || null,
      guestContactName: b.guest_contact_name || null,
      guestContactPhone: b.guest_contact_phone || null,
      guestIdType: b.guest_id_type || null,
      guestIdDocument: b.guest_id_document || null,
      vehicleNo: b.vehicle_no || null,
      arrivalFrom: b.arrival_from || null,
      arrivalTime: b.arrival_time || null,
      destination: b.destination || null,
      departureDate: b.departure_date || null,
      departureTime: b.departure_time || null,
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

  if (fs.existsSync(LOGO_PATH)) {
    const logoSize = 56;
    doc.image(LOGO_PATH, (doc.page.width - logoSize) / 2, doc.y, {
      fit: [logoSize, logoSize],
    });
    doc.y += logoSize + 8;
  }

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

function reportDetailRow(doc, number, label, value) {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const width = right - left;
  const startY = doc.y;
  doc.font('Helvetica').fontSize(8.5);
  doc.text(`${number}. `, left, startY, { width, continued: true });
  doc.font('Helvetica-Bold').text(`${label}: `, { continued: true });
  doc.font('Helvetica').text(value ? String(value) : ' ', { width });
  const bottom = doc.y + 2;
  doc
    .moveTo(left, bottom)
    .lineTo(right, bottom)
    .lineWidth(0.5)
    .strokeColor('#000000')
    .stroke();
  doc.y = bottom + 5;
}

/** Booking PDF: the guest report form plus payment details. */
function streamGuestReportPdf(res, { business, receipt: b }) {
  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename="guest-report.pdf"');
  doc.pipe(res);

  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const width = right - left;
  const center = doc.page.width / 2;

  if (fs.existsSync(LOGO_PATH)) {
    const logoSize = 52;
    doc.image(LOGO_PATH, center - logoSize / 2, doc.y, {
      fit: [logoSize, logoSize],
    });
    doc.y += logoSize + 4;
  }

  doc
    .font('Helvetica-Bold')
    .fontSize(16)
    .text((business?.name || BRAND).toUpperCase(), { align: 'center' });
  doc.fontSize(10).text('GUEST REPORT FORM', { align: 'center', characterSpacing: 1.2 });
  doc.moveDown(0.2);
  doc
    .font('Helvetica')
    .fontSize(8)
    .text(
      'After Government Girls College Doma,\nNew Liji, Biu Road, P.O. Box 1050\nGombe, Gombe State\n000101',
      { align: 'center', lineGap: 1 }
    );

  doc.moveDown(0.7);
  doc.fontSize(9).text(`Date: ${fmtDate(new Date())}`, { align: 'right' });
  doc.moveDown(0.7);

  doc.font('Helvetica-Bold').fontSize(10).text('GUEST DETAILS');
  const guestRuleY = doc.y + 1;
  doc.moveTo(left, guestRuleY).lineTo(right, guestRuleY).lineWidth(1).stroke();
  doc.y = guestRuleY + 6;

  const idProof = [b.guestIdType, b.guestIdDocument].filter(Boolean).join(' \u2014 ');
  const room = [b.roomNumber, b.roomType ? `(${b.roomType})` : ''].filter(Boolean).join(' ');
  const rows = [
    ['Name', b.guestName],
    ['Address', b.guestAddress],
    ['Phone No', b.guestPhone],
    ['Occupation', b.guestOccupation],
    ['Purpose of Stay', b.stayPurpose],
    ['Room No Occupied', room],
    ['Contact Phone No', b.guestContactPhone],
    ['Name of Contact (Incase of Emergency)', b.guestContactName],
    ['Arrival from', b.arrivalFrom],
    ['Time of Arrival', fmtTime(b.arrivalTime)],
    ['Date of Arrival', fmtDate(b.checkInDate)],
    ['Destination', b.destination],
    ['Time of Departure', fmtTime(b.departureTime)],
    ['Date of Departure', b.departureDate ? fmtDate(b.departureDate) : ''],
    [
      'Means of Identification (NIN, Voters I.D Card, Drivers License e.t.c)',
      idProof,
    ],
    ['Vehicle No', b.vehicleNo],
  ];
  rows.forEach(([label, value], index) => reportDetailRow(doc, index + 1, label, value));

  doc.moveDown(0.6);
  const signY = doc.y;
  doc.font('Helvetica-Bold').fontSize(9);
  doc.text('17. Customer Sign/Date:', left, signY, { width: width / 2 - 12 });
  doc.text('18. Manager Sign/Date:', left + width / 2, signY, { width: width / 2 - 12 });
  const signLineY = signY + 22;
  doc.moveTo(left, signLineY).lineTo(left + width / 2 - 14, signLineY).lineWidth(0.6).stroke();
  doc.moveTo(left + width / 2, signLineY).lineTo(right, signLineY).stroke();
  doc.y = signLineY + 14;

  doc.font('Helvetica-Bold').fontSize(10).text('PAYMENT DETAILS');
  const payRuleY = doc.y + 1;
  doc.moveTo(left, payRuleY).lineTo(right, payRuleY).lineWidth(1).stroke();
  doc.y = payRuleY + 6;

  const paymentRows = [
    ['Rate per night', fmtMoney(b.ratePerNight)],
    ['Nights', String(b.nights)],
    ...(b.discountAmount > 0 ? [['Discount', `- ${fmtMoney(b.discountAmount)}`]] : []),
    ['Total amount', fmtMoney(b.totalAmount)],
    ['Amount paid', fmtMoney(b.amountPaid)],
    ['Balance', fmtMoney(b.balance)],
    ['Payment status', b.paymentStatus === 'complete' ? 'Complete' : 'Incomplete'],
    [
      'Payment method',
      paymentText({ method: b.paymentMethod, splits: b.paymentSplits }),
    ],
  ];

  let payY = doc.y;
  paymentRows.forEach(([label, value]) => {
    const rowDoc = doc.font('Helvetica').fontSize(9);
    rowDoc.text(label, left, payY, { width: width * 0.62 });
    doc.text(String(value || ''), left + width * 0.62, payY, {
      width: width * 0.38,
      align: 'right',
    });
    payY += 15;
  });
  doc.y = payY;

  if (b.paymentSplits?.length) {
    doc.moveDown(0.3);
    doc.font('Helvetica-Bold').fontSize(9).text('Payment breakdown', left, doc.y);
    doc.moveDown(0.2);
    b.paymentSplits.forEach((split) => {
      doc
        .font('Helvetica')
        .fontSize(9)
        .text(`${PAYMENT_LABEL[split.method] || split.method}: ${fmtMoney(split.amount)}`, {
          indent: 12,
        });
    });
  }

  doc.moveDown(1);
  doc
    .font('Helvetica-Oblique')
    .fontSize(8.5)
    .text(business?.footer || 'Thank you for your business.', { align: 'center' });

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

    streamGuestReportPdf(res, data);
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
  streamGuestReportPdf,
  getBookingReceiptData,
  getOrderReceiptData,
};
