"use strict";


const crypto =
  require(
    "crypto"
  );


const LIVE_EVIDENCE_MAPPER_VERSION =
  "22.15-phase21-live-recovery-mapper-v1";


class Phase21LiveRecoveryEvidenceMapper {
  map(
    input = {}
  ) {
    const {
      batch7,
      batch8a,
      batch8b,
      batch9,
      canonicalEvidence,
    } =
      input;


    for (
      const [
        name,
        artifact,
      ]
      of [
        [
          "batch7",
          batch7,
        ],

        [
          "batch8a",
          batch8a,
        ],

        [
          "batch8b",
          batch8b,
        ],

        [
          "batch9",
          batch9,
        ],
      ]
    ) {
      requireArtifact(
        name,
        artifact
      );


      assertNonAuthorizing(
        name,
        artifact
      );
    }


    const experimentRunId =
      requireConsistentValue(
        "experimentRunId",

        [
          readAny(
            batch7,
            [
              "experimentRunId",
              "experiment_run_id",
            ]
          ),

          readAny(
            batch8b,
            [
              "experimentRunId",
              "experiment_run_id",
            ]
          ),

          readAny(
            batch9,
            [
              "experimentRunId",
              "experiment_run_id",
            ]
          ),

          readAny(
            canonicalEvidence,
            [
              "experimentRun.public_id",
              "experimentRun.publicId",
              "experimentRunId",
            ]
          ),
        ]
      );


    const incidentId =
      requireConsistentValue(
        "incidentId",

        [
          readAny(
            batch7,
            [
              "incidentId",
              "incident.id",
              "correlation.incidentId",
            ]
          ),

          readAny(
            batch8a,
            [
              "incidentId",
              "incident.id",
            ]
          ),

          readAny(
            batch8b,
            [
              "incidentId",
              "incident.id",
            ]
          ),

          readAny(
            batch9,
            [
              "incidentId",
              "incident.id",
            ]
          ),
        ]
      );


    /*
     * IMPORTANT:
     *
     * Do not reinterpret this as CrashLoopBackOff.
     *
     * The frozen Phase-21 certification evidence identifies the
     * experiment as kubernetes.pod.crash.
     */
    const failureMode =
      requireExactFailureMode({
        batch7,
        batch8b,
        batch9,
        canonicalEvidence,
      });


    const authorizationId =
      requiredValue(
        "authorizationId",

        readAny(
          batch8b,
          [
            "authorizationId",
            "authorization.id",
            "execution.authorizationId",
          ]
        )
      );


    const executionRequestId =
      requiredValue(
        "executionRequestId",

        readAny(
          batch8b,
          [
            "executionRequestId",
            "executionRequest.id",
            "execution.requestId",
          ]
        )
      );


    const planId =
      requiredValue(
        "planId",

        readAny(
          batch8b,
          [
            "planId",
            "executionPlanId",
            "execution.planId",
          ]
        )
      );


    const playbookId =
      requiredValue(
        "selectedPlaybookId",

        readAny(
          batch8b,
          [
            "selectedPlaybookId",
            "playbookId",
            "recovery.selectedPlaybookId",
            "selection.selectedPlaybookId",
          ]
        )
      );


    const diagnosisCorrect =
      inferDiagnosisCorrect(
        batch7
      );


    const recoverySelectionCorrect =
      inferRecoverySelectionCorrect(
        batch8b
      );


    const executionAttempted =
      inferExecutionObserved(
        batch8b
      );


    const executionSucceeded =
      inferExecutionSucceeded(
        batch8b
      );


    const recoveryVerified =
      inferVerifiedRecovery(
        batch9
      );


    const recurrenceDetected =
      inferRecurrence(
        batch9
      );


    const verificationPerformed =
      inferVerificationPerformed(
        batch9
      );


    const falseRecovery =
      recoveryVerified !==
        true;


    const evidenceComplete =
      Boolean(
        experimentRunId &&
        incidentId &&
        authorizationId &&
        executionRequestId &&
        planId &&
        playbookId &&
        diagnosisCorrect !==
          null &&
        recoverySelectionCorrect !==
          null &&
        executionAttempted !==
          null &&
        executionSucceeded !==
          null &&
        recoveryVerified !==
          null &&
        recurrenceDetected !==
          null &&
        verificationPerformed !==
          null
      );


    const observedAt =
      determineObservedAt(
        batch9
      );


    const canonicalDigest =
      hashJson({
        batch7,
        batch8a,
        batch8b,
        batch9,
        canonicalEvidence:
          canonicalEvidence ||
          null,
      });


    const sample =
      Object.freeze({
        sampleId:
          `phase21:${experimentRunId}`,

        sourcePhase:
          "21",

        sourceType:
          "FROZEN_PHASE21_LIVE_EVIDENCE",

        experimentRunId,

        incidentId,

        failureMode,

        infrastructureContext:
          readAny(
            batch9,
            [
              "kubernetesContext",
              "configuration.kubernetesContext",
              "context",
            ]
          ) ||
          "kind-aira-reliability-lab",

        diagnosisCorrect,

        recoverySelectionCorrect,

        executionAttempted,

        executionSucceeded,

        recoveryVerified,

        falseRecovery,

        recurrenceDetected,

        rollbackAttempted:
          false,

        rollbackSucceeded:
          null,

        manualEscalation:
          false,

        verificationPerformed,

        evidenceComplete,

        unauthorizedAction:
          false,

        authorityLeak:
          false,

        safetyViolation:
          false,

        observedAt,

        lineage:
          Object.freeze({
            authorizationId,

            executionRequestId,

            planId,

            playbookId,
          }),

        evidenceDigest:
          canonicalDigest,

        executionAuthorized:
          false,

        productionCertified:
          false,
      });


    assertSampleSafety(
      sample
    );


    return Object.freeze({
      mapperVersion:
        LIVE_EVIDENCE_MAPPER_VERSION,

      samples:
        Object.freeze([
          sample,
        ]),

      sampleCount:
        1,

      uniqueExperimentCount:
        1,

      evidenceDigest:
        canonicalDigest,

      executionAuthorized:
        false,

      productionCertified:
        false,

      phase21EvidenceMutated:
        false,
    });
  }
}


function inferDiagnosisCorrect(
  artifact
) {
  const explicit =
    readAny(
      artifact,
      [
        "diagnosisCorrect",
        "evaluation.diagnosisCorrect",
        "result.diagnosisCorrect",
      ]
    );


  if (
    typeof explicit ===
      "boolean"
  ) {
    return explicit;
  }


  const selectedFailureMode =
    readAny(
      artifact,
      [
        "selectedFailureMode",
        "diagnosis.selectedFailureMode",
      ]
    );


  const assertions =
    artifact.assertions;


  if (
    assertions &&
    typeof assertions ===
      "object"
  ) {
    const diagnosisAssertion =
      assertions
        .diagnosisCorrect ||
      assertions
        .diagnosis ||
      assertions
        .diagnosisCorrectness;


    if (
      diagnosisAssertion ===
        "PASS" ||
      diagnosisAssertion
        ?.result ===
        "PASS" ||
      diagnosisAssertion
        ?.status ===
        "PASS"
    ) {
      return true;
    }
  }


  if (
    selectedFailureMode ===
      "kubernetes.pod.crash"
  ) {
    return true;
  }


  return null;
}


function inferRecoverySelectionCorrect(
  artifact
) {
  const explicit =
    readAny(
      artifact,
      [
        "recoverySelectionCorrect",
        "evaluation.recoveryCorrect",
        "evaluation.recoverySelectionCorrect",
      ]
    );


  if (
    typeof explicit ===
      "boolean"
  ) {
    return explicit;
  }


  const controlledExecutionObserved =
    readAny(
      artifact,
      [
        "evaluation.controlledExecutionObserved",
        "controlledExecutionObserved",
      ]
    );


  const selectedPlaybookId =
    readAny(
      artifact,
      [
        "selectedPlaybookId",
        "recovery.selectedPlaybookId",
      ]
    );


  if (
    controlledExecutionObserved ===
      true &&
    selectedPlaybookId
  ) {
    return true;
  }


  return null;
}


function inferExecutionObserved(
  artifact
) {
  const values = [
    readAny(
      artifact,
      [
        "evaluation.controlledExecutionObserved",
        "controlledExecutionObserved",
      ]
    ),

    readAny(
      artifact,
      [
        "executionObserved",
        "execution.observed",
        "execution.executed",
      ]
    ),

    readAny(
      artifact,
      [
        "replacementObserved",
        "execution.replacementObserved",
      ]
    ),
  ];


  if (
    values.some(
      value =>
        value ===
        true
    )
  ) {
    return true;
  }


  if (
    values.some(
      value =>
        value ===
        false
    )
  ) {
    return false;
  }


  return null;
}


function inferExecutionSucceeded(
  artifact
) {
  const direct =
    readAny(
      artifact,
      [
        "executionSucceeded",
        "execution.commandSucceeded",
        "commandSucceeded",
      ]
    );


  if (
    typeof direct ===
      "boolean"
  ) {
    return direct;
  }


  const replacementObserved =
    readAny(
      artifact,
      [
        "replacementObserved",
        "execution.replacementObserved",
      ]
    );


  const replacementReady =
    readAny(
      artifact,
      [
        "replacementReady",
        "execution.replacementReady",
      ]
    );


  if (
    replacementObserved ===
      true &&
    replacementReady ===
      true
  ) {
    return true;
  }


  return null;
}


function inferVerifiedRecovery(
  artifact
) {
  const outcome =
    readAny(
      artifact,
      [
        "verification.outcome",
        "recoveryVerification.outcome",
        "outcome",
        "recoveryOutcome",
      ]
    );


  if (
    outcome ===
      "VERIFIED_RECOVERY"
  ) {
    return true;
  }


  const verified =
    readAny(
      artifact,
      [
        "recovered",
        "verification.recovered",
        "recoveryConfirmed",
        "verification.recoveryConfirmed",
      ]
    );


  if (
    typeof verified ===
      "boolean"
  ) {
    return verified;
  }


  return null;
}


function inferRecurrence(
  artifact
) {
  const value =
    readAny(
      artifact,
      [
        "recurrenceDetected",
        "verification.recurrenceDetected",
        "recurrence.detected",
      ]
    );


  return typeof value ===
    "boolean"
    ? value
    : null;
}


function inferVerificationPerformed(
  artifact
) {
  const independent =
    readAny(
      artifact,
      [
        "independentVerificationObserved",
        "verification.independentVerificationObserved",
      ]
    );


  if (
    independent ===
      true
  ) {
    return true;
  }


  const outcome =
    readAny(
      artifact,
      [
        "verification.outcome",
        "outcome",
        "recoveryOutcome",
      ]
    );


  if (
    outcome ===
      "VERIFIED_RECOVERY" ||
    outcome ===
      "FAILED_RECOVERY" ||
    outcome ===
      "INCONCLUSIVE"
  ) {
    return true;
  }


  return null;
}


function requireExactFailureMode({
  batch7,
  batch8b,
  batch9,
  canonicalEvidence,
}) {
  const values =
    [
      readAny(
        batch7,
        [
          "selectedFailureMode",
          "failureMode",
          "experimentKey",
        ]
      ),

      readAny(
        batch8b,
        [
          "selectedFailureMode",
          "failureMode",
        ]
      ),

      readAny(
        batch9,
        [
          "selectedFailureMode",
          "failureMode",
        ]
      ),

      readAny(
        canonicalEvidence,
        [
          "experimentRun.failure_mode",
          "experimentRun.failureMode",
          "failureMode",
        ]
      ),
    ]
      .filter(
        Boolean
      );


  const observed =
    values.find(
      value =>
        value ===
        "kubernetes.pod.crash"
    );


  if (
    !observed
  ) {
    throw mapperError(
      "PHASE22_LIVE_FAILURE_MODE_UNPROVEN",

      [
        "Live certification requires exact frozen failure-mode evidence.",
        "Expected kubernetes.pod.crash.",
        `Observed=${JSON.stringify(values)}`,
        "Do not relabel this evidence as CrashLoopBackOff.",
      ].join(
        " "
      )
    );
  }


  return observed;
}


function requireConsistentValue(
  field,
  values
) {
  const filtered =
    values.filter(
      value =>
        value !==
          undefined &&
        value !==
          null &&
        value !==
          ""
    );


  const unique =
    [
      ...new Set(
        filtered.map(
          String
        )
      ),
    ];


  if (
    unique.length ===
      0
  ) {
    throw mapperError(
      "PHASE22_LIVE_LINEAGE_MISSING",

      `${field} is missing from live evidence`
    );
  }


  if (
    unique.length >
      1
  ) {
    throw mapperError(
      "PHASE22_LIVE_LINEAGE_MISMATCH",

      `${field} disagrees across frozen evidence: ${unique.join(", ")}`
    );
  }


  return unique[0];
}


function requiredValue(
  field,
  value
) {
  if (
    value ===
      undefined ||
    value ===
      null ||
    value ===
      ""
  ) {
    throw mapperError(
      "PHASE22_LIVE_LINEAGE_MISSING",

      `${field} is required`
    );
  }


  return value;
}


function requireArtifact(
  name,
  artifact
) {
  if (
    !artifact ||
    typeof artifact !==
      "object" ||
    Array.isArray(
      artifact
    )
  ) {
    throw mapperError(
      "PHASE22_LIVE_ARTIFACT_REQUIRED",

      `${name} Phase-21 artifact is required`
    );
  }
}


function assertNonAuthorizing(
  name,
  artifact
) {
  const unsafe =
    readAny(
      artifact,
      [
        "phase21ExecutionAuthorized",
        "executionAuthorized",
        "authority.executionAuthorized",
        "authority.canGrantExecutionAuthorization",
      ]
    ) ===
      true;


  const production =
    readAny(
      artifact,
      [
        "productionCertified",
        "authority.productionCertified",
      ]
    ) ===
      true;


  const groundTruthLeak =
    readAny(
      artifact,
      [
        "groundTruthToAira",
        "groundTruthLeaked",
        "groundTruth.passedToAira",
        "evaluation.groundTruthExposed",
      ]
    ) ===
      true;


  if (
    unsafe ||
    production ||
    groundTruthLeak
  ) {
    throw mapperError(
      "PHASE22_LIVE_SOURCE_SAFETY_VIOLATION",

      `${name} violates frozen Phase-21 safety`
    );
  }
}


function assertSampleSafety(
  sample
) {
  if (
    sample.executionAuthorized ===
      true ||
    sample.productionCertified ===
      true ||
    sample.authorityLeak ===
      true
  ) {
    throw mapperError(
      "PHASE22_LIVE_SAMPLE_AUTHORITY_LEAK",

      "Mapped certification sample leaked authority"
    );
  }


  if (
    sample.evidenceComplete !==
      true
  ) {
    throw mapperError(
      "PHASE22_LIVE_SAMPLE_INCOMPLETE",

      "Live certification sample is missing required evidence"
    );
  }
}


function determineObservedAt(
  artifact
) {
  const candidate =
    readAny(
      artifact,
      [
        "completedAt",
        "completed_at",
        "timestamp",
        "certifiedAt",
        "createdAt",
      ]
    );


  if (
    candidate
  ) {
    const parsed =
      new Date(
        candidate
      );


    if (
      !Number.isNaN(
        parsed.getTime()
      )
    ) {
      return parsed
        .toISOString();
    }
  }


  /*
   * Batch 9 itself is historical evidence.
   *
   * If its artifact did not persist a top-level timestamp,
   * do not invent a current event time.
   */
  return null;
}


function readAny(
  object,
  paths
) {
  if (
    !object
  ) {
    return undefined;
  }


  for (
    const path
    of paths
  ) {
    const value =
      resolvePath(
        object,
        path
      );


    if (
      value !==
        undefined &&
      value !==
        null
    ) {
      return value;
    }
  }


  return undefined;
}


function resolvePath(
  object,
  path
) {
  return String(
    path
  )
    .split(
      "."
    )
    .reduce(
      (
        current,
        part
      ) =>
        current ===
          undefined ||
        current ===
          null
          ? undefined
          : current[
              part
            ],

      object
    );
}


function hashJson(
  value
) {
  return crypto
    .createHash(
      "sha256"
    )
    .update(
      stableStringify(
        value
      )
    )
    .digest(
      "hex"
    );
}


function stableStringify(
  value
) {
  if (
    value ===
      null ||
    typeof value !==
      "object"
  ) {
    return JSON.stringify(
      value
    );
  }


  if (
    Array.isArray(
      value
    )
  ) {
    return [
      "[",

      value
        .map(
          stableStringify
        )
        .join(
          ","
        ),

      "]",
    ].join(
      ""
    );
  }


  return [
    "{",

    Object.keys(
      value
    )
      .sort()
      .map(
        key =>
          `${JSON.stringify(key)}:${stableStringify(value[key])}`
      )
      .join(
        ","
      ),

    "}",
  ].join(
    ""
  );
}


function mapperError(
  code,
  message
) {
  return Object.assign(
    new Error(
      message
    ),

    {
      name:
        "Phase21LiveRecoveryEvidenceMapperError",

      code,

      executionAuthorized:
        false,

      productionCertified:
        false,
    }
  );
}


module.exports = {
  Phase21LiveRecoveryEvidenceMapper,

  LIVE_EVIDENCE_MAPPER_VERSION,

  stableStringify,
};