/**
 * Refresh-token sessions.
 *
 * Access tokens are short-lived; a rotating refresh token is persisted (hashed)
 * in the `sessions` table so a session can be revoked before the access token
 * expires. Revoked session ids are also tracked in memory for fast checks.
 */
const crypto = require('crypto');
const { pool } = require('../config/db');

const revoked = new Set();

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

function newRefreshToken() {
  return crypto.randomBytes(48).toString('hex');
}

function refreshTtlMs() {
  const days = Number(process.env.REFRESH_TOKEN_DAYS) || 7;
  return days * 24 * 60 * 60 * 1000;
}

async function createSession(db, userId, { ip = null, userAgent = null } = {}) {
  const token = newRefreshToken();
  const expiresAt = new Date(Date.now() + refreshTtlMs());
  const [result] = await db.query(
    `INSERT INTO sessions (user_id, token_hash, ip, user_agent, expires_at)
     VALUES (?, ?, ?, ?, ?)`,
    [userId, hashToken(token), ip, userAgent ? String(userAgent).slice(0, 255) : null, expiresAt]
  );
  return { sessionId: result.insertId, refreshToken: token };
}

async function findActiveSession(db, refreshToken) {
  if (!refreshToken) return null;
  const [rows] = await db.query(
    `SELECT * FROM sessions
     WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > NOW()
     LIMIT 1`,
    [hashToken(refreshToken)]
  );
  return rows[0] || null;
}

/** Rotates the refresh token for a session, returning the new token. */
async function rotateSession(db, sessionId, { ip = null, userAgent = null } = {}) {
  const token = newRefreshToken();
  await db.query(
    `UPDATE sessions
     SET token_hash = ?, last_used_at = NOW(), ip = COALESCE(?, ip),
         user_agent = COALESCE(?, user_agent)
     WHERE id = ?`,
    [hashToken(token), ip, userAgent ? String(userAgent).slice(0, 255) : null, sessionId]
  );
  return token;
}

async function revokeSession(db, sessionId) {
  revoked.add(Number(sessionId));
  await db.query('UPDATE sessions SET revoked_at = NOW() WHERE id = ? AND revoked_at IS NULL', [
    sessionId,
  ]);
}

async function revokeAllForUser(db, userId, exceptSessionId = null) {
  const params = [userId];
  let sql = 'UPDATE sessions SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL';
  if (exceptSessionId) {
    sql += ' AND id <> ?';
    params.push(exceptSessionId);
  }
  const [result] = await db.query(sql, params);
  return result.affectedRows;
}

function isRevoked(sessionId) {
  return revoked.has(Number(sessionId));
}

async function listSessions(db, userId) {
  const [rows] = await db.query(
    `SELECT id, ip, user_agent, created_at, last_used_at, expires_at, revoked_at,
            (revoked_at IS NULL AND expires_at > NOW()) AS active
     FROM sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`,
    [userId]
  );
  return rows.map((row) => ({
    id: row.id,
    ip: row.ip,
    userAgent: row.user_agent,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    active: !!row.active,
  }));
}

/** Loads revoked-but-unexpired session ids into memory at startup. */
async function loadRevoked() {
  try {
    const [rows] = await pool.query(
      'SELECT id FROM sessions WHERE revoked_at IS NOT NULL AND expires_at > NOW()'
    );
    for (const row of rows) revoked.add(Number(row.id));
  } catch (err) {
    console.error('Failed to load revoked sessions:', err.message);
  }
}

module.exports = {
  createSession,
  findActiveSession,
  rotateSession,
  revokeSession,
  revokeAllForUser,
  isRevoked,
  listSessions,
  loadRevoked,
  refreshTtlMs,
};
