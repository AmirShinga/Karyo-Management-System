const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const {
  bookingReceipt,
  orderReceipt,
  getBookingReceiptData,
  getOrderReceiptData,
} = require('../utils/pdf');
const { sendData } = require('../utils/response');
const { pool } = require('../config/db');
const {
  saveReceiptSnapshot,
  listReceiptSnapshots,
} = require('../utils/receiptSnapshots');

router.use(auth);

// PDF routes must be registered before the JSON `/:id` routes so that
// `/booking/5.pdf` is not captured as `:id = "5.pdf"`.
router.get('/booking/:id.pdf', bookingReceipt);
router.get('/order/:id.pdf', orderReceipt);

// JSON payloads for client-side thermal (XPrinter / 80mm) printing.
router.get('/booking/:id', async (req, res, next) => {
  try {
    const data = await getBookingReceiptData(req.params.id);
    const snapshotId = await saveReceiptSnapshot(
      pool,
      'booking',
      data.receipt.id,
      data,
      req.user?.id || null
    );
    sendData(res, data, { snapshotId });
  } catch (err) {
    next(err);
  }
});

router.get('/order/:id', async (req, res, next) => {
  try {
    const data = await getOrderReceiptData(req.params.id);
    const snapshotId = await saveReceiptSnapshot(
      pool,
      'order',
      data.receipt.id,
      data,
      req.user?.id || null
    );
    sendData(res, data, { snapshotId });
  } catch (err) {
    next(err);
  }
});

router.get('/booking/:id/snapshots', async (req, res, next) => {
  try {
    const rows = await listReceiptSnapshots(pool, 'booking', req.params.id, req.query.limit);
    sendData(res, rows);
  } catch (err) {
    next(err);
  }
});

router.get('/order/:id/snapshots', async (req, res, next) => {
  try {
    const rows = await listReceiptSnapshots(pool, 'order', req.params.id, req.query.limit);
    sendData(res, rows);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
