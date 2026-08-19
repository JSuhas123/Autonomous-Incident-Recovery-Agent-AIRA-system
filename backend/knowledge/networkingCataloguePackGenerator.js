'use strict';

/**
 * Phase 13.12 — Networking Catalogue Pack Generator
 *
 * Generates canonical AIRA YAML for the networking knowledge pack.
 *
 * OUTPUT:
 *
 * knowledge/.generated/phase-13-networking-pack/
 *   playbooks/networking/
 *   runbooks/networking/
 *
 * SAFETY:
 * - does not touch physical catalogue
 * - does not overwrite unless explicitly allowed
 * - refuses non-allowlisted actions
 * - renders canonical owner/scope metadata
 * - validates IDs and paths
 */

const fs =
  require(
    'fs'
  );

const path =
  require(
    'path'
  );

const yaml =
  require(
    'js-yaml'
  );

const {
  NETWORKING_RUNBOOKS,
  NETWORKING_PLAYBOOKS,
} =
  require(
    './networkingCataloguePackDefinitions'
  );

const {
  NETWORKING_CAPABILITIES,
} =
  require(
    './networkingCapabilityMatrix'
  );


const DEFAULT_OUTPUT_ROOT =
  path.resolve(
    __dirname,
    '.generated',
    'phase-13-networking-pack'
  );


const ALLOWED_ACTIONS =
  new Set(
    NETWORKING_CAPABILITIES.map(
      capability =>
        capability.handlerKey
    )
  );


function assertSafeRelativePath(
  relativePath
) {
  if (
    !relativePath ||
    typeof relativePath !==
      'string'
  ) {
    throw new Error(
      'Generated catalogue file path is required.'
    );
  }

  const normalized =
    relativePath.replace(
      /\\/g,
      '/'
    );

  if (
    path.isAbsolute(
      relativePath
    ) ||
    normalized.startsWith(
      '../'
    ) ||
    normalized.includes(
      '/../'
    )
  ) {
    throw new Error(
      `Unsafe generated catalogue path: ${relativePath}`
    );
  }

  if (
    !/\.ya?ml$/i.test(
      normalized
    )
  ) {
    throw new Error(
      `Generated catalogue definition must use YAML extension: ${relativePath}`
    );
  }

  return normalized;
}


function ensureUniqueIds() {
  const ids = [
    ...NETWORKING_RUNBOOKS.map(
      item =>
        item.runbookId
    ),

    ...NETWORKING_PLAYBOOKS.map(
      item =>
        item.playbookId
    ),
  ];

  const seen =
    new Set();

  const duplicates =
    [];

  for (
    const id
    of ids
  ) {
    if (
      seen.has(
        id
      )
    ) {
      duplicates.push(
        id
      );
    }

    seen.add(
      id
    );
  }

  if (
    duplicates.length >
    0
  ) {
    throw new Error(
      `Duplicate networking catalogue IDs: ${[
        ...new Set(
          duplicates
        ),
      ].join(', ')}`
    );
  }
}


function validateDefinitionSet() {
  const errors =
    [];

  try {
    ensureUniqueIds();
  } catch (
    error
  ) {
    errors.push(
      error.message
    );
  }

  for (
    const definition
    of NETWORKING_RUNBOOKS
  ) {
    if (
      !definition.runbookId
    ) {
      errors.push(
        'Networking Runbook missing runbookId'
      );

      continue;
    }

    try {
      assertSafeRelativePath(
        definition.file
      );
    } catch (
      error
    ) {
      errors.push(
        `${definition.runbookId}: ${error.message}`
      );
    }

    if (
      !Array.isArray(
        definition.steps
      ) ||
      definition.steps.length ===
        0
    ) {
      errors.push(
        `${definition.runbookId}: steps are required`
      );

      continue;
    }

    for (
      const currentStep
      of definition.steps
    ) {
      const handlerKey =
        `${currentStep.type}/${currentStep.action}`;

      if (
        !ALLOWED_ACTIONS.has(
          handlerKey
        )
      ) {
        errors.push(
          `${definition.runbookId}: generator refuses non-allowlisted action ${handlerKey}`
        );
      }
    }
  }

  for (
    const definition
    of NETWORKING_PLAYBOOKS
  ) {
    if (
      !definition.playbookId
    ) {
      errors.push(
        'Networking Playbook missing playbookId'
      );

      continue;
    }

    try {
      assertSafeRelativePath(
        definition.file
      );
    } catch (
      error
    ) {
      errors.push(
        `${definition.playbookId}: ${error.message}`
      );
    }

    if (
      !Array.isArray(
        definition.stages
      ) ||
      definition.stages.length ===
        0
    ) {
      errors.push(
        `${definition.playbookId}: stages are required`
      );
    }
  }

  return {
    valid:
      errors.length ===
      0,

    errors,
  };
}


function buildRunbookDocument(
  definition
) {
  return {
    apiVersion:
      'aira.io/v1',

    kind:
      'Runbook',

    runbookId:
      definition.runbookId,

    semver:
      definition.semver ||
      '1.0.0',

    name:
      definition.name,

    description:
      definition.description,

    lifecycle:
      definition.lifecycle ||
      'DRAFT',

    owner: {
      ownerType:
        definition.owner
          ?.ownerType ||
        'system',

      ownerId:
        definition.owner
          ?.ownerId ||
        'aira-core',

      name:
        definition.owner
          ?.name ||
        'AIRA Networking Reliability',

      team:
        definition.owner
          ?.team ||
        'networking-reliability',
    },

    scope: {
      environments:
        definition.scope
          ?.environments ||
        [
          'production',
          'staging',
        ],

      services:
        definition.scope
          ?.services ||
        [
          'networking',
        ],
    },

    risk: {
      level:
        definition.risk
          ?.level ||
        'LOW',

      blastRadius:
        definition.risk
          ?.blastRadius ||
        'none',

      reversible:
        definition.risk
          ?.reversible !==
        false,
    },

    parameters:
      definition.parameters ||
      [],

    steps:
      definition.steps ||
      [],

    verification:
      definition.verification ||
      {
        strategy:
          'ALL',

        timeoutSeconds:
          30,

        checks:
          [],
      },

    rollbackConfig:
      definition.rollbackConfig ||
      {
        strategy:
          'NONE',
      },

    auditConfig:
      definition.auditConfig ||
      {
        redactSensitiveValues:
          true,
      },

    tags:
      definition.tags ||
      [
        'networking',
        'diagnostic',
        'read-only',
        'phase-13',
      ],
  };
}


function buildPlaybookDocument(
  definition
) {
  return {
    apiVersion:
      'aira.io/v1',

    kind:
      'Playbook',

    playbookId:
      definition.playbookId,

    semver:
      definition.semver ||
      '1.0.0',

    name:
      definition.name,

    description:
      definition.description,

    lifecycle:
      definition.lifecycle ||
      'DRAFT',

    owner: {
      ownerType:
        definition.owner
          ?.ownerType ||
        'system',

      ownerId:
        definition.owner
          ?.ownerId ||
        'aira-core',

      name:
        definition.owner
          ?.name ||
        'AIRA Networking Reliability',

      team:
        definition.owner
          ?.team ||
        'networking-reliability',
    },

    scope: {
      environments:
        definition.scope
          ?.environments ||
        definition.incident
          ?.environments ||
        [
          'production',
          'staging',
        ],

      services:
        definition.scope
          ?.services ||
        [
          'networking',
        ],
    },

    incident: {
      types:
        definition.incident
          ?.types ||
        [],

      severities:
        definition.incident
          ?.severities ||
        [],

      providers:
        definition.incident
          ?.providers ||
        [],

      environments:
        definition.incident
          ?.environments ||
        [
          'production',
          'staging',
        ],
    },

    requiredEvidence:
      definition.requiredEvidence ||
      [],

    conditions: {
      minimumConfidence:
        definition.minimumConfidence ??
        0.75,
    },

    risk: {
      level:
        definition.risk
          ?.level ||
        'LOW',

      blastRadius:
        definition.risk
          ?.blastRadius ||
        'network-target',

      reversible:
        true,
    },

    policy: {
      required:
        true,
    },

    approval: {
      mode:
        definition.approvalMode ||
        'MANUAL',
    },

    stages:
      definition.stages ||
      [],

    rollback: {
      strategy:
        'NONE',
    },

    escalation: {
      enabled:
        true,

      maxAttempts:
        1,

      escalateTo:
        'network-oncall',
    },

    outcome: {
      captureLearning:
        true,

      updateIncidentMemory:
        true,
    },

    tags:
      definition.tags ||
      [
        'networking',
        'diagnostic',
        'phase-13',
      ],
  };
}


function renderYaml(
  document
) {
  return yaml.dump(
    document,
    {
      noRefs:
        true,

      lineWidth:
        120,

      noCompatMode:
        true,

      sortKeys:
        false,
    }
  );
}


function writeDefinition({
  outputRoot,
  kind,
  relativePath,
  document,
  overwrite,
}) {
  const safeRelative =
    assertSafeRelativePath(
      relativePath
    );

  const root =
    kind ===
      'PLAYBOOK'
      ? path.join(
          outputRoot,
          'playbooks'
        )
      : path.join(
          outputRoot,
          'runbooks'
        );

  const destination =
    path.resolve(
      root,
      safeRelative
    );

  const relativeToRoot =
    path.relative(
      root,
      destination
    );

  if (
    relativeToRoot.startsWith(
      '..'
    ) ||
    path.isAbsolute(
      relativeToRoot
    )
  ) {
    throw new Error(
      `Generated destination escapes staging root: ${destination}`
    );
  }

  fs.mkdirSync(
    path.dirname(
      destination
    ),
    {
      recursive:
        true,
    }
  );

  if (
    fs.existsSync(
      destination
    ) &&
    overwrite !==
      true
  ) {
    throw new Error(
      `Generated file already exists: ${destination}`
    );
  }

  fs.writeFileSync(
    destination,
    renderYaml(
      document
    ),
    'utf8'
  );

  return {
    file:
      destination,

    relativePath:
      safeRelative,
  };
}


function generateNetworkingPack(
  options = {}
) {
  const outputRoot =
    path.resolve(
      options.outputRoot ||
      DEFAULT_OUTPUT_ROOT
    );

  const validation =
    validateDefinitionSet();

  if (
    !validation.valid
  ) {
    const error =
      new Error(
        'Networking catalogue definition validation failed.'
      );

    error.validationErrors =
      validation.errors;

    throw error;
  }

  if (
    options.clean ===
      true &&
    fs.existsSync(
      outputRoot
    )
  ) {
    fs.rmSync(
      outputRoot,
      {
        recursive:
          true,

        force:
          true,
      }
    );
  }

  fs.mkdirSync(
    outputRoot,
    {
      recursive:
        true,
    }
  );

  const runbooks =
    [];

  const playbooks =
    [];

  for (
    const definition
    of NETWORKING_RUNBOOKS
  ) {
    const result =
      writeDefinition({
        outputRoot,

        kind:
          'RUNBOOK',

        relativePath:
          definition.file,

        document:
          buildRunbookDocument(
            definition
          ),

        overwrite:
          options.overwrite ===
          true,
      });

    runbooks.push({
      runbookId:
        definition.runbookId,

      ...result,
    });
  }

  for (
    const definition
    of NETWORKING_PLAYBOOKS
  ) {
    const result =
      writeDefinition({
        outputRoot,

        kind:
          'PLAYBOOK',

        relativePath:
          definition.file,

        document:
          buildPlaybookDocument(
            definition
          ),

        overwrite:
          options.overwrite ===
          true,
      });

    playbooks.push({
      playbookId:
        definition.playbookId,

      ...result,
    });
  }

  return {
    outputRoot,

    runbooks,

    playbooks,

    counts: {
      runbooks:
        runbooks.length,

      playbooks:
        playbooks.length,

      total:
        runbooks.length +
        playbooks.length,
    },
  };
}


function runCli() {
  const args =
    process.argv.slice(
      2
    );

  const dryRun =
    args.includes(
      '--dry-run'
    );

  const clean =
    args.includes(
      '--clean'
    );

  const overwrite =
    args.includes(
      '--overwrite'
    );

  try {
    const validation =
      validateDefinitionSet();

    if (
      !validation.valid
    ) {
      console.error(
        '[networking-pack] Definition validation failed:'
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

      return;
    }

    if (
      dryRun
    ) {
      console.log(
        '[networking-pack] DRY RUN'
      );

      console.log(
        `Output root: ${DEFAULT_OUTPUT_ROOT}`
      );

      console.log(
        `Runbooks: ${NETWORKING_RUNBOOKS.length}`
      );

      console.log(
        `Playbooks: ${NETWORKING_PLAYBOOKS.length}`
      );

      console.log(
        `Total: ${
          NETWORKING_RUNBOOKS.length +
          NETWORKING_PLAYBOOKS.length
        }`
      );

      console.log(
        '\nNo files written.'
      );

      return;
    }

    const result =
      generateNetworkingPack({
        clean,
        overwrite,
      });

    console.log(
      '\n[networking-pack] Networking pack generated successfully'
    );

    console.log(
      `Output root: ${result.outputRoot}`
    );

    console.log(
      `Runbooks: ${result.counts.runbooks}`
    );

    console.log(
      `Playbooks: ${result.counts.playbooks}`
    );

    console.log(
      `Total: ${result.counts.total}`
    );
  } catch (
    error
  ) {
    console.error(
      '\n[networking-pack] Generation failed'
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


if (
  require.main ===
  module
) {
  runCli();
}


module.exports = {
  DEFAULT_OUTPUT_ROOT,
  ALLOWED_ACTIONS,

  assertSafeRelativePath,
  validateDefinitionSet,

  buildRunbookDocument,
  buildPlaybookDocument,
  renderYaml,

  generateNetworkingPack,
};