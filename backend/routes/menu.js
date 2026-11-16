const express = require('express');
const router = express.Router();
const { auth, requirePerm } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const ctrl = require('./controllers/menuController');
const { createMenuItemSchema, updateMenuItemSchema, setAvailabilitySchema } = require('../validators/menu');

router.use(auth);

router.get('/', requirePerm('menu.view'), ctrl.listMenu);
router.post('/', requirePerm('menu.create'), validate(createMenuItemSchema), ctrl.createMenuItem);
router.put('/:id', requirePerm('menu.update'), validate(updateMenuItemSchema), ctrl.updateMenuItem);
router.patch('/:id/availability', requirePerm('menu.update'), validate(setAvailabilitySchema), ctrl.setAvailability);
router.delete('/:id', requirePerm('menu.delete'), ctrl.deleteMenuItem);

module.exports = router;
