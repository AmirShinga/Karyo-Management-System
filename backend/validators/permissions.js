const { z } = require('zod');

const updateRolePermissionsSchema = z.object({
  permissions: z.array(z.string().min(1)).max(200),
});

module.exports = { updateRolePermissionsSchema };
