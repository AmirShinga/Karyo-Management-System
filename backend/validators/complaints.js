const { z } = require('zod');

const createComplaintSchema = z.object({
  subject: z.string().trim().min(3).max(160),
  message: z.string().trim().min(5).max(4000),
});

const updateComplaintSchema = z.object({
  status: z.enum(['open', 'resolved']).optional(),
  ownerNote: z.string().trim().max(2000).optional().nullable(),
});

module.exports = { createComplaintSchema, updateComplaintSchema };
