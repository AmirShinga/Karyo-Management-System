const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return null;
  }
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return transporter;
}

/**
 * Sends an email. Returns { sent: boolean }. Never throws — email is best-effort.
 * In development without SMTP, logs a notice instead of failing.
 */
async function sendMail({ to, subject, html, text }) {
  const t = getTransporter();
  if (!t) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[mail:skipped] to=${to} subject="${subject}" (SMTP not configured)`);
    }
    return { sent: false };
  }
  try {
    await t.sendMail({
      from: process.env.MAIL_FROM || 'no-reply@example.com',
      to,
      subject,
      html,
      text,
    });
    return { sent: true };
  } catch (err) {
    console.error('Email send failed:', err.message);
    return { sent: false };
  }
}

module.exports = { sendMail };
