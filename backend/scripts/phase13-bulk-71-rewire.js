"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = process.cwd();

function resolveFile(file) {
  return path.resolve(
    ROOT,
    file
  );
}

function read(file) {
  const target =
    resolveFile(
      file
    );

  if (
    !fs.existsSync(
      target
    )
  ) {
    console.log(
      `[71-pass] skip missing ${file}`
    );

    return null;
  }

  return fs
    .readFileSync(
      target,
      "utf8"
    )
    .replace(
      /\r\n/g,
      "\n"
    );
}

function write(
  file,
  content
) {
  fs.writeFileSync(
    resolveFile(
      file
    ),
    content,
    "utf8"
  );

  console.log(
    `[71-pass] updated ${file}`
  );
}

function stripStrict(
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
    stripStrict(
      source
    ).replace(
      /^\s+/,
      ""
    )
  );
}

function removeRequireByPath(
  source,
  modulePath
) {
  const lines =
    source.split(
      "\n"
    );

  const output = [];

  for (
    let i = 0;
    i < lines.length;
    i += 1
  ) {
    const line =
      lines[i];

    /*
     * One-line require.
     */
    if (
      line.includes(
        modulePath
      )
    ) {
      /*
       * Multiline require: remove backwards to const.
       */
      if (
        !line.includes(
          "const "
        )
      ) {
        while (
          output.length &&
          !output[
            output.length -
              1
          ]
            .trim()
            .startsWith(
              "const "
            )
        ) {
          output.pop();
        }

        if (
          output.length
        ) {
          output.pop();
        }

        while (
          i <
            lines.length -
              1 &&
          !/;\s*$/.test(
            lines[i]
          )
        ) {
          i += 1;
        }
      }

      continue;
    }

    output.push(
      line
    );
  }

  return output.join(
    "\n"
  );
}

function removeMongooseRequire(
  source
) {
  return source
    .replace(
      /const\s+mongoose\s*=\s*require\s*\(\s*["']mongoose["']\s*\)\s*;?\s*/g,
      ""
    )
    .replace(
      /const\s+mongoose\s*=\s*\n\s*require\s*\(\s*\n\s*["']mongoose["']\s*\n\s*\)\s*;?\s*/g,
      ""
    );
}

function replaceObjectIdValidation(
  source
) {
  source =
    source.replace(
      /mongoose\s*\.\s*Types\s*\.\s*ObjectId\s*\.\s*isValid\s*\(/g,
      "isDatabaseIdentifier("
    );

  return source;
}

function assertAbsent(
  file,
  source,
  patterns
) {
  const bad =
    patterns.filter(
      (
        pattern
      ) =>
        pattern.test(
          source
        )
    );

  if (
    bad.length
  ) {
    throw new Error(
      [
        `Incomplete migration: ${file}`,
        ...bad.map(
          (
            pattern
          ) =>
            `  ${pattern}`
        ),
      ].join(
        "\n"
      )
    );
  }
}


// ============================================================================
// KUBERNETES INVESTIGATION TOOL
// ============================================================================

function kubernetesInvestigation() {
  const candidates = [
    "agents/v2/tools/kubernetesInvestigationTool.js",
    "agents/v2/tools/kubernetesInvestigationTools.js",
    "agents/v2/tools/kubernetesInvestigation.js",
  ];

  const file =
    candidates.find(
      (
        candidate
      ) =>
        fs.existsSync(
          resolveFile(
            candidate
          )
        )
    );

  if (!file) {
    console.log(
      "[71-pass] kubernetes investigation filename not found; skipping"
    );

    return;
  }

  let source =
    read(
      file
    );

  source =
    removeRequireByPath(
      source,
      "../../models/KubernetesResource"
    );

  source =
    removeRequireByPath(
      source,
      "../../models/KubernetesResourceRelation"
    );

  source =
    removeRequireByPath(
      source,
      "../../../models/KubernetesResource"
    );

  source =
    removeRequireByPath(
      source,
      "../../../models/KubernetesResourceRelation"
    );

  source =
    prepend(
      source,
      `
const {
  KubernetesResource,
  KubernetesResourceRelation,
} =
  require(
    "../../../persistence/operational/operationalModels"
  );
`
    );

  assertAbsent(
    file,
    source,
    [
      /models\/KubernetesResource["']/,
      /models\/KubernetesResourceRelation/,
    ]
  );

  write(
    file,
    source
  );
}


// ============================================================================
// DLQ
// ============================================================================

function dlqService() {
  const file =
    "services/infrastructure/dlqService.js";

  let source =
    read(
      file
    );

  if (!source) {
    return;
  }

  source =
    removeRequireByPath(
      source,
      "../../models/FailedMessage"
    );

  source =
    prepend(
      source,
      `
const {
  FailedMessage,
} =
  require(
    "../../persistence/operational/extendedModels"
  );
`
    );

  assertAbsent(
    file,
    source,
    [
      /models\/FailedMessage/,
    ]
  );

  write(
    file,
    source
  );
}


// ============================================================================
// ACTION LOG
// ============================================================================

function actionLogService() {
  const file =
    "services/execution/actionLogService.js";

  let source =
    read(
      file
    );

  if (!source) {
    return;
  }

  source =
    removeRequireByPath(
      source,
      "../../models/AuditEvent"
    );

  source =
    prepend(
      source,
      `
const {
  AuditEvent,
} =
  require(
    "../../persistence/operational/extendedModels"
  );
`
    );

  /*
   * Convert Mongoose construction into repository-backed creation.
   */
  source =
    source.replace(
      /new\s+AuditEvent\s*\(/g,
      "await AuditEvent.create("
    );

  assertAbsent(
    file,
    source,
    [
      /models\/AuditEvent/,
    ]
  );

  write(
    file,
    source
  );
}


// ============================================================================
// CIRCUIT BREAKER
// ============================================================================

function circuitBreakerService() {
  const file =
    "services/execution/circuitBreakerService.js";

  let source =
    read(
      file
    );

  if (!source) {
    return;
  }

  source =
    removeRequireByPath(
      source,
      "../../models/IncidentMemory"
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

  assertAbsent(
    file,
    source,
    [
      /models\/IncidentMemory/,
    ]
  );

  write(
    file,
    source
  );
}


// ============================================================================
// INCIDENT IMPACT — MONGOOSE ONLY USED FOR OBJECT ID VALIDATION
// ============================================================================

function incidentImpactService() {
  const file =
    "services/incidents/incidentImpactService.js";

  let source =
    read(
      file
    );

  if (!source) {
    return;
  }

  source =
    removeMongooseRequire(
      source
    );

  source =
    replaceObjectIdValidation(
      source
    );

  source =
    prepend(
      source,
      `
const {
  isDatabaseIdentifier,
} =
  require(
    "../../utils/identifier"
  );
`
    );

  assertAbsent(
    file,
    source,
    [
      /require\s*\(\s*["']mongoose["']/,
      /mongoose\.Types\.ObjectId/,
    ]
  );

  write(
    file,
    source
  );
}


// ============================================================================
// INCIDENT ROUTES — SAME IDENTITY VALIDATION CLEANUP
// ============================================================================

function incidentRoutes() {
  const file =
    "routes/incidentRoutes.js";

  let source =
    read(
      file
    );

  if (!source) {
    return;
  }

  source =
    removeMongooseRequire(
      source
    );

  source =
    replaceObjectIdValidation(
      source
    );

  source =
    prepend(
      source,
      `
const {
  isDatabaseIdentifier,
} =
  require(
    "../utils/identifier"
  );
`
    );

  assertAbsent(
    file,
    source,
    [
      /require\s*\(\s*["']mongoose["']/,
      /mongoose\.Types\.ObjectId/,
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

try {
  kubernetesInvestigation();

  dlqService();

  actionLogService();

  circuitBreakerService();

  incidentImpactService();

  incidentRoutes();

  console.log(
    "[71-pass] SUCCESS"
  );
} catch (
  error
) {
  console.error(
    "[71-pass] FAILED"
  );

  console.error(
    error.stack ||
    error.message
  );

  process.exit(
    1
  );
}