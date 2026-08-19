'use strict';

/**
 * AIRA Networking Diagnostic Action Handlers
 *
 * Phase 13.12
 *
 * Deterministic READ-ONLY handlers for explicitly registered
 * external network diagnostic targets.
 *
 * SAFETY:
 * - no shell execution
 * - no route mutation
 * - no DNS mutation
 * - no firewall mutation
 * - no load-balancer mutation
 * - no certificate replacement
 * - no raw credentials
 */

const {
  getNetworkDiagnosticTarget,
} =
  require(
    '../../../services/networking/networkDiagnosticTargetRegistry'
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
    'privateKey',
    'credential',
    'credentials',
  ]);


const NETWORKING_ACTIONS =
  Object.freeze({
    CHECK_CONNECTIVITY:
      'networking/check_connectivity',

    CHECK_DNS:
      'networking/check_dns',

    CHECK_LATENCY:
      'networking/check_latency',

    CHECK_PACKET_LOSS:
      'networking/check_packet_loss',

    CHECK_PORT:
      'networking/check_port',

    CHECK_ROUTE:
      'networking/check_route',

    CHECK_TLS:
      'networking/check_tls',

    CHECK_UPSTREAM:
      'networking/check_upstream',

    CHECK_LOAD_BALANCER:
      'networking/check_load_balancer',

    CHECK_EGRESS:
      'networking/check_egress',
  });


const ACTION_METHODS =
  Object.freeze({
    [NETWORKING_ACTIONS.CHECK_CONNECTIVITY]:
      'checkConnectivity',

    [NETWORKING_ACTIONS.CHECK_DNS]:
      'checkDns',

    [NETWORKING_ACTIONS.CHECK_LATENCY]:
      'checkLatency',

    [NETWORKING_ACTIONS.CHECK_PACKET_LOSS]:
      'checkPacketLoss',

    [NETWORKING_ACTIONS.CHECK_PORT]:
      'checkPort',

    [NETWORKING_ACTIONS.CHECK_ROUTE]:
      'checkRoute',

    [NETWORKING_ACTIONS.CHECK_TLS]:
      'checkTls',

    [NETWORKING_ACTIONS.CHECK_UPSTREAM]:
      'checkUpstream',

    [NETWORKING_ACTIONS.CHECK_LOAD_BALANCER]:
      'checkLoadBalancer',

    [NETWORKING_ACTIONS.CHECK_EGRESS]:
      'checkEgress',
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

    description,
  };
}


function validateNetworkingParams(
  params = {}
) {
  const errors =
    [];

  if (
    !params.targetId ||
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


function validateNetworkingParamsForRegistry(
  params = {}
) {
  try {
    validateNetworkingParams(
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


async function executeNetworkingAction(
  action,
  params = {},
  context = {}
) {
  validateNetworkingParams(
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
      `Unsupported networking action: ${action}`
    );
  }


  const target =
    getNetworkDiagnosticTarget(
      params.targetId
    );


  if (
    typeof target[
      targetMethod
    ] !==
      'function'
  ) {
    throw new Error(
      `Network diagnostic target does not implement ${targetMethod}`
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
    `networking/${action}`;


  if (
    !ACTION_METHODS[
      fullAction
    ]
  ) {
    throw new Error(
      `Unsupported networking handler definition: ${fullAction}`
    );
  }


  return {
    type:
      'networking',

    action,

    metadata:
      baseMetadata(
        description
      ),

    validate(
      params = {}
    ) {
      return validateNetworkingParamsForRegistry(
        params
      );
    },

    async execute(
      params = {},
      context = {}
    ) {
      const execution =
        await executeNetworkingAction(
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
        'check_connectivity',

      description:
        'Check end-to-end network connectivity for a registered target.',
    }),

    createReadOnlyHandler({
      action:
        'check_dns',

      description:
        'Check DNS resolution for a registered network target.',
    }),

    createReadOnlyHandler({
      action:
        'check_latency',

      description:
        'Measure network latency without changing network configuration.',
    }),

    createReadOnlyHandler({
      action:
        'check_packet_loss',

      description:
        'Measure packet-loss conditions for a registered network target.',
    }),

    createReadOnlyHandler({
      action:
        'check_port',

      description:
        'Check whether a target network port is reachable.',
    }),

    createReadOnlyHandler({
      action:
        'check_route',

      description:
        'Inspect route state without modifying routing tables.',
    }),

    createReadOnlyHandler({
      action:
        'check_tls',

      description:
        'Inspect TLS handshake and certificate-chain state.',
    }),

    createReadOnlyHandler({
      action:
        'check_upstream',

      description:
        'Inspect upstream reachability and health.',
    }),

    createReadOnlyHandler({
      action:
        'check_load_balancer',

      description:
        'Inspect load-balancer health without changing backend membership.',
    }),

    createReadOnlyHandler({
      action:
        'check_egress',

      description:
        'Inspect outbound network connectivity.',
    }),
  ]);


/**
 * Compatibility map used by tests and diagnostic tooling.
 *
 * Registry itself uses `handlers`.
 */
const networkingHandlers =
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
  NETWORKING_ACTIONS,
  ACTION_METHODS,

  handlers,
  networkingHandlers,

  validateNetworkingParams,
  validateNetworkingParamsForRegistry,
  executeNetworkingAction,

  createReadOnlyHandler,
};