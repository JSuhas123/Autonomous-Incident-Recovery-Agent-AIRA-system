'use strict';

/**
 * AIRA Observability Diagnostic Action Handlers
 *
 * Phase 13.13
 *
 * Deterministic READ-ONLY observability capabilities.
 *
 * These handlers delegate only to explicitly registered diagnostic
 * targets. They do not restart collectors, mutate alert rules,
 * delete telemetry, modify dashboards, silence alerts, or execute
 * arbitrary shell commands.
 */

const {
  getObservabilityDiagnosticTarget,
} =
  require(
    '../../../services/observability/observabilityDiagnosticTargetRegistry'
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
    'privateKey',
    'private_key',
    'credential',
    'credentials',
    'authorization',
  ]);


const OBSERVABILITY_ACTIONS =
  Object.freeze({
    CHECK_TARGET_HEALTH:
      'observability/check_target_health',

    CHECK_METRICS_FLOW:
      'observability/check_metrics_flow',

    CHECK_LOGS_FLOW:
      'observability/check_logs_flow',

    CHECK_TRACES_FLOW:
      'observability/check_traces_flow',

    CHECK_COLLECTOR_HEALTH:
      'observability/check_collector_health',

    CHECK_SCRAPE_HEALTH:
      'observability/check_scrape_health',

    CHECK_ALERT_PIPELINE:
      'observability/check_alert_pipeline',

    CHECK_ALERT_DELIVERY:
      'observability/check_alert_delivery',

    CHECK_EXPORTER_HEALTH:
      'observability/check_exporter_health',

    CHECK_INGESTION_HEALTH:
      'observability/check_ingestion_health',

    CHECK_TELEMETRY_FRESHNESS:
      'observability/check_telemetry_freshness',

    CHECK_CARDINALITY:
      'observability/check_cardinality',
  });


const ACTION_METHODS =
  Object.freeze({
    [OBSERVABILITY_ACTIONS.CHECK_TARGET_HEALTH]:
      'checkTargetHealth',

    [OBSERVABILITY_ACTIONS.CHECK_METRICS_FLOW]:
      'checkMetricsFlow',

    [OBSERVABILITY_ACTIONS.CHECK_LOGS_FLOW]:
      'checkLogsFlow',

    [OBSERVABILITY_ACTIONS.CHECK_TRACES_FLOW]:
      'checkTracesFlow',

    [OBSERVABILITY_ACTIONS.CHECK_COLLECTOR_HEALTH]:
      'checkCollectorHealth',

    [OBSERVABILITY_ACTIONS.CHECK_SCRAPE_HEALTH]:
      'checkScrapeHealth',

    [OBSERVABILITY_ACTIONS.CHECK_ALERT_PIPELINE]:
      'checkAlertPipeline',

    [OBSERVABILITY_ACTIONS.CHECK_ALERT_DELIVERY]:
      'checkAlertDelivery',

    [OBSERVABILITY_ACTIONS.CHECK_EXPORTER_HEALTH]:
      'checkExporterHealth',

    [OBSERVABILITY_ACTIONS.CHECK_INGESTION_HEALTH]:
      'checkIngestionHealth',

    [OBSERVABILITY_ACTIONS.CHECK_TELEMETRY_FRESHNESS]:
      'checkTelemetryFreshness',

    [OBSERVABILITY_ACTIONS.CHECK_CARDINALITY]:
      'checkCardinality',
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


function validateObservabilityParams(
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


function validateObservabilityParamsForRegistry(
  params = {}
) {
  try {
    validateObservabilityParams(
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


async function executeObservabilityAction(
  action,
  params = {},
  context = {}
) {
  validateObservabilityParams(
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
      `Unsupported observability action: ${action}`
    );
  }


  const target =
    getObservabilityDiagnosticTarget(
      params.targetId
    );


  if (
    typeof target[
      targetMethod
    ] !==
      'function'
  ) {
    throw new Error(
      `Observability diagnostic target does not implement ${targetMethod}`
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
    `observability/${action}`;


  if (
    !ACTION_METHODS[
      fullAction
    ]
  ) {
    throw new Error(
      `Unsupported observability handler definition: ${fullAction}`
    );
  }


  return {
    type:
      'observability',

    action,

    metadata:
      baseMetadata(
        description
      ),

    validate(
      params = {}
    ) {
      return validateObservabilityParamsForRegistry(
        params
      );
    },

    async execute(
      params = {},
      context = {}
    ) {
      const execution =
        await executeObservabilityAction(
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
        'check_target_health',

      description:
        'Inspect health and reachability of an observability backend.',
    }),

    createReadOnlyHandler({
      action:
        'check_metrics_flow',

      description:
        'Inspect whether metrics telemetry is flowing to its destination.',
    }),

    createReadOnlyHandler({
      action:
        'check_logs_flow',

      description:
        'Inspect whether log telemetry is flowing to its destination.',
    }),

    createReadOnlyHandler({
      action:
        'check_traces_flow',

      description:
        'Inspect whether trace telemetry is flowing to its destination.',
    }),

    createReadOnlyHandler({
      action:
        'check_collector_health',

      description:
        'Inspect telemetry collector health without restarting the collector.',
    }),

    createReadOnlyHandler({
      action:
        'check_scrape_health',

      description:
        'Inspect metrics scrape health and target availability.',
    }),

    createReadOnlyHandler({
      action:
        'check_alert_pipeline',

      description:
        'Inspect alert processing and routing pipeline health.',
    }),

    createReadOnlyHandler({
      action:
        'check_alert_delivery',

      description:
        'Inspect alert delivery state without sending or mutating alerts.',
    }),

    createReadOnlyHandler({
      action:
        'check_exporter_health',

      description:
        'Inspect telemetry exporter health and delivery status.',
    }),

    createReadOnlyHandler({
      action:
        'check_ingestion_health',

      description:
        'Inspect telemetry backend ingestion health.',
    }),

    createReadOnlyHandler({
      action:
        'check_telemetry_freshness',

      description:
        'Inspect whether telemetry has become stale or stopped arriving.',
    }),

    createReadOnlyHandler({
      action:
        'check_cardinality',

      description:
        'Inspect metrics cardinality conditions without modifying series.',
    }),
  ]);


const observabilityHandlers =
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
  OBSERVABILITY_ACTIONS,
  ACTION_METHODS,

  handlers,
  observabilityHandlers,

  validateObservabilityParams,
  validateObservabilityParamsForRegistry,
  executeObservabilityAction,

  createReadOnlyHandler,
};