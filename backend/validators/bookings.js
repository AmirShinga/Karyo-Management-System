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
  guestPhone: z.string().min(1).max(30),
  guestEmail: z.string().email().optional().nullable().or(z.literal('')),
  guestAddress: z.string().min(1).max(255),
  guestOccupation: z.string().min(1).max(120),
  stayPurpose: z.string().min(1).max(255),
  guestContactName: z.string().min(1).max(160),
  guestContactPhone: z.string().min(1).max(30),
  guestIdType: z.string().min(1).max(60),
  guestIdDocument: z.string().min(1).max(80),
  vehicleNo: z.string().min(1).max(60),
  arrivalFrom: z.string().min(1).max(160),
  arrivalTime: timeOnly,
  destination: z.string().max(160).optional().nullable().or(z.literal('')),
  departureDate: dateOnly.optional().nullable().or(z.literal('')),
  departureTime: timeOnly.optional().nullable().or(z.literal('')),
  checkInDate: dateOnly,
  checkOutDate: dateOnly,
  discountAmount: z.number().nonnegative().max(100000000).optional(),
  // Optional advance payment recorded at booking time
  amountPaid: z.number().nonnegative().optional(),
  payments: paymentListSchema,
});

const updateBookingReportSchema = z.object({
  guestName: z.string().min(2).max(160).optional(),
  guestPhone: z.string().min(1).max(30).optional(),
  guestEmail: z.string().email().optional().nullable().or(z.literal('')),
  guestAddress: z.string().min(1).max(255).optional(),
  guestOccupation: z.string().min(1).max(120).optional(),
  stayPurpose: z.string().min(1).max(255).optional(),
  guestContactName: z.string().min(1).max(160).optional(),
  guestContactPhone: z.string().min(1).max(30).optional(),
  guestIdType: z.string().min(1).max(60).optional(),
  guestIdDocument: z.string().min(1).max(80).optional(),
  vehicleNo: z.string().min(1).max(60).optional(),
  arrivalFrom: z.string().min(1).max(160).optional(),
  arrivalTime: timeOnly.optional(),
  destination: z.string().max(160).optional().nullable().or(z.literal('')),
  departureDate: dateOnly.optional().nullable().or(z.literal('')),
  departureTime: timeOnly.optional().nullable().or(z.literal('')),
});

module.exports = { createBookingSchema, updateBookingReportSchema };
