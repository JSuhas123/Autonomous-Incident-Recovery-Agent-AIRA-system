"use strict";

const https = require("https");
const http  = require("http");
const { URL } = require("url");
const { makeStubAdapter } = require("../adapterInterface");
const { assertSafeHost } = require("../../../utils/ssrfGuard");

/**
 * Outgoing webhook adapter.
 *
 * Non-secret config: { targetUrl, method, customHeaders (object, auth-stripped) }
 * Secret: optional shared secret added as X-AIRA-Signature header
 */

const METHOD_ALLOW = new Set(["POST", "PUT", "PATCH"]);

const adapter = {
  ...makeStubAdapter("webhook_outgoing"),

  async validateConfiguration(config) {
    const errors = [];
    if (!config?.targetUrl) { errors.push("targetUrl is required"); }
    else {
      try {
        const u = new URL(config.targetUrl);
        if (!["http:", "https:"].includes(u.protocol)) errors.push("targetUrl must use http or https");
      } catch {
        errors.push("targetUrl is not a valid URL");
      }
    }
    if (config.method && !METHOD_ALLOW.has(config.method.toUpperCase())) {
      errors.push("method must be POST, PUT, or PATCH");
    }
    return { valid: errors.length === 0, errors };
  },

  async testConnection(connection) {
    const { targetUrl } = connection.nonSecretConfig ?? {};
    if (!targetUrl) return { success: false, detail: "No targetUrl configured" };

    try {
      const parsed = new URL(targetUrl);
      assertSafeHost(parsed.hostname);

      const t0 = Date.now();
      await _post(targetUrl, { test: true, source: "aira" }, connection);
      return { success: true, latencyMs: Date.now() - t0 };
    } catch (err) {
      return { success: false, detail: err.message };
    }
  },

  async sendNotification(connection, notification) {
    const { targetUrl } = connection.nonSecretConfig ?? {};
    if (!targetUrl) throw new Error("No targetUrl configured");
    const parsed = new URL(targetUrl);
    assertSafeHost(parsed.hostname);
    await _post(targetUrl, notification, connection);
  },
};

async function _post(targetUrl, body, connection) {
  const { customHeaders = {}, method = "POST" } = connection.nonSecretConfig ?? {};
  const secret = connection._decryptedSecret;
  const payload = JSON.stringify(body);

  const headers = {
    "Content-Type":   "application/json",
    "Content-Length": Buffer.byteLength(payload),
    ...customHeaders,
  };

  // Strip any auth-like headers from stored config (defence in depth)
  for (const k of Object.keys(headers)) {
    if (/authorization|cookie|x-api-key/i.test(k)) delete headers[k];
  }

  if (secret) {
    const crypto = require("crypto");
    const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex");
    headers["X-AIRA-Signature"] = `sha256=${sig}`;
  }

  const parsed = new URL(targetUrl);
  const lib    = parsed.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    const req = lib.request(
      { hostname: parsed.hostname, port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
        path: parsed.pathname + parsed.search, method: method.toUpperCase(), headers },
      (res) => {
        res.resume();
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(Object.assign(new Error(`HTTP ${res.statusCode}`), { statusCode: res.statusCode }));
        } else {
          resolve(res.statusCode);
        }
      }
    );
    req.on("error", reject);
    req.setTimeout(10000, () => req.destroy(new Error("Request timed out")));
    req.write(payload);
    req.end();
  });
}

module.exports = adapter;
