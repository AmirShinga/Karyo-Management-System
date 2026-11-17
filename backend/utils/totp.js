/**
 * Minimal TOTP (RFC 6238) implementation using only Node's crypto module,
 * so no extra dependency is required for MFA. Secrets are Base32 (RFC 4648).
 */
const crypto = require('crypto');

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const DIGITS = 6;
const PERIOD = 30; // seconds

function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(input) {
  const clean = String(input || '')
    .toUpperCase()
    .replace(/=+$/, '')
    .replace(/\s+/g, '');
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** Generates a random Base32 secret (default 20 bytes = 160 bits). */
function generateSecret(bytes = 20) {
  return base32Encode(crypto.randomBytes(bytes));
}

/** Computes the 6-digit TOTP for a given secret at a counter value. */
function hotp(secret, counter) {
  const key = base32Decode(secret);
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 10 ** DIGITS).padStart(DIGITS, '0');
}

function currentCounter(timestamp = Date.now()) {
  return Math.floor(timestamp / 1000 / PERIOD);
}

/**
 * Verifies a submitted code allowing +/- `window` periods for clock drift.
 */
function verifyToken(secret, token, window = 1) {
  const submitted = String(token || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(submitted)) return false;
  const counter = currentCounter();
  for (let offset = -window; offset <= window; offset += 1) {
    if (hotp(secret, counter + offset) === submitted) return true;
  }
  return false;
}

/** Builds the otpauth:// URI used by authenticator apps. */
function otpauthUri(secret, label, issuer = 'Karyo Guest Palace') {
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(PERIOD),
  });
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(label)}?${params.toString()}`;
}

module.exports = { generateSecret, verifyToken, otpauthUri, base32Decode, base32Encode };
