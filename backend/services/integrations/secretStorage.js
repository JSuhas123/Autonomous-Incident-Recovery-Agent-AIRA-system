"use strict";

/**
 * Secret storage abstraction.
 *
 * Strategy selection (in priority order):
 *   1. External secret manager — not yet configured; reserved for future.
 *   2. AES-256-GCM encryption with a server-side master key from INTEGRATION_SECRET_KEY env.
 *
 * Secrets are stored as base64-encoded ciphertext blobs.
 * The decrypted value is NEVER returned to the API caller after initial creation.
 */

const crypto = require("crypto");

const ALGORITHM  = "aes-256-gcm";
const IV_BYTES   = 12;   // 96-bit IV for GCM
const TAG_BYTES  = 16;

function getMasterKey() {
  const raw = process.env.INTEGRATION_SECRET_KEY ?? process.env.AUDIT_SECRET ?? "dev-only-insecure-key-32chars!!!";
  // Derive a 32-byte key regardless of input length
  return crypto.createHash("sha256").update(raw).digest();
}

/**
 * Encrypt a plaintext secret.
 * @returns {string} base64-encoded "iv:tag:ciphertext"
 */
function encryptSecret(plaintext) {
  const key = getMasterKey();
  const iv  = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const enc1 = cipher.update(plaintext, "utf8");
  const enc2 = cipher.final();
  const tag  = cipher.getAuthTag();
  const blob = Buffer.concat([iv, tag, enc1, enc2]);
  return blob.toString("base64");
}

/**
 * Decrypt a secret stored by encryptSecret.
 * @returns {string} plaintext
 */
function decryptSecret(blob) {
  const key = getMasterKey();
  const buf = Buffer.from(blob, "base64");
  const iv  = buf.subarray(0, IV_BYTES);
  const tag = buf.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = buf.subarray(IV_BYTES + TAG_BYTES);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const dec1 = decipher.update(ciphertext);
  const dec2 = decipher.final();
  return Buffer.concat([dec1, dec2]).toString("utf8");
}

/**
 * Mask a secret value for display: shows first 4 chars then asterisks.
 */
function maskSecret(plaintext) {
  if (!plaintext || plaintext.length < 5) return "****";
  return plaintext.slice(0, 4) + "*".repeat(Math.min(plaintext.length - 4, 20));
}

module.exports = { encryptSecret, decryptSecret, maskSecret };
