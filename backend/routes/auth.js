const express = require('express');
const router = express.Router();
const { auth, requirePerm } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { loginLimiter, forgotLimiter, refreshLimiter } = require('../middleware/rateLimit');
const ctrl = require('./controllers/authController');
const {
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
} = require('../validators/auth');

// --- Authentication ---------------------------------------------------------
router.post('/login', loginLimiter, validate(loginSchema), ctrl.login);
router.post('/mfa/verify', loginLimiter, validate(mfaVerifySchema), ctrl.verifyMfa);
router.post('/refresh', refreshLimiter, validate(refreshSchema), ctrl.refresh);
router.post('/logout', validate(refreshSchema), ctrl.logout);

router.get('/me', auth, ctrl.me);
router.post('/change-password', auth, validate(changePasswordSchema), ctrl.changePassword);

// --- Sessions (self-service revocation) -------------------------------------
router.get('/sessions', auth, ctrl.listMySessions);
router.delete('/sessions/:id', auth, ctrl.revokeMySession);

// --- MFA (self-service) -----------------------------------------------------
router.post('/mfa/setup', auth, ctrl.mfaSetup);
router.post('/mfa/enable', auth, validate(mfaCodeSchema), ctrl.mfaEnable);
router.post('/mfa/disable', auth, validate(mfaDisableSchema), ctrl.mfaDisable);

// --- Password reset ---------------------------------------------------------
router.post('/forgot-password', forgotLimiter, validate(forgotPasswordSchema), ctrl.forgotPassword);
router.post('/reset-password/:token', validate(resetPasswordSchema), ctrl.resetPassword);

// --- User management (admin by default; matrix-editable) --------------------
router.get('/users', auth, requirePerm('users.view'), ctrl.listUsers);
router.post('/users', auth, requirePerm('users.manage'), validate(createUserSchema), ctrl.createUser);
router.patch('/users/:id', auth, requirePerm('users.manage'), validate(updateUserSchema), ctrl.updateUser);
router.patch(
  '/users/:id/password',
  auth,
  requirePerm('users.password'),
  validate(changeUserPasswordSchema),
  ctrl.changeUserPassword
);
router.delete('/users/:id', auth, requirePerm('users.manage'), ctrl.deleteUser);

module.exports = router;
