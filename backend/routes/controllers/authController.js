const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../../config/db');
const { sendData, unauthorized, notFound, conflict, badRequest, AppError, paginate, pageMeta } = require('../../utils/response');
const { sendMail } = require('../../utils/mailer');
const { getPermissions } = require('../../utils/permissionCache');
const { roleExists } = require('../../db/roles');
const {
  createSession,
  findActiveSession,
  rotateSession,
  revokeSession,
  revokeAllForUser,
  listSessions,
} = require('../../utils/sessions');
const { generateSecret, verifyToken, otpauthUri } = require('../../utils/totp');

const MAX_FAILED_ATTEMPTS = Number(process.env.MAX_LOGIN_ATTEMPTS) || 5;
const LOCK_MINUTES = Number(process.env.LOCKOUT_MINUTES) || 15;
const REFRESH_COOKIE = 'hms_refresh';

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

function accessTtl() {
  return process.env.JWT_EXPIRES_IN || '15m';
}

function signAccessToken(user, sessionId) {
  return jwt.sign(
    { id: user.id, role: user.role, name: user.name, sid: sessionId, tv: user.token_version || 0 },
    process.env.JWT_SECRET,
    { expiresIn: accessTtl() }
  );
}

function signMfaChallenge(user) {
  return jwt.sign({ id: user.id, purpose: 'mfa' }, process.env.JWT_SECRET, { expiresIn: '5m' });
}

function clientIp(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || null;
}

function refreshCookieOptions() {
  const secure = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure,
    sameSite: secure ? 'none' : 'lax',
    path: '/api/auth',
    maxAge: (Number(process.env.REFRESH_TOKEN_DAYS) || 7) * 24 * 60 * 60 * 1000,
  };
}

function setRefreshCookie(res, token) {
  res.cookie(REFRESH_COOKIE, token, refreshCookieOptions());
}

function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions(), maxAge: undefined });
}

function publicUser(u) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    role: u.role,
    active: !!u.active,
    mfaEnabled: !!u.mfa_enabled,
  };
}

async function issueSession(req, res, user) {
  const { sessionId, refreshToken } = await createSession(pool, user.id, {
    ip: clientIp(req),
    userAgent: req.headers['user-agent'],
  });
  setRefreshCookie(res, refreshToken);
  const token = signAccessToken(user, sessionId);
  const permissions = await getPermissions(user.role);
  return { token, refreshToken, user: publicUser(user), permissions };
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const [rows] = await pool.query(
      'SELECT * FROM users WHERE email = ? AND deleted_at IS NULL LIMIT 1',
      [email.toLowerCase()]
    );
    const user = rows[0];
    // Use a uniform message so the response does not reveal which part failed.
    if (!user || !user.active) return next(unauthorized('Invalid credentials'));

    if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
      return next(
        new AppError(429, 'ACCOUNT_LOCKED', 'Account temporarily locked after too many failed attempts. Try again later.')
      );
    }

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      const attempts = Number(user.failed_attempts || 0) + 1;
      if (attempts >= MAX_FAILED_ATTEMPTS) {
        await pool.query(
          'UPDATE users SET failed_attempts = 0, locked_until = DATE_ADD(NOW(), INTERVAL ? MINUTE) WHERE id = ?',
          [LOCK_MINUTES, user.id]
        );
      } else {
        await pool.query('UPDATE users SET failed_attempts = ? WHERE id = ?', [attempts, user.id]);
      }
      return next(unauthorized('Invalid credentials'));
    }

    await pool.query('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?', [
      user.id,
    ]);

    if (user.mfa_enabled) {
      return sendData(res, { mfaRequired: true, challenge: signMfaChallenge(user) });
    }

    return sendData(res, await issueSession(req, res, user));
  } catch (err) {
    next(err);
  }
}

async function verifyMfa(req, res, next) {
  try {
    const { challenge, code } = req.body;
    let payload;
    try {
      payload = jwt.verify(challenge, process.env.JWT_SECRET);
    } catch {
      return next(unauthorized('Your verification session expired. Please sign in again.'));
    }
    if (payload.purpose !== 'mfa') return next(unauthorized('Invalid verification session'));

    const [rows] = await pool.query(
      'SELECT * FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1',
      [payload.id]
    );
    const user = rows[0];
    if (!user || !user.active || !user.mfa_enabled) return next(unauthorized('Invalid credentials'));

    if (!verifyToken(user.mfa_secret, code)) {
      return next(unauthorized('Invalid authentication code'));
    }
    return sendData(res, await issueSession(req, res, user));
  } catch (err) {
    next(err);
  }
}

async function refresh(req, res, next) {
  try {
    const token = req.body?.refreshToken || req.cookies?.[REFRESH_COOKIE];
    const session = await findActiveSession(pool, token);
    if (!session) return next(unauthorized('Session expired, please sign in again'));

    const [rows] = await pool.query(
      'SELECT * FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1',
      [session.user_id]
    );
    const user = rows[0];
    if (!user || !user.active) {
      await revokeSession(pool, session.id);
      clearRefreshCookie(res);
      return next(unauthorized('Account is no longer active'));
    }

    const newRefresh = await rotateSession(pool, session.id, {
      ip: clientIp(req),
      userAgent: req.headers['user-agent'],
    });
    setRefreshCookie(res, newRefresh);
    const accessToken = signAccessToken(user, session.id);
    const permissions = await getPermissions(user.role);
    return sendData(res, { token: accessToken, refreshToken: newRefresh, user: publicUser(user), permissions });
  } catch (err) {
    next(err);
  }
}

async function logout(req, res, next) {
  try {
    const token = req.body?.refreshToken || req.cookies?.[REFRESH_COOKIE];
    if (token) {
      const session = await findActiveSession(pool, token);
      if (session) await revokeSession(pool, session.id);
    } else if (req.user?.sid) {
      await revokeSession(pool, req.user.sid);
    }
    clearRefreshCookie(res);
    return sendData(res, { loggedOut: true });
  } catch (err) {
    next(err);
  }
}

async function listMySessions(req, res, next) {
  try {
    return sendData(res, await listSessions(pool, req.user.id));
  } catch (err) {
    next(err);
  }
}

async function revokeMySession(req, res, next) {
  try {
    const { id } = req.params;
    const [rows] = await pool.query('SELECT id FROM sessions WHERE id = ? AND user_id = ?', [
      id,
      req.user.id,
    ]);
    if (!rows.length) return next(notFound('Session not found'));
    await revokeSession(pool, id);
    return sendData(res, { revoked: true });
  } catch (err) {
    next(err);
  }
}

async function me(req, res, next) {
  try {
    const [rows] = await pool.query(
      'SELECT id, name, email, phone, role, active, mfa_enabled FROM users WHERE id = ? AND deleted_at IS NULL',
      [req.user.id]
    );
    if (!rows.length) return next(notFound('User not found'));
    const permissions = await getPermissions(rows[0].role);
    return sendData(res, { ...publicUser(rows[0]), permissions });
  } catch (err) {
    next(err);
  }
}

// --- MFA management (self-service) -----------------------------------------

async function mfaSetup(req, res, next) {
  try {
    const [rows] = await pool.query('SELECT id, email, mfa_enabled FROM users WHERE id = ?', [
      req.user.id,
    ]);
    if (!rows.length) return next(notFound('User not found'));
    const secret = generateSecret();
    await pool.query('UPDATE users SET mfa_secret = ? WHERE id = ?', [secret, req.user.id]);
    return sendData(res, {
      secret,
      otpauthUrl: otpauthUri(secret, rows[0].email),
      enabled: !!rows[0].mfa_enabled,
    });
  } catch (err) {
    next(err);
  }
}

async function mfaEnable(req, res, next) {
  try {
    const [rows] = await pool.query('SELECT mfa_secret FROM users WHERE id = ?', [req.user.id]);
    if (!rows.length || !rows[0].mfa_secret) {
      return next(badRequest('Start MFA setup first'));
    }
    if (!verifyToken(rows[0].mfa_secret, req.body.code)) {
      return next(badRequest('Invalid authentication code'));
    }
    await pool.query('UPDATE users SET mfa_enabled = 1 WHERE id = ?', [req.user.id]);
    return sendData(res, { enabled: true });
  } catch (err) {
    next(err);
  }
}

async function mfaDisable(req, res, next) {
  try {
    const [rows] = await pool.query('SELECT password FROM users WHERE id = ?', [req.user.id]);
    if (!rows.length) return next(notFound('User not found'));
    const ok = await bcrypt.compare(req.body.password, rows[0].password);
    if (!ok) return next(badRequest('Password is incorrect'));
    await pool.query('UPDATE users SET mfa_enabled = 0, mfa_secret = NULL WHERE id = ?', [
      req.user.id,
    ]);
    return sendData(res, { enabled: false });
  } catch (err) {
    next(err);
  }
}

async function changePassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.body;
    const [rows] = await pool.query('SELECT password FROM users WHERE id = ?', [req.user.id]);
    if (!rows.length) return next(notFound('User not found'));

    const ok = await bcrypt.compare(currentPassword, rows[0].password);
    if (!ok) return next(badRequest('Current password is incorrect'));

    const hash = await bcrypt.hash(newPassword, 10);
    await pool.query(
      'UPDATE users SET password = ?, token_version = token_version + 1 WHERE id = ?',
      [hash, req.user.id]
    );
    // Revoke every other session; keep the current one signed in.
    await revokeAllForUser(pool, req.user.id, req.user.sid || null);
    return sendData(res, { updated: true });
  } catch (err) {
    next(err);
  }
}

/**
 * Admin/privileged reset of another account's password. Requires the
 * `users.password` permission (admin bypasses all checks). All of the target
 * user's sessions are revoked so they must sign in again with the new password.
 */
async function changeUserPassword(req, res, next) {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(
      'SELECT id, name, email FROM users WHERE id = ? AND deleted_at IS NULL',
      [id]
    );
    if (!rows.length) return next(notFound('User not found'));

    const hash = await bcrypt.hash(req.body.password, 10);
    await pool.query(
      'UPDATE users SET password = ?, token_version = token_version + 1 WHERE id = ?',
      [hash, id]
    );
    await revokeAllForUser(pool, id);

    return sendData(res, { updated: true });
  } catch (err) {
    next(err);
  }
}

async function forgotPassword(req, res, next) {
  try {
    const { email } = req.body;
    const [rows] = await pool.query(
      'SELECT id, name FROM users WHERE email = ? AND deleted_at IS NULL LIMIT 1',
      [email.toLowerCase()]
    );
    // Always respond success to avoid user enumeration.
    if (rows.length) {
      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = hashToken(token);
      const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await pool.query('UPDATE users SET reset_token = ?, reset_token_expiry = ? WHERE id = ?', [
        tokenHash,
        expiry,
        rows[0].id,
      ]);

      const base = process.env.APP_URL || 'http://localhost:5173';
      const link = `${base}/reset-password/${token}`;
      await sendMail({
        to: email,
        subject: 'Password reset request',
        html: `<p>Hello ${rows[0].name},</p><p>Reset your password using the link below (valid for 1 hour):</p><p><a href="${link}">${link}</a></p>`,
      });
    }
    return sendData(res, { message: 'If that email exists, a reset link has been sent.' });
  } catch (err) {
    next(err);
  }
}

async function resetPassword(req, res, next) {
  try {
    const { password } = req.body;
    const tokenHash = hashToken(req.params.token);
    const [rows] = await pool.query(
      'SELECT id FROM users WHERE reset_token = ? AND reset_token_expiry > NOW() AND deleted_at IS NULL LIMIT 1',
      [tokenHash]
    );
    if (!rows.length) return next(badRequest('Invalid or expired reset token'));

    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      `UPDATE users
       SET password = ?, reset_token = NULL, reset_token_expiry = NULL,
           failed_attempts = 0, locked_until = NULL, token_version = token_version + 1
       WHERE id = ?`,
      [hash, rows[0].id]
    );
    // A password reset invalidates every existing session.
    await revokeAllForUser(pool, rows[0].id);
    return sendData(res, { updated: true });
  } catch (err) {
    next(err);
  }
}

// --- User management -------------------------------------------------------

async function listUsers(req, res, next) {
  try {
    const { page, limit, offset } = paginate(req.query);
    const search = (req.query.search || '').trim();
    const where = ['deleted_at IS NULL'];
    const params = [];
    if (search) {
      where.push('(name LIKE ? OR email LIKE ? OR phone LIKE ?)');
      const like = `%${search}%`;
      params.push(like, like, like);
    }
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM users WHERE ${where.join(' AND ')}`,
      params
    );
    const [rows] = await pool.query(
      `SELECT id, name, email, phone, role, active, mfa_enabled, created_at
       FROM users WHERE ${where.join(' AND ')}
       ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    return sendData(res, rows.map(publicUser), pageMeta(page, limit, total));
  } catch (err) {
    next(err);
  }
}

async function createUser(req, res, next) {
  try {
    const { name, email, phone, password, role } = req.body;
    if (!(await roleExists(pool, role))) return next(badRequest('Unknown role'));
    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);
    if (existing.length) return next(conflict('A user with that email already exists'));

    const hash = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      'INSERT INTO users (name, email, phone, password, role) VALUES (?, ?, ?, ?, ?)',
      [name, email.toLowerCase(), phone || null, hash, role]
    );
    const [rows] = await pool.query('SELECT id, name, email, phone, role, active FROM users WHERE id = ?', [
      result.insertId,
    ]);
    return sendData(res, publicUser(rows[0]), undefined, 201);
  } catch (err) {
    next(err);
  }
}

async function updateUser(req, res, next) {
  try {
    const { id } = req.params;
    const fields = req.body;
    if (fields.role !== undefined && !(await roleExists(pool, fields.role))) {
      return next(badRequest('Unknown role'));
    }
    const [beforeRows] = await pool.query(
      'SELECT id, name, email, role, active FROM users WHERE id = ? AND deleted_at IS NULL',
      [id]
    );
    if (!beforeRows.length) return next(notFound('User not found'));
    const sets = [];
    const values = [];
    if (fields.name !== undefined) { sets.push('name = ?'); values.push(fields.name); }
    if (fields.email !== undefined) { sets.push('email = ?'); values.push(fields.email.toLowerCase()); }
    if (fields.phone !== undefined) { sets.push('phone = ?'); values.push(fields.phone); }
    if (fields.role !== undefined) { sets.push('role = ?'); values.push(fields.role); }
    if (fields.active !== undefined) { sets.push('active = ?'); values.push(fields.active ? 1 : 0); }

    if (!sets.length) return next(badRequest('No fields to update'));
    // Role or activation changes invalidate existing sessions.
    if (fields.role !== undefined || fields.active === false) {
      sets.push('token_version = token_version + 1');
    }
    values.push(id);
    const [result] = await pool.query(`UPDATE users SET ${sets.join(', ')} WHERE id = ? AND deleted_at IS NULL`, values);
    if (!result.affectedRows) return next(notFound('User not found'));

    if (fields.role !== undefined || fields.active === false) {
      await revokeAllForUser(pool, id);
    }

    const [rows] = await pool.query('SELECT id, name, email, phone, role, active FROM users WHERE id = ?', [id]);
    return sendData(res, publicUser(rows[0]));
  } catch (err) {
    next(err);
  }
}

async function deleteUser(req, res, next) {
  try {
    const { id } = req.params;
    if (Number(id) === req.user.id) return next(badRequest('You cannot deactivate your own account'));
    const [result] = await pool.query(
      'UPDATE users SET active = 0, deleted_at = NOW(), token_version = token_version + 1 WHERE id = ? AND deleted_at IS NULL',
      [id]
    );
    if (!result.affectedRows) return next(notFound('User not found'));
    await revokeAllForUser(pool, id);
    return sendData(res, { deleted: true });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  login,
  verifyMfa,
  refresh,
  logout,
  listMySessions,
  revokeMySession,
  mfaSetup,
  mfaEnable,
  mfaDisable,
  me,
  changePassword,
  changeUserPassword,
  forgotPassword,
  resetPassword,
  listUsers,
  createUser,
  updateUser,
  deleteUser,
};
