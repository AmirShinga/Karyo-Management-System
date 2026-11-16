/**
 * Startup environment validation.
 *
 * Fails fast with a clear message when a required secret/config value is
 * missing, instead of discovering it at request time (e.g. jwt.sign throwing
 * because JWT_SECRET is undefined).
 */

const WEAK_SECRETS = new Set([
  'change-me-to-a-long-random-secret',
  'secret',
  'changeme',
  'jwtsecret',
  'test',
]);

function isProduction() {
  return process.env.NODE_ENV === 'production';
}

/**
 * Validates the environment. Throws an Error listing every problem so the
 * process can exit before serving traffic.
 */
function assertEnv() {
  const problems = [];
  const warnings = [];

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    problems.push('JWT_SECRET is required (generate one: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))")');
  } else if (jwtSecret.length < 16) {
    problems.push('JWT_SECRET is too short (use at least 32 random characters)');
  } else if (WEAK_SECRETS.has(jwtSecret.toLowerCase())) {
    if (isProduction()) problems.push('JWT_SECRET is a known placeholder value; set a strong secret');
    else warnings.push('JWT_SECRET looks like a placeholder; use a strong random value before deploying');
  }

  for (const key of ['DB_HOST', 'DB_USER', 'DB_NAME']) {
    if (!process.env[key]) problems.push(`${key} is required`);
  }

  if (isProduction()) {
    if (!process.env.CORS_ORIGIN) {
      problems.push('CORS_ORIGIN must be set in production (comma-separated allowed origins)');
    }
    if ((process.env.CORS_ORIGIN || '').includes('localhost')) {
      warnings.push('CORS_ORIGIN still includes localhost in production');
    }
  }

  const expiresIn = process.env.JWT_EXPIRES_IN || '15m';
  const accessMinutes = parseExpiryMinutes(expiresIn);
  if (accessMinutes > 60) {
    warnings.push(`JWT_EXPIRES_IN is ${expiresIn}; short-lived access tokens (<= 1h) are recommended`);
  }

  if (warnings.length) {
    for (const warning of warnings) console.warn(`[env] warning: ${warning}`);
  }

  if (problems.length) {
    const err = new Error(`Invalid environment configuration:\n  - ${problems.join('\n  - ')}`);
    err.code = 'ENV_VALIDATION_ERROR';
    throw err;
  }

  return {
    accessTokenTtl: expiresIn,
    refreshTokenDays: Number(process.env.REFRESH_TOKEN_DAYS) || 7,
  };
}

/** Best-effort conversion of a JWT expiry string to minutes (for warnings). */
function parseExpiryMinutes(value) {
  const match = /^(\d+)\s*([smhd])$/.exec(String(value).trim());
  if (!match) return 0;
  const amount = Number(match[1]);
  const unit = match[2];
  const perUnit = { s: 1 / 60, m: 1, h: 60, d: 60 * 24 };
  return amount * (perUnit[unit] || 0);
}

module.exports = { assertEnv, isProduction, parseExpiryMinutes };
