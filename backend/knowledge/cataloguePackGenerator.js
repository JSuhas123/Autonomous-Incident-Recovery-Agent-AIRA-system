'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const {
  KUBERNETES_RUNBOOKS,
  KUBERNETES_PLAYBOOKS,
} = require('./cataloguePackDefinitions');

const DEFAULT_OUTPUT_ROOT = path.join(
  __dirname,
  '.generated',
  'phase-13-kubernetes-pack',
);

const SAFE_ACTIONS = new Set([
  'kubernetes/get_pod',
  'kubernetes/get_events',
  'kubernetes/get_logs',
  'kubernetes/check_pod_ready',
  'kubernetes/get_deployment',
  'kubernetes/get_deployment_status',
  'kubernetes/get_node',

  'kubernetes/restart_deployment',
  'kubernetes/scale_deployment',
  'kubernetes/get_pvc',
'kubernetes/check_pvc_bound',

'kubernetes/check_dns',

'kubernetes/get_service',
'kubernetes/get_endpoints',
'kubernetes/check_service_endpoints',

'kubernetes/get_ingress',
'kubernetes/check_ingress',

'kubernetes/get_hpa',
'kubernetes/get_resource_quota',
]);

function buildRunbook(definition) {
  return {
    apiVersion: 'aira.io/v1',
    kind: 'Runbook',

    runbookId: definition.runbookId,
    name: definition.name,
    description: definition.description,
    semver: definition.semver || '1.0.0',
    lifecycle: definition.lifecycle || 'DRAFT',

    owner: {
      ownerType: 'system',
      name: 'Platform Engineering',
    },

    scope: {
      environments: ['production', 'staging', 'dev'],
      providers: ['kubernetes'],
    },

    risk: {
      level: definition.risk.level,
      blastRadius: definition.risk.blastRadius,
      reversible: definition.risk.reversible,
    },

    parameters: definition.parameters,

    steps: definition.steps,

    rollbackConfig: definition.rollbackConfig || {
      strategy: 'NONE',
      nonReversibleAcknowledged: false,
    },

    verification: definition.verification,

    auditConfig: {
      redactSensitiveValues: false,
    },
  };
}

function buildPlaybook(
  definition
) {
  if (
    !definition ||
    typeof definition !==
      "object"
  ) {
    throw new TypeError(
      "Playbook definition must be an object"
    );
  }

  if (
    !definition.playbookId
  ) {
    throw new Error(
      "Playbook definition requires playbookId"
    );
  }

  if (
    !definition.name
  ) {
    throw new Error(
      `Playbook ${definition.playbookId} requires name`
    );
  }

  const scope =
    definition.scope ||
    {
      environments: [
        "development",
        "staging",
        "production",
      ],

      providers: [
        "kubernetes",
      ],

      resourceTypes: [
        "Deployment",
        "StatefulSet",
        "DaemonSet",
        "Pod",
        "Node",
      ],

      namespaces: [
        "*",
      ],
    };

  return {
    apiVersion:
      "aira.io/v1",

    kind:
      "Playbook",

    playbookId:
      definition.playbookId,

    name:
      definition.name,

    semver:
      definition.semver ||
      "1.0.0",

    lifecycle:
      definition.lifecycle ||
      "DRAFT",

    owner: {
  ownerType:
    definition
      .owner
      ?.ownerType ||
    "system",

  ownerId:
    definition
      .owner
      ?.ownerId ||
    "aira-core",

  name:
    definition
      .owner
      ?.name ||
    "AIRA Platform Reliability",

  team:
    definition
      .owner
      ?.team ||
    "platform-reliability",
},

    description:
      definition.description ||
      "",

    category:
      definition.category ||
      "kubernetes",

    tags:
      Array.isArray(
        definition.tags
      )
        ? definition.tags
        : [
            "kubernetes",
            "incident-response",
          ],

    scope: {
      environments:
        Array.isArray(
          scope.environments
        ) &&
        scope.environments.length >
          0
          ? scope.environments
          : [
              "development",
              "staging",
              "production",
            ],

      providers:
        Array.isArray(
          scope.providers
        ) &&
        scope.providers.length >
          0
          ? scope.providers
          : [
              "kubernetes",
            ],

      resourceTypes:
        Array.isArray(
          scope.resourceTypes
        )
          ? scope.resourceTypes
          : [],

      namespaces:
        Array.isArray(
          scope.namespaces
        )
          ? scope.namespaces
          : [
              "*",
            ],
    },

    incident:
      definition.incident ||
      {
        types: [],
        severities: [],
      },

    requiredEvidence:
      Array.isArray(
        definition.requiredEvidence
      )
        ? definition.requiredEvidence
        : [],

    conditions:
      definition.conditions ||
      {
        minimumConfidence:
          0.75,

        requireCorrelation:
          true,

        requireEvidence:
          true,
      },

    risk:
      definition.risk ||
      {
        level:
          "MEDIUM",

        blastRadius:
          "WORKLOAD",

        reversible:
          true,
      },

    policy:
      definition.policy ||
      {
        required:
          true,

        failClosed:
          true,
      },

    approval:
      definition.approval ||
      {
        mode:
          "POLICY_DRIVEN",

        requiredForProduction:
          true,
      },

    stages:
      Array.isArray(
        definition.stages
      )
        ? definition.stages
        : [],

    rollback:
      definition.rollback ||
      {
        enabled:
          true,

        automatic:
          false,

        requireVerificationFailure:
          true,
      },

    escalation:
      definition.escalation ||
      {
        enabled:
          true,

        onFailure:
          "MANUAL_REQUIRED",

        onAmbiguity:
          "MANUAL_REQUIRED",

        onPolicyDenial:
          "MANUAL_REQUIRED",
      },

    outcome:
      definition.outcome ||
      {
        captureLearning:
          true,

        persistEvidence:
          true,

        persistDecisionTrace:
          true,
      },
  };
}

function validateDefinitionSet() {
  const errors = [];

  const runbookIds = new Set();
  const playbookIds = new Set();
  const files = new Set();

  for (const def of KUBERNETES_RUNBOOKS) {
    if (!def.runbookId) {
      errors.push('Runbook definition missing runbookId');
      continue;
    }

    if (runbookIds.has(def.runbookId)) {
      errors.push(`Duplicate runbookId: ${def.runbookId}`);
    }

    runbookIds.add(def.runbookId);

    if (!def.file) {
      errors.push(`${def.runbookId}: file is required`);
    } else if (files.has(`runbook:${def.file}`)) {
      errors.push(`Duplicate runbook output file: ${def.file}`);
    } else {
      files.add(`runbook:${def.file}`);
    }

    for (const step of def.steps || []) {
      const key = `${step.type}/${step.action}`;

      if (!SAFE_ACTIONS.has(key)) {
        errors.push(
          `${def.runbookId}: generator refuses non-allowlisted action ${key}`,
        );
      }
    }
  }

  for (const def of KUBERNETES_PLAYBOOKS) {
    if (!def.playbookId) {
      errors.push('Playbook definition missing playbookId');
      continue;
    }

    if (playbookIds.has(def.playbookId)) {
      errors.push(`Duplicate playbookId: ${def.playbookId}`);
    }

    playbookIds.add(def.playbookId);

    if (!def.file) {
      errors.push(`${def.playbookId}: file is required`);
    } else if (files.has(`playbook:${def.file}`)) {
      errors.push(`Duplicate playbook output file: ${def.file}`);
    } else {
      files.add(`playbook:${def.file}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function renderYaml(document) {
  return yaml.dump(document, {
    noRefs: true,
    lineWidth: 100,
    noCompatMode: true,
    quotingType: '"',
    forceQuotes: false,
    sortKeys: false,
  });
}

function ensureSafeOutputPath(root, relativePath) {
  const resolvedRoot = path.resolve(root);
  const target = path.resolve(root, relativePath);

  if (
    target !== resolvedRoot &&
    !target.startsWith(`${resolvedRoot}${path.sep}`)
  ) {
    throw new Error(
      `Unsafe generated output path: ${relativePath}`,
    );
  }

  return target;
}

function writeDocument(root, relativePath, document, options = {}) {
  const overwrite = options.overwrite === true;

  const target = ensureSafeOutputPath(
    root,
    relativePath,
  );

  if (fs.existsSync(target) && !overwrite) {
    throw new Error(
      `Refusing to overwrite existing generated file: ${target}`,
    );
  }

  fs.mkdirSync(
    path.dirname(target),
    { recursive: true },
  );

  fs.writeFileSync(
    target,
    renderYaml(document),
    'utf8',
  );

  return target;
}

function generateKubernetesPack(options = {}) {
  const outputRoot =
    options.outputRoot ||
    DEFAULT_OUTPUT_ROOT;

  const validation =
    validateDefinitionSet();

  if (!validation.valid) {
    const err = new Error(
      `Catalogue pack definition validation failed:\n${validation.errors.join('\n')}`,
    );

    err.validationErrors =
      validation.errors;

    throw err;
  }

  if (
    options.clean === true &&
    fs.existsSync(outputRoot)
  ) {
    fs.rmSync(
      outputRoot,
      {
        recursive: true,
        force: true,
      },
    );
  }

  fs.mkdirSync(
    outputRoot,
    { recursive: true },
  );

  const generated = {
    outputRoot,
    playbooks: [],
    runbooks: [],
  };

  for (const definition of KUBERNETES_RUNBOOKS) {
    const document =
      buildRunbook(definition);

    const relativePath =
      path.join(
        'runbooks',
        definition.file,
      );

    const file =
      writeDocument(
        outputRoot,
        relativePath,
        document,
        {
          overwrite:
            options.overwrite === true,
        },
      );

    generated.runbooks.push({
      runbookId:
        definition.runbookId,

      lifecycle:
        definition.lifecycle,

      file,
      relativePath,
      document,
    });
  }

  for (const definition of KUBERNETES_PLAYBOOKS) {
    const document =
      buildPlaybook(definition);

    const relativePath =
      path.join(
        'playbooks',
        definition.file,
      );

    const file =
      writeDocument(
        outputRoot,
        relativePath,
        document,
        {
          overwrite:
            options.overwrite === true,
        },
      );

    generated.playbooks.push({
      playbookId:
        definition.playbookId,

      lifecycle:
        definition.lifecycle,

      file,
      relativePath,
      document,
    });
  }

  generated.counts = {
    playbooks:
      generated.playbooks.length,

    runbooks:
      generated.runbooks.length,

    total:
      generated.playbooks.length +
      generated.runbooks.length,
  };

  return generated;
}
// ============================================================================
// CLI ENTRY POINT
// ============================================================================

if (
  require.main ===
  module
) {
  const args =
    process.argv
      .slice(
        2
      );

  const dryRun =
    args.includes(
      "--dry-run"
    );

  const clean =
    args.includes(
      "--clean"
    );

  const overwrite =
    args.includes(
      "--overwrite"
    );

  try {
    if (
      dryRun
    ) {
      const validation =
        validateDefinitionSet();

      if (
        !validation.valid
      ) {
        console.error(
          "[knowledge-pack] Definition validation failed:"
        );

        for (
          const error
          of validation.errors
        ) {
          console.error(
            `  - ${error}`
          );
        }

        process.exitCode =
          1;
      } else {
        console.log(
          "[knowledge-pack] DRY RUN"
        );

        console.log(
          `Output root: ${DEFAULT_OUTPUT_ROOT}`
        );

        console.log(
          `Runbooks: ${KUBERNETES_RUNBOOKS.length}`
        );

        console.log(
          `Playbooks: ${KUBERNETES_PLAYBOOKS.length}`
        );

        console.log(
          `Total: ${
            KUBERNETES_RUNBOOKS.length +
            KUBERNETES_PLAYBOOKS.length
          }`
        );

        console.log(
          "\nRunbooks:"
        );

        for (
          const definition
          of KUBERNETES_RUNBOOKS
        ) {
          console.log(
            `  + ${definition.runbookId} -> ${definition.file}`
          );
        }

        console.log(
          "\nPlaybooks:"
        );

        for (
          const definition
          of KUBERNETES_PLAYBOOKS
        ) {
          console.log(
            `  + ${definition.playbookId} -> ${definition.file}`
          );
        }

        console.log(
          "\nNo files written."
        );
      }
    } else {
      const generated =
        generateKubernetesPack({
          clean:
            clean,

          overwrite:
            overwrite,
        });

      console.log(
        "\n[knowledge-pack] Kubernetes pack generated successfully"
      );

      console.log(
        `Output root: ${generated.outputRoot}`
      );

      console.log(
        `Runbooks: ${generated.counts.runbooks}`
      );

      console.log(
        `Playbooks: ${generated.counts.playbooks}`
      );

      console.log(
        `Total: ${generated.counts.total}`
      );

      console.log(
        "\nGenerated files:"
      );

      for (
        const entry
        of generated.runbooks
      ) {
        console.log(
          `  RUNBOOK  ${entry.runbookId}`
        );

        console.log(
          `           ${entry.file}`
        );
      }

      for (
        const entry
        of generated.playbooks
      ) {
        console.log(
          `  PLAYBOOK ${entry.playbookId}`
        );

        console.log(
          `           ${entry.file}`
        );
      }
    }
  } catch (
    error
  ) {
    console.error(
      "\n[knowledge-pack] Generation failed"
    );

    console.error(
      error.message
    );

    if (
      Array.isArray(
        error.validationErrors
      )
    ) {
      for (
        const validationError
        of error.validationErrors
      ) {
        console.error(
          `  - ${validationError}`
        );
      }
    }

    process.exitCode =
      1;
  }
}

module.exports = {
  DEFAULT_OUTPUT_ROOT,
  SAFE_ACTIONS,

  buildRunbook,
  buildPlaybook,

  validateDefinitionSet,
  renderYaml,
  generateKubernetesPack,
};