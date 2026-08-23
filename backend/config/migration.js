"use strict";

const VALID_MODES =
  new Set([
    "disabled",
    "backfill",
    "shadow",
    "cutover",
  ]);

const VALID_FAILURE_POLICIES =
  new Set([
    "fail-fast",
    "continue",
  ]);

function parseBoolean(
  value,
  fallback
) {
  if (
    value === undefined ||
    value === null ||
    value === ""
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
    normalized ===
    "true"
  ) {
    return true;
  }

  if (
    normalized ===
    "false"
  ) {
    return false;
  }

  return fallback;
}

function parseInteger(
  value,
  fallback = null
) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return fallback;
  }

  const parsed =
    Number.parseInt(
      value,
      10
    );

  return Number.isFinite(
    parsed
  )
    ? parsed
    : fallback;
}

function getMigrationConfig() {
  const mode =
    String(
      process.env
        .MIGRATION_MODE ||
      "disabled"
    )
      .trim()
      .toLowerCase();

  if (
    !VALID_MODES.has(
      mode
    )
  ) {
    throw Object.assign(
      new Error(
        `Unsupported migration mode: ${mode}`
      ),
      {
        code:
          "MIGRATION_MODE_INVALID",
      }
    );
  }

  const batchSize =
    parseInteger(
      process.env
        .MIGRATION_BATCH_SIZE,
      250
    );

  if (
    !Number.isInteger(
      batchSize
    ) ||
    batchSize <
      1 ||
    batchSize >
      5000
  ) {
    throw Object.assign(
      new Error(
        "MIGRATION_BATCH_SIZE must be between 1 and 5000"
      ),
      {
        code:
          "MIGRATION_BATCH_SIZE_INVALID",
      }
    );
  }

  const failurePolicy =
    String(
      process.env
        .MIGRATION_FAILURE_POLICY ||
      "fail-fast"
    )
      .trim()
      .toLowerCase();

  if (
    !VALID_FAILURE_POLICIES
      .has(
        failurePolicy
      )
  ) {
    throw Object.assign(
      new Error(
        `Unsupported migration failure policy: ${failurePolicy}`
      ),
      {
        code:
          "MIGRATION_FAILURE_POLICY_INVALID",
      }
    );
  }

  const batchDelayMs =
    parseInteger(
      process.env
        .MIGRATION_BATCH_DELAY_MS,
      0
    );

  if (
    batchDelayMs <
    0
  ) {
    throw Object.assign(
      new Error(
        "MIGRATION_BATCH_DELAY_MS cannot be negative"
      ),
      {
        code:
          "MIGRATION_BATCH_DELAY_INVALID",
      }
    );
  }

  const maxDocuments =
    parseInteger(
      process.env
        .MIGRATION_MAX_DOCUMENTS,
      null
    );

  if (
    maxDocuments !==
      null &&
    maxDocuments <
      1
  ) {
    throw Object.assign(
      new Error(
        "MIGRATION_MAX_DOCUMENTS must be positive"
      ),
      {
        code:
          "MIGRATION_MAX_DOCUMENTS_INVALID",
      }
    );
  }

  const rollbackWindowHours =
    parseInteger(
      process.env
        .MIGRATION_ROLLBACK_WINDOW_HOURS,
      72
    );

  if (
    rollbackWindowHours <
    1
  ) {
    throw Object.assign(
      new Error(
        "MIGRATION_ROLLBACK_WINDOW_HOURS must be positive"
      ),
      {
        code:
          "MIGRATION_ROLLBACK_WINDOW_INVALID",
      }
    );
  }

  return {
    enabled:
      mode !==
      "disabled",

    mode,

    batchSize,

    failurePolicy,

    dryRun:
      parseBoolean(
        process.env
          .MIGRATION_DRY_RUN,
        false
      ),

    batchDelayMs,

    maxDocuments,

    logEveryBatch:
      parseBoolean(
        process.env
          .MIGRATION_LOG_EVERY_BATCH,
        true
      ),

    shadowReadsEnabled:
      parseBoolean(
        process.env
          .MIGRATION_SHADOW_READS_ENABLED,
        false
      ),

    failOnMismatch:
      parseBoolean(
        process.env
          .MIGRATION_FAIL_ON_MISMATCH,
        true
      ),

    rollbackWindowHours,
  };
}

module.exports = {
  VALID_MODES,
  VALID_FAILURE_POLICIES,
  getMigrationConfig,
};