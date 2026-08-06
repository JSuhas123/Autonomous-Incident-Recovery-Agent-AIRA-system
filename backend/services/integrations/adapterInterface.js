"use strict";

/**
 * Adapter interface contract (JSDoc typedef only — no runtime enforcement).
 *
 * Every provider adapter must export an object implementing the methods below.
 * Unimplemented methods should throw an UnsupportedOperationError.
 *
 * @typedef {Object} Adapter
 * @property {(config: object) => Promise<{valid: boolean, errors: string[]}>} validateConfiguration
 * @property {(connection: object) => Promise<{success: boolean, latencyMs?: number, detail?: string}>} testConnection
 * @property {(connection: object, rawPayload: object, headers: object) => Promise<NormalizedEvent>} receiveEvent
 * @property {(rawEvent: object) => NormalizedEvent} normalizeEvent
 * @property {(connection: object, notification: object) => Promise<void>} sendNotification
 * @property {(connection: object) => Promise<{status: string, detail?: string}>} getHealth
 * @property {(connection: object) => Promise<void>} revoke
 */

class UnsupportedOperationError extends Error {
  constructor(provider, method) {
    super(`Adapter "${provider}" does not implement "${method}"`);
    this.code = "UNSUPPORTED_OPERATION";
    this.status = 501;
  }
}

/**
 * Builds a stub adapter that throws UnsupportedOperationError for all methods.
 * Used as a base for partially-implemented adapters.
 */
function makeStubAdapter(provider) {
  const stub = (method) => async () => { throw new UnsupportedOperationError(provider, method); };
  return {
    validateConfiguration: stub("validateConfiguration"),
    testConnection:        stub("testConnection"),
    receiveEvent:          stub("receiveEvent"),
    normalizeEvent:        stub("normalizeEvent"),
    sendNotification:      stub("sendNotification"),
    getHealth:             stub("getHealth"),
    revoke:                stub("revoke"),
  };
}

module.exports = { UnsupportedOperationError, makeStubAdapter };
