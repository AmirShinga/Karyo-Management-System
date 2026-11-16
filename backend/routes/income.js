const express = require('express');
const router = express.Router();
const { auth, requirePerm } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const ctrl = require('./controllers/incomeController');
const { createIncomeSchema } = require('../validators/finance');

router.use(auth);

router.get('/', requirePerm('income.view'), ctrl.listIncome);
router.get('/summary', requirePerm('income.view'), ctrl.incomeSummary);
router.post('/', requirePerm('income.create'), validate(createIncomeSchema), ctrl.createIncome);

module.exports = router;
