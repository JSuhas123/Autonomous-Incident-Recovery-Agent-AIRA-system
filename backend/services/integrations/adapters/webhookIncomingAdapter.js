"use strict";

const crypto = require("crypto");
const { makeStubAdapter } = require("../adapterInterface");

/**
 * Incoming webhook adapter.
 *
 * Validates HMAC-SHA256 signatures (X-AIRA-Signature header).
 * Non-secret config keys: { webhookPath }
 * Secret: HMAC signing key
 */

const SUPPORTED_ALGOS = new Set(["sha256"]);

const adapter = {
  ...makeStubAdapter("webhook_incoming"),

  async validateConfiguration(config) {
    const errors = [];
    if (!config || typeof config !== "object") {
      errors.push("config must be an object");
      return { valid: false, errors };
    }
    // No required non-secret fields for incoming webhook — the path is auto-generated
    return { valid: true, errors: [] };
  },

  async testConnection(connection) {
    // Nothing to actively test for an incoming webhook — it's passive
    return { success: true, detail: "Incoming webhook endpoint is active." };
  },

  /**
   * Verify the HMAC-SHA256 signature and return the raw payload unchanged.
   * The caller is responsible for persisting and routing the event.
   */
  async receiveEvent(connection, rawPayload, headers) {
    const secret = connection._decryptedSecret;
    if (secret) {
      const sigHeader = headers["x-aira-signature"] ?? headers["x-hub-signature-256"] ?? "";
      const [algo, provided] = sigHeader.split("=");
      if (!SUPPORTED_ALGOS.has(algo)) {
        throw Object.assign(new Error("Invalid or missing signature algorithm"), { status: 401 });
      }
      const body    = typeof rawPayload === "string" ? rawPayload : JSON.stringify(rawPayload);
      const expected = crypto.createHmac("sha256", secret).update(body).digest("hex");
      if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided ?? ""))) {
        throw Object.assign(new Error("Signature mismatch"), { status: 401 });
      }
    }
    return this.normalizeEvent(rawPayload);
  },

  normalizeEvent(rawEvent) {
    return {
      provider:    "webhook_incoming",
      eventType:   rawEvent.eventType ?? rawEvent.event_type ?? "webhook.event",
      title:       rawEvent.title ?? rawEvent.summary ?? "Incoming webhook event",
      severity:    rawEvent.severity ?? "info",
      rawPayload:  rawEvent,
      receivedAt:  new Date().toISOString(),
    };
  },
};

module.exports = adapter;
