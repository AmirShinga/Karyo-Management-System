const express = require('express');
const router = express.Router();
const { auth, roleCheck } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const ctrl = require('./controllers/permissionsController');
const { updateRolePermissionsSchema, clearDataSchema } = require('../validators/permissions');

// Permission management is reserved for the admin role.
router.use(auth, roleCheck('admin'));

router.get('/', ctrl.getMatrix);
router.post('/clear-data', validate(clearDataSchema), ctrl.clearData);
router.put('/:role', validate(updateRolePermissionsSchema), ctrl.updateRole);

module.exports = router;
