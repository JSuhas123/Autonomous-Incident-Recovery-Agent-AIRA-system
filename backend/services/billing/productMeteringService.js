"use strict";

const {
  BILLING_METERS,
} =
  require(
    "../../constants/billingMeters"
  );

const {
  recordUsage,
} =
  require(
    "./usageMeterService"
  );

  const {
  recordLlmInferenceCost,
} =
  require(
    "./costAttributionService"
  );
const {
  incidentUsageKey,
  agentRunUsageKey,
  buildUsageIdempotencyKey,
} =
  require(
    "./usageIdempotency"
  );


function recordIncidentProcessed({
  organizationId,
  environmentId,
  incidentId,
  correlationId =
    null,
  metadata =
    {},
}) {
  return recordUsage({
    organizationId,

    environmentId,

    meterCode:
      BILLING_METERS
        .INCIDENTS_PROCESSED,

    quantity:
      1,

    idempotencyKey:
      incidentUsageKey(
        incidentId
      ),

    sourceType:
      "incident",

    sourceId:
      incidentId,

    incidentId,

    correlationId,

    metadata,
  });
}


async function recordAgentRun({
  organizationId,
  environmentId,

  agentRunId,

  incidentId =
    null,

  correlationId =
    null,

  budgetUsage =
    {},

  metadata =
    {},
}) {
  const results =
    [];


  results.push(
    await recordUsage({
      organizationId,

      environmentId,

      meterCode:
        BILLING_METERS
          .AGENT_RUNS,

      quantity:
        1,

      idempotencyKey:
        agentRunUsageKey(
          agentRunId
        ),

      sourceType:
        "agent_run",

      sourceId:
        agentRunId,

      agentRunId,

      incidentId,

      correlationId,

      metadata,
    })
  );


  const inputTokens =
    Number(
      budgetUsage
        ?.inputTokens ||
      0
    );


  if (
    inputTokens >
      0
  ) {
    results.push(
      await recordUsage({
        organizationId,

        environmentId,

        meterCode:
          BILLING_METERS
            .LLM_INPUT_TOKENS,

        quantity:
          inputTokens,

        idempotencyKey:
          buildUsageIdempotencyKey(
            "agent_run",
            agentRunId,
            "llm_input_tokens"
          ),

        sourceType:
          "agent_run",

        sourceId:
          agentRunId,

        agentRunId,

        incidentId,

        correlationId,

        metadata,
      })
    );
  }


  const outputTokens =
    Number(
      budgetUsage
        ?.outputTokens ||
      0
    );


  if (
    outputTokens >
      0
  ) {
    results.push(
      await recordUsage({
        organizationId,

        environmentId,

        meterCode:
          BILLING_METERS
            .LLM_OUTPUT_TOKENS,

        quantity:
          outputTokens,

        idempotencyKey:
          buildUsageIdempotencyKey(
            "agent_run",
            agentRunId,
            "llm_output_tokens"
          ),

        sourceType:
          "agent_run",

        sourceId:
          agentRunId,

        agentRunId,

        incidentId,

        correlationId,

        metadata,
      })
    );
  }


  return results;
}


function recordIntegrationQuery({
  organizationId,
  environmentId,

  integrationId,

  operation,

  requestId,

  metadata =
    {},
}) {
  return recordUsage({
    organizationId,

    environmentId,

    meterCode:
      BILLING_METERS
        .INTEGRATION_QUERIES,

    quantity:
      1,

    idempotencyKey:
      buildUsageIdempotencyKey(
        "integration",
        integrationId,
        operation,
        requestId
      ),

    sourceType:
      "integration_query",

    sourceId:
      integrationId,

    integrationId,

    metadata: {
      ...metadata,

      operation,
    },
  });
}


function recordPlaybookExecution({
  organizationId,
  environmentId,

  playbookExecutionId,

  incidentId =
    null,

  correlationId =
    null,

  metadata =
    {},
}) {
  return recordUsage({
    organizationId,

    environmentId,

    meterCode:
      BILLING_METERS
        .PLAYBOOK_EXECUTIONS,

    quantity:
      1,

    idempotencyKey:
      buildUsageIdempotencyKey(
        "playbook_execution",
        playbookExecutionId
      ),

    sourceType:
      "playbook_execution",

    sourceId:
      playbookExecutionId,

    incidentId,

    correlationId,

    metadata,
  });
}


function recordNotification({
  organizationId,

  environmentId =
    null,

  notificationId,

  metadata =
    {},
}) {
  return recordUsage({
    organizationId,

    environmentId,

    meterCode:
      BILLING_METERS
        .NOTIFICATIONS,

    quantity:
      1,

    idempotencyKey:
      buildUsageIdempotencyKey(
        "notification",
        notificationId
      ),

    sourceType:
      "notification",

    sourceId:
      notificationId,

    metadata,
  });
}


function recordResourceCount({
  organizationId,
  environmentId,

  snapshotId,

  count,

  metadata =
    {},
}) {
  if (
    Number(
      count
    ) <=
      0
  ) {
    return Promise.resolve({
      created:
        false,

      skipped:
        true,
    });
  }


  return recordUsage({
    organizationId,

    environmentId,

    meterCode:
      BILLING_METERS
        .RESOURCES,

    quantity:
      Number(
        count
      ),

    idempotencyKey:
      buildUsageIdempotencyKey(
        "resource_snapshot",
        snapshotId
      ),

    sourceType:
      "resource_snapshot",

    sourceId:
      snapshotId,

    metadata,
  });
}

async function recordAgentEconomics({
  organizationId,

  environmentId =
    null,

  agentRunId,

  incidentId =
    null,

  correlationId =
    null,

  provider =
    null,

  model =
    null,

  inputTokens =
    0,

  outputTokens =
    0,

  estimatedCostMinor =
    null,

  costCurrency =
    "USD",

  metadata =
    {},
}) {
  /**
   * Metering and cost attribution deliberately remain separate.
   *
   * Usage describes what happened.
   *
   * Cost attribution describes what it cost AIRA.
   */

  const usageResults =
    await recordAgentRun({
      organizationId,

      environmentId,

      agentRunId,

      incidentId,

      correlationId,

      budgetUsage: {
        inputTokens,

        outputTokens,
      },

      metadata,
    });


  let costResult =
    null;


  if (
    estimatedCostMinor !==
      null &&
    estimatedCostMinor !==
      undefined
  ) {
    costResult =
      await recordLlmInferenceCost({
        organizationId,

        environmentId,

        agentRunId,

        incidentId,

        correlationId,

        provider,

        model,

        currency:
          costCurrency,

        amountMinor:
          estimatedCostMinor,

        inputTokens,

        outputTokens,

        metadata,
      });
  }


  return {
    usage:
      usageResults,

    cost:
      costResult,
  };
}

module.exports = {
  recordIncidentProcessed,

  recordAgentRun,

  recordIntegrationQuery,
recordAgentEconomics,

  recordPlaybookExecution,

  recordNotification,

  recordResourceCount,
};