const { z } = require('zod');
const { paymentListSchema } = require('./payments');

// Date-only validation: expects "YYYY-MM-DD"
const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected date in YYYY-MM-DD format');

const createBookingSchema = z.object({
  roomId: z.number().int().positive(),
  guestName: z.string().min(2).max(160),
  guestPhone: z.string().max(30).optional().nullable(),
  guestEmail: z.string().email().optional().nullable().or(z.literal('')),
  guestAddress: z.string().max(255).optional().nullable(),
  checkInDate: dateOnly,
  checkOutDate: dateOnly,
  discountAmount: z.number().nonnegative().max(100000000).optional(),
  // Optional advance payment recorded at booking time
  amountPaid: z.number().nonnegative().optional(),
  payments: paymentListSchema,
});

module.exports = { createBookingSchema };
