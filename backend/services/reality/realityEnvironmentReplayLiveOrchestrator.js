"use strict";

const {
  ExperimentOrchestrator,
} = require(
  "../reliability/experimentOrchestrator"
);

const REALITY_ENVIRONMENT_REPLAY_LIVE_VERSION =
  "23R.10B.0";

const FORBIDDEN_CONTEXT_KEYS =
  Object.freeze([
    "groundTruth",
    "ground_truth",

    "sealedEvaluation",
    "sealed_evaluation",

    "evaluationRubric",
    "evaluation_rubric",

    "knownFault",
    "known_fault",

    "expectedDiagnosis",
    "expected_diagnosis",

    "acceptableDiagnoses",
    "acceptable_diagnoses",

    "expectedRecoveryFamily",
    "expected_recovery_family",

    "rootCause",
    "root_cause",

    "executionAuthorized",
    "execution_authorized",

    "productionAuthorized",
    "production_authorized",
  ]);

const AUTHORITY_CONTEXT_KEYS =
  Object.freeze([
    "executionAuthorized",
    "execution_authorized",

    "productionAuthorized",
    "production_authorized",
  ]);


class RealityEnvironmentReplayLiveOrchestrator {
  constructor(
    options = {}
  ) {
    this.phase21Orchestrator =
      options.phase21Orchestrator ||
      new ExperimentOrchestrator(
        options
      );

    this.now =
      options.now ||
      (() => new Date());
  }


  async start(
    input = {}
  ) {
    validateStartInput(
      input
    );

    assertNoForbiddenContext(
      input.agentContext ||
        {},
      "agentContext"
    );

    assertNoForbiddenContext(
      input.ingestionContext ||
        {},
      "ingestionContext"
    );

    assertNoForbiddenContext(
      input.ingestionOptions ||
        {},
      "ingestionOptions"
    );

    assertNoForbiddenContext(
      input.metadata ||
        {},
      "metadata"
    );

    assertLabTarget(
      input.target
    );

    const correlationId =
      input.correlationId ||
      buildCorrelationId({
        replayRunId:
          input.replayRunId,

        realityCaseId:
          input.realityCaseId,
      });

    const result =
      await this
        .phase21Orchestrator
        .runToCorrelation({
          organizationId:
            input.organizationId,

          environmentId:
            input.environmentId,

          tenantId:
            input.tenantId ||
            input.organizationId,

          labEnvironmentId:
            input.labEnvironmentId,

          experimentKey:
            input.experimentKey,

          experimentVersion:
            input.experimentVersion,

          failureKey:
            input.failureKey ||
            input.experimentKey,

          correlationId,

          target:
            sanitizeTarget(
              input.target
            ),

          injectionParameters:
            sanitizeObject(
              input.injectionParameters ||
                {}
            ),

          ingestionContext:
            sanitizeObject(
              input.ingestionContext ||
                {}
            ),

          ingestionOptions:
            sanitizeObject(
              input.ingestionOptions ||
                {}
            ),

          metadata: {
            phase:
              "23R.10B",

            bridgeVersion:
              REALITY_ENVIRONMENT_REPLAY_LIVE_VERSION,

            replayRunId:
              input.replayRunId,

            realityCaseId:
              input.realityCaseId,

            realityCaseVersion:
              input.realityCaseVersion ||
              null,

            evidenceGrade:
              input.evidenceGrade ||
              null,

            replaySeed:
              normalizeOptionalInteger(
                input.replaySeed
              ),

            source:
              "AIRA_REALITY_ENVIRONMENT_REPLAY",

            phase21AuthorityPreserved:
              true,

            evaluatorGroundTruthAgentVisible:
              false,

            productionCertified:
              false,

            executionAuthorized:
              false,

            ...sanitizeObject(
              input.metadata ||
                {}
            ),
          },

          observableSignalProvider:
            input.observableSignalProvider ||
            undefined,

          observableSignal:
            input.observableSignal ||
            undefined,

          executionAuthorized:
            false,
        });

    assertPhase21Result(
      result
    );

    const evaluator =
      result &&
      result.evaluator &&
      typeof result.evaluator ===
        "object"
        ?
        result.evaluator
        :
        {};

    return {
      bridgeVersion:
        REALITY_ENVIRONMENT_REPLAY_LIVE_VERSION,

      phase:
        "23R.10B",

      replayRunId:
        input.replayRunId,

      realityCaseId:
        input.realityCaseId,

      realityCaseVersion:
        input.realityCaseVersion ||
        null,

      experimentRunId:
        requireString(
          result.experimentRunId,
          "phase21Result.experimentRunId"
        ),

      experimentKey:
        result.experimentKey,

      experimentVersion:
        result.experimentVersion,

      correlationId:
        result.correlationId ||
        correlationId,

      phase21Status:
        result.status,

      baseline:
        sanitizeResultValue(
          result.baseline
        ),

      injection:
        sanitizeResultValue(
          result.injection
        ),

      correlation:
        sanitizeResultValue(
          result.correlation
        ),

      evaluator: {
        groundTruthAvailable:
          evaluator.groundTruthAvailable ===
          true,

        groundTruthPassedToAira:
          false,

        evaluationPerformed:
          false,
      },

      authority: {
        labMutationAuthority:
          "PHASE21_RELIABILITY_LAB",

        recoveryExecutionAuthority:
          "UNCHANGED",

        productionAuthorityGranted:
          false,

        replayAuthorityGranted:
          false,
      },

      productionCertified:
        false,

      executionAuthorized:
        false,
    };
  }


  async reset(
    input = {}
  ) {
    validateResetInput(
      input
    );

    const result =
      await this
        .phase21Orchestrator
        .resetAfterPartialRun({
          organizationId:
            input.organizationId,

          environmentId:
            input.environmentId,

          labEnvironmentId:
            input.labEnvironmentId,

          experimentRunId:
            input.experimentRunId,

          resetter:
            input.resetter,

          baselineProvider:
            input.baselineProvider,
        });

    if (
      !result ||
      typeof result !==
        "object"
    ) {
      throw replayLiveError(
        "REALITY_ENVIRONMENT_REPLAY_RESET_RESULT_INVALID",
        (
          "Phase 21 reset returned no "
          + "structured result"
        )
      );
    }

    if (
      result.executionAuthorized ===
      true
    ) {
      throw replayLiveError(
        "REALITY_ENVIRONMENT_REPLAY_RESET_AUTHORITY_FORBIDDEN",
        (
          "Environment replay reset must "
          + "not grant execution authority"
        )
      );
    }

    return {
      bridgeVersion:
        REALITY_ENVIRONMENT_REPLAY_LIVE_VERSION,

      replayRunId:
        input.replayRunId ||
        null,

      experimentRunId:
        input.experimentRunId,

      resetSucceeded:
        result.resetSucceeded ===
        true,

      baselineRestored:
        result.baselineRestored ===
        true,

      authority: {
        resetAuthority:
          "PHASE21_RELIABILITY_LAB",

        productionAuthorityGranted:
          false,
      },

      executionAuthorized:
        false,
    };
  }
}


function validateStartInput(
  input
) {
  requireObject(
    input,
    "input"
  );

  requireString(
    input.organizationId,
    "organizationId"
  );

  requireString(
    input.environmentId,
    "environmentId"
  );

  requireString(
    input.labEnvironmentId,
    "labEnvironmentId"
  );

  requireString(
    input.replayRunId,
    "replayRunId"
  );

  requireString(
    input.realityCaseId,
    "realityCaseId"
  );

  requireString(
    input.experimentKey,
    "experimentKey"
  );

  requireString(
    input.experimentVersion,
    "experimentVersion"
  );

  if (
    input.production ===
    true
  ) {
    throw replayLiveError(
      "REALITY_ENVIRONMENT_REPLAY_PRODUCTION_FORBIDDEN",
      (
        "Reality environment replay may "
        + "not target production"
      )
    );
  }

  if (
    input.executionAuthorized ===
    true
  ) {
    throw replayLiveError(
      "REALITY_ENVIRONMENT_REPLAY_AUTHORITY_FORBIDDEN",
      (
        "Reality replay cannot grant "
        + "execution authority"
      )
    );
  }

  if (
    input.productionAuthorized ===
    true
  ) {
    throw replayLiveError(
      "REALITY_ENVIRONMENT_REPLAY_PRODUCTION_AUTHORITY_FORBIDDEN",
      (
        "Reality replay cannot grant "
        + "production authority"
      )
    );
  }

  if (
    input.evaluatorGroundTruth !==
      undefined ||
    input.groundTruth !==
      undefined ||
    input.sealedEvaluation !==
      undefined
  ) {
    throw replayLiveError(
      "REALITY_ENVIRONMENT_REPLAY_GROUND_TRUTH_FORBIDDEN",
      (
        "Ground truth or sealed evaluation "
        + "data must not enter the live "
        + "replay bridge"
      )
    );
  }
}


function validateResetInput(
  input
) {
  requireObject(
    input,
    "input"
  );

  requireString(
    input.organizationId,
    "organizationId"
  );

  requireString(
    input.environmentId,
    "environmentId"
  );

  requireString(
    input.labEnvironmentId,
    "labEnvironmentId"
  );

  requireString(
    input.experimentRunId,
    "experimentRunId"
  );

  if (
    !input.resetter ||
    typeof input
      .resetter
      .reset !==
      "function"
  ) {
    throw replayLiveError(
      "REALITY_ENVIRONMENT_REPLAY_RESETTER_REQUIRED",
      (
        "Environment replay reset requires "
        + "the canonical Phase 21 resetter"
      )
    );
  }

  if (
    input.executionAuthorized ===
    true
  ) {
    throw replayLiveError(
      "REALITY_ENVIRONMENT_REPLAY_AUTHORITY_FORBIDDEN",
      (
        "Environment replay reset cannot "
        + "grant execution authority"
      )
    );
  }
}


function assertLabTarget(
  target
) {
  if (
    target ===
      null ||
    target ===
      undefined
  ) {
    return;
  }

  requireObject(
    target,
    "target"
  );

  if (
    target.production ===
    true
  ) {
    throw replayLiveError(
      "REALITY_ENVIRONMENT_REPLAY_TARGET_PRODUCTION_FORBIDDEN",
      (
        "Environment replay target "
        + "cannot be production"
      )
    );
  }

  if (
    target.executionAuthorized ===
    true
  ) {
    throw replayLiveError(
      "REALITY_ENVIRONMENT_REPLAY_TARGET_AUTHORITY_FORBIDDEN",
      (
        "Environment replay target "
        + "cannot grant authority"
      )
    );
  }

  assertNoForbiddenContext(
    target,
    "target"
  );
}


function assertPhase21Result(
  result
) {
  if (
    !result ||
    typeof result !==
      "object"
  ) {
    throw replayLiveError(
      "REALITY_ENVIRONMENT_REPLAY_PHASE21_RESULT_INVALID",
      (
        "Phase 21 experiment orchestrator "
        + "returned no structured result"
      )
    );
  }

  requireString(
    result.experimentRunId,
    "phase21Result.experimentRunId"
  );

  if (
    result.executionAuthorized ===
    true
  ) {
    throw replayLiveError(
      "REALITY_ENVIRONMENT_REPLAY_PHASE21_AUTHORITY_FORBIDDEN",
      (
        "Phase 21 result unexpectedly "
        + "granted execution authority"
      )
    );
  }

  if (
    result.productionCertified ===
    true
  ) {
    throw replayLiveError(
      "REALITY_ENVIRONMENT_REPLAY_PHASE21_PRODUCTION_FORBIDDEN",
      (
        "Reality replay cannot convert "
        + "lab evidence into production proof"
      )
    );
  }

  if (
    result.evaluator &&
    result
      .evaluator
      .groundTruthPassedToAira ===
      true
  ) {
    throw replayLiveError(
      "REALITY_ENVIRONMENT_REPLAY_GROUND_TRUTH_LEAKAGE",
      (
        "Phase 21 result reports evaluator "
        + "ground truth entered AIRA context"
      )
    );
  }

  assertNoAuthorityField(
    result.correlation,
    "phase21Result.correlation"
  );
}


function assertNoForbiddenContext(
  value,
  path =
    "value"
) {
  const match =
    findForbiddenField(
      value
    );

  if (
    match
  ) {
    throw replayLiveError(
      isAuthorityKey(
        match.key
      )
        ?
        "REALITY_ENVIRONMENT_REPLAY_CONTEXT_AUTHORITY_FORBIDDEN"
        :
        "REALITY_ENVIRONMENT_REPLAY_GROUND_TRUTH_LEAKAGE",

      (
        `Forbidden field ${match.key} `
        + `found in ${path}${match.path}`
      )
    );
  }
}


function findForbiddenField(
  value,
  path =
    ""
) {
  if (
    value ===
      null ||
    value ===
      undefined
  ) {
    return null;
  }

  if (
    Array.isArray(
      value
    )
  ) {
    for (
      let index = 0;
      index <
        value.length;
      index += 1
    ) {
      const found =
        findForbiddenField(
          value[
            index
          ],
          `${path}[${index}]`
        );

      if (
        found
      ) {
        return found;
      }
    }

    return null;
  }

  if (
    typeof value !==
      "object"
  ) {
    return null;
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
      FORBIDDEN_CONTEXT_KEYS
        .includes(
          key
        )
    ) {
      if (
        isAuthorityKey(
          key
        )
      ) {
        /*
         * Authority declarations are allowed when explicitly false.
         *
         * This is important because Phase 21 and Phase 23R objects
         * deliberately carry executionAuthorized:false as a safety
         * assertion.
         *
         * Only a TRUE authority request is forbidden.
         */
        if (
          child ===
          true
        ) {
          return {
            key,

            path:
              `${path}.${key}`,
          };
        }
      } else {
        /*
         * Ground truth / evaluator fields are forbidden by presence,
         * regardless of their value.
         */
        return {
          key,

          path:
            `${path}.${key}`,
        };
      }
    }

    const found =
      findForbiddenField(
        child,
        `${path}.${key}`
      );

    if (
      found
    ) {
      return found;
    }
  }

  return null;
}


function isAuthorityKey(
  key
) {
  return AUTHORITY_CONTEXT_KEYS
    .includes(
      key
    );
}


function assertNoAuthorityField(
  value,
  path
) {
  if (
    value ===
      null ||
    value ===
      undefined
  ) {
    return;
  }

  const authority =
    findTrueAuthorityField(
      value
    );

  if (
    authority
  ) {
    throw replayLiveError(
      "REALITY_ENVIRONMENT_REPLAY_RESULT_AUTHORITY_FORBIDDEN",
      (
        `Authority field ${authority.key} `
        + `was true in ${path}`
      )
    );
  }
}


function findTrueAuthorityField(
  value
) {
  if (
    !value ||
    typeof value !==
      "object"
  ) {
    return null;
  }

  if (
    Array.isArray(
      value
    )
  ) {
    for (
      const child
      of value
    ) {
      const found =
        findTrueAuthorityField(
          child
        );

      if (
        found
      ) {
        return found;
      }
    }

    return null;
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
      isAuthorityKey(
        key
      ) &&
      child ===
        true
    ) {
      return {
        key,
      };
    }

    const found =
      findTrueAuthorityField(
        child
      );

    if (
      found
    ) {
      return found;
    }
  }

  return null;
}


function sanitizeTarget(
  target
) {
  if (
    target ===
      null ||
    target ===
      undefined
  ) {
    return null;
  }

  return {
    ...sanitizeObject(
      target
    ),

    production:
      false,

    executionAuthorized:
      false,
  };
}


function sanitizeObject(
  value
) {
  if (
    value ===
      null ||
    value ===
      undefined
  ) {
    return {};
  }

  requireObject(
    value,
    "value"
  );

  const cloned =
    JSON.parse(
      JSON.stringify(
        value
      )
    );

  delete cloned.executionAuthorized;
  delete cloned.execution_authorized;
  delete cloned.productionAuthorized;
  delete cloned.production_authorized;

  return cloned;
}


function sanitizeResultValue(
  value
) {
  if (
    value ===
      undefined ||
    value ===
      null
  ) {
    return null;
  }

  if (
    typeof value !==
      "object"
  ) {
    return value;
  }

  const cloned =
    JSON.parse(
      JSON.stringify(
        value
      )
    );

  scrubGroundTruth(
    cloned
  );

  return cloned;
}


function scrubGroundTruth(
  value
) {
  if (
    !value ||
    typeof value !==
      "object"
  ) {
    return;
  }

  if (
    Array.isArray(
      value
    )
  ) {
    for (
      const child
      of value
    ) {
      scrubGroundTruth(
        child
      );
    }

    return;
  }

  for (
    const key
    of Object.keys(
      value
    )
  ) {
    if (
      FORBIDDEN_CONTEXT_KEYS
        .includes(
          key
        )
    ) {
      delete value[
        key
      ];

      continue;
    }

    scrubGroundTruth(
      value[
        key
      ]
    );
  }
}


function buildCorrelationId({
  replayRunId,

  realityCaseId,
}) {
  return [
    "phase23r",

    encodeIdentityPart(
      replayRunId
    ),

    encodeIdentityPart(
      realityCaseId
    ),
  ]
    .join(
      ":"
    );
}


function encodeIdentityPart(
  value
) {
  return encodeURIComponent(
    requireString(
      value,
      "identity"
    )
  );
}


function normalizeOptionalInteger(
  value
) {
  if (
    value ===
      null ||
    value ===
      undefined
  ) {
    return null;
  }

  if (
    !Number.isInteger(
      value
    ) ||
    value < 0
  ) {
    throw replayLiveError(
      "REALITY_ENVIRONMENT_REPLAY_SEED_INVALID",
      (
        "replaySeed must be a "
        + "non-negative integer"
      )
    );
  }

  return value;
}


function requireObject(
  value,
  field
) {
  if (
    !value ||
    typeof value !==
      "object" ||
    Array.isArray(
      value
    )
  ) {
    throw replayLiveError(
      "REALITY_ENVIRONMENT_REPLAY_OBJECT_REQUIRED",
      `${field} must be an object`
    );
  }

  return value;
}


function requireString(
  value,
  field
) {
  if (
    typeof value !==
      "string" ||
    value.trim() ===
      ""
  ) {
    throw replayLiveError(
      "REALITY_ENVIRONMENT_REPLAY_STRING_REQUIRED",
      (
        `${field} must be a `
        + "non-empty string"
      )
    );
  }

  return value.trim();
}


function replayLiveError(
  code,
  message,
  extra =
    {}
) {
  return Object.assign(
    new Error(
      message
    ),
    {
      name:
        "RealityEnvironmentReplayLiveOrchestrationError",

      code,

      productionCertified:
        false,

      executionAuthorized:
        false,

      ...extra,
    }
  );
}


module.exports = {
  REALITY_ENVIRONMENT_REPLAY_LIVE_VERSION,

  FORBIDDEN_CONTEXT_KEYS,

  AUTHORITY_CONTEXT_KEYS,

  RealityEnvironmentReplayLiveOrchestrator,

  validateStartInput,

  validateResetInput,

  assertLabTarget,

  assertPhase21Result,

  assertNoForbiddenContext,

  findForbiddenField,

  findTrueAuthorityField,

  buildCorrelationId,

  sanitizeTarget,

  sanitizeResultValue,
};