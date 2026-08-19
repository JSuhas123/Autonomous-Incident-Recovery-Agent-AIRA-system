'use strict';

/**
 * AIRA Container Diagnostic Action Handlers
 *
 * Phase 13 — Containers / Runtime
 *
 * READ-ONLY diagnostic capabilities.
 *
 * No:
 * - container restart
 * - container deletion
 * - image deletion
 * - resource mutation
 * - runtime configuration changes
 * - arbitrary shell execution
 */

const {
  getContainerDiagnosticTarget,
} =
  require(
    '../../../services/containers/containerDiagnosticTargetRegistry'
  );


const SAFE_ENVIRONMENTS =
  Object.freeze([
    'production',
    'staging',
    'dev',
  ]);


const FORBIDDEN_PARAMETER_NAMES =
  Object.freeze([
    'password',
    'secret',
    'token',
    'apiKey',
    'api_key',
    'credential',
    'credentials',
    'authorization',
    'privateKey',
  ]);


const CONTAINER_ACTIONS =
  Object.freeze({
    CHECK_CONTAINER_STATE:
      'containers/check_container_state',

    CHECK_CONTAINER_LOGS:
      'containers/check_container_logs',

    CHECK_EXIT_REASON:
      'containers/check_exit_reason',

    CHECK_RESTART_HISTORY:
      'containers/check_restart_history',

    CHECK_RESOURCE_USAGE:
      'containers/check_resource_usage',

    CHECK_RESOURCE_LIMITS:
      'containers/check_resource_limits',

    CHECK_RUNTIME_HEALTH:
      'containers/check_runtime_health',

    CHECK_IMAGE_STATE:
      'containers/check_image_state',

    CHECK_FILESYSTEM_USAGE:
      'containers/check_filesystem_usage',

    CHECK_PROCESS_HEALTH:
      'containers/check_process_health',
  });


const ACTION_METHODS =
  Object.freeze({
    [CONTAINER_ACTIONS.CHECK_CONTAINER_STATE]:
      'checkContainerState',

    [CONTAINER_ACTIONS.CHECK_CONTAINER_LOGS]:
      'checkContainerLogs',

    [CONTAINER_ACTIONS.CHECK_EXIT_REASON]:
      'checkExitReason',

    [CONTAINER_ACTIONS.CHECK_RESTART_HISTORY]:
      'checkRestartHistory',

    [CONTAINER_ACTIONS.CHECK_RESOURCE_USAGE]:
      'checkResourceUsage',

    [CONTAINER_ACTIONS.CHECK_RESOURCE_LIMITS]:
      'checkResourceLimits',

    [CONTAINER_ACTIONS.CHECK_RUNTIME_HEALTH]:
      'checkRuntimeHealth',

    [CONTAINER_ACTIONS.CHECK_IMAGE_STATE]:
      'checkImageState',

    [CONTAINER_ACTIONS.CHECK_FILESYSTEM_USAGE]:
      'checkFilesystemUsage',

    [CONTAINER_ACTIONS.CHECK_PROCESS_HEALTH]:
      'checkProcessHealth',
  });


function baseMetadata(
  description
) {
  return {
    automationSafe:
      true,

    idempotent:
      true,

    retrySafe:
      true,

    destructive:
      false,

    reversible:
      true,

    builtinRollback:
      false,

    requiresConfirmation:
      false,

    allowedEnvironments:
      SAFE_ENVIRONMENTS,

    blastRadius:
      'none',

    outputMayContainSecrets:
      false,

    mode:
      'OBSERVE',

    readOnly:
      true,

    description,
  };
}


function validateContainerParams(
  params = {}
) {
  const errors =
    [];

  if (
    typeof params.targetId !==
      'string' ||
    !params.targetId.trim()
  ) {
    errors.push(
      'targetId is required'
    );
  }

  for (
    const forbidden
    of FORBIDDEN_PARAMETER_NAMES
  ) {
    if (
      params[
        forbidden
      ] !== undefined
    ) {
      errors.push(
        `Raw credential material is forbidden: ${forbidden}`
      );
    }
  }

  if (
    errors.length >
    0
  ) {
    const error =
      new Error(
        errors.join(
          '; '
        )
      );

    error.validationErrors =
      errors;

    throw error;
  }

  return true;
}


function validateContainerParamsForRegistry(
  params = {}
) {
  try {
    validateContainerParams(
      params
    );

    return {
      valid:
        true,
      errors:
        [],
    };
  } catch (
    error
  ) {
    return {
      valid:
        false,

      errors:
        Array.isArray(
          error.validationErrors
        )
          ? error.validationErrors
          : [
              error.message,
            ],
    };
  }
}


async function executeContainerAction(
  action,
  params = {},
  context = {}
) {
  validateContainerParams(
    params
  );

  const targetMethod =
    ACTION_METHODS[
      action
    ];

  if (
    !targetMethod
  ) {
    throw new Error(
      `Unsupported container action: ${action}`
    );
  }

  const target =
    getContainerDiagnosticTarget(
      params.targetId
    );

  if (
    typeof target[
      targetMethod
    ] !==
      'function'
  ) {
    throw new Error(
      `Container diagnostic target does not implement ${targetMethod}`
    );
  }

  const safeParams = {
    ...params,
  };

  for (
    const forbidden
    of FORBIDDEN_PARAMETER_NAMES
  ) {
    delete safeParams[
      forbidden
    ];
  }

  const result =
    await target[
      targetMethod
    ](
      safeParams,
      context
    );

  return {
    action,

    targetId:
      params.targetId,

    diagnostic:
      true,

    readOnly:
      true,

    result,
  };
}


function createReadOnlyHandler({
  action,
  description,
}) {
  const fullAction =
    `containers/${action}`;

  if (
    !ACTION_METHODS[
      fullAction
    ]
  ) {
    throw new Error(
      `Unsupported container handler definition: ${fullAction}`
    );
  }

  return {
    type:
      'containers',

    action,

    metadata:
      baseMetadata(
        description
      ),

    validate(
      params = {}
    ) {
      return validateContainerParamsForRegistry(
        params
      );
    },

    async execute(
      params = {},
      context = {}
    ) {
      const execution =
        await executeContainerAction(
          fullAction,
          params,
          context
        );

      return {
        success:
          true,

        diagnostic:
          true,

        readOnly:
          true,

        targetId:
          execution.targetId,

        ...(
          execution.result &&
          typeof execution.result ===
            'object'
            ? execution.result
            : {
                result:
                  execution.result,
              }
        ),
      };
    },
  };
}


const handlers =
  Object.freeze([
    createReadOnlyHandler({
      action:
        'check_container_state',

      description:
        'Inspect container lifecycle and runtime state.',
    }),

    createReadOnlyHandler({
      action:
        'check_container_logs',

      description:
        'Inspect recent and previous container log evidence.',
    }),

    createReadOnlyHandler({
      action:
        'check_exit_reason',

      description:
        'Inspect container exit code and termination reason.',
    }),

    createReadOnlyHandler({
      action:
        'check_restart_history',

      description:
        'Inspect restart counts and restart history.',
    }),

    createReadOnlyHandler({
      action:
        'check_resource_usage',

      description:
        'Inspect container CPU and memory utilization.',
    }),

    createReadOnlyHandler({
      action:
        'check_resource_limits',

      description:
        'Inspect configured container resource limits and requests.',
    }),

    createReadOnlyHandler({
      action:
        'check_runtime_health',

      description:
        'Inspect container runtime availability and health.',
    }),

    createReadOnlyHandler({
      action:
        'check_image_state',

      description:
        'Inspect container image state and runtime image availability.',
    }),

    createReadOnlyHandler({
      action:
        'check_filesystem_usage',

      description:
        'Inspect container filesystem and ephemeral storage usage.',
    }),

    createReadOnlyHandler({
      action:
        'check_process_health',

      description:
        'Inspect container process health without executing commands.',
    }),
  ]);


const containerHandlers =
  Object.freeze(
    Object.fromEntries(
      handlers.map(
        handler => [
          `${handler.type}/${handler.action}`,
          handler.execute,
        ]
      )
    )
  );


module.exports = {
  CONTAINER_ACTIONS,
  ACTION_METHODS,

  handlers,
  containerHandlers,

  validateContainerParams,
  validateContainerParamsForRegistry,
  executeContainerAction,

  createReadOnlyHandler,
};