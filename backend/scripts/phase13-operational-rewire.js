"use strict";

/**
 * Phase 13 Operational Platform Bulk Rewire
 *
 * Rewrites:
 *
 * routes/monitorRoutes.js
 * routes/serviceRoutes.js
 * routes/integrationRoutes.js
 * services/discovery/kubernetesTopologyService.js
 *
 * It removes direct Mongoose/model ownership and points those
 * production paths at persistence/operational/operationalModels.
 *
 * Run ONCE from backend:
 *
 *   node scripts/phase13-operational-rewire.js
 */

const fs =
  require(
    "node:fs"
  );

const path =
  require(
    "node:path"
  );

const root =
  path.resolve(
    process.cwd()
  );


function rewrite(
  relativePath,
  transform
) {
  const file =
    path.join(
      root,
      relativePath
    );

  const before =
    fs.readFileSync(
      file,
      "utf8"
    );

  const after =
    transform(
      before
    );

  if (
    before ===
    after
  ) {
    throw new Error(
      `No change produced for ${relativePath}`
    );
  }

  fs.writeFileSync(
    file,
    after,
    "utf8"
  );

  console.log(
    `[phase13-operational-rewire] updated ${relativePath}`
  );
}


// ============================================================================
// MONITOR ROUTES
// ============================================================================

rewrite(
  "routes/monitorRoutes.js",
  (
    source
  ) => {
    source =
      source.replace(
        /const Monitor = require\("\.\.\/models\/Monitor"\);\r?\nconst MonitorCheck = require\("\.\.\/models\/MonitorCheck"\);\r?\nconst Service = require\("\.\.\/models\/Service"\);\r?\n\r?\nconst \{\r?\n\s*sanitizeHeaders,\r?\n\} = require\("\.\.\/models\/Monitor"\);/,

        `const {
  Monitor,
  MonitorCheck,
  Service,
  sanitizeHeaders,
} = require("../persistence/operational/operationalModels");`
      );

    return source;
  }
);


// ============================================================================
// SERVICE ROUTES
// ============================================================================

rewrite(
  "routes/serviceRoutes.js",
  (
    source
  ) => {
    source =
      source.replace(
        /const mongoose = require\("mongoose"\);\r?\n\r?\nconst Service = require\("\.\.\/models\/Service"\);/,

        `const { isDatabaseIdentifier } = require("../utils/identifier");

const {
  Service,
  SERVICE_TYPES,
  SERVICE_ENVS,
  SERVICE_STATUSES,
  VERIFICATION_STATUSES,
  MONITORING_STATUSES,
} = require("../persistence/operational/operationalModels");`
      );

    source =
      source.replace(
        /\r?\nconst \{\r?\n\s*SERVICE_TYPES,\r?\n\s*SERVICE_ENVS,\r?\n\s*SERVICE_STATUSES,\r?\n\s*VERIFICATION_STATUSES,\r?\n\s*MONITORING_STATUSES,\r?\n\} = require\("\.\.\/models\/Service"\);/,
        ""
      );

    source =
      source.replace(
        /mongoose\.Types\.ObjectId\.isValid\(/g,
        "isDatabaseIdentifier("
      );

    return source;
  }
);


// ============================================================================
// INTEGRATION ROUTES
// ============================================================================

rewrite(
  "routes/integrationRoutes.js",
  (
    source
  ) => {
    source =
      source.replace(
        /const mongoose = require\("mongoose"\);/,

        `const { isDatabaseIdentifier } = require("../utils/identifier");`
      );

    source =
      source.replace(
        /const \{\r?\n\s*IntegrationConnection,\r?\n\} = require\("\.\.\/models\/IntegrationConnection"\);\r?\n\r?\nconst Service = require\("\.\.\/models\/Service"\);/,

        `const {
  IntegrationConnection,
  Service,
} = require("../persistence/operational/operationalModels");`
      );

    source =
      source.replace(
        /mongoose\.Types\.ObjectId\.isValid\(/g,
        "isDatabaseIdentifier("
      );

    return source;
  }
);


// ============================================================================
// KUBERNETES TOPOLOGY
// ============================================================================

rewrite(
  "services/discovery/kubernetesTopologyService.js",
  (
    source
  ) => {
    source =
      source.replace(
        /const mongoose =\r?\n\s*require\("mongoose"\);\r?\n\r?\nconst KubernetesResource =\r?\n\s*require\("\.\.\/\.\.\/models\/KubernetesResource"\);\r?\n\r?\nconst KubernetesResourceRelation =\r?\n\s*require\("\.\.\/\.\.\/models\/KubernetesResourceRelation"\);/,

        `const { isDatabaseIdentifier } =
  require("../../utils/identifier");

const {
  KubernetesResource,
  KubernetesResourceRelation,
} = require("../../persistence/operational/operationalModels");`
      );

    source =
      source.replace(
        /return \(\r?\n\s*value &&\r?\n\s*mongoose\.Types\.ObjectId\r?\n\s*\.isValid\(value\)\r?\n\s*\);/,

        `return Boolean(
      value &&
      isDatabaseIdentifier(value)
    );`
      );

    return source;
  }
);


console.log(
  "[phase13-operational-rewire] complete"
);