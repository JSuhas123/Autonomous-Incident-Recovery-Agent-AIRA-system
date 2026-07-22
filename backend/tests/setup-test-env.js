/**
 * Jest global test environment setup
 *
 * Runs before any test module is loaded.  Sets environment variables that are
 * required by production code paths exercised during testing.
 *
 * IMPORTANT: These values are for testing only — they must never be used in a
 * real deployment.
 */

"use strict";

// Required by auditService._computeSignature() — must be present and >= 32 chars.
if (!process.env.AUDIT_SECRET) {
  process.env.AUDIT_SECRET = "test-audit-secret-32-chars-min!!";
}
