"use strict";

/**
 * Thin helper used by sessionService to attach CSRF secrets.
 * Kept separate from csrfMiddleware to avoid circular dependencies
 * (sessionService → csrfMiddleware → UserSession → sessionService).
 */

const crypto = require("crypto");
const { userSessionRepository } = require("../../persistence/repositories");

function generateCsrfSecret() {
  return crypto.randomBytes(32).toString("hex");
}

function deriveCsrfToken(secret) {
  return crypto.createHmac("sha256", secret).update("csrf-token-v1").digest("hex");
}

async function attachCsrfSecret(session, transaction = null) {
  const secret = generateCsrfSecret();
  await userSessionRepository.updateOne({ _id: session._id }, { csrfSecret: secret }, {}, transaction);
  return deriveCsrfToken(secret);
}

module.exports = { attachCsrfSecret, generateCsrfSecret, deriveCsrfToken };
