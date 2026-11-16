const express = require('express');
const router = express.Router();
const { auth, requirePerm } = require('../middleware/auth');
const ctrl = require('./controllers/reportsController');
const exportsCtrl = require('./controllers/exportsController');

router.use(auth);

const canView = requirePerm('reports.view');
const canExport = requirePerm('reports.export');

router.get('/dashboard', canView, ctrl.dashboard);
router.get('/revenue', canView, ctrl.revenue);
router.get('/revenue-by-source', canView, ctrl.revenueBySource);
router.get('/occupancy', canView, ctrl.occupancy);
router.get('/sales', canView, ctrl.sales);

router.get('/export/income.xlsx', canExport, exportsCtrl.incomeExport);
router.get('/export/expenses.xlsx', canExport, exportsCtrl.expensesExport);
router.get('/export/sales.xlsx', canExport, exportsCtrl.salesExport);

module.exports = router;
