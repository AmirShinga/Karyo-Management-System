const { z } = require('zod');
const { paymentListSchema } = require('./payments');
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

// --- Income (manual entries; system entries come from bookings/orders) ------
const createIncomeSchema = z.object({
  source: z.enum(['room', 'restaurant', 'other']).default('other'),
  description: z.string().max(255).optional().nullable(),
  amount: z.number().positive(),
  incomeDate: dateOnly.optional(),
  payments: paymentListSchema,
});

// --- Expenses ---------------------------------------------------------------
const createExpenseSchema = z.object({
  category: z.string().min(1).max(80).default('general'),
  description: z.string().max(255).optional().nullable(),
  amount: z.number().positive(),
  expenseDate: dateOnly.optional(),
  receiptUrl: z.string().max(255).optional().nullable(),
});

const updateExpenseSchema = z.object({
  category: z.string().min(1).max(80).optional(),
  description: z.string().max(255).optional().nullable(),
  amount: z.number().positive().optional(),
  expenseDate: dateOnly.optional(),
  receiptUrl: z.string().max(255).optional().nullable(),
});

// --- Staff ------------------------------------------------------------------
const createStaffSchema = z.object({
  fullName: z.string().min(2).max(160),
  position: z.string().min(1).max(80).default('staff'),
  phone: z.string().max(30).optional().nullable(),
  salary: z.number().nonnegative().optional().default(0),
  hireDate: dateOnly.optional().nullable(),
  userId: z.number().int().positive().optional().nullable(),
});

const updateStaffSchema = z.object({
  fullName: z.string().min(2).max(160).optional(),
  position: z.string().min(1).max(80).optional(),
  phone: z.string().max(30).optional().nullable(),
  salary: z.number().nonnegative().optional(),
  hireDate: dateOnly.optional().nullable(),
  active: z.boolean().optional(),
  userId: z.number().int().positive().optional().nullable(),
});

module.exports = {
  createIncomeSchema,
  createExpenseSchema,
  updateExpenseSchema,
  createStaffSchema,
  updateStaffSchema,
};
