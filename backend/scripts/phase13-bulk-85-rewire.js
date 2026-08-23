"use strict";

const fs =
  require(
    "node:fs"
  );

const path =
  require(
    "node:path"
  );


const ROOT =
  process.cwd();


function absolute(
  relative
) {
  return path.resolve(
    ROOT,
    relative
  );
}


function read(
  relative
) {
  const file =
    absolute(
      relative
    );

  if (
    !fs.existsSync(
      file
    )
  ) {
    console.log(
      `[phase13-85] skip missing ${relative}`
    );

    return null;
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
  relative,
  source
) {
  fs.writeFileSync(
    absolute(
      relative
    ),
    source,
    "utf8"
  );

  console.log(
    `[phase13-85] updated ${relative}`
  );
}


function replaceImportLine(
  source,
  modulePath,
  replacement
) {
  const lines =
    source.split(
      "\n"
    );

  /*
   * First handle ordinary one-line requires.
   */
  const result = [];

  let removed =
    false;

  for (
    let index = 0;
    index <
      lines.length;
    index +=
      1
  ) {
    const line =
      lines[index];

    if (
      line.includes(
        modulePath
      )
    ) {
      /*
       * If the module path appears inside a multiline require,
       * walk backwards in output until the `const` declaration.
       */
      if (
        !line.includes(
          "const "
        ) &&
        !line.includes(
          "require"
        )
      ) {
        while (
          result.length >
            0 &&
          !result[
            result.length -
              1
          ]
            .trim()
            .startsWith(
              "const "
            )
        ) {
          result.pop();
        }

        if (
          result.length >
          0
        ) {
          result.pop();
        }

        /*
         * Skip forward until the terminating semicolon.
         */
        while (
          index <
            lines.length -
              1 &&
          !/;\s*$/.test(
            lines[index]
          )
        ) {
          index +=
            1;
        }
      }

      removed =
        true;

      continue;
    }

    result.push(
      line
    );
  }

  let output =
    result.join(
      "\n"
    );

  if (
    removed &&
    replacement
  ) {
    output =
      prepend(
        output,
        replacement
      );
  }

  return output;
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
  block
) {
  return (
    `"use strict";\n\n` +
    block.trim() +
    "\n\n" +
    removeStrict(
      source
    ).replace(
      /^\s+/,
      ""
    )
  );
}


function ensureGone(
  file,
  source,
  values
) {
  const remaining =
    values.filter(
      (
        value
      ) =>
        source.includes(
          value
        )
    );

  if (
    remaining.length >
    0
  ) {
    throw new Error(
      [
        `Still Mongo-coupled: ${file}`,
        ...remaining,
      ].join(
        "\n"
      )
    );
  }
}


// ============================================================================
// KUBERNETES INVENTORY ADAPTER — 4 imports
// ============================================================================

function kubernetesInventoryAdapter() {
  const file =
    "services/inventory/kubernetesInventoryAdapter.js";

  let source =
    read(
      file
    );

  if (
    source ===
    null
  ) {
    return;
  }

  const targets = [
    "../../models/KubernetesResource",
    "../../models/KubernetesResourceRelation",
    "../../models/InfrastructureResource",
    "../../models/ResourceRelationship",
  ];

  for (
    const target
    of targets
  ) {
    source =
      replaceImportLine(
        source,
        target,
        null
      );
  }

  source =
    prepend(
      source,
      `
const {
  KubernetesResource,
  KubernetesResourceRelation,
} =
  require(
    "../../persistence/operational/operationalModels"
  );

const {
  InfrastructureResource,
  ResourceRelationship,
} =
  require(
    "../../persistence/operational/inventoryModels"
  );
      `
    );

  ensureGone(
    file,
    source,
    targets
  );

  write(
    file,
    source
  );
}


// ============================================================================
// DASHBOARD — Service
// ============================================================================

function dashboardRoutes() {
  const file =
    "routes/dashboardRoutes.js";

  let source =
    read(
      file
    );

  if (
    source ===
    null
  ) {
    return;
  }

  source =
    replaceImportLine(
      source,
      "../models/Service",
      null
    );

  source =
    prepend(
      source,
      `
const {
  Service,
} =
  require(
    "../persistence/operational/operationalModels"
  );
      `
    );

  ensureGone(
    file,
    source,
    [
      "../models/Service",
    ]
  );

  write(
    file,
    source
  );
}


// ============================================================================
// RETENTION SERVICE
//
// Leave TenantConfig alone for the identity cleanup pass.
// ============================================================================

function retentionService() {
  const file =
    "services/infrastructure/retentionService.js";

  let source =
    read(
      file
    );

  if (
    source ===
    null
  ) {
    return;
  }

  const extendedTargets = [
    "../../models/DecisionTrace",
    "../../models/FailedMessage",
    "../../models/RetentionArchive",
  ];

  const legacyTargets = [
    "../../models/IncidentMemory",
    "../../models/RunbookExecution",
  ];

  for (
    const target
    of [
      ...extendedTargets,
      ...legacyTargets,
    ]
  ) {
    source =
      replaceImportLine(
        source,
        target,
        null
      );
  }

  source =
    prepend(
      source,
      `
const {
  DecisionTrace,
  FailedMessage,
  RetentionArchive,
} =
  require(
    "../../persistence/operational/extendedModels"
  );

const {
  IncidentMemory,
  RunbookExecution,
} =
  require(
    "../../persistence/operational/legacyModels"
  );
      `
    );

  ensureGone(
    file,
    source,
    [
      ...extendedTargets,
      ...legacyTargets,
    ]
  );

  write(
    file,
    source
  );
}


// ============================================================================
// RETRY HANDLER
// ============================================================================

function retryHandler() {
  const file =
    "services/infrastructure/retryHandler.js";

  let source =
    read(
      file
    );

  if (
    source ===
    null
  ) {
    return;
  }

  source =
    replaceImportLine(
      source,
      "../../models/FailedMessage",
      null
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

  ensureGone(
    file,
    source,
    [
      "../../models/FailedMessage",
    ]
  );

  write(
    file,
    source
  );
}


// ============================================================================
// RETRY PROCESSOR
//
// TenantConfig intentionally remains for the later identity repository pass.
// ============================================================================

function retryProcessor() {
  const file =
    "services/infrastructure/retryProcessorJob.js";

  let source =
    read(
      file
    );

  if (
    source ===
    null
  ) {
    return;
  }

  source =
    replaceImportLine(
      source,
      "../../models/FailedMessage",
      null
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

  ensureGone(
    file,
    source,
    [
      "../../models/FailedMessage",
    ]
  );

  write(
    file,
    source
  );
}


// ============================================================================
// ACTION AUDIT
// ============================================================================

function actionAudit() {
  const file =
    "services/observability/actionAuditService.js";

  let source =
    read(
      file
    );

  if (
    source ===
    null
  ) {
    return;
  }

  source =
    replaceImportLine(
      source,
      "../../models/AuditEvent",
      null
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

  ensureGone(
    file,
    source,
    [
      "../../models/AuditEvent",
    ]
  );

  /*
   * AuditEvent may still be constructed via:
   *
   * new AuditEvent({...})
   *
   * Replace those constructors with repository create.
   */
  source =
    source.replace(
      /new\s+AuditEvent\s*\(/g,
      "await AuditEvent.create("
    );

  write(
    file,
    source
  );
}


// ============================================================================
// MACHINE INGESTION — SERVICE ONLY IN THIS PASS
//
// Incident and AgentIntelligenceRun use canonical repositories and will be
// migrated in the next pass rather than incorrectly putting them in the
// operational document compatibility table.
// ============================================================================

function machineService() {
  const file =
    "routes/machineIngestionRoutes.js";

  let source =
    read(
      file
    );

  if (
    source ===
    null
  ) {
    return;
  }

  source =
    replaceImportLine(
      source,
      "../models/Service",
      null
    );

  source =
    prepend(
      source,
      `
const {
  Service,
} =
  require(
    "../persistence/operational/operationalModels"
  );
      `
    );

  ensureGone(
    file,
    source,
    [
      "../models/Service",
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
  kubernetesInventoryAdapter();

  dashboardRoutes();

  retentionService();

  retryHandler();

  retryProcessor();

  actionAudit();

  machineService();

  console.log(
    "[phase13-85] BULK PASS COMPLETE"
  );
} catch (
  error
) {
  console.error(
    "[phase13-85] FAILED"
  );

  console.error(
    error.stack ||
    error.message
  );

  process.exit(
    1
  );
}