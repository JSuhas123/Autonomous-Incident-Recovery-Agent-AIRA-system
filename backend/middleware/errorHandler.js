'use strict';

/**
 * Centralized Express error handler middleware.
 *
 * Mount LAST in server.js:
 *   app.use(require('./middleware/errorHandler'));
 *
 * Any route that calls next(error) or throws inside an async handler will end
 * up here.  The handler normalises the response shape and logs appropriately.
 */

const { loggingService } = require('../services/infrastructure');

/**
 * Attach a status code to an error object so routes can signal 4xx vs 5xx.
 *
 * Example:
 *   const err = new Error('Runbook not found');
 *   err.status = 404;
 *   err.code   = 'NOT_FOUND';
 *   return next(err);
 *
 * @param {string} message
 * @param {number} status
 * @param {string} [code]
 */
function createError(message, status, code) {
  const err = new Error(message);
  err.status = status;
  if (code) err.code = code;
  return err;
}

/**
 * @param {Error} err
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next   eslint-disable-line no-unused-vars
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;
  const isClientError = status >= 400 && status < 500;

  const logPayload = {
    status,
    method: req.method,
    path: req.path,
    tenantId: req.tenant?.id,
    correlationId: req.correlationId,
    message: err.message,
  };

  if (isClientError) {
    loggingService.warn('[api]', logPayload);
  } else {
    loggingService.error('[api]', { ...logPayload, stack: err.stack });
  }

  // Never leak internal stack traces to clients in production.
  const responseMessage =
    isClientError || process.env.NODE_ENV !== 'production'
      ? err.message
      : 'Internal server error';

  res.status(status).json({
    error: responseMessage,
    code: err.code || (status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR'),
  });
}

module.exports = { errorHandler, createError };
