"use strict";

require("dotenv").config();
/**
 * Jest global test environment setup
 *
 * Runs before any test module is loaded.  Sets environment variables that are
 * required by production code paths exercised during testing.
 *
 * IMPORTANT: These values are for testing only â€” they must never be used in a
 * real deployment.
 */

"use strict";

// Required by auditService._computeSignature() â€” must be present and >= 32 chars.
if (!process.env.AUDIT_SECRET) {
  process.env.AUDIT_SECRET = "test-audit-secret-32-chars-min!!";
}

// Minimal Argon2id parameters for fast test runs
if (!process.env.ARGON2_MEMORY_COST) process.env.ARGON2_MEMORY_COST = "256";
if (!process.env.ARGON2_TIME_COST)   process.env.ARGON2_TIME_COST   = "1";
if (!process.env.ARGON2_PARALLELISM) process.env.ARGON2_PARALLELISM = "1";

