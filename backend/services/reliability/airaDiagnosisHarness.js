"use strict";


const PostgresReliabilityLabRepository =
  require(
    "../../persistence/postgres/PostgresReliabilityLabRepository"
  );


const DIAGNOSIS_HARNESS_VERSION =
  "21.14-v1";


const FORBIDDEN_GROUND_TRUTH_KEYS =
  Object.freeze(
    new Set([
      "groundTruth",
      "ground_truth",

      "expectedFailureMode",
      "expected_failure_mode",

      "expectedFailureModeKey",
      "expected_failure_mode_key",

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

      "evaluatorGroundTruth",
      "evaluator_ground_truth",
    ])
  );


class AiraDiagnosisHarness {
  constructor(
    options = {}
  ) {
    /*
     * Lazy require intentionally avoids booting the entire
     * diagnosis runtime when tests inject a deterministic stub.
     */
    this.diagnosisCoordinator =
      options.diagnosisCoordinator ||
      require(
        "../diagnosis/diagnosisCoordinator"
      );


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


  async observe(
    {
      organizationId,

      environmentId,

      tenantId,

      experimentRunId,

      correlationId,

      incidentId,

      diagnosisDependencies =
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


    requireNonEmpty(
      incidentId,
      "incidentId"
    );


    const scope = {
      organizationId,

      environmentId,

      tenantId,

      correlationId,
    };


    /*
     * HARD PHASE-21 FIREWALL
     *
     * AIRA diagnosis receives only its canonical incident,
     * evidence and runtime dependencies.
     *
     * Experiment ground truth belongs to the evaluator.
     */
    assertNoGroundTruth(
      scope
    );


    assertNoGroundTruth(
      diagnosisDependencies
    );


    const startedAt =
      this.now();


    const result =
      await this
        .diagnosisCoordinator
        .diagnose(
          scope,
          incidentId,
          diagnosisDependencies
        );


    const completedAt =
      this.now();


    if (
      result
        ?.executionAuthorized ===
        true ||
      result
        ?.diagnosis
        ?.executionAuthorized ===
        true
    ) {
      throw harnessError(
        "PHASE21_DIAGNOSIS_AUTHORITY_VIOLATION",
        "Diagnosis observation unexpectedly authorized execution"
      );
    }


    /*
     * This also prevents an upstream component from accidentally
     * embedding evaluator data into the actual diagnosis result.
     */
    assertNoGroundTruth(
      result
    );


    const normalized =
      normalizeDiagnosisResult(
        result
      );


    const observation = {
      harnessVersion:
        DIAGNOSIS_HARNESS_VERSION,

      experimentRunId,

      correlationId,

      incidentId:
        String(
          incidentId
        ),

      diagnosisRunId:
        normalized
          .diagnosisRunId,

      selectedFailureMode:
        normalized
          .selectedFailureMode,

      diagnosisOutcome:
        normalized
          .diagnosisOutcome,

      diagnosisConfidence:
        normalized
          .diagnosisConfidence,

      evidenceCompleteness:
        normalized
          .evidenceCompleteness,

      primaryHypothesisId:
        normalized
          .primaryHypothesisId,

      primaryHypothesis:
        normalized
          .primaryHypothesis,

      verificationStatus:
        normalized
          .verificationStatus,

      supportingEvidenceCount:
        normalized
          .supportingEvidenceCount,

      contradictingEvidenceCount:
        normalized
          .contradictingEvidenceCount,

      falsePositiveSuspected:
        normalized
          .falsePositiveSuspected,

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
       * Evaluator owns this decision.
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
          "AIRA_DIAGNOSIS_RESULT",

        source:
          "PHASE21_AIRA_DIAGNOSIS_HARNESS",

        observedAt:
          completedAt,

        referenceType:
          "INCIDENT",

        referenceId:
          String(
            incidentId
          ),

        summary:
          observation,
      });


    return observation;
  }
}


function normalizeDiagnosisResult(
  result
) {
  const diagnosis =
    result
      ?.diagnosis ||
    {};


  const primary =
    diagnosis
      .primaryHypothesis ||
    null;


  /*
   * Prefer a canonical machine-readable FailureMode identity.
   *
   * We deliberately DO NOT infer a failure mode from arbitrary
   * natural-language root-cause text. Doing so would make the
   * evaluator grade its own interpretation rather than AIRA.
   */
  const selectedFailureMode =
    firstNonEmpty(
      diagnosis
        .failureModeKey,

      diagnosis
        .selectedFailureMode,

      diagnosis
        .recommendedIncidentType,

      primary
        ?.failureModeKey,

      primary
        ?.incidentType,

      primary
        ?.recommendedIncidentType
    );


  return {
    diagnosisRunId:
      firstNonEmpty(
        result
          ?.runId,

        diagnosis
          ?.metadata
          ?.runId
      ),

    selectedFailureMode:
      selectedFailureMode
        ? String(
            selectedFailureMode
          )
        : null,

    diagnosisOutcome:
      diagnosis
        .outcome ||
      null,

    diagnosisConfidence:
      finiteNumberOrNull(
        diagnosis
          .diagnosisConfidence ??
        result
          ?.confidence
          ?.confidence
      ),

    evidenceCompleteness:
      finiteNumberOrNull(
        diagnosis
          .evidenceCompleteness
      ),

    primaryHypothesisId:
      firstNonEmpty(
        diagnosis
          .primaryHypothesisId,

        primary
          ?.id,

        diagnosis
          .acceptedHypothesisId
      ),

    primaryHypothesis:
      sanitizePrimaryHypothesis(
        primary
      ),

    verificationStatus:
      diagnosis
        .verificationStatus ||
      result
        ?.safetyGate
        ?.decision ||
      null,

    supportingEvidenceCount:
      Array.isArray(
        diagnosis
          .supportingEvidenceIds
      )
        ? diagnosis
            .supportingEvidenceIds
            .length
        : 0,

    contradictingEvidenceCount:
      Array.isArray(
        diagnosis
          .contradictingEvidenceIds
      )
        ? diagnosis
            .contradictingEvidenceIds
            .length
        : 0,

    falsePositiveSuspected:
      diagnosis
        .falsePositiveSuspected ===
      true,
  };
}


function sanitizePrimaryHypothesis(
  hypothesis
) {
  if (
    !hypothesis ||
    typeof hypothesis !==
      "object" ||
    Array.isArray(
      hypothesis
    )
  ) {
    return null;
  }


  return {
    id:
      firstNonEmpty(
        hypothesis.id
      ),

    title:
      firstNonEmpty(
        hypothesis.title
      ),

    category:
      firstNonEmpty(
        hypothesis.category
      ),

    rootCause:
      firstNonEmpty(
        hypothesis.rootCause
      ),

    confidence:
      finiteNumberOrNull(
        hypothesis.confidence
      ),

    status:
      firstNonEmpty(
        hypothesis.status
      ),
  };
}


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
      undefined ||
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
        `Ground-truth field cannot enter AIRA diagnosis path: ${path}.${key}`,
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
      "PHASE21_DIAGNOSIS_CONTEXT_REQUIRED",
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
  metadata =
    {}
) {
  return Object.assign(
    new Error(
      message
    ),
    {
      name:
        "AiraReliabilityDiagnosisHarnessError",

      code,

      ...metadata,

      executionAuthorized:
        false,
    }
  );
}


module.exports = {
  DIAGNOSIS_HARNESS_VERSION,

  AiraDiagnosisHarness,

  normalizeDiagnosisResult,

  assertNoGroundTruth,

  harnessError,
};