"use strict";

/**
 * Phase 13 — Inventory + Kubernetes Discovery Bulk Rewire
 *
 * This version is intentionally strict.
 *
 * It:
 * 1. removes direct mongoose imports,
 * 2. removes direct inventory/service/integration model imports,
 * 3. injects provider-neutral compatibility imports,
 * 4. replaces ObjectId-only validation,
 * 5. verifies every target file after writing,
 * 6. throws if ANY targeted Mongo dependency remains.
 *
 * Run from backend:
 *
 *   node scripts/phase13-inventory-rewire.js
 */

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


// ============================================================================
// BASIC IO
// ============================================================================

function resolveFile(
  relativePath
) {
  return path.resolve(
    ROOT,
    relativePath
  );
}


function readFile(
  relativePath
) {
  const absolute =
    resolveFile(
      relativePath
    );

  if (
    !fs.existsSync(
      absolute
    )
  ) {
    throw new Error(
      `File not found: ${relativePath}`
    );
  }

  return fs.readFileSync(
    absolute,
    "utf8"
  );
}


function writeFile(
  relativePath,
  source
) {
  fs.writeFileSync(
    resolveFile(
      relativePath
    ),
    source,
    "utf8"
  );

  console.log(
    `[phase13-inventory-rewire] updated ${relativePath}`
  );
}


// ============================================================================
// TEXT HELPERS
// ============================================================================

function removeRequire(
  source,
  modulePath
) {
  const escaped =
    modulePath.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );

  /*
   * Supports:
   *
   * const X = require("...");
   *
   * const X =
   *   require(
   *     "..."
   *   );
   *
   * const { X } =
   *   require(
   *     "..."
   *   );
   */
  const patterns = [
    new RegExp(
      `const\\s+[A-Za-z0-9_$]+\\s*=\\s*require\\(\\s*["']${escaped}["']\\s*\\);?\\s*`,
      "g"
    ),

    new RegExp(
      `const\\s+[A-Za-z0-9_$]+\\s*=\\s*require\\s*\\(\\s*["']${escaped}["']\\s*\\)\\s*;?\\s*`,
      "g"
    ),

    new RegExp(
      `const\\s+[A-Za-z0-9_$]+\\s*=\\s*\\r?\\n\\s*require\\s*\\(\\s*\\r?\\n\\s*["']${escaped}["']\\s*\\r?\\n\\s*\\)\\s*;?\\s*`,
      "g"
    ),

    new RegExp(
      `const\\s*\\{[\\s\\S]*?\\}\\s*=\\s*require\\(\\s*["']${escaped}["']\\s*\\);?\\s*`,
      "g"
    ),

    new RegExp(
      `const\\s*\\{[\\s\\S]*?\\}\\s*=\\s*\\r?\\n\\s*require\\s*\\(\\s*\\r?\\n\\s*["']${escaped}["']\\s*\\r?\\n\\s*\\)\\s*;?\\s*`,
      "g"
    ),
  ];

  let output =
    source;

  for (
    const pattern
    of patterns
  ) {
    output =
      output.replace(
        pattern,
        ""
      );
  }

  return output;
}


function removeMongoose(
  source
) {
  return removeRequire(
    source,
    "mongoose"
  );
}


function replaceObjectIdValidation(
  source
) {
  /*
   * Handles both:
   *
   * mongoose.Types.ObjectId.isValid(value)
   *
   * mongoose.Types.ObjectId
   *   .isValid(
   *     value
   *   )
   */
  return source.replace(
    /mongoose\s*\.\s*Types\s*\.\s*ObjectId\s*\.\s*isValid\s*\(/g,
    "isDatabaseIdentifier("
  );
}


function insertAfterStrict(
  source,
  block
) {
  const strictPattern =
    /^["']use strict["'];?\s*/;

  const match =
    source.match(
      strictPattern
    );

  if (
    !match
  ) {
    throw new Error(
      `"use strict" not found`
    );
  }

  const rest =
    source.slice(
      match[0].length
    );

  return (
    `"use strict";\n\n` +
    block.trim() +
    "\n\n" +
    rest.replace(
      /^\s+/,
      ""
    )
  );
}


function assertGone(
  relativePath,
  source,
  patterns
) {
  const failures = [];

  for (
    const pattern
    of patterns
  ) {
    if (
      pattern.test(
        source
      )
    ) {
      failures.push(
        pattern.toString()
      );
    }
  }

  if (
    failures.length >
    0
  ) {
    throw new Error(
      [
        `Rewire incomplete for ${relativePath}`,
        ...failures.map(
          (
            value
          ) =>
            `  remaining: ${value}`
        ),
      ].join(
        "\n"
      )
    );
  }
}


// ============================================================================
// INVENTORY SERVICE
// ============================================================================

function rewriteInventoryService() {
  const file =
    "services/inventory/inventoryService.js";

  let source =
    readFile(
      file
    );

  source =
    removeMongoose(
      source
    );

  source =
    removeRequire(
      source,
      "../../models/InfrastructureResource"
    );

  source =
    replaceObjectIdValidation(
      source
    );

  source =
    insertAfterStrict(
      source,
      `
const {
  isDatabaseIdentifier,
} =
  require(
    "../../utils/identifier"
  );

const {
  InfrastructureResource,
} =
  require(
    "../../persistence/operational/inventoryModels"
  );
      `
    );

  assertGone(
    file,
    source,
    [
      /require\s*\(\s*["']mongoose["']/,
      /models\/InfrastructureResource/,
      /mongoose\.Types\.ObjectId/,
    ]
  );

  writeFile(
    file,
    source
  );
}


// ============================================================================
// TOPOLOGY SERVICE
// ============================================================================

function rewriteTopologyService() {
  const file =
    "services/inventory/topologyService.js";

  let source =
    readFile(
      file
    );

  source =
    removeMongoose(
      source
    );

  source =
    removeRequire(
      source,
      "../../models/Service"
    );

  source =
    removeRequire(
      source,
      "../../models/InfrastructureResource"
    );

  source =
    removeRequire(
      source,
      "../../models/ServiceDependency"
    );

  source =
    removeRequire(
      source,
      "../../models/ResourceRelationship"
    );

  source =
    replaceObjectIdValidation(
      source
    );

  source =
    insertAfterStrict(
      source,
      `
const {
  isDatabaseIdentifier,
} =
  require(
    "../../utils/identifier"
  );

const {
  Service,
} =
  require(
    "../../persistence/operational/operationalModels"
  );

const {
  InfrastructureResource,
  ServiceDependency,
  ResourceRelationship,
} =
  require(
    "../../persistence/operational/inventoryModels"
  );
      `
    );

  assertGone(
    file,
    source,
    [
      /require\s*\(\s*["']mongoose["']/,
      /models\/Service["']/,
      /models\/InfrastructureResource/,
      /models\/ServiceDependency/,
      /models\/ResourceRelationship/,
      /mongoose\.Types\.ObjectId/,
    ]
  );

  writeFile(
    file,
    source
  );
}


// ============================================================================
// SERVICE DEPENDENCY SERVICE
// ============================================================================

function rewriteServiceDependencyService() {
  const file =
    "services/inventory/serviceDependencyService.js";

  let source =
    readFile(
      file
    );

  source =
    removeMongoose(
      source
    );

  source =
    removeRequire(
      source,
      "../../models/Service"
    );

  source =
    removeRequire(
      source,
      "../../models/ServiceDependency"
    );

  source =
    replaceObjectIdValidation(
      source
    );

  source =
    insertAfterStrict(
      source,
      `
const {
  isDatabaseIdentifier,
} =
  require(
    "../../utils/identifier"
  );

const {
  Service,
} =
  require(
    "../../persistence/operational/operationalModels"
  );

const {
  ServiceDependency,
} =
  require(
    "../../persistence/operational/inventoryModels"
  );
      `
    );

  assertGone(
    file,
    source,
    [
      /require\s*\(\s*["']mongoose["']/,
      /models\/Service["']/,
      /models\/ServiceDependency/,
      /mongoose\.Types\.ObjectId/,
    ]
  );

  writeFile(
    file,
    source
  );
}


// ============================================================================
// RESOURCE RELATIONSHIP SERVICE
// ============================================================================

function rewriteResourceRelationshipService() {
  const file =
    "services/inventory/resourceRelationshipService.js";

  let source =
    readFile(
      file
    );

  source =
    removeMongoose(
      source
    );

  source =
    removeRequire(
      source,
      "../../models/Service"
    );

  source =
    removeRequire(
      source,
      "../../models/InfrastructureResource"
    );

  source =
    removeRequire(
      source,
      "../../models/ResourceRelationship"
    );

  source =
    replaceObjectIdValidation(
      source
    );

  source =
    insertAfterStrict(
      source,
      `
const {
  isDatabaseIdentifier,
} =
  require(
    "../../utils/identifier"
  );

const {
  Service,
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

  assertGone(
    file,
    source,
    [
      /require\s*\(\s*["']mongoose["']/,
      /models\/Service["']/,
      /models\/InfrastructureResource/,
      /models\/ResourceRelationship/,
      /mongoose\.Types\.ObjectId/,
    ]
  );

  writeFile(
    file,
    source
  );
}


// ============================================================================
// KUBERNETES DISCOVERY ROUTES
// ============================================================================

function rewriteKubernetesDiscoveryRoutes() {
  const file =
    "routes/kubernetesDiscoveryRoutes.js";

  let source =
    readFile(
      file
    );

  source =
    removeMongoose(
      source
    );

  source =
    removeRequire(
      source,
      "../models/IntegrationConnection"
    );

  source =
    replaceObjectIdValidation(
      source
    );

  source =
    insertAfterStrict(
      source,
      `
const {
  isDatabaseIdentifier,
} =
  require(
    "../utils/identifier"
  );

const {
  IntegrationConnection,
} =
  require(
    "../persistence/operational/operationalModels"
  );
      `
    );

  assertGone(
    file,
    source,
    [
      /require\s*\(\s*["']mongoose["']/,
      /models\/IntegrationConnection/,
      /mongoose\.Types\.ObjectId/,
    ]
  );

  writeFile(
    file,
    source
  );
}


// ============================================================================
// EXECUTION
// ============================================================================

function main() {
  console.log(
    "[phase13-inventory-rewire] starting strict rewrite"
  );

  rewriteInventoryService();

  rewriteTopologyService();

  rewriteServiceDependencyService();

  rewriteResourceRelationshipService();

  rewriteKubernetesDiscoveryRoutes();

  console.log(
    "[phase13-inventory-rewire] SUCCESS — all targeted imports removed"
  );
}


try {
  main();
} catch (
  error
) {
  console.error(
    "[phase13-inventory-rewire] FAILED"
  );

  console.error(
    error.stack ||
    error.message
  );

  process.exit(
    1
  );
}