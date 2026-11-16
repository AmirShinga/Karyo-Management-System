const express = require('express');
const router = express.Router();
const { auth, requirePerm } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const ctrl = require('./controllers/maintenanceController');
const { createRequestSchema, updateRequestSchema, setStatusSchema } = require('../validators/maintenance');

router.use(auth);

router.get('/', requirePerm('maintenance.view'), ctrl.listRequests);
router.post('/', requirePerm('maintenance.manage'), validate(createRequestSchema), ctrl.createRequest);
router.put('/:id', requirePerm('maintenance.manage'), validate(updateRequestSchema), ctrl.updateRequest);
router.patch('/:id/status', requirePerm('maintenance.manage'), validate(setStatusSchema), ctrl.setRequestStatus);
router.delete('/:id', requirePerm('maintenance.manage'), ctrl.deleteRequest);

module.exports = router;
