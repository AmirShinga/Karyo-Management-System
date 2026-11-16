const { z } = require('zod');

const createRoomSchema = z.object({
  roomNumber: z.string().min(1).max(20),
  roomType: z.string().min(1).max(60),
  ratePerNight: z.number().nonnegative(),
  capacity: z.number().int().positive().default(1),
  status: z.enum(['available', 'occupied', 'maintenance']).optional(),
  notes: z.string().max(1000).optional().nullable(),
});

const updateRoomSchema = z.object({
  roomNumber: z.string().min(1).max(20).optional(),
  roomType: z.string().min(1).max(60).optional(),
  ratePerNight: z.number().nonnegative().optional(),
  capacity: z.number().int().positive().optional(),
  status: z.enum(['available', 'occupied', 'maintenance']).optional(),
  notes: z.string().max(1000).optional().nullable(),
  reason: z.string().max(255).optional().nullable(),
});

const setStatusSchema = z.object({
  status: z.enum(['available', 'occupied', 'maintenance']),
  reason: z.string().max(255).optional().nullable(),
});

module.exports = { createRoomSchema, updateRoomSchema, setStatusSchema };
