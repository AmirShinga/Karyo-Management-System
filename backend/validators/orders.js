const { z } = require('zod');
const { paymentListSchema } = require('./payments');

const orderItemSchema = z.object({
  menuItemId: z.number().int().positive(),
  quantity: z.number().int().positive(),
});

const createOrderSchema = z
  .object({
    orderType: z.enum(['dine_in', 'takeaway', 'room_service']).default('dine_in'),
    roomId: z.number().int().positive().optional().nullable(),
    tableNumber: z.string().max(20).optional().nullable(),
    items: z.array(orderItemSchema).min(1, 'At least one item is required'),
    // amountPaid is what the cashier collected; must cover nothing in particular,
    // but we record it for the income ledger.
    amountPaid: z.number().nonnegative().optional(),
    payments: paymentListSchema,
    taxRate: z.number().nonnegative().max(100).optional(),
    // Extra charge for takeaway / room-service orders (manual amount).
    chargeAmount: z.number().nonnegative().max(100000).optional(),
    discountAmount: z.number().nonnegative().max(100000000).optional(),
  })
  .refine((v) => v.orderType !== 'room_service' || v.roomId != null, {
    message: 'roomId is required for room service orders',
    path: ['roomId'],
  });

module.exports = { createOrderSchema };
