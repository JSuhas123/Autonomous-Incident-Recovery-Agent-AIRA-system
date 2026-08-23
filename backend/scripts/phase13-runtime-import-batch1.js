const fs = require("node:fs");

const changes = [
  // -------------------------------------------------------------------------
  // INCIDENT
  // -------------------------------------------------------------------------
  {
    file: "routes/incidentRoutes.js",
    model: "Incident",
    oldPath: "../models/Incident",
    newPath: "../persistence/operational/canonicalModels",
  },
  {
    file: "services/diagnosis/investigationContextService.js",
    model: "Incident",
    oldPath: "../../models/Incident",
    newPath: "../../persistence/operational/canonicalModels",
  },
  {
    file: "services/incidents/incidentService.js",
    model: "Incident",
    oldPath: "../../models/Incident",
    newPath: "../../persistence/operational/canonicalModels",
  },

  // -------------------------------------------------------------------------
  // SERVICE
  // -------------------------------------------------------------------------
  {
    file: "services/diagnosis/investigationContextService.js",
    model: "Service",
    oldPath: "../../models/Service",
    newPath: "../../persistence/operational/operationalModels",
  },
  {
    file: "services/incidents/incidentImpactService.js",
    model: "Service",
    oldPath: "../../models/Service",
    newPath: "../../persistence/operational/operationalModels",
  },
  {
    file: "services/signals/signalEnrichmentService.js",
    model: "Service",
    oldPath: "../../models/Service",
    newPath: "../../persistence/operational/operationalModels",
  },

  // -------------------------------------------------------------------------
  // INVENTORY
  // -------------------------------------------------------------------------
  {
    file: "services/incidents/incidentImpactService.js",
    model: "InfrastructureResource",
    oldPath: "../../models/InfrastructureResource",
    newPath: "../../persistence/operational/inventoryModels",
  },
  {
    file: "services/incidents/incidentImpactService.js",
    model: "ServiceDependency",
    oldPath: "../../models/ServiceDependency",
    newPath: "../../persistence/operational/inventoryModels",
  },
  {
    file: "services/incidents/incidentImpactService.js",
    model: "ResourceRelationship",
    oldPath: "../../models/ResourceRelationship",
    newPath: "../../persistence/operational/inventoryModels",
  },
  {
    file: "services/signals/signalEnrichmentService.js",
    model: "InfrastructureResource",
    oldPath: "../../models/InfrastructureResource",
    newPath: "../../persistence/operational/inventoryModels",
  },

  // -------------------------------------------------------------------------
  // KUBERNETES
  // -------------------------------------------------------------------------
  {
    file: "services/discovery/kubernetesInventoryService.js",
    model: "KubernetesResource",
    oldPath: "../../models/KubernetesResource",
    newPath: "../../persistence/operational/operationalModels",
  },
  {
    file: "services/discovery/kubernetesRelationshipService.js",
    model: "KubernetesResource",
    oldPath: "../../models/KubernetesResource",
    newPath: "../../persistence/operational/operationalModels",
  },
  {
    file: "services/discovery/kubernetesRelationshipService.js",
    model: "KubernetesResourceRelation",
    oldPath: "../../models/KubernetesResourceRelation",
    newPath: "../../persistence/operational/operationalModels",
  },

  // -------------------------------------------------------------------------
  // MEMORY / RETENTION
  // -------------------------------------------------------------------------
  {
    file: "services/infrastructure/memoryCleanupJob.js",
    model: "IncidentMemory",
    oldPath: "../../models/IncidentMemory",
    newPath: "../../persistence/operational/legacyModels",
  },
  {
    file: "services/infrastructure/memoryCleanupJob.js",
    model: "DecisionTrace",
    oldPath: "../../models/DecisionTrace",
    newPath: "../../persistence/operational/extendedModels",
  },
  {
    file: "services/infrastructure/memoryCleanupJob.js",
    model: "TenantConfig",
    oldPath: "../../models/TenantConfig",
    newPath: "../../persistence/operational/identityModels",
  },
  {
    file: "services/infrastructure/retentionService.js",
    model: "TenantConfig",
    oldPath: "../../models/TenantConfig",
    newPath: "../../persistence/operational/identityModels",
  },
];

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceImport(change) {
  const {
    file,
    model,
    oldPath,
    newPath,
  } = change;

  let source = fs.readFileSync(file, "utf8");

  if (!source.includes(oldPath)) {
    console.log(`[skip] ${file} -> ${model}: old import not present`);
    return false;
  }

  const oldEscaped = escapeRegex(oldPath);

  /*
   * Case A:
   *
   * const Model =
   *   require(
   *     "../../models/Model"
   *   );
   *
   * becomes:
   *
   * const {
   *   Model,
   * } = require(
   *   "../../persistence/operational/..."
   * );
   */
  const defaultImportRegex = new RegExp(
    String.raw`const\s+${model}\s*=\s*require\s*\(\s*["']${oldEscaped}["']\s*\)\s*;?`,
    "m"
  );

  if (defaultImportRegex.test(source)) {
    source = source.replace(
      defaultImportRegex,
      `const {\n  ${model},\n} = require(\n  "${newPath}"\n);`
    );

    fs.writeFileSync(file, source, "utf8");

    console.log(`[updated] ${file} -> ${model}`);
    return true;
  }

  /*
   * Case B:
   *
   * const { Model } =
   *   require("../models/Model");
   *
   * Already destructured, so only the path has to change.
   */
  const destructuredRegex = new RegExp(
    String.raw`(require\s*\(\s*["'])${oldEscaped}(["']\s*\))`,
    "m"
  );

  if (destructuredRegex.test(source)) {
    source = source.replace(
      destructuredRegex,
      `$1${newPath}$2`
    );

    fs.writeFileSync(file, source, "utf8");

    console.log(`[updated-path] ${file} -> ${model}`);
    return true;
  }

  console.error(
    `[FAILED] Could not safely rewrite ${model} in ${file}`
  );

  process.exitCode = 1;
  return false;
}

let updated = 0;

for (const change of changes) {
  if (replaceImport(change)) {
    updated += 1;
  }
}

console.log("");
console.log(
  `[phase13-batch1] ${updated}/${changes.length} imports updated`
);

if (process.exitCode) {
  process.exit(process.exitCode);
}
