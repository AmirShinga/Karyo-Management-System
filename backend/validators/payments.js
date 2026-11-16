const { z } = require('zod');

const paymentMethod = z.enum(['cash', 'pos', 'bank_transfer']);

const paymentSplitSchema = z.object({
  method: paymentMethod,
  amount: z.number().positive(),
});

const paymentListSchema = z.array(paymentSplitSchema).min(1).max(10).optional();

module.exports = { paymentMethod, paymentSplitSchema, paymentListSchema };
