const { z } = require('zod');

const updateRolePermissionsSchema = z.object({
  permissions: z.array(z.string().min(1)).max(200),
});

const clearDataSchema = z.object({
  mode: z.enum(['orders', 'bookings']),
  pin: z.string().min(1).max(20),
});

module.exports = { updateRolePermissionsSchema, clearDataSchema };
