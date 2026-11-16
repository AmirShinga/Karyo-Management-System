const express = require('express');
const router = express.Router();
const { auth, requirePerm } = require('../middleware/auth');
const ctrl = require('./controllers/outstandingController');

router.use(auth, requirePerm('outstanding.view'));
router.get('/', ctrl.listOutstanding);

module.exports = router;
