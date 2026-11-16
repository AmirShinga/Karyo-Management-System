const { z } = require('zod');

const TX_TYPES = ['purchase', 'usage', 'wastage', 'adjustment', 'return'];

const createItemSchema = z.object({
  name: z.string().min(2).max(160),
  unit: z.string().min(1).max(20).default('unit'),
  quantity: z.number().default(0),
  reorderLevel: z.number().nonnegative().default(0),
  unitCost: z.number().nonnegative().default(0),
  active: z.boolean().optional(),
});

const updateItemSchema = z.object({
  name: z.string().min(2).max(160).optional(),
  unit: z.string().min(1).max(20).optional(),
  reorderLevel: z.number().nonnegative().optional(),
  unitCost: z.number().nonnegative().optional(),
  active: z.boolean().optional(),
});

const createTransactionSchema = z.object({
  type: z.enum(TX_TYPES),
  quantity: z.number().refine((v) => v !== 0, 'Quantity cannot be zero'),
  unitCost: z.number().nonnegative().optional(),
  reason: z.string().max(255).optional().nullable(),
  reference: z.string().max(80).optional().nullable(),
});

module.exports = { createItemSchema, updateItemSchema, createTransactionSchema, TX_TYPES };
