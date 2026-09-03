"use strict";

const {
  PostgresRealityEnvironmentReplayRepository,
  ENVIRONMENT_REPLAY_RUN_STAGE,
} = require(
  "../../persistence/postgres/PostgresRealityEnvironmentReplayRepository"
);

const {
  ENVIRONMENT_REPLAY_MODE,
  isEnvironmentReplayMode,
} = require(
  "../../constants/realityEnvironmentReplay"
);

const REALITY_ENVIRONMENT_REPLAY_BINDING_VERSION =
  "23R.10C.0";

function bindingError(
  code,
  message,
  status = 422
) {
  return Object.assign(
    new Error(
      message
    ),
    {
      code,
      status,
      executionAuthorized:
        false,
    }
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
    throw bindingError(
      "REALITY_ENVIRONMENT_REPLAY_BINDING_FIELD_REQUIRED",
      `${field} is required`
    );
  }

  return value.trim();
}

function assertNoAuthority(
  input
) {
  if (
    input.executionAuthorized ===
      true ||
    input.productionAuthorized ===
      true ||
    input.production ===
      true
  ) {
    throw bindingError(
      "REALITY_ENVIRONMENT_REPLAY_BINDING_AUTHORITY_FORBIDDEN",
      (
        "Reality environment replay binding cannot " +
        "grant execution or production authority"
      )
    );
  }
}

function assertNoGroundTruth(
  input
) {
  const forbidden = [
    "groundTruth",
    "sealedEvaluation",
    "evaluationRubric",
    "knownFault",
    "expectedDiagnosis",
    "rootCause",
  ];

  for (
    const key
    of forbidden
  ) {
    if (
      input[
        key
      ] !==
        undefined
    ) {
      throw bindingError(
        "REALITY_ENVIRONMENT_REPLAY_BINDING_GROUND_TRUTH_FORBIDDEN",
        (
          `${key} must not enter ` +
          "environment replay binding"
        )
      );
    }
  }
}

function requireBindingStage(
  value
) {
  const stage =
    requireString(
      value,
      "stage"
    );

  if (
    !Object.values(
      ENVIRONMENT_REPLAY_RUN_STAGE
    ).includes(
      stage
    )
  ) {
    throw bindingError(
      "REALITY_ENVIRONMENT_REPLAY_BINDING_STAGE_INVALID",
      (
        "Unsupported environment replay stage " +
        stage
      )
    );
  }

  return stage;
}

class RealityEnvironmentReplayBindingService {
  constructor(
    options = {}
  ) {
    this.repository =
      options.repository ||
      new PostgresRealityEnvironmentReplayRepository(
        options
      );
  }

  async createBinding(
    input = {}
  ) {
    assertNoAuthority(
      input
    );

    assertNoGroundTruth(
      input
    );

    const mode =
      requireString(
        input.mode,
        "mode"
      );

    if (
      !isEnvironmentReplayMode(
        mode
      )
    ) {
      throw bindingError(
        "REALITY_ENVIRONMENT_REPLAY_BINDING_MODE_INVALID",
        (
          "Unsupported environment replay mode " +
          mode
        )
      );
    }

    const binding =
      await this.repository
        .createBinding({
          organizationId:
            requireString(
              input.organizationId,
              "organizationId"
            ),

          environmentId:
            requireString(
              input.environmentId,
              "environmentId"
            ),

          replayRunId:
            requireString(
              input.replayRunId,
              "replayRunId"
            ),

          labEnvironmentId:
            requireString(
              input.labEnvironmentId,
              "labEnvironmentId"
            ),

          correlationId:
            requireString(
              input.correlationId,
              "correlationId"
            ),

          mode,

          metadata: {
            ...(
              input.metadata ||
              {}
            ),

            bindingVersion:
              REALITY_ENVIRONMENT_REPLAY_BINDING_VERSION,

            source:
              "PHASE_23R_ENVIRONMENT_REPLAY",

            groundTruthAgentVisible:
              false,

            productionCertified:
              false,

            executionAuthorized:
              false,
          },
        });

    return this
      .assertSafeBinding(
        binding
      );
  }

  async bindExperimentRun(
    input = {}
  ) {
    assertNoAuthority(
      input
    );

    assertNoGroundTruth(
      input
    );

    const binding =
      await this.repository
        .bindExperimentRun({
          organizationId:
            requireString(
              input.organizationId,
              "organizationId"
            ),

          environmentId:
            requireString(
              input.environmentId,
              "environmentId"
            ),

          environmentReplayRunId:
            requireString(
              input.environmentReplayRunId,
              "environmentReplayRunId"
            ),

          experimentRunId:
            requireString(
              input.experimentRunId,
              "experimentRunId"
            ),
        });

    const safe =
      this.assertSafeBinding(
        binding
      );

    if (
      safe.stage !==
        ENVIRONMENT_REPLAY_RUN_STAGE
          .EXPERIMENT_BOUND
    ) {
      throw bindingError(
        "REALITY_ENVIRONMENT_REPLAY_EXPERIMENT_STAGE_INVALID",
        (
          "Experiment binding did not reach " +
          "EXPERIMENT_BOUND"
        ),
        500
      );
    }

    return safe;
  }

  async transitionStage(
    input = {}
  ) {
    assertNoAuthority(
      input
    );

    assertNoGroundTruth(
      input
    );

    const binding =
      await this.repository
        .transitionStage({
          organizationId:
            requireString(
              input.organizationId,
              "organizationId"
            ),

          environmentId:
            requireString(
              input.environmentId,
              "environmentId"
            ),

          environmentReplayRunId:
            requireString(
              input.environmentReplayRunId,
              "environmentReplayRunId"
            ),

          stage:
            requireBindingStage(
              input.stage
            ),

          failureCode:
            input.failureCode ||
            null,

          failureMessage:
            input.failureMessage ||
            null,
        });

    if (
      !binding
    ) {
      throw bindingError(
        "REALITY_ENVIRONMENT_REPLAY_BINDING_NOT_FOUND",
        (
          "Environment replay binding " +
          "was not found"
        ),
        404
      );
    }

    return this
      .assertSafeBinding(
        binding
      );
  }

  async getBinding(
    input = {}
  ) {
    const binding =
      await this.repository
        .getBinding({
          organizationId:
            requireString(
              input.organizationId,
              "organizationId"
            ),

          environmentId:
            requireString(
              input.environmentId,
              "environmentId"
            ),

          environmentReplayRunId:
            requireString(
              input.environmentReplayRunId,
              "environmentReplayRunId"
            ),
        });

    if (
      !binding
    ) {
      return null;
    }

    return this
      .assertSafeBinding(
        binding
      );
  }

  assertSafeBinding(
    binding
  ) {
    if (
      !binding ||
      typeof binding !==
        "object"
    ) {
      throw bindingError(
        "REALITY_ENVIRONMENT_REPLAY_BINDING_RESULT_INVALID",
        (
          "Environment replay repository " +
          "returned no binding"
        ),
        500
      );
    }

    if (
      binding.executionAuthorized ===
        true ||
      binding.productionCertified ===
        true ||
      binding.groundTruthAgentVisible ===
        true
    ) {
      throw bindingError(
        "REALITY_ENVIRONMENT_REPLAY_BINDING_SAFETY_VIOLATION",
        (
          "Persisted environment replay binding " +
          "violated safety invariants"
        ),
        500
      );
    }

    return {
      ...binding,

      bindingVersion:
        REALITY_ENVIRONMENT_REPLAY_BINDING_VERSION,

      groundTruthAgentVisible:
        false,

      productionCertified:
        false,

      executionAuthorized:
        false,
    };
  }
}

module.exports = {
  REALITY_ENVIRONMENT_REPLAY_BINDING_VERSION,

  RealityEnvironmentReplayBindingService,

  ENVIRONMENT_REPLAY_RUN_STAGE,

  ENVIRONMENT_REPLAY_MODE,

  assertNoAuthority,

  assertNoGroundTruth,

  requireBindingStage,
};