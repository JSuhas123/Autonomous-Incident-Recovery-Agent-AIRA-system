'use strict';

/**
 * AIRA Messaging Diagnostic Action Handlers
 *
 * Phase 13 — Messaging / Queues
 *
 * READ-ONLY capabilities only.
 *
 * No:
 * - queue purge
 * - DLQ replay
 * - consumer restart
 * - partition reassignment
 * - broker restart
 * - message deletion
 * - offset reset
 * - shell execution
 */

const {
  getMessagingDiagnosticTarget,
} =
  require(
    '../../../services/messaging/messagingDiagnosticTargetRegistry'
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
  ]);


const MESSAGING_ACTIONS =
  Object.freeze({
    CHECK_BROKER_HEALTH:
      'messaging/check_broker_health',

    CHECK_QUEUE_DEPTH:
      'messaging/check_queue_depth',

    CHECK_DLQ_DEPTH:
      'messaging/check_dlq_depth',

    CHECK_CONSUMER_LAG:
      'messaging/check_consumer_lag',

    CHECK_CONSUMER_HEALTH:
      'messaging/check_consumer_health',

    CHECK_PUBLISH_HEALTH:
      'messaging/check_publish_health',

    CHECK_DELIVERY_HEALTH:
      'messaging/check_delivery_health',

    CHECK_PARTITION_HEALTH:
      'messaging/check_partition_health',

    CHECK_REPLICATION_HEALTH:
      'messaging/check_replication_health',

    CHECK_CONNECTION_HEALTH:
      'messaging/check_connection_health',
  });


const ACTION_METHODS =
  Object.freeze({
    [MESSAGING_ACTIONS.CHECK_BROKER_HEALTH]:
      'checkBrokerHealth',

    [MESSAGING_ACTIONS.CHECK_QUEUE_DEPTH]:
      'checkQueueDepth',

    [MESSAGING_ACTIONS.CHECK_DLQ_DEPTH]:
      'checkDlqDepth',

    [MESSAGING_ACTIONS.CHECK_CONSUMER_LAG]:
      'checkConsumerLag',

    [MESSAGING_ACTIONS.CHECK_CONSUMER_HEALTH]:
      'checkConsumerHealth',

    [MESSAGING_ACTIONS.CHECK_PUBLISH_HEALTH]:
      'checkPublishHealth',

    [MESSAGING_ACTIONS.CHECK_DELIVERY_HEALTH]:
      'checkDeliveryHealth',

    [MESSAGING_ACTIONS.CHECK_PARTITION_HEALTH]:
      'checkPartitionHealth',

    [MESSAGING_ACTIONS.CHECK_REPLICATION_HEALTH]:
      'checkReplicationHealth',

    [MESSAGING_ACTIONS.CHECK_CONNECTION_HEALTH]:
      'checkConnectionHealth',
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


function validateMessagingParams(
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


function validateMessagingParamsForRegistry(
  params = {}
) {
  try {
    validateMessagingParams(
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


async function executeMessagingAction(
  action,
  params = {},
  context = {}
) {
  validateMessagingParams(
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
      `Unsupported messaging action: ${action}`
    );
  }

  const target =
    getMessagingDiagnosticTarget(
      params.targetId
    );

  if (
    typeof target[
      targetMethod
    ] !==
      'function'
  ) {
    throw new Error(
      `Messaging diagnostic target does not implement ${targetMethod}`
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
    `messaging/${action}`;

  if (
    !ACTION_METHODS[
      fullAction
    ]
  ) {
    throw new Error(
      `Unsupported messaging handler definition: ${fullAction}`
    );
  }

  return {
    type:
      'messaging',

    action,

    metadata:
      baseMetadata(
        description
      ),

    validate(
      params = {}
    ) {
      return validateMessagingParamsForRegistry(
        params
      );
    },

    async execute(
      params = {},
      context = {}
    ) {
      const execution =
        await executeMessagingAction(
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
        'check_broker_health',
      description:
        'Inspect RabbitMQ/Kafka broker health without mutation.',
    }),

    createReadOnlyHandler({
      action:
        'check_queue_depth',
      description:
        'Inspect queue backlog or topic backlog state.',
    }),

    createReadOnlyHandler({
      action:
        'check_dlq_depth',
      description:
        'Inspect dead-letter queue depth without replaying messages.',
    }),

    createReadOnlyHandler({
      action:
        'check_consumer_lag',
      description:
        'Inspect consumer lag and offset delay.',
    }),

    createReadOnlyHandler({
      action:
        'check_consumer_health',
      description:
        'Inspect consumer health without restarting consumers.',
    }),

    createReadOnlyHandler({
      action:
        'check_publish_health',
      description:
        'Inspect publisher/broker publish-path health.',
    }),

    createReadOnlyHandler({
      action:
        'check_delivery_health',
      description:
        'Inspect message delivery and acknowledgement health.',
    }),

    createReadOnlyHandler({
      action:
        'check_partition_health',
      description:
        'Inspect Kafka partition leadership and availability.',
    }),

    createReadOnlyHandler({
      action:
        'check_replication_health',
      description:
        'Inspect broker/topic replication health.',
    }),

    createReadOnlyHandler({
      action:
        'check_connection_health',
      description:
        'Inspect broker client connection health.',
    }),
  ]);


const messagingHandlers =
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
  MESSAGING_ACTIONS,
  ACTION_METHODS,

  handlers,
  messagingHandlers,

  validateMessagingParams,
  validateMessagingParamsForRegistry,
  executeMessagingAction,

  createReadOnlyHandler,
};