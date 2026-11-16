const express = require('express');
const router = express.Router();
const { auth, requirePerm } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const ctrl = require('./controllers/staffController');
const { createStaffSchema, updateStaffSchema } = require('../validators/finance');

router.use(auth);

router.get('/', requirePerm('staff.view'), ctrl.listStaff);
router.post('/', requirePerm('staff.manage'), validate(createStaffSchema), ctrl.createStaff);
router.put('/:id', requirePerm('staff.manage'), validate(updateStaffSchema), ctrl.updateStaff);
router.delete('/:id', requirePerm('staff.manage'), ctrl.deleteStaff);

module.exports = router;
