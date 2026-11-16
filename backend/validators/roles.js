const { z } = require('zod');

const createRoleSchema = z.object({
  label: z.string().trim().min(2, 'Role name must be at least 2 characters').max(60),
  code: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[a-z][a-z0-9_]*$/, 'Use lowercase letters, numbers and underscores')
    .optional(),
});

module.exports = { createRoleSchema };
