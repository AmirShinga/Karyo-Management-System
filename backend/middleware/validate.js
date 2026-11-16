const { ZodError } = require('zod');
const { sendError } = require('../utils/response');

/** Validates req.body against a Zod schema, replacing it with the parsed value. */
function validate(schema) {
  return (req, res, next) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid request body', err.issues);
      }
      next(err);
    }
  };
}

module.exports = { validate };
