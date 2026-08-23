"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = process.cwd();

function getFile(relativePath) {
  return path.resolve(
    ROOT,
    relativePath
  );
}

function read(relativePath) {
  const file = getFile(
    relativePath
  );

  if (!fs.existsSync(file)) {
    throw new Error(
      `Missing file: ${relativePath}`
    );
  }

  return fs
    .readFileSync(
      file,
      "utf8"
    )
    .replace(
      /\r\n/g,
      "\n"
    );
}

function write(
  relativePath,
  source
) {
  fs.writeFileSync(
    getFile(
      relativePath
    ),
    source,
    "utf8"
  );

  console.log(
    `[phase13] updated ${relativePath}`
  );
}

function removeStrict(
  source
) {
  return source.replace(
    /^\s*["']use strict["'];?\s*/,
    ""
  );
}

function prepend(
  source,
  header
) {
  return (
    `"use strict";\n\n` +
    header.trim() +
    "\n\n" +
    removeStrict(
      source
    ).replace(
      /^\s+/,
      ""
    )
  );
}

function removeLinesContaining(
  source,
  values
) {
  return source
    .split(
      "\n"
    )
    .filter(
      (line) =>
        !values.some(
          (value) =>
            line.includes(
              value
            )
        )
    )
    .join(
      "\n"
    );
}

function requireRemoved(
  file,
  source,
  values
) {
  const remaining =
    values.filter(
      (value) =>
        source.includes(
          value
        )
    );

  if (
    remaining.length
  ) {
    throw new Error(
      [
        `Direct model import still remains in ${file}`,
        ...remaining.map(
          (item) =>
            `  ${item}`
        ),
      ].join(
        "\n"
      )
    );
  }
}


// ============================================================================
// FEEDBACK
// ============================================================================

function feedbackService() {
  const file =
    "services/learning/feedbackService.js";

  let source =
    read(
      file
    );

  /*
   * Remove the exact current one-line imports:
   *
   * const Feedback = require("../../models/Feedback");
   * const FeedbackOutcome = require("../../models/FeedbackOutcome");
   *
   * Also removes a previous compatibility import if this script is rerun.
   */
  source =
    removeLinesContaining(
      source,
      [
        "../../models/Feedback",
        "../../models/FeedbackOutcome",
        "../../persistence/operational/legacyModels",
      ]
    );

  source =
    prepend(
      source,
      `
const {
  Feedback,
  FeedbackOutcome,
} =
  require(
    "../../persistence/operational/legacyModels"
  );
`
    );

  requireRemoved(
    file,
    source,
    [
      "../../models/Feedback",
      "../../models/FeedbackOutcome",
    ]
  );

  write(
    file,
    source
  );
}


// ============================================================================
// MEMORY
// ============================================================================

function memoryService() {
  const file =
    "services/learning/memoryService.js";

  let source =
    read(
      file
    );

  source =
    removeLinesContaining(
      source,
      [
        "../../models/IncidentMemory",
        "../../persistence/operational/legacyModels",
      ]
    );

  source =
    prepend(
      source,
      `
const {
  IncidentMemory,
} =
  require(
    "../../persistence/operational/legacyModels"
  );
`
    );

  requireRemoved(
    file,
    source,
    [
      "../../models/IncidentMemory",
    ]
  );

  write(
    file,
    source
  );
}


// ============================================================================
// SIMULATION
// ============================================================================

function simulationService() {
  const file =
    "services/learning/simulationService.js";

  let source =
    read(
      file
    );

  /*
   * Current file uses single quotes:
   *
   * require('../../models/SimulationResult')
   *
   * Checking by module path makes quote style irrelevant.
   */
  source =
    removeLinesContaining(
      source,
      [
        "../../models/SimulationResult",
        "../../persistence/operational/legacyModels",
      ]
    );

  source =
    prepend(
      source,
      `
const {
  SimulationResult,
} =
  require(
    "../../persistence/operational/legacyModels"
  );
`
    );

  requireRemoved(
    file,
    source,
    [
      "../../models/SimulationResult",
    ]
  );

  write(
    file,
    source
  );
}


// ============================================================================
// RUNBOOK EXECUTION SERVICE
// ============================================================================

function runbookExecutionService() {
  const file =
    "services/execution/runbookExecutionService.js";

  let source =
    read(
      file
    );

  source =
    removeLinesContaining(
      source,
      [
        "../../models/RunbookExecution",
        "../../persistence/operational/legacyModels",
      ]
    );

  /*
   * Convert the direct Mongoose construction to repository-backed creation.
   */
  source =
    source.replace(
      /new\s+RunbookExecution\s*\(\s*executionData\s*\)/g,
      "await RunbookExecution.create(executionData)"
    );

  source =
    prepend(
      source,
      `
const {
  RunbookExecution,
} =
  require(
    "../../persistence/operational/legacyModels"
  );
`
    );

  requireRemoved(
    file,
    source,
    [
      "../../models/RunbookExecution",
    ]
  );

  if (
    /new\s+RunbookExecution\s*\(/.test(
      source
    )
  ) {
    throw new Error(
      `${file} still constructs RunbookExecution directly`
    );
  }

  write(
    file,
    source
  );
}


// ============================================================================
// RUNBOOK ROUTES
// ============================================================================

function runbookRoutes() {
  const file =
    "routes/runbookRoutes.js";

  let source =
    read(
      file
    );

  source =
    removeLinesContaining(
      source,
      [
        "../models/RunbookExecution",
        "../persistence/operational/legacyModels",
      ]
    );

  source =
    prepend(
      source,
      `
const {
  RunbookExecution,
} =
  require(
    "../persistence/operational/legacyModels"
  );
`
    );

  requireRemoved(
    file,
    source,
    [
      "../models/RunbookExecution",
    ]
  );

  write(
    file,
    source
  );
}


// ============================================================================
// MAIN
// ============================================================================

function main() {
  feedbackService();
  memoryService();
  simulationService();
  runbookExecutionService();
  runbookRoutes();

  console.log(
    "[phase13] ALL FIVE FILES REWIRED"
  );
}

try {
  main();
} catch (error) {
  console.error(
    "[phase13] FAILED"
  );

  console.error(
    error.stack ||
    error.message
  );

  process.exit(1);
}