"use strict";

const signalIngestionService =
  require(
    "../signals/signalIngestionService"
  );

const PostgresReliabilityLabRepository =
  require(
    "../../persistence/postgres/PostgresReliabilityLabRepository"
  );


const CORRELATION_HARNESS_VERSION =
  "21.12-v1";


const FORBIDDEN_GROUND_TRUTH_KEYS =
  Object.freeze(
    new Set([
      "groundTruth",
      "ground_truth",

      "expectedFailureMode",
      "expected_failure_mode",

      "expectedDiagnosis",
      "expected_diagnosis",

      "expectedRootCause",
      "expected_root_cause",

      "expectedRecovery",
      "expected_recovery",

      "expectedPlaybook",
      "expected_playbook",

      "expectedRunbook",
      "expected_runbook",

      "diagnosisCorrect",
      "recoveryCorrect",

      "injectedFailureType",
      "injected_failure_type",

      "evaluatorGroundTruth",
      "evaluator_ground_truth",
    ])
  );


class AiraCorrelationHarness {
  constructor(
    options = {}
  ) {
    this.signalIngestionService =
      options.signalIngestionService ||
      signalIngestionService;


    this.repository =
      options.repository ||
      new PostgresReliabilityLabRepository(
        options
      );


    this.now =
      options.now ||
      (() =>
        new Date());
  }


  /**
   * --------------------------------------------------------------------------
   * Observe one experiment through AIRA's canonical signal pipeline.
   *
   * This method intentionally DOES NOT receive experiment ground truth.
   *
   * Flow:
   *
   * observable signal
   *   -> canonical SignalIngestionService
   *   -> signal persistence
   *   -> correlation
   *   -> correlation group
   *   -> routing
   *   -> incident path when AIRA decides it is warranted
   *
   * The harness merely observes the result.
   * --------------------------------------------------------------------------
   */
  async observe(
    {
      organizationId,

      environmentId,

      tenantId,

      experimentRunId,

      correlationId,

      observableSignal,

      ingestionContext =
        {},

      ingestionOptions =
        {},
    }
  ) {
    requireNonEmpty(
      organizationId,
      "organizationId"
    );


    requireNonEmpty(
      environmentId,
      "environmentId"
    );


    requireNonEmpty(
      tenantId,
      "tenantId"
    );


    requireNonEmpty(
      experimentRunId,
      "experimentRunId"
    );


    requireNonEmpty(
      correlationId,
      "correlationId"
    );


    if (
      !observableSignal ||
      typeof observableSignal !==
        "object" ||
      Array.isArray(
        observableSignal
      )
    ) {
      throw harnessError(
        "PHASE21_OBSERVABLE_SIGNAL_REQUIRED",
        "AIRA correlation harness requires an observable signal"
      );
    }


    assertNoGroundTruth(
      observableSignal
    );


    assertNoGroundTruth(
      ingestionContext
    );


    assertNoGroundTruth(
      ingestionOptions
    );


    const startedAt =
      this.now();


    /*
     * Important:
     *
     * correlationId is experiment provenance/correlation metadata.
     * It is NOT the injected ground truth.
     */
    const context = {
      ...ingestionContext,

      organizationId,

      environmentId,

      tenantId,

      correlationId,

      reliabilityLab: {
        phase:
          "21.12",

        experimentRunId,

        safetyClass:
          "LAB_ONLY",

        executionAuthorized:
          false,
      },
    };


    const ingestionResult =
      await this
        .signalIngestionService
        .ingest(
          observableSignal,
          context,
          ingestionOptions
        );


    const completedAt =
      this.now();


    const normalized =
      normalizeIngestionResult(
        ingestionResult
      );


    const observation = {
      harnessVersion:
        CORRELATION_HARNESS_VERSION,

      experimentRunId,

      correlationId,

      accepted:
        normalized.accepted,

      duplicate:
        normalized.duplicate,

      signalId:
        normalized.signalId,

      correlationGroupId:
        normalized.correlationGroupId,

      correlationObserved:
        normalized.correlationObserved,

      incidentCandidate:
        normalized.incidentCandidate,

      incidentId:
        normalized.incidentId,

      routed:
        normalized.routed,

      routingReason:
        normalized.routingReason,

      startedAt:
        toIso(
          startedAt
        ),

      completedAt:
        toIso(
          completedAt
        ),

      durationMs:
        durationMs(
          startedAt,
          completedAt
        ),

      /*
       * This is observational only.
       *
       * 21.13 decides whether detection was correct.
       */
      detectionCorrect:
        null,

      /*
       * 21.14 decides whether diagnosis was correct.
       */
      diagnosisCorrect:
        null,

      groundTruthConsumed:
        false,

      evaluatorInfluencedReasoning:
        false,

      productionCertified:
        false,

      executionAuthorized:
        false,
    };


    await this.repository
      .appendObservation({
        organizationId,

        environmentId,

        experimentRunId,

        observationType:
          "AIRA_CORRELATION_RESULT",

        source:
          "PHASE21_AIRA_CORRELATION_HARNESS",

        observedAt:
          completedAt,

        referenceType:
          normalized.incidentId
            ? "INCIDENT"
            : normalized.signalId
              ? "SIGNAL"
              : null,

        referenceId:
          normalized.incidentId ||
          normalized.signalId ||
          null,

        summary:
          observation,
      });


    return observation;
  }
}


// ============================================================================
// INGESTION RESULT NORMALIZATION
// ============================================================================

function normalizeIngestionResult(
  result
) {
  const signal =
    result?.signal ||
    null;


  const correlation =
    result?.correlation ||
    null;


  const group =
    result?.correlationGroup ||
    null;


  const routing =
    result?.routing ||
    null;


  const incidentResult =
    routing?.incidentResult ||
    result?.incidentResult ||
    null;


  const incidentId =
    firstNonEmpty(
      incidentResult?.incidentId,

      incidentResult?.id,

      incidentResult?.publicId,

      incidentResult?.incident?.publicId,

      incidentResult?.incident?.incidentId,

      incidentResult?.incident?._id
    );


  const signalId =
    firstNonEmpty(
      signal?.signalId,

      signal?.publicId,

      signal?._id
    );


  const correlationGroupId =
    firstNonEmpty(
      group?.correlationGroupId,

      group?.publicId,

      group?._id,

      correlation?.correlationGroupId,

      signal?.correlationGroupId
    );


  const correlationObserved =
    Boolean(
      correlation?.correlated ===
        true ||
      correlationGroupId
    );


  return {
    accepted:
      result?.accepted ===
      true,

    duplicate:
      result?.duplicate ===
      true,

    signalId:
      signalId
        ? String(
            signalId
          )
        : null,

    correlationGroupId:
      correlationGroupId
        ? String(
            correlationGroupId
          )
        : null,

    correlationObserved,

    incidentCandidate:
      Boolean(
        routing?.incidentCandidate ??
        signal?.incidentCandidate
      ),

    incidentId:
      incidentId
        ? String(
            incidentId
          )
        : null,

    routed:
      routing?.routed ===
      true,

    routingReason:
      routing?.reason ||
      null,
  };
}


// ============================================================================
// GROUND-TRUTH FIREWALL
// ============================================================================

function assertNoGroundTruth(
  value,
  path =
    "$",
  seen =
    new Set()
) {
  if (
    value ===
      null ||
    value ===
      undefined
  ) {
    return true;
  }


  if (
    typeof value !==
      "object"
  ) {
    return true;
  }


  if (
    seen.has(
      value
    )
  ) {
    return true;
  }


  seen.add(
    value
  );


  if (
    Array.isArray(
      value
    )
  ) {
    for (
      let index =
        0;
      index <
        value.length;
      index +=
        1
    ) {
      assertNoGroundTruth(
        value[index],
        `${path}[${index}]`,
        seen
      );
    }


    return true;
  }


  for (
    const [
      key,
      child,
    ]
    of Object.entries(
      value
    )
  ) {
    if (
      FORBIDDEN_GROUND_TRUTH_KEYS
        .has(
          key
        )
    ) {
      throw harnessError(
        "PHASE21_GROUND_TRUTH_LEAK_BLOCKED",
        `Ground-truth field cannot enter AIRA reasoning path: ${path}.${key}`,
        {
          field:
            key,

          path:
            `${path}.${key}`,
        }
      );
    }


    assertNoGroundTruth(
      child,
      `${path}.${key}`,
      seen
    );
  }


  return true;
}


// ============================================================================
// HELPERS
// ============================================================================

function firstNonEmpty(
  ...values
) {
  for (
    const value
    of values
  ) {
    if (
      value !==
        null &&
      value !==
        undefined &&
      String(
        value
      )
        .trim() !==
        ""
    ) {
      return value;
    }
  }


  return null;
}


function requireNonEmpty(
  value,
  field
) {
  if (
    value ===
      null ||
    value ===
      undefined ||
    String(
      value
    )
      .trim() ===
      ""
  ) {
    throw harnessError(
      "PHASE21_CORRELATION_CONTEXT_REQUIRED",
      `${field} is required`,
      {
        field,
      }
    );
  }
}


function durationMs(
  start,
  end
) {
  const left =
    new Date(
      start
    )
      .getTime();


  const right =
    new Date(
      end
    )
      .getTime();


  if (
    !Number.isFinite(
      left
    ) ||
    !Number.isFinite(
      right
    ) ||
    right <
      left
  ) {
    return null;
  }


  return right -
    left;
}


function toIso(
  value
) {
  if (
    value instanceof
      Date
  ) {
    return value
      .toISOString();
  }


  return new Date(
    value
  )
    .toISOString();
}


function harnessError(
  code,
  message,
  extra = {}
) {
  return Object.assign(
    new Error(
      message
    ),
    {
      name:
        "AiraCorrelationHarnessError",

      code,

      productionCertified:
        false,

      executionAuthorized:
        false,

      ...extra,
    }
  );
}


// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  CORRELATION_HARNESS_VERSION,

  FORBIDDEN_GROUND_TRUTH_KEYS,

  AiraCorrelationHarness,

  normalizeIngestionResult,

  assertNoGroundTruth,
};