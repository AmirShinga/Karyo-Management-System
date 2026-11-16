const { z } = require('zod');

const createCategorySchema = z.object({
  name: z.string().min(1).max(60),
  sortOrder: z.number().int().min(0).optional(),
});

const updateCategorySchema = z.object({
  name: z.string().min(1).max(60).optional(),
  sortOrder: z.number().int().min(0).optional(),
});

module.exports = { createCategorySchema, updateCategorySchema };
