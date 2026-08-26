
"use strict";


const BILLING_METERS =
  Object.freeze({

    INCIDENTS_PROCESSED:
      "incidents_processed",

    AGENT_RUNS:
      "agent_runs",

    LLM_INPUT_TOKENS:
      "llm_input_tokens",

    LLM_OUTPUT_TOKENS:
      "llm_output_tokens",

    INTEGRATION_QUERIES:
      "integration_queries",

    TELEMETRY_BYTES:
      "telemetry_bytes",

    PLAYBOOK_EXECUTIONS:
      "playbook_executions",

    AUTONOMOUS_RECOVERIES:
      "autonomous_recoveries",

    EVIDENCE_STORAGE_BYTES:
      "evidence_storage_bytes",

    VECTOR_EMBEDDINGS:
      "vector_embeddings",

    NOTIFICATIONS:
      "notifications",

    ENVIRONMENTS:
      "environments",

    USERS:
      "users",

    RESOURCES:
      "resources",
  });


const BILLING_METER_VALUES =
  Object.freeze(
    Object.values(
      BILLING_METERS
    )
  );


function isKnownBillingMeter(
  value
) {
  return (
    typeof value ===
      "string" &&
    BILLING_METER_VALUES
      .includes(
        value
      )
  );
}


module.exports = {
  BILLING_METERS,

  BILLING_METER_VALUES,

  isKnownBillingMeter,
};