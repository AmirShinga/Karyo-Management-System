const express = require('express');
const router = express.Router();
const { auth, requirePerm } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const ctrl = require('./controllers/inventoryController');
const { createItemSchema, updateItemSchema, createTransactionSchema } = require('../validators/inventory');

router.use(auth);

router.get('/', requirePerm('inventory.view'), ctrl.listItems);
router.post('/', requirePerm('inventory.manage'), validate(createItemSchema), ctrl.createItem);
router.get('/transactions', requirePerm('inventory.view'), ctrl.listTransactions);
router.put('/:id', requirePerm('inventory.manage'), validate(updateItemSchema), ctrl.updateItem);
router.delete('/:id', requirePerm('inventory.manage'), ctrl.deleteItem);
router.post('/:id/transactions', requirePerm('inventory.manage'), validate(createTransactionSchema), ctrl.createTransaction);

module.exports = router;
