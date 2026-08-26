"use strict";

const PostgresCostAttributionRepository =
  require(
    "../../persistence/postgres/PostgresCostAttributionRepository"
  );

const {
  BILLING_COST_CODE_VALUES,

  isKnownBillingCostCode,
} =
  require(
    "../../constants/billingCostCategories"
  );

const {
  normalizeCurrency,

  validateMinorUnits,
} =
  require(
    "./costMoney"
  );

const {
  buildUsageIdempotencyKey,
} =
  require(
    "./usageIdempotency"
  );


class CostAttributionService {

  constructor(
    options = {}
  ) {
    this.repository =
      options.repository ||
      new PostgresCostAttributionRepository(
        options
      );
  }


  createError(
    message,
    code,
    status = 422,
    metadata = {}
  ) {
    const error =
      new Error(
        message
      );

    error.code =
      code;

    error.status =
      status;

    Object.assign(
      error,
      metadata
    );

    return error;
  }


  async record({
    organizationId,

    environmentId =
      null,

    costCode,

    currency =
      "USD",

    amountMinor,

    quantity =
      null,

    idempotencyKey,

    sourceType,

    sourceId =
      null,

    correlationId =
      null,

    incidentId =
      null,

    agentRunId =
      null,

    executionRequestId =
      null,

    integrationId =
      null,

    provider =
      null,

    model =
      null,

    occurredAt =
      new Date(),

    metadata =
      {},
  }) {
    if (
      !organizationId
    ) {
      throw this.createError(
        "Organization is required for cost attribution",
        "COST_ORGANIZATION_REQUIRED"
      );
    }


    if (
      !isKnownBillingCostCode(
        costCode
      )
    ) {
      throw this.createError(
        "Unknown billing cost code",
        "BILLING_COST_CODE_UNKNOWN",
        422,
        {
          costCode,

          knownCostCodes:
            BILLING_COST_CODE_VALUES,
        }
      );
    }


    const normalizedCurrency =
      normalizeCurrency(
        currency
      );


    const normalizedAmountMinor =
      validateMinorUnits(
        amountMinor
      );


    if (
      typeof idempotencyKey !==
        "string" ||
      idempotencyKey
        .trim()
        .length ===
        0
    ) {
      throw this.createError(
        "Cost idempotency key is required",
        "COST_IDEMPOTENCY_KEY_REQUIRED"
      );
    }


    if (
      typeof sourceType !==
        "string" ||
      sourceType
        .trim()
        .length ===
        0
    ) {
      throw this.createError(
        "Cost source type is required",
        "COST_SOURCE_TYPE_REQUIRED"
      );
    }


    return this.repository
      .recordCost({
        organizationId,

        environmentId,

        costCode,

        currency:
          normalizedCurrency,

        amountMinor:
          normalizedAmountMinor,

        quantity,

        idempotencyKey:
          idempotencyKey
            .trim(),

        sourceType:
          sourceType
            .trim(),

        sourceId,

        correlationId,

        incidentId,

        agentRunId,

        executionRequestId,

        integrationId,

        provider,

        model,

        occurredAt,

        metadata:
          metadata ||
          {},
      });
  }


  async recordLlmInferenceCost({
    organizationId,

    environmentId =
      null,

    agentRunId,

    incidentId =
      null,

    correlationId =
      null,

    provider,

    model,

    currency =
      "USD",

    amountMinor,

    inputTokens =
      0,

    outputTokens =
      0,

    metadata =
      {},
  }) {
    if (
      !agentRunId
    ) {
      throw this.createError(
        "Agent run identifier is required for LLM cost attribution",
        "COST_AGENT_RUN_REQUIRED"
      );
    }


    return this.record({
      organizationId,

      environmentId,

      costCode:
        "llm_inference",

      currency,

      amountMinor,

      quantity:
        Number(
          inputTokens
        ) +
        Number(
          outputTokens
        ),

      idempotencyKey:
        buildUsageIdempotencyKey(
          "cost",
          "llm",
          agentRunId
        ),

      sourceType:
        "agent_run",

      sourceId:
        agentRunId,

      agentRunId,

      incidentId,

      correlationId,

      provider,

      model,

      metadata: {
        ...metadata,

        inputTokens:
          Number(
            inputTokens
          ),

        outputTokens:
          Number(
            outputTokens
          ),
      },
    });
  }


  async rebuildPeriodAggregates(
    options
  ) {
    return this.repository
      .rebuildPeriodAggregates(
        options
      );
  }
}


const costAttributionService =
  new CostAttributionService();


module.exports = {
  CostAttributionService,

  costAttributionService,

  recordCost:
    costAttributionService
      .record
      .bind(
        costAttributionService
      ),

  recordLlmInferenceCost:
    costAttributionService
      .recordLlmInferenceCost
      .bind(
        costAttributionService
      ),
};