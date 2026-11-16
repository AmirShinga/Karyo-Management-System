const express = require('express');
const router = express.Router();
const { auth, requirePerm } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const ctrl = require('./controllers/bookingsController');
const { createBookingSchema } = require('../validators/bookings');

router.use(auth);

router.get('/', requirePerm('bookings.view'), ctrl.listBookings);
router.get('/availability', requirePerm('bookings.view'), ctrl.availability);
router.get('/:id', requirePerm('bookings.view'), ctrl.getBooking);
router.post('/', requirePerm('bookings.create'), validate(createBookingSchema), ctrl.createBooking);
router.patch('/:id/check-in', requirePerm('bookings.checkin'), ctrl.checkIn);
router.patch('/:id/check-out', requirePerm('bookings.checkout'), ctrl.checkOut);
router.patch('/:id/payments', requirePerm('bookings.checkout'), ctrl.recordPayment);
router.patch('/:id/cancel', requirePerm('bookings.cancel'), ctrl.cancelBooking);

module.exports = router;
