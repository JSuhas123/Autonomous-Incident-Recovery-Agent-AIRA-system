"use strict";


const BILLING_COST_CATEGORIES =
  Object.freeze({

    LLM:
      "LLM",

    COMPUTE:
      "COMPUTE",

    STORAGE:
      "STORAGE",

    NETWORK:
      "NETWORK",

    VECTOR:
      "VECTOR",

    NOTIFICATION:
      "NOTIFICATION",

    PAYMENT_PROCESSING:
      "PAYMENT_PROCESSING",

    DATABASE:
      "DATABASE",

    OTHER:
      "OTHER",
  });


const BILLING_COST_CODES =
  Object.freeze({

    LLM_INFERENCE:
      "llm_inference",

    COMPUTE_RUNTIME:
      "compute_runtime",

    DATABASE_USAGE:
      "database_usage",

    OBJECT_STORAGE:
      "object_storage",

    NETWORK_TRANSFER:
      "network_transfer",

    VECTOR_EMBEDDING:
      "vector_embedding",

    VECTOR_STORAGE:
      "vector_storage",

    NOTIFICATION_DELIVERY:
      "notification_delivery",

    PAYMENT_PROCESSING:
      "payment_processing",
  });


const BILLING_COST_CODE_VALUES =
  Object.freeze(
    Object.values(
      BILLING_COST_CODES
    )
  );


function isKnownBillingCostCode(
  value
) {
  return (
    typeof value ===
      "string" &&
    BILLING_COST_CODE_VALUES
      .includes(
        value
      )
  );
}


module.exports = {
  BILLING_COST_CATEGORIES,

  BILLING_COST_CODES,

  BILLING_COST_CODE_VALUES,

  isKnownBillingCostCode,
};