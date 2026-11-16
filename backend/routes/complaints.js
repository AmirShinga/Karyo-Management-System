const express = require('express');
const router = express.Router();
const { auth, requirePerm } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const ctrl = require('./controllers/complaintsController');
const { createComplaintSchema, updateComplaintSchema } = require('../validators/complaints');

router.use(auth);

router.get('/', requirePerm('complaints.view'), ctrl.listComplaints);
router.post('/', requirePerm('complaints.create'), validate(createComplaintSchema), ctrl.createComplaint);
router.patch('/:id', requirePerm('complaints.manage'), validate(updateComplaintSchema), ctrl.updateComplaint);

module.exports = router;
