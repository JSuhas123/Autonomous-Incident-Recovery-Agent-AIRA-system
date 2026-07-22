/**
 * Startup Environment Validator
 *
 * Asserts that all required environment variables are present and non-empty
 * before any service initialises. Throws a descriptive error and exits the
 * process with code 1 if any required variable is missing.
 *
 * Call validateProductionEnv() at the very top of startServer(), BEFORE any
 * service connection is attempted.
 */

"use strict";

/**
 * Variables that MUST be set in every environment (dev, staging, production).
 * The process will not start without them.
 */
const REQUIRED_ALWAYS = [
  { name: "AUDIT_SECRET", description: "HMAC secret for audit-trail signatures (min 32 chars)" },
];

/**
 * Variables that MUST be set when NODE_ENV === 'production'.
 * In development/test these can fall back to defaults, but production
 * must be explicit.
 */
const REQUIRED_IN_PRODUCTION = [
  { name: "MONGODB_URI",    description: "MongoDB connection string" },
  { name: "REDIS_URL",      description: "Redis connection URL" },
  { name: "RABBITMQ_URL",   description: "RabbitMQ connection URL" },
  { name: "CORS_ORIGIN",    description: "Allowed CORS origin (must not be *)" },
];

/**
 * Additional checks beyond presence (value-level validation).
 * Returns an error string on failure, null on success.
 */
const VALUE_CHECKS = [
  {
    name: "AUDIT_SECRET",
    check: (v) => v.length >= 32,
    message: "AUDIT_SECRET must be at least 32 characters long",
  },
  {
    name: "CORS_ORIGIN",
    check: (v) => v !== "*",
    message: 'CORS_ORIGIN must not be "*" in production — set a specific origin',
    productionOnly: true,
  },
];

/**
 * Validate environment variables.
 * Throws an error listing all failures so the operator can fix everything
 * in a single restart cycle.
 *
 * @param {{ isProduction?: boolean }} [options]
 */
function validateEnvironment(options = {}) {
  const isProduction =
    options.isProduction !== undefined
      ? options.isProduction
      : process.env.NODE_ENV === "production";

  const errors = [];

  // --- required always ---
  for (const { name, description } of REQUIRED_ALWAYS) {
    const val = process.env[name];
    if (!val || val.trim() === "") {
      errors.push(`  [MISSING] ${name} — ${description}`);
    }
  }

  // --- required in production ---
  if (isProduction) {
    for (const { name, description } of REQUIRED_IN_PRODUCTION) {
      const val = process.env[name];
      if (!val || val.trim() === "") {
        errors.push(`  [MISSING] ${name} — ${description}`);
      }
    }
  }

  // --- value-level checks ---
  for (const { name, check, message, productionOnly } of VALUE_CHECKS) {
    if (productionOnly && !isProduction) continue;
    const val = process.env[name];
    if (val && !check(val)) {
      errors.push(`  [INVALID] ${name} — ${message}`);
    }
  }

  if (errors.length > 0) {
    const lines = [
      "",
      "╔══════════════════════════════════════════════════════════╗",
      "║         AIRA STARTUP VALIDATION FAILED                  ║",
      "╚══════════════════════════════════════════════════════════╝",
      "",
      "The following required environment variables are missing or invalid:",
      "",
      ...errors,
      "",
      "Set the above variables in your .env file (local) or secret store",
      "(Kubernetes Secret / Docker Compose environment) and restart.",
      "",
    ].join("\n");

    // Always write to stderr so it is visible regardless of logging config.
    process.stderr.write(lines + "\n");
    process.exit(1);
  }
}

module.exports = { validateEnvironment };
