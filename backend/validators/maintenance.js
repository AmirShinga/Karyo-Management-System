const { z } = require('zod');

const PRIORITIES = ['low', 'medium', 'high', 'urgent'];
const STATUSES = ['open', 'in_progress', 'resolved', 'closed'];

const createRequestSchema = z.object({
  roomId: z.number().int().positive().optional().nullable(),
  title: z.string().min(2).max(160),
  description: z.string().max(2000).optional().nullable(),
  category: z.string().min(1).max(60).default('general'),
  priority: z.enum(PRIORITIES).default('medium'),
  cost: z.number().nonnegative().default(0),
  assignedTo: z.number().int().positive().optional().nullable(),
});

const updateRequestSchema = z.object({
  roomId: z.number().int().positive().optional().nullable(),
  title: z.string().min(2).max(160).optional(),
  description: z.string().max(2000).optional().nullable(),
  category: z.string().min(1).max(60).optional(),
  priority: z.enum(PRIORITIES).optional(),
  status: z.enum(STATUSES).optional(),
  cost: z.number().nonnegative().optional(),
  assignedTo: z.number().int().positive().optional().nullable(),
});

const setStatusSchema = z.object({
  status: z.enum(STATUSES),
  cost: z.number().nonnegative().optional(),
});

module.exports = { createRequestSchema, updateRequestSchema, setStatusSchema, PRIORITIES, STATUSES };
