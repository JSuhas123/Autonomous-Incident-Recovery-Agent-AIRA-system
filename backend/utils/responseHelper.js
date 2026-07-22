'use strict';

/**
 * Standardized API response helpers.
 *
 * Usage:
 *   const { sendSuccess, sendError, sendNotFound } = require('../utils/responseHelper');
 *
 *   sendSuccess(res, { data });
 *   sendError(res, 400, 'VALIDATION_ERROR', 'Missing required field');
 *   sendNotFound(res, 'Runbook');
 */

/**
 * Send a successful JSON response.
 * @param {import('express').Response} res
 * @param {object} body   - payload to merge into the response
 * @param {number} [status=200]
 */
function sendSuccess(res, body, status = 200) {
  res.status(status).json(body);
}

/**
 * Send a 201 Created response.
 * @param {import('express').Response} res
 * @param {object} body
 */
function sendCreated(res, body) {
  res.status(201).json(body);
}

/**
 * Send an error JSON response.
 * @param {import('express').Response} res
 * @param {number} status
 * @param {string} code    - machine-readable error code
 * @param {string} message - human-readable message
 * @param {object} [extra] - optional extra fields
 */
function sendError(res, status, code, message, extra = {}) {
  res.status(status).json({ error: message, code, ...extra });
}

/**
 * Shorthand for 400 Bad Request.
 */
function sendBadRequest(res, message, code = 'BAD_REQUEST') {
  sendError(res, 400, code, message);
}

/**
 * Shorthand for 404 Not Found.
 * @param {import('express').Response} res
 * @param {string} resource - e.g. 'Runbook', 'Approval'
 */
function sendNotFound(res, resource) {
  sendError(res, 404, 'NOT_FOUND', `${resource} not found`);
}

/**
 * Shorthand for 409 Conflict (duplicate key, idempotency collision, etc.).
 */
function sendConflict(res, message) {
  sendError(res, 409, 'CONFLICT', message);
}

/**
 * Shorthand for 503 Service Unavailable.
 */
function sendServiceUnavailable(res, message) {
  sendError(res, 503, 'SERVICE_UNAVAILABLE', message);
}

module.exports = {
  sendSuccess,
  sendCreated,
  sendError,
  sendBadRequest,
  sendNotFound,
  sendConflict,
  sendServiceUnavailable,
};
