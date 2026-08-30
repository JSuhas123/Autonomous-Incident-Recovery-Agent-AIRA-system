"use strict";

const {
  RELIABILITY_EXPERIMENT_CONTRACT_VERSION,

  FAILURE_DOMAIN,

  FAILURE_TYPE,

  EXPERIMENT_RUN_STATUS,

  EXPERIMENT_OUTCOME,

  EXPERIMENT_ASSERTION,
} =
  require(
    "../../constants/reliabilityLab"
  );


const EXPERIMENT_CONTRACT =
  Object.freeze({
    contractVersion:
      RELIABILITY_EXPERIMENT_CONTRACT_VERSION,

    phase:
      21,

    groundTruthVisibility:
      "EVALUATOR_ONLY",

    executionAuthorized:
      false,
  });


function validateExperimentDefinition(
  definition
) {
  requireString(
    definition
      ?.experimentKey,
    "experimentKey"
  );


  requirePositiveInteger(
    definition
      ?.version,
    "version"
  );


  requireString(
    definition
      ?.name,
    "name"
  );


  requireEnum(
    definition
      ?.failureDomain,
    FAILURE_DOMAIN,
    "failureDomain"
  );


  requireEnum(
    definition
      ?.failureType,
    FAILURE_TYPE,
    "failureType"
  );


  requireString(
    definition
      ?.targetResourceType,
    "targetResourceType"
  );


  if (
    definition
      ?.executionAuthorized ===
    true
  ) {
    throw experimentError(
      "EXPERIMENT_DEFINITION_CANNOT_AUTHORIZE_EXECUTION",
      "Experiment definition cannot grant execution authorization"
    );
  }


  if (
    !definition
      ?.groundTruth ||
    typeof definition
      .groundTruth !==
      "object"
  ) {
    throw experimentError(
      "EXPERIMENT_GROUND_TRUTH_REQUIRED",
      "Experiment definition requires evaluator ground truth"
    );
  }


  requireString(
    definition
      .groundTruth
      .expectedFailureModeKey,
    "groundTruth.expectedFailureModeKey"
  );


  if (
    definition
      ?.assertions !==
      undefined
  ) {
    if (
      !Array.isArray(
        definition.assertions
      )
    ) {
      throw experimentError(
        "EXPERIMENT_ASSERTIONS_INVALID",
        "Experiment assertions must be an array"
      );
    }


    for (
      const assertion
      of definition.assertions
    ) {
      if (
        !Object.values(
          EXPERIMENT_ASSERTION
        ).includes(
          assertion
        )
      ) {
        throw experimentError(
          "EXPERIMENT_ASSERTION_UNKNOWN",
          `Unknown experiment assertion ${assertion}`
        );
      }
    }
  }


  return {
    valid:
      true,

    experimentKey:
      definition
        .experimentKey,

    version:
      definition.version,

    executionAuthorized:
      false,
  };
}


function validateExperimentRun(
  run
) {
  requireString(
    run
      ?.experimentRunId,
    "experimentRunId"
  );


  requireString(
    run
      ?.experimentKey,
    "experimentKey"
  );


  requirePositiveInteger(
    run
      ?.experimentVersion,
    "experimentVersion"
  );


  requireString(
    run
      ?.labEnvironmentId,
    "labEnvironmentId"
  );


  requireString(
    run
      ?.correlationId,
    "correlationId"
  );


  requireEnum(
    run
      ?.status,
    EXPERIMENT_RUN_STATUS,
    "status"
  );


  if (
    run
      ?.outcome !==
      undefined &&
    run
      ?.outcome !==
      null
  ) {
    requireEnum(
      run.outcome,
      EXPERIMENT_OUTCOME,
      "outcome"
    );
  }


  if (
    run
      ?.executionAuthorized ===
    true
  ) {
    throw experimentError(
      "EXPERIMENT_RUN_CANNOT_AUTHORIZE_EXECUTION",
      "Experiment run cannot grant execution authorization"
    );
  }


  return {
    valid:
      true,

    experimentRunId:
      run
        .experimentRunId,

    executionAuthorized:
      false,
  };
}


/**
 * Builds data visible to AIRA during an experiment.
 *
 * Ground truth, injected-failure implementation details and evaluator-only
 * expectations are intentionally excluded.
 */
function buildAiraExperimentContext({
  experimentRun,

  definition,

  resourceContext =
    {},

  observationContext =
    {},
} = {}) {
  validateExperimentRun(
    experimentRun
  );


  validateExperimentDefinition(
    definition
  );


  return {
    experimentRunId:
      experimentRun
        .experimentRunId,

    correlationId:
      experimentRun
        .correlationId,

    labEnvironmentId:
      experimentRun
        .labEnvironmentId,

    experimentKey:
      experimentRun
        .experimentKey,

    experimentVersion:
      experimentRun
        .experimentVersion,

    resourceContext:
      sanitizeVisibleContext(
        resourceContext
      ),

    observationContext:
      sanitizeVisibleContext(
        observationContext
      ),

    reliabilityLab:
      true,

    executionAuthorized:
      false,
  };
}


/**
 * Builds evaluator-only ground truth.
 *
 * This object must never be forwarded into the AIRA reasoning pipeline.
 */
function buildEvaluatorGroundTruth({
  experimentRun,

  definition,

  failureInjectionId,
} = {}) {
  validateExperimentRun(
    experimentRun
  );


  validateExperimentDefinition(
    definition
  );


  requireString(
    failureInjectionId,
    "failureInjectionId"
  );


  return {
    experimentRunId:
      experimentRun
        .experimentRunId,

    failureInjectionId,

    failureDomain:
      definition
        .failureDomain,

    failureType:
      definition
        .failureType,

    targetResourceType:
      definition
        .targetResourceType,

    groundTruth:
      deepClone(
        definition
          .groundTruth
      ),

    visibility:
      "EVALUATOR_ONLY",

    executionAuthorized:
      false,
  };
}


function assertNoGroundTruthLeak(
  value
) {
  const forbiddenKeys =
    new Set([
      "groundtruth",

      "expectedfailuremodekey",

      "failureinjectionimplementation",

      "injector",

      "injectioncommand",

      "expecteddiagnosis",

      "expectedrecovery",
    ]);


  walk(
    value,
    (
      key
    ) => {
      const normalized =
        String(
          key
        )
          .replace(
            /[^a-z0-9]/gi,
            ""
          )
          .toLowerCase();


      if (
        forbiddenKeys.has(
          normalized
        )
      ) {
        throw experimentError(
          "EXPERIMENT_GROUND_TRUTH_LEAK",
          `Evaluator-only experiment field "${key}" cannot enter AIRA reasoning`
        );
      }
    }
  );


  return {
    valid:
      true,

    executionAuthorized:
      false,
  };
}


function sanitizeVisibleContext(
  value
) {
  const cloned =
    deepClone(
      value
    );


  assertNoGroundTruthLeak(
    cloned
  );


  return cloned;
}


function walk(
  value,
  visitor
) {
  if (
    Array.isArray(
      value
    )
  ) {
    for (
      const item
      of value
    ) {
      walk(
        item,
        visitor
      );
    }


    return;
  }


  if (
    !value ||
    typeof value !==
      "object"
  ) {
    return;
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
    visitor(
      key,
      child
    );


    walk(
      child,
      visitor
    );
  }
}


function deepClone(
  value
) {
  if (
    value ===
      undefined
  ) {
    return undefined;
  }


  return JSON.parse(
    JSON.stringify(
      value
    )
  );
}


function requireString(
  value,
  field
) {
  if (
    typeof value !==
      "string" ||
    !value.trim()
  ) {
    throw experimentError(
      "EXPERIMENT_FIELD_REQUIRED",
      `${field} is required`,
      {
        field,
      }
    );
  }
}


function requirePositiveInteger(
  value,
  field
) {
  if (
    !Number.isInteger(
      value
    ) ||
    value <=
      0
  ) {
    throw experimentError(
      "EXPERIMENT_INTEGER_INVALID",
      `${field} must be a positive integer`,
      {
        field,
      }
    );
  }
}


function requireEnum(
  value,
  enumObject,
  field
) {
  if (
    !Object.values(
      enumObject
    ).includes(
      value
    )
  ) {
    throw experimentError(
      "EXPERIMENT_ENUM_INVALID",
      `${field} is invalid`,
      {
        field,

        value,
      }
    );
  }
}


function experimentError(
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
        "ReliabilityExperimentContractError",

      code,

      ...metadata,

      executionAuthorized:
        false,
    }
  );
}


module.exports = {
  EXPERIMENT_CONTRACT,

  validateExperimentDefinition,

  validateExperimentRun,

  buildAiraExperimentContext,

  buildEvaluatorGroundTruth,

  assertNoGroundTruthLeak,

  experimentError,
};