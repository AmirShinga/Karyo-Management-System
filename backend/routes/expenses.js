const express = require('express');
const router = express.Router();
const { auth, requirePerm } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const ctrl = require('./controllers/expensesController');
const { createExpenseSchema, updateExpenseSchema } = require('../validators/finance');

router.use(auth);

router.get('/', requirePerm('expenses.view'), ctrl.listExpenses);
router.get('/summary', requirePerm('expenses.view'), ctrl.expenseSummary);
router.post('/', requirePerm('expenses.create'), validate(createExpenseSchema), ctrl.createExpense);
router.put('/:id', requirePerm('expenses.update'), validate(updateExpenseSchema), ctrl.updateExpense);
router.delete('/:id', requirePerm('expenses.delete'), ctrl.deleteExpense);

module.exports = router;
