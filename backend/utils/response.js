/**
 * Uniform API response helpers.
 *   success: { success: true, data, meta? }
 *   error:   { success: false, error: { code, message, details? } }
 */

function sendData(res, data, meta, status = 200) {
  const body = { success: true, data };
  if (meta) body.meta = meta;
  return res.status(status).json(body);
}

function sendError(res, status, code, message, details) {
  const body = { success: false, error: { code, message } };
  if (details !== undefined) body.error.details = details;
  return res.status(status).json(body);
}

class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const badRequest = (msg, details) => new AppError(400, 'VALIDATION_ERROR', msg, details);
const unauthorized = (msg = 'Authentication required') => new AppError(401, 'UNAUTHORIZED', msg);
const forbidden = (msg = 'Insufficient permissions') => new AppError(403, 'FORBIDDEN', msg);
const notFound = (msg = 'Resource not found') => new AppError(404, 'NOT_FOUND', msg);
const conflict = (msg) => new AppError(409, 'CONFLICT', msg);

function paginate(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const rawLimit = parseInt(query.limit, 10) || 20;
  const limit = Math.min(100, Math.max(1, rawLimit));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

function pageMeta(page, limit, total) {
  return { page, limit, total, pages: Math.ceil(total / limit) || 1 };
}

module.exports = {
  sendData,
  sendError,
  AppError,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  paginate,
  pageMeta,
};
