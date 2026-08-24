"use strict";

/**
 * ============================================================================
 * PHASE 11.14 â€” PRODUCTION CONFIGURATION VALIDATION
 * ============================================================================
 *
 * PURPOSE
 *
 * Fail startup before infrastructure initialization when configuration is:
 *
 * - missing
 * - malformed
 * - insecure
 * - contradictory
 * - using unsafe production defaults
 *
 * IMPORTANT
 *
 * This module validates configuration only.
 *
 * It does NOT:
 *
 * - connect to dependencies
 * - mutate infrastructure
 * - grant execution authority
 * - call process.exit()
 *
 * Callers decide how a validation failure terminates startup.
 */


// ============================================================================
// CONSTANTS
// ============================================================================

const ENVIRONMENT = Object.freeze({
  DEVELOPMENT:
    "development",

  TEST:
    "test",

  PRODUCTION:
    "production",
});


const MIN_SECRET_LENGTH =
  32;


const MIN_STRONG_SECRET_LENGTH =
  48;


const DEFAULT_PRODUCTION_FRONTENDS = [
  "https://autonomous-incident-recovery-agent-ten.vercel.app",
  "https://autonomous-incident-recovery-agent-aira-system-id1961ym5.vercel.app",
];


const NUMERIC_RULES = Object.freeze({
  SESSION_IDLE_TIMEOUT_MS: {
    min:
      60000,

    max:
      24 *
      60 *
      60 *
      1000,
  },


  SESSION_ABSOLUTE_TIMEOUT_MS: {
    min:
      5 *
      60 *
      1000,

    max:
      30 *
      24 *
      60 *
      60 *
      1000,
  },


  SESSION_REMEMBER_ME_TIMEOUT_MS: {
    min:
      60 *
      60 *
      1000,

    max:
      180 *
      24 *
      60 *
      60 *
      1000,
  },


  SESSION_ACTIVITY_THROTTLE_MS: {
    min:
      1000,

    max:
      10 *
      60 *
      1000,
  },


  APPLICATION_SHUTDOWN_TIMEOUT_MS: {
    min:
      5000,

    max:
      120000,
  },


  SERVER_SHUTDOWN_TIMEOUT_MS: {
    min:
      5000,

    max:
      120000,
  },


  WORKFLOW_OUTBOX_SHUTDOWN_TIMEOUT_MS: {
    min:
      1000,

    max:
      60000,
  },


  QUEUE_MAX_IN_FLIGHT_PUBLISHES: {
    min:
      1,

    max:
      10000,
  },


  QUEUE_PUBLISH_DRAIN_TIMEOUT_MS: {
    min:
      100,

    max:
      60000,
  },


  QUEUE_PUBLISH_RETRY_AFTER_MS: {
    min:
      100,

    max:
      60000,
  },


  RETENTION_JOB_INTERVAL_MINUTES: {
    min:
      1,

    max:
      1440,
  },


  RETENTION_MAX_PATTERN_OCCURRENCES: {
    min:
      10,

    max:
      10000,
  },


  PORT: {
    min:
      1,

    max:
      65535,
  },
});


// ============================================================================
// HELPERS
// ============================================================================

function hasValue(
  value
) {
  return (
    value !==
      undefined &&
    value !==
      null &&
    String(
      value
    )
      .trim() !==
      ""
  );
}


function redactValue(
  name,
  value
) {
  if (
    !hasValue(
      value
    )
  ) {
    return null;
  }


  const sensitiveNames = [
    "SECRET",
    "TOKEN",
    "PASSWORD",
    "KEY",
    "URI",
    "URL",
  ];


  const upper =
    String(
      name
    )
      .toUpperCase();


  if (
    sensitiveNames
      .some(
        (
          fragment
        ) =>
          upper.includes(
            fragment
          )
      )
  ) {
    return "[REDACTED]";
  }


  return String(
    value
  );
}


function parseBoolean(
  value,
  fallback =
    false
) {
  if (
    value ===
      undefined ||
    value ===
      null ||
    value ===
      ""
  ) {
    return fallback;
  }


  const normalized =
    String(
      value
    )
      .trim()
      .toLowerCase();


  if (
    [
      "true",
      "1",
      "yes",
      "on",
    ]
      .includes(
        normalized
      )
  ) {
    return true;
  }


  if (
    [
      "false",
      "0",
      "no",
      "off",
    ]
      .includes(
        normalized
      )
  ) {
    return false;
  }


  return fallback;
}


function parseInteger(
  value
) {
  if (
    !hasValue(
      value
    )
  ) {
    return null;
  }


  if (
    !/^-?\d+$/
      .test(
        String(
          value
        )
          .trim()
      )
  ) {
    return null;
  }


  const parsed =
    Number.parseInt(
      String(
        value
      ),
      10
    );


  return Number.isSafeInteger(
    parsed
  )
    ? parsed
    : null;
}


function parseOrigins(
  raw
) {
  if (
    !hasValue(
      raw
    )
  ) {
    return [];
  }


  return String(
    raw
  )
    .split(
      ","
    )
    .map(
      (
        value
      ) =>
        value
          .trim()
          .replace(
            /\/+$/,
            ""
          )
    )
    .filter(
      Boolean
    );
}


function isValidUrl(
  value,
  allowedProtocols
) {
  if (
    !hasValue(
      value
    )
  ) {
    return false;
  }


  try {
    const parsed =
      new URL(
        String(
          value
        )
      );


    return allowedProtocols
      .includes(
        parsed.protocol
      );
  } catch {
    return false;
  }
}


function isLoopbackHost(
  hostname
) {
  const normalized =
    String(
      hostname ||
      ""
    )
      .toLowerCase();


  return (
    normalized ===
      "localhost" ||
    normalized ===
      "127.0.0.1" ||
    normalized ===
      "::1"
  );
}


function urlUsesLoopback(
  value
) {
  if (
    !hasValue(
      value
    )
  ) {
    return false;
  }


  try {
    const parsed =
      new URL(
        String(
          value
        )
      );


    return isLoopbackHost(
      parsed.hostname
    );
  } catch {
    return false;
  }
}


function looksLikePlaceholderSecret(
  value
) {
  if (
    !hasValue(
      value
    )
  ) {
    return false;
  }


  const normalized =
    String(
      value
    )
      .trim()
      .toLowerCase();


  const forbiddenFragments = [
    "changeme",
    "change-me",
    "replace-me",
    "replace_me",
    "example",
    "default",
    "development",
    "dev-secret",
    "test-secret",
    "your-secret",
    "your_secret",
    "password",
    "secret123",
    "aira-integration-test-key",
    "aira-ip-salt",
  ];


  return forbiddenFragments
    .some(
      (
        fragment
      ) =>
        normalized.includes(
          fragment
        )
    );
}


function hasEnoughCharacterVariety(
  value
) {
  const text =
    String(
      value ||
      ""
    );


  const classes = [
    /[a-z]/,
    /[A-Z]/,
    /\d/,
    /[^a-zA-Z0-9]/,
  ];


  const matched =
    classes
      .reduce(
        (
          count,
          pattern
        ) =>
          count +
          (
            pattern.test(
              text
            )
              ? 1
              : 0
          ),
        0
      );


  return matched >=
    3;
}


function addError(
  errors,
  code,
  variable,
  message
) {
  errors.push({
    severity:
      "ERROR",

    code,

    variable,

    message,
  });
}


function addWarning(
  warnings,
  code,
  variable,
  message
) {
  warnings.push({
    severity:
      "WARNING",

    code,

    variable,

    message,
  });
}


// ============================================================================
// SECRET VALIDATION
// ============================================================================

function validateSecret({
  env,
  errors,
  warnings,
  name,
  minimumLength =
    MIN_SECRET_LENGTH,
  production,
  required =
    false,
}) {
  const value =
    env[
      name
    ];


  if (
    !hasValue(
      value
    )
  ) {
    if (
      required
    ) {
      addError(
        errors,
        "CONFIG_SECRET_MISSING",
        name,
        `${name} is required`
      );
    }


    return;
  }


  if (
    String(
      value
    ).length <
    minimumLength
  ) {
    addError(
      errors,
      "CONFIG_SECRET_TOO_SHORT",
      name,
      `${name} must be at least ${minimumLength} characters`
    );
  }


  if (
    production &&
    looksLikePlaceholderSecret(
      value
    )
  ) {
    addError(
      errors,
      "CONFIG_PLACEHOLDER_SECRET",
      name,
      `${name} appears to contain a placeholder/default value`
    );
  }


  if (
    production &&
    String(
      value
    ).length >=
      minimumLength &&
    !hasEnoughCharacterVariety(
      value
    )
  ) {
    addWarning(
      warnings,
      "CONFIG_SECRET_LOW_VARIETY",
      name,
      `${name} has low character variety; use a cryptographically generated secret`
    );
  }
}


// ============================================================================
// URL VALIDATION
// ============================================================================

function validateDependencyUrl({
  env,
  errors,
  warnings,
  name,
  protocols,
  production,
  required =
    false,
}) {
  const value =
    env[
      name
    ];


  if (
    !hasValue(
      value
    )
  ) {
    if (
      required
    ) {
      addError(
        errors,
        "CONFIG_DEPENDENCY_URL_MISSING",
        name,
        `${name} is required`
      );
    }


    return;
  }


  if (
    !isValidUrl(
      value,
      protocols
    )
  ) {
    addError(
      errors,
      "CONFIG_DEPENDENCY_URL_INVALID",
      name,
      `${name} must use one of: ${protocols.join(", ")}`
    );


    return;
  }


  if (
    production &&
    urlUsesLoopback(
      value
    )
  ) {
    addWarning(
      warnings,
      "CONFIG_PRODUCTION_LOOPBACK_DEPENDENCY",
      name,
      `${name} points to localhost/loopback in production`
    );
  }
}


// ============================================================================
// NUMERIC VALIDATION
// ============================================================================

function validateNumericRules(
  env,
  errors
) {
  for (
    const [
      name,
      rule,
    ]
    of Object.entries(
      NUMERIC_RULES
    )
  ) {
    if (
      !hasValue(
        env[
          name
        ]
      )
    ) {
      continue;
    }


    const parsed =
      parseInteger(
        env[
          name
        ]
      );


    if (
      parsed ===
      null
    ) {
      addError(
        errors,
        "CONFIG_INTEGER_INVALID",
        name,
        `${name} must be an integer`
      );


      continue;
    }


    if (
      parsed <
        rule.min ||
      parsed >
        rule.max
    ) {
      addError(
        errors,
        "CONFIG_INTEGER_OUT_OF_RANGE",
        name,
        `${name} must be between ${rule.min} and ${rule.max}`
      );
    }
  }
}


// ============================================================================
// CORS
// ============================================================================

function validateCors(
  env,
  errors,
  warnings,
  production
) {
  /*
   * server.js uses CORS_ORIGINS.
   *
   * Keep CORS_ORIGIN compatibility only as a migration warning.
   */
  const canonical =
    env
      .CORS_ORIGINS;


  const legacy =
    env
      .CORS_ORIGIN;


  if (
    !hasValue(
      canonical
    )
  ) {
    if (
      production
    ) {
      addError(
        errors,
        "CONFIG_CORS_ORIGINS_MISSING",
        "CORS_ORIGINS",
        "CORS_ORIGINS is required in production"
      );
    }


    if (
      hasValue(
        legacy
      )
    ) {
      addWarning(
        warnings,
        "CONFIG_LEGACY_CORS_VARIABLE",
        "CORS_ORIGIN",
        "CORS_ORIGIN is legacy; server.js uses CORS_ORIGINS"
      );
    }


    return;
  }


  const origins =
    parseOrigins(
      canonical
    );


  if (
    origins.length ===
    0
  ) {
    addError(
      errors,
      "CONFIG_CORS_ORIGINS_EMPTY",
      "CORS_ORIGINS",
      "CORS_ORIGINS must contain at least one origin"
    );


    return;
  }


  const seen =
    new Set();


  for (
    const origin
    of origins
  ) {
    if (
      origin ===
      "*"
    ) {
      addError(
        errors,
        "CONFIG_CORS_WILDCARD_FORBIDDEN",
        "CORS_ORIGINS",
        'CORS_ORIGINS must not contain "*"'
      );


      continue;
    }


    if (
      seen.has(
        origin
      )
    ) {
      addWarning(
        warnings,
        "CONFIG_CORS_DUPLICATE_ORIGIN",
        "CORS_ORIGINS",
        `Duplicate CORS origin: ${origin}`
      );
    }


    seen.add(
      origin
    );


    if (
      !isValidUrl(
        origin,
        [
          "http:",
          "https:",
        ]
      )
    ) {
      addError(
        errors,
        "CONFIG_CORS_ORIGIN_INVALID",
        "CORS_ORIGINS",
        `Invalid CORS origin: ${origin}`
      );


      continue;
    }


    if (
      production
    ) {
      try {
        const parsed =
          new URL(
            origin
          );


        if (
          parsed.protocol !==
          "https:" &&
          !isLoopbackHost(
            parsed.hostname
          )
        ) {
          addError(
            errors,
            "CONFIG_CORS_HTTPS_REQUIRED",
            "CORS_ORIGINS",
            `Production CORS origin must use HTTPS: ${origin}`
          );
        }
      } catch {
        // Already reported above.
      }
    }
  }


  if (
    production
  ) {
    const missingKnownFrontends =
      DEFAULT_PRODUCTION_FRONTENDS
        .filter(
          (
            origin
          ) =>
            !seen.has(
              origin
            )
        );


    if (
      missingKnownFrontends.length >
      0
    ) {
      addWarning(
        warnings,
        "CONFIG_KNOWN_FRONTEND_NOT_ALLOWED",
        "CORS_ORIGINS",
        `Known production frontend origin(s) absent: ${missingKnownFrontends.join(", ")}`
      );
    }
  }
}


// ============================================================================
// SESSION CONFIGURATION
// ============================================================================

function validateSessionConfiguration(
  env,
  errors,
  warnings,
  production
) {
  const idle =
    parseInteger(
      env
        .SESSION_IDLE_TIMEOUT_MS
    );


  const absolute =
    parseInteger(
      env
        .SESSION_ABSOLUTE_TIMEOUT_MS
    );


  const remember =
    parseInteger(
      env
        .SESSION_REMEMBER_ME_TIMEOUT_MS
    );


  if (
    idle !==
      null &&
    absolute !==
      null &&
    idle >
      absolute
  ) {
    addError(
      errors,
      "CONFIG_SESSION_IDLE_EXCEEDS_ABSOLUTE",
      "SESSION_IDLE_TIMEOUT_MS",
      "SESSION_IDLE_TIMEOUT_MS must not exceed SESSION_ABSOLUTE_TIMEOUT_MS"
    );
  }


  if (
    absolute !==
      null &&
    remember !==
      null &&
    remember <
      absolute
  ) {
    addError(
      errors,
      "CONFIG_REMEMBER_TIMEOUT_TOO_SHORT",
      "SESSION_REMEMBER_ME_TIMEOUT_MS",
      "SESSION_REMEMBER_ME_TIMEOUT_MS must be >= SESSION_ABSOLUTE_TIMEOUT_MS"
    );
  }


  if (
    production &&
    !hasValue(
      env
        .IP_HASH_SALT
    )
  ) {
    addError(
      errors,
      "CONFIG_IP_HASH_SALT_MISSING",
      "IP_HASH_SALT",
      "IP_HASH_SALT is required in production; the session service default must not be used"
    );
  }


  if (
    production &&
    looksLikePlaceholderSecret(
      env
        .IP_HASH_SALT
    )
  ) {
    addError(
      errors,
      "CONFIG_IP_HASH_SALT_INSECURE",
      "IP_HASH_SALT",
      "IP_HASH_SALT must not use the built-in/default development value"
    );
  }


  if (
    production &&
    hasValue(
      env
        .IP_HASH_SALT
    ) &&
    String(
      env
        .IP_HASH_SALT
    ).length <
      MIN_SECRET_LENGTH
  ) {
    addWarning(
      warnings,
      "CONFIG_IP_HASH_SALT_SHORT",
      "IP_HASH_SALT",
      `IP_HASH_SALT should be at least ${MIN_SECRET_LENGTH} characters`
    );
  }
}


// ============================================================================
// DEPLOYMENT MODE
// ============================================================================

function validateDeploymentMode(
  env,
  errors,
  warnings,
  production
) {
  const nodeInstanceId =
    env
      .NODE_INSTANCE_ID;


  if (
    hasValue(
      nodeInstanceId
    )
  ) {
    if (
      !/^[a-zA-Z0-9._-]{1,128}$/
        .test(
          String(
            nodeInstanceId
          )
        )
    ) {
      addError(
        errors,
        "CONFIG_NODE_INSTANCE_ID_INVALID",
        "NODE_INSTANCE_ID",
        "NODE_INSTANCE_ID may contain only letters, numbers, dot, underscore and hyphen"
      );
    }


    if (
      !hasValue(
        env
          .REDIS_URL
      )
    ) {
      addError(
        errors,
        "CONFIG_MULTI_INSTANCE_REDIS_REQUIRED",
        "REDIS_URL",
        "REDIS_URL is mandatory when NODE_INSTANCE_ID enables multi-instance mode"
      );
    }
  } else if (
    production
  ) {
    addWarning(
      warnings,
      "CONFIG_SINGLE_INSTANCE_PRODUCTION",
      "NODE_INSTANCE_ID",
      "NODE_INSTANCE_ID is not set; AIRA will treat this deployment as single-instance"
    );
  }


  const shutdown =
    parseInteger(
      env
        .SERVER_SHUTDOWN_TIMEOUT_MS ||
      env
        .APPLICATION_SHUTDOWN_TIMEOUT_MS
    );


  const outboxShutdown =
    parseInteger(
      env
        .WORKFLOW_OUTBOX_SHUTDOWN_TIMEOUT_MS
    );


  if (
    shutdown !==
      null &&
    outboxShutdown !==
      null &&
    outboxShutdown >=
      shutdown
  ) {
    addError(
      errors,
      "CONFIG_OUTBOX_SHUTDOWN_EXCEEDS_GLOBAL",
      "WORKFLOW_OUTBOX_SHUTDOWN_TIMEOUT_MS",
      "WORKFLOW_OUTBOX_SHUTDOWN_TIMEOUT_MS must be lower than the global shutdown timeout"
    );
  }
}


// ============================================================================
// RUNTIME SAFETY FLAGS
// ============================================================================

function validateRuntimeSafety(
  env,
  errors,
  warnings,
  production
) {
  if (
    !production
  ) {
    return;
  }


  if (
    parseBoolean(
      env
        .ALLOW_UNSAFE_EXECUTION,
      false
    )
  ) {
    addError(
      errors,
      "CONFIG_UNSAFE_EXECUTION_ENABLED",
      "ALLOW_UNSAFE_EXECUTION",
      "Unsafe execution bypasses are forbidden in production"
    );
  }


  if (
    parseBoolean(
      env
        .DISABLE_POLICY_ENGINE,
      false
    )
  ) {
    addError(
      errors,
      "CONFIG_POLICY_ENGINE_DISABLED",
      "DISABLE_POLICY_ENGINE",
      "Policy engine cannot be disabled in production"
    );
  }


  if (
    parseBoolean(
      env
        .DISABLE_AUDIT,
      false
    )
  ) {
    addError(
      errors,
      "CONFIG_AUDIT_DISABLED",
      "DISABLE_AUDIT",
      "Audit recording cannot be disabled in production"
    );
  }


  if (
    parseBoolean(
      env
        .SKIP_STARTUP_RECOVERY,
      false
    )
  ) {
    addError(
      errors,
      "CONFIG_STARTUP_RECOVERY_DISABLED",
      "SKIP_STARTUP_RECOVERY",
      "Durable startup recovery cannot be disabled in production"
    );
  }


  if (
    env
      .LOG_LEVEL &&
    ![
      "error",
      "warn",
      "info",
      "debug",
    ]
      .includes(
        String(
          env
            .LOG_LEVEL
        )
          .toLowerCase()
      )
  ) {
    addError(
      errors,
      "CONFIG_LOG_LEVEL_INVALID",
      "LOG_LEVEL",
      "LOG_LEVEL must be one of error, warn, info or debug"
    );
  }


  if (
    String(
      env
        .LOG_LEVEL ||
      ""
    )
      .toLowerCase() ===
      "debug"
  ) {
    addWarning(
      warnings,
      "CONFIG_DEBUG_LOGGING_PRODUCTION",
      "LOG_LEVEL",
      "Debug logging is enabled in production"
    );
  }
}

function validatePostgresConfiguration({
  env,
  errors,
  warnings,
  production,
}) {
  const enabled =
    parseBoolean(
      env.POSTGRES_ENABLED,
      false
    );

  if (
    !enabled
  ) {
    return;
  }

  const connectionString =
    env.DATABASE_URL ||
    env.POSTGRES_URL ||
    null;

  // ==========================================================================
  // CONNECTION
  // ==========================================================================

  if (
    connectionString
  ) {
    if (
      !isValidUrl(
        connectionString,
        [
          "postgres:",
          "postgresql:",
        ]
      )
    ) {
      addError(
        errors,
        "CONFIG_POSTGRES_URL_INVALID",
        env.DATABASE_URL
          ? "DATABASE_URL"
          : "POSTGRES_URL",
        "PostgreSQL connection URL must use postgres:// or postgresql://"
      );
    }

    if (
      production &&
      urlUsesLoopback(
        connectionString
      )
    ) {
      addWarning(
        warnings,
        "CONFIG_POSTGRES_PRODUCTION_LOOPBACK",
        env.DATABASE_URL
          ? "DATABASE_URL"
          : "POSTGRES_URL",
        "Production PostgreSQL connection points to localhost/loopback"
      );
    }
  } else {
    if (
      !hasValue(
        env.POSTGRES_HOST
      ) &&
      production
    ) {
      addError(
        errors,
        "CONFIG_POSTGRES_HOST_MISSING",
        "POSTGRES_HOST",
        "POSTGRES_HOST is required when PostgreSQL is enabled without DATABASE_URL"
      );
    }

    if (
      !hasValue(
        env.POSTGRES_DATABASE
      ) &&
      production
    ) {
      addError(
        errors,
        "CONFIG_POSTGRES_DATABASE_MISSING",
        "POSTGRES_DATABASE",
        "POSTGRES_DATABASE is required when PostgreSQL is enabled without DATABASE_URL"
      );
    }

    if (
      !hasValue(
        env.POSTGRES_USER
      ) &&
      production
    ) {
      addError(
        errors,
        "CONFIG_POSTGRES_USER_MISSING",
        "POSTGRES_USER",
        "POSTGRES_USER is required when PostgreSQL is enabled without DATABASE_URL"
      );
    }

    if (
      !hasValue(
        env.POSTGRES_PASSWORD
      ) &&
      production
    ) {
      addError(
        errors,
        "CONFIG_POSTGRES_PASSWORD_MISSING",
        "POSTGRES_PASSWORD",
        "POSTGRES_PASSWORD is required in production when DATABASE_URL is not used"
      );
    }
  }

  // ==========================================================================
  // PORT
  // ==========================================================================

  if (
    hasValue(
      env.POSTGRES_PORT
    )
  ) {
    const port =
      parseInteger(
        env.POSTGRES_PORT
      );

    if (
      port ===
      null
    ) {
      addError(
        errors,
        "CONFIG_POSTGRES_PORT_INVALID",
        "POSTGRES_PORT",
        "POSTGRES_PORT must be an integer"
      );
    } else if (
      port <
        1 ||
      port >
        65535
    ) {
      addError(
        errors,
        "CONFIG_POSTGRES_PORT_OUT_OF_RANGE",
        "POSTGRES_PORT",
        "POSTGRES_PORT must be between 1 and 65535"
      );
    }
  }

  // ==========================================================================
  // POOL LIMITS
  // ==========================================================================

  const poolMin =
    hasValue(
      env.POSTGRES_POOL_MIN
    )
      ? parseInteger(
          env.POSTGRES_POOL_MIN
        )
      : 0;

  const poolMax =
    hasValue(
      env.POSTGRES_POOL_MAX
    )
      ? parseInteger(
          env.POSTGRES_POOL_MAX
        )
      : 20;

  if (
    poolMin ===
    null ||
    poolMin <
      0 ||
    poolMin >
      100
  ) {
    addError(
      errors,
      "CONFIG_POSTGRES_POOL_MIN_INVALID",
      "POSTGRES_POOL_MIN",
      "POSTGRES_POOL_MIN must be an integer between 0 and 100"
    );
  }

  if (
    poolMax ===
    null ||
    poolMax <
      1 ||
    poolMax >
      200
  ) {
    addError(
      errors,
      "CONFIG_POSTGRES_POOL_MAX_INVALID",
      "POSTGRES_POOL_MAX",
      "POSTGRES_POOL_MAX must be an integer between 1 and 200"
    );
  }

  if (
    poolMin !==
      null &&
    poolMax !==
      null &&
    poolMin >
      poolMax
  ) {
    addError(
      errors,
      "CONFIG_POSTGRES_POOL_RANGE_INVALID",
      "POSTGRES_POOL_MIN",
      "POSTGRES_POOL_MIN cannot exceed POSTGRES_POOL_MAX"
    );
  }

  // ==========================================================================
  // TIMEOUTS
  // ==========================================================================

  const timeoutRules = [
    {
      name:
        "POSTGRES_IDLE_TIMEOUT_MS",

      minimum:
        1000,
    },

    {
      name:
        "POSTGRES_CONNECTION_TIMEOUT_MS",

      minimum:
        100,
    },

    {
      name:
        "POSTGRES_STATEMENT_TIMEOUT_MS",

      minimum:
        100,
    },

    {
      name:
        "POSTGRES_QUERY_TIMEOUT_MS",

      minimum:
        100,
    },
  ];

  for (
    const rule
    of timeoutRules
  ) {
    if (
      !hasValue(
        env[
          rule.name
        ]
      )
    ) {
      continue;
    }

    const value =
      parseInteger(
        env[
          rule.name
        ]
      );

    if (
      value ===
        null ||
      value <
        rule.minimum
    ) {
      addError(
        errors,
        "CONFIG_POSTGRES_TIMEOUT_INVALID",
        rule.name,
        `${rule.name} must be an integer >= ${rule.minimum}`
      );
    }
  }

  // ==========================================================================
  // SSL
  // ==========================================================================

  if (
    production &&
    !parseBoolean(
      env.POSTGRES_SSL,
      false
    )
  ) {
    addWarning(
      warnings,
      "CONFIG_POSTGRES_SSL_DISABLED",
      "POSTGRES_SSL",
      "PostgreSQL TLS is disabled in production"
    );
  }

  if (
    production &&
    parseBoolean(
      env.POSTGRES_SSL,
      false
    ) &&
    !parseBoolean(
      env
        .POSTGRES_SSL_REJECT_UNAUTHORIZED,
      true
    )
  ) {
    addWarning(
      warnings,
      "CONFIG_POSTGRES_SSL_VERIFICATION_DISABLED",
      "POSTGRES_SSL_REJECT_UNAUTHORIZED",
      "PostgreSQL TLS certificate verification is disabled in production"
    );
  }

  // ==========================================================================
  // TRANSACTION ISOLATION
  // ==========================================================================

  if (
    hasValue(
      env.POSTGRES_TRANSACTION_ISOLATION
    )
  ) {
    const isolation =
      String(
        env
          .POSTGRES_TRANSACTION_ISOLATION
      )
        .trim()
        .toUpperCase();

    const allowed = [
      "READ COMMITTED",
      "REPEATABLE READ",
      "SERIALIZABLE",
    ];

    if (
      !allowed.includes(
        isolation
      )
    ) {
      addError(
        errors,
        "CONFIG_POSTGRES_ISOLATION_INVALID",
        "POSTGRES_TRANSACTION_ISOLATION",
        `POSTGRES_TRANSACTION_ISOLATION must be one of ${allowed.join(", ")}`
      );
    }
  }

  // ==========================================================================
  // MIGRATION LOCK
  // ==========================================================================

  if (
    hasValue(
      env.POSTGRES_MIGRATION_LOCK_ID
    )
  ) {
    const lockId =
      parseInteger(
        env
          .POSTGRES_MIGRATION_LOCK_ID
      );

    if (
      lockId ===
        null ||
      lockId <
        1 ||
      lockId >
        2147483647
    ) {
      addError(
        errors,
        "CONFIG_POSTGRES_MIGRATION_LOCK_INVALID",
        "POSTGRES_MIGRATION_LOCK_ID",
        "POSTGRES_MIGRATION_LOCK_ID must be an integer between 1 and 2147483647"
      );
    }
  }
}

// ============================================================================
// MAIN VALIDATION
// ============================================================================

function inspectEnvironment(
  options =
    {}
) {
  const env =
    options.env ||
    process.env;


  const nodeEnvironment =
    String(
      options.nodeEnv ||
      env.NODE_ENV ||
      ENVIRONMENT.DEVELOPMENT
    )
      .trim()
      .toLowerCase();


  const isProduction =
    options.isProduction !==
      undefined
      ? Boolean(
          options.isProduction
        )
      : nodeEnvironment ===
        ENVIRONMENT.PRODUCTION;


  /*
   * ==========================================================================
   * PHASE 13 â€” PERSISTENCE PROVIDER
   * ==========================================================================
   *
   * MongoDB must only be required when Mongo participates in the selected
   * runtime/migration path.
   *
   * This allows the final Phase 13 target:
   *
   *   NODE_ENV=production
   *   PERSISTENCE_PROVIDER=postgres
   *   POSTGRES_ENABLED=true
   *   MIGRATION_MODE=disabled
   *   MONGODB_URI=<absent>
   *
   * to start without MongoDB.
   */

  const persistenceProvider =
    String(
      env
        .PERSISTENCE_PROVIDER ||
      "postgres"
    )
      .trim()
      .toLowerCase();


  const migrationMode =
    String(
      env
        .MIGRATION_MODE ||
      "disabled"
    )
      .trim()
      .toLowerCase();


  /*
   * Mongo is still required while it participates in:
   *
   * - normal Mongo-primary runtime
   * - historical backfill
   * - shadow comparison
   * - migration verification
   *
   * Once PostgreSQL becomes authoritative and migration mode is disabled,
   * Mongo must not be a startup dependency.
   */

  const mongoRequired =
    persistenceProvider ===
      "mongo" ||
    [
      "backfill",
      "shadow",
      "verify",
    ].includes(
      migrationMode
    );


  const errors =
    [];


  const warnings =
    [];


  // ==========================================================================
  // NODE_ENV
  // ==========================================================================

  if (
    !Object.values(
      ENVIRONMENT
    )
      .includes(
        nodeEnvironment
      )
  ) {
    addError(
      errors,
      "CONFIG_NODE_ENV_INVALID",
      "NODE_ENV",
      `NODE_ENV must be one of ${Object.values(ENVIRONMENT).join(", ")}`
    );
  }


  // ==========================================================================
  // PHASE 13 â€” PERSISTENCE PROVIDER VALIDATION
  // ==========================================================================

  if (
    ![
      "mongo",
      "postgres",
    ].includes(
      persistenceProvider
    )
  ) {
    addError(
      errors,
      "CONFIG_PERSISTENCE_PROVIDER_INVALID",
      "PERSISTENCE_PROVIDER",
      "PERSISTENCE_PROVIDER must be either mongo or postgres"
    );
  }


  // ==========================================================================
  // PHASE 13 â€” MIGRATION MODE VALIDATION
  // ==========================================================================

  if (
    ![
      "disabled",
      "backfill",
      "shadow",
      "verify",
      "cutover",
    ].includes(
      migrationMode
    )
  ) {
    addError(
      errors,
      "CONFIG_MIGRATION_MODE_INVALID",
      "MIGRATION_MODE",
      "MIGRATION_MODE must be one of disabled, backfill, shadow, verify or cutover"
    );
  }


  /*
   * Selecting PostgreSQL as the persistence provider while PostgreSQL is
   * disabled is always contradictory configuration.
   */

  if (
    persistenceProvider ===
      "postgres" &&
    !parseBoolean(
      env
        .POSTGRES_ENABLED,
      false
    )
  ) {
    addError(
      errors,
      "CONFIG_POSTGRES_PROVIDER_DISABLED",
      "POSTGRES_ENABLED",
      "POSTGRES_ENABLED must be true when PERSISTENCE_PROVIDER=postgres"
    );
  }


  // ==========================================================================
  // AUDIT SECRETS
  // ==========================================================================

  validateSecret({
    env,

    errors,

    warnings,

    name:
      "AUDIT_SECRET",

    minimumLength:
      MIN_STRONG_SECRET_LENGTH,

    production:
      isProduction,

    required:
      true,
  });


  /*
   * Identity audit service may use a separate HMAC boundary.
   *
   * Require it in production if configured as a separate secret.
   * If absent, the application may intentionally use AUDIT_SECRET,
   * depending on the service implementation.
   */

  if (
    hasValue(
      env
        .AUTH_AUDIT_SECRET
    )
  ) {
    validateSecret({
      env,

      errors,

      warnings,

      name:
        "AUTH_AUDIT_SECRET",

      minimumLength:
        MIN_STRONG_SECRET_LENGTH,

      production:
        isProduction,

      required:
        false,
    });


    if (
      env
        .AUTH_AUDIT_SECRET ===
      env
        .AUDIT_SECRET
    ) {
      addWarning(
        warnings,
        "CONFIG_AUDIT_SECRET_REUSE",
        "AUTH_AUDIT_SECRET",
        "AUTH_AUDIT_SECRET and AUDIT_SECRET are identical; separate keys are preferable"
      );
    }
  }


  // ==========================================================================
  // INTEGRATION SECRET ENCRYPTION
  // ==========================================================================

  validateSecret({
    env,

    errors,

    warnings,

    name:
      "INTEGRATION_SECRET_KEY",

    minimumLength:
      MIN_STRONG_SECRET_LENGTH,

    production:
      isProduction,

    required:
      isProduction,
  });


  // ==========================================================================
  // SESSION / PRIVACY SECRET
  // ==========================================================================

  if (
    hasValue(
      env
        .IP_HASH_SALT
    )
  ) {
    validateSecret({
      env,

      errors,

      warnings,

      name:
        "IP_HASH_SALT",

      minimumLength:
        MIN_SECRET_LENGTH,

      production:
        isProduction,

      required:
        false,
    });
  }


  // ==========================================================================
  // DEPENDENCY URLS
  // ==========================================================================

  /*
   * PHASE 13:
   *
   * MongoDB is no longer universally required in production.
   *
   * It is required only while Mongo participates in the selected runtime or
   * migration mode.
   */

  validateDependencyUrl({
    env,

    errors,

    warnings,

    name:
      "MONGODB_URI",

    protocols: [
      "mongodb:",
      "mongodb+srv:",
    ],

    production:
      isProduction,

    required:
      isProduction &&
      mongoRequired,
  });


  validateDependencyUrl({
    env,

    errors,

    warnings,

    name:
      "REDIS_URL",

    protocols: [
      "redis:",
      "rediss:",
    ],

    production:
      isProduction,

    required:
      isProduction,
  });


  validateDependencyUrl({
    env,

    errors,

    warnings,

    name:
      "RABBITMQ_URL",

    protocols: [
      "amqp:",
      "amqps:",
    ],

    production:
      isProduction,

    required:
      isProduction,
  });


  // ==========================================================================
  // PRODUCTION TRANSPORT ENCRYPTION WARNINGS
  // ==========================================================================

  if (
    isProduction &&
    hasValue(
      env
        .REDIS_URL
    ) &&
    String(
      env
        .REDIS_URL
    )
      .startsWith(
        "redis://"
      ) &&
    !urlUsesLoopback(
      env
        .REDIS_URL
    )
  ) {
    addWarning(
      warnings,
      "CONFIG_REDIS_TRANSPORT_UNENCRYPTED",
      "REDIS_URL",
      "Production Redis uses redis:// rather than rediss://"
    );
  }


  if (
    isProduction &&
    hasValue(
      env
        .RABBITMQ_URL
    ) &&
    String(
      env
        .RABBITMQ_URL
    )
      .startsWith(
        "amqp://"
      ) &&
    !urlUsesLoopback(
      env
        .RABBITMQ_URL
    )
  ) {
    addWarning(
      warnings,
      "CONFIG_RABBITMQ_TRANSPORT_UNENCRYPTED",
      "RABBITMQ_URL",
      "Production RabbitMQ uses amqp:// rather than amqps://"
    );
  }


  // ==========================================================================
  // CORS
  // ==========================================================================

  validateCors(
    env,
    errors,
    warnings,
    isProduction
  );


  // ==========================================================================
  // NUMERIC LIMITS
  // ==========================================================================

  validateNumericRules(
    env,
    errors
  );


  // ==========================================================================
  // CROSS-FIELD VALIDATION
  // ==========================================================================

  validateSessionConfiguration(
    env,
    errors,
    warnings,
    isProduction
  );


  validateDeploymentMode(
    env,
    errors,
    warnings,
    isProduction
  );


  validateRuntimeSafety(
    env,
    errors,
    warnings,
    isProduction
  );


  // ==========================================================================
  // RESULT
  // ==========================================================================

  return {
    valid:
      errors.length ===
      0,

    environment:
      nodeEnvironment,

    production:
      isProduction,

    /*
     * Expose these in the report because Phase 13 status/startup diagnostics
     * need to know which persistence contract was validated.
     */

    persistenceProvider,

    migrationMode,

    mongoRequired,

    errors,

    warnings,

    checkedAt:
      new Date()
        .toISOString(),

    /*
     * Configuration validation can never grant execution authority.
     */

    executionAuthorized:
      false,
  };
}


// ============================================================================
// ERROR TYPE
// ============================================================================

class StartupConfigurationError
  extends Error {
  constructor(
    report
  ) {
    const details =
      report
        .errors
        .map(
          (
            error
          ) =>
            `[${error.code}] ${error.variable}: ${error.message}`
        )
        .join(
          "\n"
        );


    super(
      `AIRA startup configuration validation failed\n${details}`
    );


    this.name =
      "StartupConfigurationError";


    this.code =
      "AIRA_STARTUP_CONFIGURATION_INVALID";


    this.report =
      report;


    this.executionAuthorized =
      false;
  }
}


// ============================================================================
// FAIL-CLOSED VALIDATOR
// ============================================================================

function validateEnvironment(
  options = {}
) {
  const env =
    options.env ||
    process.env;


  const report =
    inspectEnvironment(
      options
    );


  /*
   * ==========================================================================
   * PHASE 13 â€” POSTGRESQL CONFIGURATION
   * ==========================================================================
   *
   * PostgreSQL validation remains layered on top of the established startup
   * configuration validator.
   *
   * PostgreSQL is AIRA's authoritative transactional persistence layer.
   *
   * Once POSTGRES_ENABLED=true, PostgreSQL configuration becomes part of the
   * fail-closed startup contract.
   */

  validatePostgresConfiguration({
    env,

    errors:
      report.errors,

    warnings:
      report.warnings,

    production:
      report.production,
  });


  /*
   * inspectEnvironment() calculated validity before PostgreSQL validation was
   * appended, therefore recompute the final result here.
   */

  report.valid =
    report.errors.length ===
    0;


  if (
    report.warnings.length >
      0 &&
    options
      .silent !==
      true
  ) {
    for (
      const warning
      of report
        .warnings
    ) {
      process.stderr
        .write(
          `[startup-validator] WARNING ${warning.code} ${warning.variable}: ${warning.message}\n`
        );
    }
  }


  if (
    !report.valid
  ) {
    if (
      options
        .silent !==
      true
    ) {
      const lines = [
        "",
        "============================================================",
        "AIRA STARTUP CONFIGURATION VALIDATION FAILED",
        "============================================================",
        "",
        ...report
          .errors
          .map(
            (
              error
            ) =>
              `[${error.code}] ${error.variable}: ${error.message}`
          ),
        "",
        "Correct the configuration before starting AIRA.",
        "",
      ];


      process.stderr
        .write(
          lines.join(
            "\n"
          )
        );
    }


    throw new StartupConfigurationError(
      report
    );
  }


  return report;
}


// ============================================================================
// SAFE DIAGNOSTIC SNAPSHOT
// ============================================================================

function getSafeConfigurationSnapshot(
  env =
    process.env
) {
  const names = [
    "NODE_ENV",
    "NODE_INSTANCE_ID",
    "PORT",

    // ========================================================================
    // PHASE 13 â€” PERSISTENCE SELECTION
    // ========================================================================

    "PERSISTENCE_PROVIDER",
    "MIGRATION_MODE",

    // ========================================================================
    // MONGODB
    // ========================================================================

    "MONGODB_URI",

    // ========================================================================
    // INFRASTRUCTURE
    // ========================================================================

    "REDIS_URL",
    "RABBITMQ_URL",

    // ========================================================================
    // PHASE 13 â€” POSTGRESQL
    // ========================================================================

    "POSTGRES_ENABLED",

    "DATABASE_URL",
    "POSTGRES_URL",

    "POSTGRES_HOST",
    "POSTGRES_PORT",
    "POSTGRES_DATABASE",
    "POSTGRES_USER",
    "POSTGRES_PASSWORD",
    "POSTGRES_APPLICATION_NAME",

    "POSTGRES_POOL_MIN",
    "POSTGRES_POOL_MAX",

    "POSTGRES_IDLE_TIMEOUT_MS",
    "POSTGRES_CONNECTION_TIMEOUT_MS",
    "POSTGRES_STATEMENT_TIMEOUT_MS",
    "POSTGRES_QUERY_TIMEOUT_MS",

    "POSTGRES_SSL",
    "POSTGRES_SSL_REJECT_UNAUTHORIZED",

    "POSTGRES_TRANSACTION_ISOLATION",
    "POSTGRES_MIGRATION_LOCK_ID",

    // ========================================================================
    // APPLICATION SECURITY
    // ========================================================================

    "CORS_ORIGINS",

    "AUDIT_SECRET",
    "AUTH_AUDIT_SECRET",
    "INTEGRATION_SECRET_KEY",
    "IP_HASH_SALT",

    // ========================================================================
    // SESSION
    // ========================================================================

    "SESSION_IDLE_TIMEOUT_MS",
    "SESSION_ABSOLUTE_TIMEOUT_MS",
    "SESSION_REMEMBER_ME_TIMEOUT_MS",

    // ========================================================================
    // SHUTDOWN
    // ========================================================================

    "SERVER_SHUTDOWN_TIMEOUT_MS",
    "APPLICATION_SHUTDOWN_TIMEOUT_MS",
    "WORKFLOW_OUTBOX_SHUTDOWN_TIMEOUT_MS",

    // ========================================================================
    // QUEUE
    // ========================================================================

    "QUEUE_MAX_IN_FLIGHT_PUBLISHES",
    "QUEUE_PUBLISH_DRAIN_TIMEOUT_MS",
    "QUEUE_PUBLISH_RETRY_AFTER_MS",

    // ========================================================================
    // RETENTION
    // ========================================================================

    "RETENTION_JOB_INTERVAL_MINUTES",
    "RETENTION_MAX_PATTERN_OCCURRENCES",

    // ========================================================================
    // LOGGING
    // ========================================================================

    "LOG_LEVEL",
    "LOG_TO_FILE",
  ];


  return Object.fromEntries(
    names.map(
      (
        name
      ) => [
        name,

        hasValue(
          env[
            name
          ]
        )
          ? redactValue(
              name,
              env[
                name
              ]
            )
          : null,
      ]
    )
  );
}


// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  validateEnvironment,

  inspectEnvironment,

  validatePostgresConfiguration,

  getSafeConfigurationSnapshot,

  StartupConfigurationError,

  NUMERIC_RULES,

  ENVIRONMENT,
};


