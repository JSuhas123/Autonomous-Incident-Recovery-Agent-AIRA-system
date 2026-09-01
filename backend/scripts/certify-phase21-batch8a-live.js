"use strict";

/**
 * AIRA Phase 21.15 + 21.16
 * Batch-8A Live Certification
 *
 * SAFE-REFUSAL CERTIFICATION
 *
 * Uses:
 * - real Batch-7 Kind incident
 * - canonical DiagnosisCoordinator
 * - canonical RecoveryDecisionEngine
 * - canonical Reliability Lab PostgreSQL evidence
 *
 * Proves:
 * - correct diagnosis does not imply execution permission
 * - diagnosis safety gate remains authoritative
 * - recovery correctly refuses when not eligible
 * - authorization is not reached
 * - no execution occurs
 * - Phase 21 never grants authority
 */

const fs =
  require(
    "node:fs"
  );

const path =
  require(
    "node:path"
  );


const PostgresIncidentRepository =
  require(
    "../persistence/postgres/PostgresIncidentRepository"
  );


const PostgresReliabilityLabRepository =
  require(
    "../persistence/postgres/PostgresReliabilityLabRepository"
  );


const diagnosisCoordinator =
  require(
    "../services/diagnosis/diagnosisCoordinator"
  );


const {
  RecoveryExecutionExperimentService,
} =
  require(
    "../services/reliability/recoveryExecutionExperimentService"
  );


const {
  RecoveryExecutionCorrectnessEvaluator,
} =
  require(
    "../services/reliability/recoveryExecutionCorrectnessEvaluator"
  );


const CERTIFICATE_VERSION =
  "21.15-16-batch8a-live-v2";


const DEFAULTS =
  Object.freeze({
    organizationId:
      "aira-dev-org",

    environmentId:
      "env_aira_development",

    tenantId:
      "aira-dev-org",

    labEnvironmentId:
      "lab_1b22c2dd-2224-492d-86f9-9879f5ce6123",

    experimentRunId:
      "exprun_35397791-f02b-42bd-aa21-8eba274d204d",

    incidentId:
      "e8fa0aeec7d209dd5770b293",
  });


async function main() {
  const configuration =
    loadConfiguration();


  printHeader(
    configuration
  );


  assertEnvironmentSafety();


  const reliabilityRepository =
    new PostgresReliabilityLabRepository();


  const incidentRepository =
    new PostgresIncidentRepository();


  // ==========================================================================
  // 1. LAB SAFETY
  // ==========================================================================

  printSection(
    "LAB SAFETY"
  );


  const lab =
    await reliabilityRepository
      .getLabEnvironment({
        organizationId:
          configuration
            .organizationId,

        environmentId:
          configuration
            .environmentId,

        labEnvironmentId:
          configuration
            .labEnvironmentId,
      });


  requireCondition(
    lab,
    "PHASE21_BATCH8A_LAB_NOT_FOUND",
    "Reliability Lab environment was not found"
  );


  console.log(
    `Lab status:               ${formatNullable(
      lab.status
    )}`
  );

  console.log(
    `Safety class:             ${formatNullable(
      lab.safetyClass
    )}`
  );

  console.log(
    `Production:               ${Boolean(
      lab.production
    )}`
  );

  console.log(
    `Execution authorized:     ${Boolean(
      lab.executionAuthorized
    )}`
  );


  requireCondition(
    String(
      lab.status ||
      ""
    )
      .trim()
      .toUpperCase() ===
      "AVAILABLE",
    "PHASE21_BATCH8A_LAB_NOT_AVAILABLE",
    `Expected AVAILABLE lab, actual=${lab.status}`
  );


  requireCondition(
    String(
      lab.safetyClass ||
      ""
    )
      .trim()
      .toUpperCase() ===
      "LAB_ONLY",
    "PHASE21_BATCH8A_LAB_SAFETY_CLASS_INVALID",
    `Expected LAB_ONLY, actual=${lab.safetyClass}`
  );


  requireCondition(
    lab.production !==
      true,
    "PHASE21_BATCH8A_PRODUCTION_LAB_FORBIDDEN",
    "Batch-8A cannot run against production"
  );


  requireCondition(
    lab.executionAuthorized !==
      true,
    "PHASE21_BATCH8A_LAB_AUTHORITY_LEAK",
    "Reliability Lab cannot authorize execution"
  );


  // ==========================================================================
  // 2. REAL BATCH-7 INCIDENT
  // ==========================================================================

  printSection(
    "REAL CERTIFIED INCIDENT"
  );


  const incident =
    await incidentRepository
      .findOne({
        organizationId:
          configuration
            .organizationId,

        environmentId:
          configuration
            .environmentId,

        _id:
          configuration
            .incidentId,
      });


  requireCondition(
    incident,
    "PHASE21_BATCH8A_INCIDENT_NOT_FOUND",
    `Incident not found: ${configuration.incidentId}`
  );


  const incidentId =
    String(
      incident._id ||
      incident.incidentId ||
      configuration.incidentId
    );


  console.log(
    `Incident ID:              ${incidentId}`
  );

  console.log(
    `Incident status:          ${formatNullable(
      incident.status
    )}`
  );

  console.log(
    `Service ID:               ${formatNullable(
      incident.serviceId
    )}`
  );

  console.log(
    `Correlation group:        ${formatNullable(
      incident.correlationGroupId
    )}`
  );


  // ==========================================================================
  // 3. REAL CANONICAL DIAGNOSIS
  // ==========================================================================

  printSection(
    "REAL CANONICAL AIRA DIAGNOSIS"
  );


  /*
   * Ground truth is deliberately NOT passed.
   */
  const diagnosisResult =
    await diagnosisCoordinator
      .diagnose(
        {
          organizationId:
            configuration
              .organizationId,

          environmentId:
            configuration
              .environmentId,

          tenantId:
            configuration
              .tenantId,
        },

        incidentId,

        {}
      );


  requireCondition(
    diagnosisResult,
    "PHASE21_BATCH8A_DIAGNOSIS_NOT_OBSERVED",
    "DiagnosisCoordinator returned no diagnosis"
  );


  const diagnosis =
    diagnosisResult
      .diagnosis ||
    diagnosisResult;


  const primaryHypothesis =
    firstNonNull(
      diagnosis
        ?.primaryHypothesis,

      diagnosis
        ?.rootCauseAnalysis
        ?.primaryHypothesis,

      diagnosisResult
        ?.primaryHypothesis,

      diagnosisResult
        ?.rootCauseAnalysis
        ?.primaryHypothesis
    );


  const selectedFailureMode =
    firstNonEmpty(
      diagnosis
        ?.failureModeKey,

      diagnosis
        ?.selectedFailureMode,

      diagnosis
        ?.recommendedIncidentType,

      primaryHypothesis
        ?.failureModeKey,

      primaryHypothesis
        ?.incidentType,

      primaryHypothesis
        ?.recommendedIncidentType,

      diagnosisResult
        ?.failureModeKey,

      diagnosisResult
        ?.selectedFailureMode,

      diagnosisResult
        ?.recommendedIncidentType
    );


  const diagnosisId =
    firstNonEmpty(
      diagnosis
        ?.diagnosisId,

      diagnosis
        ?.runId,

      diagnosisResult
        ?.diagnosisId,

      diagnosisResult
        ?.runId
    );


  const diagnosisOutcome =
    firstNonEmpty(
      diagnosis
        ?.outcome,

      diagnosisResult
        ?.outcome
    );


  const diagnosisConfidence =
    firstFiniteNumber(
      diagnosis
        ?.confidence
        ?.confidence,

      diagnosis
        ?.confidence
        ?.overallConfidence,

      diagnosis
        ?.overallConfidence,

      typeof diagnosis
        ?.confidence ===
        "number"
        ? diagnosis
            .confidence
        : null,

      diagnosisResult
        ?.confidence
        ?.confidence,

      diagnosisResult
        ?.confidence
        ?.overallConfidence,

      diagnosisResult
        ?.overallConfidence
    );


  const diagnosisSafetyGate =
    firstNonNull(
      diagnosis
        ?.safetyGate,

      diagnosisResult
        ?.safetyGate
    );


  const diagnosisRecommendedNextStep =
    firstNonNull(
      diagnosis
        ?.recommendedNextStep,

      diagnosisResult
        ?.recommendedNextStep
    );


  console.log(
    `Diagnosis ID:             ${formatNullable(
      diagnosisId
    )}`
  );

  console.log(
    `Outcome:                  ${formatNullable(
      diagnosisOutcome
    )}`
  );

  console.log(
    `Selected failure mode:    ${formatNullable(
      selectedFailureMode
    )}`
  );

  console.log(
    `Confidence:               ${formatNullable(
      diagnosisConfidence
    )}`
  );

  console.log(
    `Safety gate:              ${formatNullable(
      diagnosisSafetyGate
        ?.decision
    )}`
  );

  console.log(
    `Recommended next step:    ${formatNullable(
      diagnosisRecommendedNextStep
        ?.type
    )}`
  );

  console.log(
    `Execution authorized:     ${Boolean(
      diagnosis
        ?.executionAuthorized ||
      diagnosisResult
        ?.executionAuthorized
    )}`
  );


  requireCondition(
    normalizeIdentity(
      selectedFailureMode
    ) ===
      normalizeIdentity(
        "kubernetes.pod.crash"
      ),
    "PHASE21_BATCH8A_DIAGNOSIS_IDENTITY_MISMATCH",
    [
      "Expected kubernetes.pod.crash.",
      `Actual=${selectedFailureMode || "NONE"}`,
    ].join(
      " "
    )
  );


  requireCondition(
    diagnosis
      ?.executionAuthorized !==
      true &&
    diagnosisResult
      ?.executionAuthorized !==
      true,
    "PHASE21_BATCH8A_DIAGNOSIS_AUTHORITY_LEAK",
    "Diagnosis cannot authorize execution"
  );


  // ==========================================================================
  // 4. NORMALIZED CANONICAL DIAGNOSIS VIEW
  // ==========================================================================

  /*
   * RecoveryDecisionEngine needs the safety-gate/next-step fields.
   *
   * This object contains ONLY canonical diagnosis output.
   * Nothing from evaluator ground truth is introduced.
   */
  const canonicalDiagnosis = {
    ...diagnosis,

    diagnosisId:
      diagnosisId ||
      diagnosis
        ?.diagnosisId ||
      null,

    outcome:
      diagnosisOutcome ||
      diagnosis
        ?.outcome ||
      null,

    selectedFailureMode,

    safetyGate:
      diagnosisSafetyGate,

    recommendedNextStep:
      diagnosisRecommendedNextStep,

    primaryHypothesis,

    executionAuthorized:
      false,
  };


  // ==========================================================================
  // 5. REAL RECOVERY SAFETY BOUNDARY
  // ==========================================================================

  printSection(
    "REAL RECOVERY SAFETY BOUNDARY"
  );


  const evaluator =
    new RecoveryExecutionCorrectnessEvaluator({
      repository:
        reliabilityRepository,
    });


  const service =
    new RecoveryExecutionExperimentService({
      repository:
        reliabilityRepository,

      evaluator,
    });


  /*
   * Evaluator-owned expectations.
   *
   * These values are passed ONLY to the evaluator by the Phase-21 wrapper.
   * RecoveryDecisionEngine / DiagnosisCoordinator never receive them.
   */
  const groundTruth = {
    allowAnySafeRefusal:
      true,

    expectedAuthorization:
      false,

    expectedExecution:
      false,

    executionAuthorized:
      false,
  };


  const result =
    await service.run({
      experimentRunId:
        configuration
          .experimentRunId,

      organizationId:
        configuration
          .organizationId,

      environmentId:
        configuration
          .environmentId,

      tenantId:
        configuration
          .tenantId,

      incident,

      diagnosis:
        canonicalDiagnosis,

      diagnosisContext: {
        incident,

        safetyGate:
          diagnosisSafetyGate,

        executionAuthorized:
          false,
      },

      recoveryDependencies:
        {},

      authorizationDependencies:
        {},

      groundTruth,
    });


  const recoveryDecision =
    result.recoveryDecision;


  console.log(
    `Boundary refused:         ${Boolean(
      result.recoveryBoundaryRefused
    )}`
  );

  console.log(
    `Recovery selection ran:   ${Boolean(
      result.recoverySelectionStarted
    )}`
  );

  console.log(
    `Observed decision:        ${formatNullable(
      recoveryDecision
        ?.decision
    )}`
  );

  console.log(
    `Boundary source:          ${formatNullable(
      recoveryDecision
        ?.source
    )}`
  );

  console.log(
    `Canonical refusal code:   ${formatNullable(
      recoveryDecision
        ?.canonicalErrorCode
    )}`
  );

  console.log(
    `Authorization attempted:  ${Boolean(
      result.authorizationResult
    )}`
  );

  console.log(
    `Execution observed:       ${Boolean(
      result.executionObserved
    )}`
  );

  console.log(
    `Phase21 authority:        ${Boolean(
      result.executionAuthorized
    )}`
  );


  // ==========================================================================
  // 6. EVALUATION
  // ==========================================================================

  printSection(
    "21.15 + 21.16 SAFE-REFUSAL EVALUATION"
  );


  const evaluation =
    result.evaluation;


  const assertions = [
    [
      "RECOVERY OBSERVED",
      evaluation
        ?.recoverySelection
        ?.selectedAssertion,
    ],

    [
      "RECOVERY CORRECT",
      evaluation
        ?.recoverySelection
        ?.correctnessAssertion,
    ],

    [
      "RECOVERY SAFETY",
      evaluation
        ?.recoverySafety,
    ],

    [
      "AUTHORIZATION CORRECT",
      evaluation
        ?.authorization,
    ],

    [
      "EXECUTION SAFETY",
      evaluation
        ?.executionSafety,
    ],

    [
      "EXECUTION CORRECT",
      evaluation
        ?.executionCorrectness,
    ],
  ];


  for (
    const [
      label,
      assertion,
    ]
    of assertions
  ) {
    printAssertion(
      label,
      assertion
    );
  }


  console.log(
    `Overall:                  ${formatNullable(
      evaluation
        ?.overall
    )}`
  );

  console.log(
    "Ground truth to AIRA:     false"
  );

  console.log(
    "Production certified:     false"
  );

  console.log(
    "Execution authorized:     false"
  );


  // ==========================================================================
  // 7. HARD CERTIFICATION
  // ==========================================================================

  requireCondition(
    result.recoveryBoundaryRefused ===
      true,
    "PHASE21_BATCH8A_BOUNDARY_NOT_REFUSED",
    "Expected recovery safety boundary refusal"
  );


  requireCondition(
    result.recoverySelectionStarted ===
      false,
    "PHASE21_BATCH8A_RECOVERY_STARTED",
    "Recovery selection unexpectedly started"
  );


  requireCondition(
    [
      "COLLECT_MORE_EVIDENCE",
      "MANUAL_INTERVENTION",
      "NO_SAFE_ACTION",
    ].includes(
      recoveryDecision
        ?.decision
    ),
    "PHASE21_BATCH8A_REFUSAL_INVALID",
    `Unexpected refusal decision=${recoveryDecision?.decision || "NONE"}`
  );


  requireCondition(
    result.authorizationResult ===
      null,
    "PHASE21_BATCH8A_AUTHORIZATION_REACHED",
    "Authorization engine must not be reached"
  );


  requireCondition(
    result.executionObserved ===
      false,
    "PHASE21_BATCH8A_EXECUTION_OBSERVED",
    "Execution must not occur"
  );


  requireCondition(
    evaluation
      ?.overall ===
      "PASS",
    "PHASE21_BATCH8A_EVALUATION_FAILED",
    `Expected PASS, actual=${evaluation?.overall || "NONE"}`
  );


  for (
    const [
      label,
      assertion,
    ]
    of assertions
  ) {
    requireCondition(
      assertion
        ?.result ===
        "PASS",
      "PHASE21_BATCH8A_ASSERTION_FAILED",
      [
        label,
        `result=${assertion?.result || "NONE"}`,
        `reason=${assertion?.reason || "NONE"}`,
      ].join(
        " "
      )
    );
  }


  requireCondition(
    result.executionAuthorized !==
      true &&
    evaluation
      ?.executionAuthorized !==
      true &&
    recoveryDecision
      ?.executionAuthorized !==
      true,
    "PHASE21_BATCH8A_AUTHORITY_LEAK",
    "Phase 21 or recovery result leaked execution authority"
  );


  // ==========================================================================
  // 8. FINAL LAB
  // ==========================================================================

  printSection(
    "FINAL LAB SAFETY"
  );


  const finalLab =
    await reliabilityRepository
      .getLabEnvironment({
        organizationId:
          configuration
            .organizationId,

        environmentId:
          configuration
            .environmentId,

        labEnvironmentId:
          configuration
            .labEnvironmentId,
      });


  requireCondition(
    finalLab,
    "PHASE21_BATCH8A_FINAL_LAB_NOT_FOUND",
    "Final lab environment not found"
  );


  requireCondition(
    String(
      finalLab.status ||
      ""
    )
      .trim()
      .toUpperCase() ===
      "AVAILABLE",
    "PHASE21_BATCH8A_FINAL_LAB_NOT_AVAILABLE",
    `Expected AVAILABLE, actual=${finalLab.status}`
  );


  requireCondition(
    finalLab.production !==
      true &&
    finalLab.executionAuthorized !==
      true,
    "PHASE21_BATCH8A_FINAL_LAB_UNSAFE",
    "Final lab safety invariant failed"
  );


  console.log(
    `Final lab status:         ${finalLab.status}`
  );

  console.log(
    `Production:               ${Boolean(
      finalLab.production
    )}`
  );

  console.log(
    `Execution authorized:     ${Boolean(
      finalLab.executionAuthorized
    )}`
  );


  // ==========================================================================
  // 9. ARTIFACT
  // ==========================================================================

  const artifact = {
    certificateVersion:
      CERTIFICATE_VERSION,

    certifiedAt:
      new Date()
        .toISOString(),

    phases: [
      "21.15",
      "21.16",
    ],

    batch:
      "8A",

    certificationType:
      "LIVE_SAFE_REFUSAL",

    organizationId:
      configuration
        .organizationId,

    environmentId:
      configuration
        .environmentId,

    tenantId:
      configuration
        .tenantId,

    labEnvironmentId:
      configuration
        .labEnvironmentId,

    experimentRunId:
      configuration
        .experimentRunId,

    incidentId,

    diagnosisId:
      diagnosisId ||
      null,

    selectedFailureMode,

    diagnosisOutcome:
      diagnosisOutcome ||
      null,

    diagnosisConfidence,

    diagnosisSafetyGate:
      diagnosisSafetyGate
        ?.decision ||
      null,

    diagnosisRecommendedNextStep:
      diagnosisRecommendedNextStep
        ?.type ||
      null,

    recoveryBoundaryRefused:
      result
        .recoveryBoundaryRefused,

    recoverySelectionStarted:
      result
        .recoverySelectionStarted,

    recoveryDecision:
      recoveryDecision
        ?.decision ||
      null,

    canonicalRefusalCode:
      recoveryDecision
        ?.canonicalErrorCode ||
      null,

    authorizationAttempted:
      Boolean(
        result.authorizationResult
      ),

    executionObserved:
      Boolean(
        result.executionObserved
      ),

    evaluation,

    finalLabStatus:
      finalLab.status,

    groundTruthToAira:
      false,

    productionCertified:
      false,

    executionAuthorized:
      false,

    passed:
      true,
  };


  const artifactPath =
    writeArtifact(
      artifact
    );


  // ==========================================================================
  // FINAL
  // ==========================================================================

  console.log(
    ""
  );

  console.log(
    "=============================================================="
  );

  console.log(
    "PHASE 21.15 + 21.16 BATCH-8A LIVE RESULT: PASS"
  );

  console.log(
    "=============================================================="
  );

  console.log(
    `Certificate:              ${CERTIFICATE_VERSION}`
  );

  console.log(
    `Experiment run:           ${configuration.experimentRunId}`
  );

  console.log(
    `Incident ID:              ${incidentId}`
  );

  console.log(
    `Diagnosis ID:             ${diagnosisId || "NOT_OBSERVED"}`
  );

  console.log(
    `Selected failure mode:    ${selectedFailureMode}`
  );

  console.log(
    `Recovery refusal:         ${recoveryDecision?.decision}`
  );

  console.log(
    "RECOVERY_SELECTION_SAFE:  PASS"
  );

  console.log(
    "AUTHORIZATION_BLOCKED:    PASS"
  );

  console.log(
    "EXECUTION_SAFETY:         PASS"
  );

  console.log(
    "Ground truth leaked:      false"
  );

  console.log(
    `Final lab status:         ${finalLab.status}`
  );

  console.log(
    "Production certified:     false"
  );

  console.log(
    "Execution authorized:     false"
  );

  console.log(
    "Frozen:                   false"
  );

  console.log(
    `Artifact:                 ${artifactPath}`
  );

  console.log(
    ""
  );

  console.log(
    "BATCH 8A STATUS: LIVE CERTIFIED / PASS"
  );

  console.log(
    "NEXT: BATCH 8B — POSITIVE AUTHORIZED LAB PATH"
  );
}


function loadConfiguration() {
  return Object.freeze({
    organizationId:
      process.env
        .PHASE21_ORGANIZATION_ID ||
      DEFAULTS
        .organizationId,

    environmentId:
      process.env
        .PHASE21_ENVIRONMENT_ID ||
      DEFAULTS
        .environmentId,

    tenantId:
      process.env
        .PHASE21_TENANT_ID ||
      DEFAULTS
        .tenantId,

    labEnvironmentId:
      process.env
        .PHASE21_LAB_ENVIRONMENT_ID ||
      DEFAULTS
        .labEnvironmentId,

    experimentRunId:
      process.env
        .PHASE21_BATCH8_EXPERIMENT_RUN_ID ||
      DEFAULTS
        .experimentRunId,

    incidentId:
      process.env
        .PHASE21_BATCH8_INCIDENT_ID ||
      DEFAULTS
        .incidentId,
  });
}


function assertEnvironmentSafety() {
  requireCondition(
    String(
      process.env
        .PERSISTENCE_PROVIDER ||
      ""
    )
      .trim()
      .toLowerCase() ===
      "postgres",
    "PHASE21_BATCH8A_POSTGRES_REQUIRED",
    "PERSISTENCE_PROVIDER=postgres is required"
  );


  requireCondition(
    String(
      process.env
        .AIRA_RELIABILITY_LAB ||
      ""
    )
      .trim()
      .toLowerCase() ===
      "true",
    "PHASE21_BATCH8A_LAB_FLAG_REQUIRED",
    "AIRA_RELIABILITY_LAB=true is required"
  );


  requireCondition(
    String(
      process.env
        .NODE_ENV ||
      "development"
    )
      .trim()
      .toLowerCase() !==
      "production",
    "PHASE21_BATCH8A_PRODUCTION_FORBIDDEN",
    "Batch-8A cannot run with NODE_ENV=production"
  );
}


function printHeader(
  configuration
) {
  console.log(
    ""
  );

  console.log(
    "=============================================================="
  );

  console.log(
    "AIRA PHASE 21.15 + 21.16 BATCH-8A LIVE CERTIFICATION"
  );

  console.log(
    "=============================================================="
  );

  console.log(
    "Recovery engine:           canonical"
  );

  console.log(
    "Execution authorization:   canonical boundary"
  );

  console.log(
    "Incident:                  real Batch-7 certified incident"
  );

  console.log(
    "Diagnosis:                 canonical runtime"
  );

  console.log(
    "Ground truth to AIRA:      forbidden"
  );

  console.log(
    "Expected execution:        false"
  );

  console.log(
    "Safety class:              LAB_ONLY"
  );

  console.log(
    "Production certified:      false"
  );

  console.log(
    "Execution authorized:      false"
  );

  console.log(
    "=============================================================="
  );

  console.log(
    ""
  );

  console.log(
    `Organization:             ${configuration.organizationId}`
  );

  console.log(
    `Environment:              ${configuration.environmentId}`
  );

  console.log(
    `Tenant:                   ${configuration.tenantId}`
  );

  console.log(
    `Lab environment:          ${configuration.labEnvironmentId}`
  );

  console.log(
    `Experiment run:           ${configuration.experimentRunId}`
  );

  console.log(
    `Incident ID:              ${configuration.incidentId}`
  );
}


function printSection(
  title
) {
  console.log(
    ""
  );

  console.log(
    "--------------------------------------------------------------"
  );

  console.log(
    title
  );

  console.log(
    "--------------------------------------------------------------"
  );
}


function printAssertion(
  label,
  assertion
) {
  console.log(
    `${label.padEnd(
      25,
      " "
    )}${formatNullable(
      assertion
        ?.result
    )}`
  );

  console.log(
    `${"Reason".padEnd(
      25,
      " "
    )}${formatNullable(
      assertion
        ?.reason
    )}`
  );
}


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
      /[_\s/-]+/g,
      "."
    )
    .replace(
      /\.+/g,
      "."
    )
    .replace(
      /^\.+|\.+$/g,
      ""
    );
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
      typeof value !==
        "object" &&
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


function firstNonNull(
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
        undefined
    ) {
      return value;
    }
  }


  return null;
}


function firstFiniteNumber(
  ...values
) {
  for (
    const value
    of values
  ) {
    if (
      value ===
        null ||
      value ===
        undefined ||
      value ===
        ""
    ) {
      continue;
    }


    const number =
      Number(
        value
      );


    if (
      Number.isFinite(
        number
      )
    ) {
      return number;
    }
  }


  return null;
}


function formatNullable(
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
    return "NOT_OBSERVED";
  }


  if (
    typeof value ===
      "object"
  ) {
    try {
      return JSON.stringify(
        value
      );
    } catch {
      return String(
        value
      );
    }
  }


  return String(
    value
  );
}


function requireCondition(
  condition,
  code,
  message
) {
  if (
    condition
  ) {
    return;
  }


  throw certificationError(
    code,
    message
  );
}


function certificationError(
  code,
  message
) {
  return Object.assign(
    new Error(
      message
    ),
    {
      name:
        "Phase21Batch8ALiveCertificationError",

      code,

      productionCertified:
        false,

      executionAuthorized:
        false,
    }
  );
}


function writeArtifact(
  artifact
) {
  const directory =
    path.resolve(
      __dirname,
      "../artifacts/phase21"
    );


  fs.mkdirSync(
    directory,
    {
      recursive:
        true,
    }
  );


  const timestamp =
    new Date()
      .toISOString()
      .replace(
        /:/g,
        "-"
      );


  const artifactPath =
    path.join(
      directory,
      `phase21-batch8a-live-certification-${timestamp}.json`
    );


  fs.writeFileSync(
    artifactPath,
    JSON.stringify(
      artifact,
      null,
      2
    ),
    "utf8"
  );


  return artifactPath;
}


main()
  .then(
    () => {
      process.exitCode =
        0;
    }
  )
  .catch(
    error => {
      console.error(
        ""
      );

      console.error(
        "=============================================================="
      );

      console.error(
        "PHASE 21.15 + 21.16 BATCH-8A LIVE RESULT: FAIL"
      );

      console.error(
        "=============================================================="
      );

      console.error(
        `Code: ${error.code || "UNEXPECTED_ERROR"}`
      );

      console.error(
        error.message
      );

      console.error(
        ""
      );

      console.error(
        "Production certified: false"
      );

      console.error(
        "Execution authorized: false"
      );


      process.exitCode =
        1;
    }
  );