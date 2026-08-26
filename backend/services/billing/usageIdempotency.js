"use strict";


function normalizePart(
  value
) {
  return String(
    value ??
    ""
  )
    .trim()
    .replace(
      /\s+/g,
      "_"
    )
    .replace(
      /:/g,
      "_"
    );
}


function buildUsageIdempotencyKey(
  ...parts
) {
  const normalized =
    parts
      .map(
        normalizePart
      )
      .filter(
        Boolean
      );


  if (
    normalized.length ===
      0
  ) {
    const error =
      new Error(
        "Cannot create an empty usage idempotency key"
      );

    error.code =
      "USAGE_IDEMPOTENCY_KEY_EMPTY";

    throw error;
  }


  return normalized
    .join(
      ":"
    );
}


function autonomousRecoveryUsageKey({
  recoveryDecisionId,

  executionRequestId,
}) {
  const identity =
    recoveryDecisionId ||
    executionRequestId;


  if (
    !identity
  ) {
    const error =
      new Error(
        "Recovery billing requires a stable recovery or execution identifier"
      );

    error.code =
      "RECOVERY_BILLING_IDENTIFIER_REQUIRED";

    throw error;
  }


  return buildUsageIdempotencyKey(
    "autonomous_recovery",

    identity
  );
}


function agentRunUsageKey(
  agentRunId
) {
  if (
    !agentRunId
  ) {
    const error =
      new Error(
        "Agent run identifier is required"
      );

    error.code =
      "AGENT_RUN_IDENTIFIER_REQUIRED";

    throw error;
  }


  return buildUsageIdempotencyKey(
    "agent_run",

    agentRunId
  );
}


function incidentUsageKey(
  incidentId
) {
  if (
    !incidentId
  ) {
    const error =
      new Error(
        "Incident identifier is required"
      );

    error.code =
      "INCIDENT_IDENTIFIER_REQUIRED";

    throw error;
  }


  return buildUsageIdempotencyKey(
    "incident",

    incidentId
  );
}


module.exports = {
  buildUsageIdempotencyKey,

  autonomousRecoveryUsageKey,

  agentRunUsageKey,

  incidentUsageKey,
};