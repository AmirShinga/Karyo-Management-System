const { z } = require('zod');

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/**
 * Password policy: at least 10 characters with lower, upper, digit and symbol.
 * Applied when setting or creating a password (not when logging in).
 */
const strongPassword = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(128, 'Password must be at most 128 characters')
  .regex(/[a-z]/, 'Password must include a lowercase letter')
  .regex(/[A-Z]/, 'Password must include an uppercase letter')
  .regex(/[0-9]/, 'Password must include a number')
  .regex(/[^A-Za-z0-9]/, 'Password must include a symbol');

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: strongPassword,
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  password: strongPassword,
});

const mfaVerifySchema = z.object({
  challenge: z.string().min(10),
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
});

const mfaCodeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
});

const mfaDisableSchema = z.object({
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(10).optional(),
});

const roleCode = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[a-z][a-z0-9_]*$/, 'Invalid role');

const createUserSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  phone: z.string().max(30).optional().nullable(),
  password: strongPassword,
  role: roleCode,
});

const updateUserSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(30).optional().nullable(),
  role: roleCode.optional(),
  active: z.boolean().optional(),
});

const changeUserPasswordSchema = z.object({
  password: strongPassword,
});

module.exports = {
  loginSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  createUserSchema,
  updateUserSchema,
  changeUserPasswordSchema,
  mfaVerifySchema,
  mfaCodeSchema,
  mfaDisableSchema,
  refreshSchema,
  strongPassword,
};
