const express = require('express');
const router = express.Router();
const { auth, requirePerm } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const ctrl = require('./controllers/roomsController');
const { createRoomSchema, updateRoomSchema, setStatusSchema } = require('../validators/rooms');

router.use(auth);

router.get('/', requirePerm('rooms.view'), ctrl.listRooms);
router.get('/:id/history', requirePerm('rooms.history'), ctrl.listRoomHistory);
router.post('/', requirePerm('rooms.create'), validate(createRoomSchema), ctrl.createRoom);
router.put('/:id', requirePerm('rooms.update'), validate(updateRoomSchema), ctrl.updateRoom);
router.patch('/:id/status', requirePerm('rooms.status'), validate(setStatusSchema), ctrl.setRoomStatus);
router.delete('/:id', requirePerm('rooms.delete'), ctrl.deleteRoom);

module.exports = router;
