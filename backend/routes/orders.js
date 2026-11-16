const express = require('express');
const router = express.Router();
const { auth, requirePerm } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const ctrl = require('./controllers/ordersController');
const { createOrderSchema } = require('../validators/orders');

router.use(auth);

router.get('/', requirePerm('orders.view'), ctrl.listOrders);
router.get('/:id', requirePerm('orders.view'), ctrl.getOrder);
router.post('/', requirePerm('orders.create'), validate(createOrderSchema), ctrl.createOrder);
router.patch('/:id/complete-payment', requirePerm('orders.create'), ctrl.completePayment);
router.patch('/:id/cancel', requirePerm('orders.cancel'), ctrl.cancelOrder);

module.exports = router;
