const express = require('express');
const router = express.Router();
const { auth, roleCheck } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const ctrl = require('./controllers/rolesController');
const { createRoleSchema } = require('../validators/roles');

router.use(auth);

router.get('/', ctrl.getRoles);
router.post('/', roleCheck('admin'), validate(createRoleSchema), ctrl.createRole);

module.exports = router;
