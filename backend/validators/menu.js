const { z } = require('zod');

const createMenuItemSchema = z.object({
  name: z.string().min(1).max(160),
  category: z.string().min(1).max(60).default('general'),
  price: z.number().nonnegative(),
  cost: z.number().nonnegative().optional().default(0),
  available: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
  imageUrl: z.string().max(255).optional().nullable(),
});

const updateMenuItemSchema = z.object({
  name: z.string().min(1).max(160).optional(),
  category: z.string().min(1).max(60).optional(),
  price: z.number().nonnegative().optional(),
  cost: z.number().nonnegative().optional(),
  available: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
  imageUrl: z.string().max(255).optional().nullable(),
});

const setAvailabilitySchema = z.object({
  available: z.boolean(),
});

module.exports = { createMenuItemSchema, updateMenuItemSchema, setAvailabilitySchema };
