const { z } = require('zod');
const { paymentListSchema } = require('./payments');

// Date-only validation: expects "YYYY-MM-DD"
const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected date in YYYY-MM-DD format');

const timeOnly = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected time in HH:MM format');

const createBookingSchema = z.object({
  roomId: z.number().int().positive(),
  guestName: z.string().min(2).max(160),
  guestPhone: z.string().max(30).optional().nullable(),
  guestEmail: z.string().email().optional().nullable().or(z.literal('')),
  guestAddress: z.string().max(255).optional().nullable(),
  guestOccupation: z.string().max(120).optional().nullable(),
  stayPurpose: z.string().max(255).optional().nullable(),
  guestContactName: z.string().max(160).optional().nullable(),
  guestContactPhone: z.string().max(30).optional().nullable(),
  guestIdType: z.string().max(60).optional().nullable(),
  guestIdDocument: z.string().max(80).optional().nullable(),
  vehicleNo: z.string().max(60).optional().nullable(),
  arrivalFrom: z.string().max(160).optional().nullable(),
  arrivalTime: timeOnly.optional().nullable().or(z.literal('')),
  destination: z.string().max(160).optional().nullable(),
  departureTime: timeOnly.optional().nullable().or(z.literal('')),
  checkInDate: dateOnly,
  checkOutDate: dateOnly,
  discountAmount: z.number().nonnegative().max(100000000).optional(),
  // Optional advance payment recorded at booking time
  amountPaid: z.number().nonnegative().optional(),
  payments: paymentListSchema,
});

module.exports = { createBookingSchema };
