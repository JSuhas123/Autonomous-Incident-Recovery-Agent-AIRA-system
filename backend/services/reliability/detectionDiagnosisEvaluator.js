"use strict";


const PostgresReliabilityLabRepository =
  require(
    "../../persistence/postgres/PostgresReliabilityLabRepository"
  );


const {
  EXPERIMENT_ASSERTION,
} =
  require(
    "../../constants/reliabilityLab"
  );


const DETECTION_DIAGNOSIS_EVALUATOR_VERSION =
  "21.13-14-v2";


const ASSERTION_STATUS =
  Object.freeze({
    PASS:
      "PASS",

    FAIL:
      "FAIL",

    INCONCLUSIVE:
      "INCONCLUSIVE",

    NOT_APPLICABLE:
      "NOT_APPLICABLE",
  });


class DetectionDiagnosisEvaluator {
  constructor(
    options = {}
  ) {
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


  async evaluate(
    {
      organizationId,

      environmentId,

      experimentRunId,

      groundTruth,

      correlation,

      diagnosisObservation =
        null,

      failureInjectedAt =
        null,

      firstObservableAt =
        null,

      incidentCreatedAt =
        null,
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
      experimentRunId,
      "experimentRunId"
    );


    if (
      !groundTruth ||
      typeof groundTruth !==
        "object" ||
      Array.isArray(
        groundTruth
      )
    ) {
      throw evaluatorError(
        "PHASE21_EVALUATOR_GROUND_TRUTH_REQUIRED",
        "Detection/diagnosis evaluation requires evaluator-owned ground truth"
      );
    }


    if (
      !correlation ||
      typeof correlation !==
        "object" ||
      Array.isArray(
        correlation
      )
    ) {
      throw evaluatorError(
        "PHASE21_CORRELATION_RESULT_REQUIRED",
        "Detection evaluation requires the actual AIRA correlation result"
      );
    }


    assertNonAuthorizing(
      correlation,
      "correlation"
    );


    if (
      diagnosisObservation
    ) {
      assertNonAuthorizing(
        diagnosisObservation,
        "diagnosis observation"
      );
    }


    const detection =
      evaluateDetection(
        correlation
      );


    const correlationEvaluation =
      evaluateCorrelation(
        correlation
      );


    const diagnosis =
      evaluateDiagnosis(
        groundTruth,
        diagnosisObservation
      );


    const evaluatedAt =
      this.now();


    await this.persistAssertion({
      organizationId,

      environmentId,

      experimentRunId,

      assertionKey:
        EXPERIMENT_ASSERTION
          .DETECTED,

      evaluation:
        detection,

      evaluatedAt,
    });


    await this.persistAssertion({
      organizationId,

      environmentId,

      experimentRunId,

      assertionKey:
        EXPERIMENT_ASSERTION
          .CORRELATED,

      evaluation:
        correlationEvaluation,

      evaluatedAt,
    });


    await this.persistAssertion({
      organizationId,

      environmentId,

      experimentRunId,

      assertionKey:
        EXPERIMENT_ASSERTION
          .DIAGNOSIS_CORRECT,

      evaluation:
        diagnosis,

      evaluatedAt,
    });


    const metrics =
      await this.persistMetrics({
        organizationId,

        environmentId,

        experimentRunId,

        failureInjectedAt,

        firstObservableAt,

        signalReceivedAt:
          correlation.completedAt ||
          correlation.startedAt ||
          null,

        incidentCreatedAt,

        diagnosisObservation,
      });


    const result = {
      evaluatorVersion:
        DETECTION_DIAGNOSIS_EVALUATOR_VERSION,

      experimentRunId,

      detection,

      correlation:
        correlationEvaluation,

      diagnosis,

      metrics,

      groundTruthUsedByEvaluator:
        true,

      groundTruthPassedToAira:
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
          "DETECTION_DIAGNOSIS_EVALUATION",

        source:
          "PHASE21_DETECTION_DIAGNOSIS_EVALUATOR",

        observedAt:
          evaluatedAt,

        referenceType:
          diagnosisObservation
            ?.incidentId
            ? "INCIDENT"
            : correlation
                .signalId
              ? "SIGNAL"
              : null,

        referenceId:
          diagnosisObservation
            ?.incidentId ||
          correlation
            .signalId ||
          null,

        summary:
          result,
      });


    return result;
  }


  async persistAssertion(
    {
      organizationId,

      environmentId,

      experimentRunId,

      assertionKey,

      evaluation,

      evaluatedAt,
    }
  ) {
    return this.repository
      .upsertAssertionResult({
        organizationId,

        environmentId,

        experimentRunId,

        assertionKey,

        status:
          evaluation.status,

        expected:
          evaluation.expected,

        actual:
          evaluation.actual,

        reasonCode:
          evaluation.reasonCode,

        details: {
          evaluatorVersion:
            DETECTION_DIAGNOSIS_EVALUATOR_VERSION,

          evaluatedAt:
            toIso(
              evaluatedAt
            ),

          ...evaluation.details,

          productionCertified:
            false,

          executionAuthorized:
            false,
        },
      });
  }


  async persistMetrics(
    {
      organizationId,

      environmentId,

      experimentRunId,

      failureInjectedAt,

      firstObservableAt,

      signalReceivedAt,

      incidentCreatedAt,

      diagnosisObservation,
    }
  ) {
    const metrics =
      {};


    const timeToObservableMs =
      elapsedMs(
        failureInjectedAt,
        firstObservableAt
      );


    const timeToSignalMs =
      elapsedMs(
        failureInjectedAt,
        signalReceivedAt
      );


    const timeToIncidentMs =
      elapsedMs(
        failureInjectedAt,
        incidentCreatedAt
      );


    const diagnosisLatencyMs =
      finiteNumberOrNull(
        diagnosisObservation
          ?.durationMs
      );


    const diagnosisConfidence =
      finiteNumberOrNull(
        diagnosisObservation
          ?.diagnosisConfidence
      );


    if (
      timeToObservableMs !==
      null
    ) {
      metrics.timeToObservableMs =
        timeToObservableMs;


      await this.persistMetric(
        organizationId,
        environmentId,
        experimentRunId,
        "time_to_observable_ms",
        timeToObservableMs,
        "ms"
      );
    }


    if (
      timeToSignalMs !==
      null
    ) {
      metrics.timeToSignalMs =
        timeToSignalMs;


      await this.persistMetric(
        organizationId,
        environmentId,
        experimentRunId,
        "time_to_signal_ms",
        timeToSignalMs,
        "ms"
      );
    }


    if (
      timeToIncidentMs !==
      null
    ) {
      metrics.timeToIncidentMs =
        timeToIncidentMs;


      await this.persistMetric(
        organizationId,
        environmentId,
        experimentRunId,
        "time_to_incident_ms",
        timeToIncidentMs,
        "ms"
      );
    }


    if (
      diagnosisLatencyMs !==
      null
    ) {
      metrics.diagnosisLatencyMs =
        diagnosisLatencyMs;


      await this.persistMetric(
        organizationId,
        environmentId,
        experimentRunId,
        "diagnosis_latency_ms",
        diagnosisLatencyMs,
        "ms"
      );
    }


    if (
      diagnosisConfidence !==
      null
    ) {
      metrics.diagnosisConfidence =
        diagnosisConfidence;


      await this.persistMetric(
        organizationId,
        environmentId,
        experimentRunId,
        "diagnosis_confidence",
        diagnosisConfidence,
        "ratio"
      );
    }


    return metrics;
  }


  async persistMetric(
    organizationId,
    environmentId,
    experimentRunId,
    metricKey,
    value,
    unit
  ) {
    return this.repository
      .upsertMetric({
        organizationId,

        environmentId,

        experimentRunId,

        metricKey,

        value,

        unit,

        metadata: {
          evaluatorVersion:
            DETECTION_DIAGNOSIS_EVALUATOR_VERSION,

          productionCertified:
            false,

          executionAuthorized:
            false,
        },
      });
  }
}


// ============================================================================
// DETECTION CORRECTNESS
// ============================================================================

function evaluateDetection(
  correlation
) {
  const accepted =
    correlation.accepted ===
    true;


  const hasSignal =
    Boolean(
      firstNonEmpty(
        correlation.signalId
      )
    );


  const incidentCandidate =
    correlation
      .incidentCandidate ===
    true;


  const detected =
    accepted &&
    hasSignal &&
    incidentCandidate;


  return {
    status:
      detected
        ? ASSERTION_STATUS
            .PASS
        : ASSERTION_STATUS
            .FAIL,

    expected: {
      detected:
        true,
    },

    actual: {
      detected,

      accepted,

      duplicate:
        correlation
          .duplicate ===
        true,

      signalId:
        correlation
          .signalId ||
        null,

      incidentCandidate,

      routed:
        correlation
          .routed ===
        true,

      routingReason:
        correlation
          .routingReason ||
        null,

      incidentId:
        correlation
          .incidentId ||
        null,
    },

    reasonCode:
      detected
        ? "EXPECTED_FAILURE_DETECTED"
        : !accepted
          ? "SIGNAL_NOT_ACCEPTED"
          : !hasSignal
            ? "SIGNAL_ID_NOT_OBSERVED"
            : "FAILURE_NOT_CLASSIFIED_AS_INCIDENT_CANDIDATE",

    details: {
      incidentObserved:
        Boolean(
          correlation
            .incidentId
        ),
    },
  };
}


// ============================================================================
// CORRELATION CORRECTNESS
// ============================================================================

function evaluateCorrelation(
  correlation
) {
  const correlated =
    correlation
      .correlationObserved ===
      true &&
    Boolean(
      firstNonEmpty(
        correlation
          .correlationGroupId
      )
    );


  return {
    status:
      correlated
        ? ASSERTION_STATUS
            .PASS
        : ASSERTION_STATUS
            .FAIL,

    expected: {
      correlated:
        true,
    },

    actual: {
      correlated,

      correlationObserved:
        correlation
          .correlationObserved ===
        true,

      correlationGroupId:
        correlation
          .correlationGroupId ||
        null,

      signalId:
        correlation
          .signalId ||
        null,
    },

    reasonCode:
      correlated
        ? "EXPECTED_CORRELATION_OBSERVED"
        : "EXPECTED_CORRELATION_NOT_OBSERVED",

    details: {},
  };
}


// ============================================================================
// DIAGNOSIS CORRECTNESS
// ============================================================================

function evaluateDiagnosis(
  groundTruth,
  diagnosisObservation
) {
  const expectedFailureMode =
    firstNonEmpty(
      groundTruth
        .expectedFailureModeKey,

      groundTruth
        .expectedDiagnosis
    );


  if (
    !diagnosisObservation
  ) {
    return {
      status:
        ASSERTION_STATUS
          .INCONCLUSIVE,

      expected: {
        selectedFailureMode:
          expectedFailureMode,

        expectedDiagnosis:
          groundTruth
            .expectedDiagnosis ||
          null,
      },

      actual: {
        diagnosisObserved:
          false,

        selectedFailureMode:
          null,
      },

      reasonCode:
        "DIAGNOSIS_NOT_OBSERVED",

      details: {
        incidentRequired:
          true,
      },
    };
  }


  const selectedFailureMode =
    firstNonEmpty(
      diagnosisObservation
        .selectedFailureMode
    );


  const diagnosisOutcome =
    firstNonEmpty(
      diagnosisObservation
        .diagnosisOutcome
    );


  const diagnosisConfidence =
    finiteNumberOrNull(
      diagnosisObservation
        .diagnosisConfidence
    );


  const evidenceCompleteness =
    finiteNumberOrNull(
      diagnosisObservation
        .evidenceCompleteness
    );


  /*
   * SAFETY / EVALUATION LAW:
   *
   * Machine-readable identity alone cannot produce a diagnosis PASS.
   *
   * If AIRA itself concludes that evidence is insufficient, the evaluator
   * must preserve that uncertainty even if a machine-readable identity field
   * happens to match evaluator-owned ground truth.
   */
  if (
    String(
      diagnosisOutcome ||
      ""
    )
      .trim()
      .toUpperCase() ===
      "INSUFFICIENT_EVIDENCE"
  ) {
    return {
      status:
        ASSERTION_STATUS
          .INCONCLUSIVE,

      expected: {
        selectedFailureMode:
          expectedFailureMode,

        expectedDiagnosis:
          groundTruth
            .expectedDiagnosis ||
          null,
      },

      actual: {
        diagnosisObserved:
          true,

        selectedFailureMode:
          selectedFailureMode ||
          null,

        diagnosisOutcome:
          diagnosisOutcome ||
          null,

        diagnosisConfidence,

        evidenceCompleteness,

        primaryHypothesisId:
          diagnosisObservation
            .primaryHypothesisId ||
          null,

        verificationStatus:
          diagnosisObservation
            .verificationStatus ||
          null,
      },

      reasonCode:
        "DIAGNOSIS_INSUFFICIENT_EVIDENCE",

      details: {
        explanation:
          "AIRA explicitly reported insufficient evidence; matching identity alone cannot certify diagnosis correctness.",

        supportingEvidenceCount:
          diagnosisObservation
            .supportingEvidenceCount ??
          0,

        contradictingEvidenceCount:
          diagnosisObservation
            .contradictingEvidenceCount ??
          0,
      },
    };
  }


  /*
   * Diagnosis confidence must be meaningful.
   *
   * null/undefined/empty is not zero.
   * zero confidence is also not enough for correctness certification.
   */
  if (
    diagnosisConfidence ===
      null ||
    diagnosisConfidence <=
      0
  ) {
    return {
      status:
        ASSERTION_STATUS
          .INCONCLUSIVE,

      expected: {
        selectedFailureMode:
          expectedFailureMode,

        expectedDiagnosis:
          groundTruth
            .expectedDiagnosis ||
          null,
      },

      actual: {
        diagnosisObserved:
          true,

        selectedFailureMode:
          selectedFailureMode ||
          null,

        diagnosisOutcome:
          diagnosisOutcome ||
          null,

        diagnosisConfidence,

        evidenceCompleteness,

        primaryHypothesisId:
          diagnosisObservation
            .primaryHypothesisId ||
          null,

        verificationStatus:
          diagnosisObservation
            .verificationStatus ||
          null,
      },

      reasonCode:
        "DIAGNOSIS_CONFIDENCE_INSUFFICIENT",

      details: {
        explanation:
          "AIRA did not expose positive diagnosis confidence, so diagnosis correctness cannot be certified.",

        supportingEvidenceCount:
          diagnosisObservation
            .supportingEvidenceCount ??
          0,

        contradictingEvidenceCount:
          diagnosisObservation
            .contradictingEvidenceCount ??
          0,
      },
    };
  }


  /*
   * Do NOT invent machine-readable diagnosis identity by interpreting
   * arbitrary natural-language hypotheses.
   *
   * If the canonical AIRA diagnosis boundary does not expose identity,
   * Phase 21.14 remains INCONCLUSIVE.
   */
  if (
    !selectedFailureMode
  ) {
    return {
      status:
        ASSERTION_STATUS
          .INCONCLUSIVE,

      expected: {
        selectedFailureMode:
          expectedFailureMode,

        expectedDiagnosis:
          groundTruth
            .expectedDiagnosis ||
          null,
      },

      actual: {
        diagnosisObserved:
          true,

        selectedFailureMode:
          null,

        diagnosisOutcome:
          diagnosisOutcome ||
          null,

        diagnosisConfidence,

        evidenceCompleteness,

        primaryHypothesisId:
          diagnosisObservation
            .primaryHypothesisId ||
          null,

        verificationStatus:
          diagnosisObservation
            .verificationStatus ||
          null,
      },

      reasonCode:
        "DIAGNOSIS_IDENTITY_NOT_EXPOSED",

      details: {
        explanation:
          "AIRA produced diagnosis evidence but no canonical machine-readable failure-mode identity was exposed.",

        supportingEvidenceCount:
          diagnosisObservation
            .supportingEvidenceCount ??
          0,

        contradictingEvidenceCount:
          diagnosisObservation
            .contradictingEvidenceCount ??
          0,
      },
    };
  }


  const expectedCandidates =
    [
      groundTruth
        .expectedFailureModeKey,

      groundTruth
        .expectedDiagnosis,
    ]
      .filter(
        Boolean
      )
      .map(
        normalizeIdentity
      );


  const actualIdentity =
    normalizeIdentity(
      selectedFailureMode
    );


  const correct =
    expectedCandidates
      .includes(
        actualIdentity
      );


  return {
    status:
      correct
        ? ASSERTION_STATUS
            .PASS
        : ASSERTION_STATUS
            .FAIL,

    expected: {
      selectedFailureMode:
        groundTruth
          .expectedFailureModeKey ||
        null,

      expectedDiagnosis:
        groundTruth
          .expectedDiagnosis ||
        null,
    },

    actual: {
      diagnosisObserved:
        true,

      selectedFailureMode:
        String(
          selectedFailureMode
        ),

      diagnosisOutcome:
        diagnosisOutcome ||
        null,

      diagnosisConfidence,

      evidenceCompleteness,

      primaryHypothesisId:
        diagnosisObservation
          .primaryHypothesisId ||
        null,

      verificationStatus:
        diagnosisObservation
          .verificationStatus ||
        null,
    },

    reasonCode:
      correct
        ? "DIAGNOSIS_MATCHES_GROUND_TRUTH"
        : "DIAGNOSIS_MISMATCHES_GROUND_TRUTH",

    details: {
      expectedSymptoms:
        Array.isArray(
          groundTruth
            .expectedSymptoms
        )
          ? groundTruth
              .expectedSymptoms
          : [],

      supportingEvidenceCount:
        diagnosisObservation
          .supportingEvidenceCount ??
        0,

      contradictingEvidenceCount:
        diagnosisObservation
          .contradictingEvidenceCount ??
        0,

      falsePositiveSuspected:
        diagnosisObservation
          .falsePositiveSuspected ===
        true,
    },
  };
}


// ============================================================================
// SAFETY
// ============================================================================

function assertNonAuthorizing(
  value,
  name
) {
  if (
    value
      ?.executionAuthorized ===
    true
  ) {
    throw evaluatorError(
      "PHASE21_EVALUATION_AUTHORITY_VIOLATION",
      `${name} unexpectedly authorizes execution`
    );
  }
}


// ============================================================================
// IDENTITY
// ============================================================================

function normalizeIdentity(
  value
) {
  return String(
    value ||
    ""
  )
    .trim()
    .toLowerCase()
    .replace(
      /[^a-z0-9]+/g,
      "."
    )
    .replace(
      /^\.+|\.+$/g,
      ""
    );
}


// ============================================================================
// METRIC HELPERS
// ============================================================================

function elapsedMs(
  start,
  end
) {
  if (
    !start ||
    !end
  ) {
    return null;
  }


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


function finiteNumberOrNull(
  value
) {
  if (
    value ===
      null ||
    value ===
      undefined ||
    value ===
      ""
  ) {
    return null;
  }


  const number =
    Number(
      value
    );


  return Number.isFinite(
    number
  )
    ? number
    : null;
}


// ============================================================================
// GENERAL HELPERS
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
    throw evaluatorError(
      "PHASE21_EVALUATION_CONTEXT_REQUIRED",
      `${field} is required`,
      {
        field,
      }
    );
  }
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


function evaluatorError(
  code,
  message,
  metadata =
    {}
) {
  return Object.assign(
    new Error(
      message
    ),
    {
      name:
        "ReliabilityDetectionDiagnosisEvaluatorError",

      code,

      ...metadata,

      executionAuthorized:
        false,
    }
  );
}


// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  DETECTION_DIAGNOSIS_EVALUATOR_VERSION,

  ASSERTION_STATUS,

  DetectionDiagnosisEvaluator,

  evaluateDetection,

  evaluateCorrelation,

  evaluateDiagnosis,

  normalizeIdentity,

  evaluatorError,
};