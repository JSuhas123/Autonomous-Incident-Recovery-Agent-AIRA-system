"use strict";

const fs = require("node:fs");

function read(file) {
  if (!fs.existsSync(file)) {
    throw new Error(`File not found: ${file}`);
  }

  return fs.readFileSync(file, "utf8");
}

function write(file, source) {
  fs.writeFileSync(file, source, "utf8");
  console.log(`[updated] ${file}`);
}

function replaceRequired(source, oldText, newText, file) {
  if (!source.includes(oldText)) {
    throw new Error(
      `Expected code not found in ${file}:\n${oldText}`
    );
  }

  return source.replace(
    oldText,
    newText
  );
}


// ============================================================================
// 1. SIGNAL DOMAIN CONSTANTS
// ============================================================================

const signalConstantsFile =
  "services/signals/signalConstants.js";

const signalConstants = `"use strict";

/**
 * Canonical Signal domain constants.
 *
 * Phase 13:
 * Runtime services must not import the Mongo/Mongoose Signal model
 * merely to access domain constants.
 */

const SIGNAL_TYPES =
  Object.freeze([
    "alert",
    "log",
    "metric",
    "trace",
    "monitor",
    "event",
    "health",
    "unknown",
  ]);

const SIGNAL_SEVERITIES =
  Object.freeze([
    "unknown",
    "info",
    "warning",
    "critical",
  ]);

const SIGNAL_STATUSES =
  Object.freeze([
    "received",
    "normalized",
    "enriched",
    "correlated",
    "routed",
    "ignored",
    "failed",
  ]);

const SIGNAL_SOURCES =
  Object.freeze([
    "monitor",
    "integration",
    "telemetry",
    "manual",
    "internal",
  ]);

module.exports = {
  SIGNAL_TYPES,
  SIGNAL_SEVERITIES,
  SIGNAL_STATUSES,
  SIGNAL_SOURCES,
};
`;

write(
  signalConstantsFile,
  signalConstants
);


// ============================================================================
// 2. SIGNAL NORMALIZATION SERVICE
// ============================================================================

{
  const file =
    "services/signals/signalNormalizationService.js";

  let source =
    read(file);

  const directModelPattern =
    /const\s*\{\s*SIGNAL_TYPES\s*,\s*SIGNAL_SEVERITIES\s*,\s*SIGNAL_SOURCES\s*,?\s*\}\s*=\s*require\s*\(\s*["']\.\.\/\.\.\/models\/Signal["']\s*\)\s*;?/m;

  if (
    !directModelPattern.test(
      source
    )
  ) {
    throw new Error(
      `Signal constants model import not found in ${file}`
    );
  }

  source =
    source.replace(
      directModelPattern,
`const {
  SIGNAL_TYPES,
  SIGNAL_SEVERITIES,
  SIGNAL_SOURCES,
} = require(
  "./signalConstants"
);`
    );

  write(
    file,
    source
  );
}


// ============================================================================
// 3. INVESTIGATION CONTEXT SERVICE
//    Signal model -> provider-neutral SignalRepository
// ============================================================================

{
  const file =
    "services/diagnosis/investigationContextService.js";

  let source =
    read(file);

  const signalImportPattern =
    /const\s*\{\s*Signal\s*,?\s*\}\s*=\s*require\s*\(\s*["']\.\.\/\.\.\/models\/Signal["']\s*\)\s*;?/m;

  if (
    !signalImportPattern.test(
      source
    )
  ) {
    throw new Error(
      `Signal model import not found in ${file}`
    );
  }

  source =
    source.replace(
      signalImportPattern,
`const {
  signalRepository,
} = require(
  "../../persistence/repositories"
);`
    );

  /*
   * Convert:
   *
   * return Signal
   *   .find({...})
   *   .sort({...})
   *   .limit(...)
   *   .lean();
   *
   * into repository.list().
   *
   * We target the loadSignals method rather than blindly replacing
   * every .find() call in the file.
   */

  const methodStart =
    source.indexOf(
      "async loadSignals("
    );

  if (
    methodStart ===
    -1
  ) {
    throw new Error(
      `loadSignals() not found in ${file}`
    );
  }

  const nextMethod =
    source.indexOf(
      "\n  async ",
      methodStart + 10
    );

  const methodEnd =
    nextMethod === -1
      ? source.length
      : nextMethod;

  let method =
    source.slice(
      methodStart,
      methodEnd
    );

  const mongooseQueryPattern =
    /return\s+Signal\s*\.find\s*\(\s*(\{[\s\S]*?\})\s*\)\s*\.sort\s*\(\s*\{\s*observedAt\s*:\s*1\s*,?\s*\}\s*\)\s*\.limit\s*\(\s*this\.maxSignals\s*\)\s*\.lean\s*\(\s*\)\s*;/m;

  const match =
    method.match(
      mongooseQueryPattern
    );

  if (!match) {
    throw new Error(
      `Expected Signal.find().sort().limit().lean() query not found inside loadSignals() in ${file}`
    );
  }

  const filter =
    match[1];

  const replacement =
`return signalRepository.list(
      ${filter},
      {
        sort: {
          observedAt:
            1,
        },

        limit:
          this.maxSignals,
      }
    );`;

  method =
    method.replace(
      mongooseQueryPattern,
      replacement
    );

  source =
    source.slice(
      0,
      methodStart
    ) +
    method +
    source.slice(
      methodEnd
    );

  write(
    file,
    source
  );
}


// ============================================================================
// 4. WORKFLOW OUTBOX PERSISTENCE SERVICE
//
// Production already uses workflowOutboxRepository.
// The direct model import exists only as migration/test compatibility debt.
// options.WorkflowOutboxEvent injection remains untouched.
// ============================================================================

{
  const file =
    "services/workflowOutbox/workflowOutboxPersistenceService.js";

  let source =
    read(file);

  const modelImportPattern =
    /const\s+WorkflowOutboxEvent\s*=\s*require\s*\(\s*["']\.\.\/\.\.\/models\/WorkflowOutboxEvent["']\s*\)\s*;?/m;

  if (
    modelImportPattern.test(
      source
    )
  ) {
    source =
      source.replace(
        modelImportPattern,
        ""
      );
  } else {
    /*
     * Support destructured formatting as well.
     */
    const destructuredPattern =
      /const\s*\{\s*WorkflowOutboxEvent\s*,?\s*\}\s*=\s*require\s*\(\s*["']\.\.\/\.\.\/models\/WorkflowOutboxEvent["']\s*\)\s*;?/m;

    if (
      destructuredPattern.test(
        source
      )
    ) {
      source =
        source.replace(
          destructuredPattern,
          ""
        );
    } else {
      throw new Error(
        `WorkflowOutboxEvent model import not found in ${file}`
      );
    }
  }

  /*
   * Safety check:
   * We expect test injection to remain available.
   */

  if (
    !source.includes(
      "options.WorkflowOutboxEvent"
    )
  ) {
    console.warn(
      `[warning] ${file} does not contain options.WorkflowOutboxEvent`
    );
  }

  if (
    !source.includes(
      "workflowOutboxRepository"
    )
  ) {
    throw new Error(
      `${file} does not appear to use workflowOutboxRepository`
    );
  }

  write(
    file,
    source
  );
}


console.log("");
console.log(
  "============================================"
);
console.log(
  "PHASE 13 BATCH 2B COMPLETE"
);
console.log(
  "============================================"
);
console.log(
  "Updated:"
);
console.log(
  "  + signalConstants.js"
);
console.log(
  "  + signalNormalizationService.js"
);
console.log(
  "  + investigationContextService.js"
);
console.log(
  "  + workflowOutboxPersistenceService.js"
);
console.log("");
console.log(
  "No idempotency/recovery/worker persistence was modified."
);
