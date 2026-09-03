"use strict";

const {
  RealityEnvironmentReplayLiveOrchestrator,
  buildCorrelationId,
} = require(
  "./realityEnvironmentReplayLiveOrchestrator"
);

const {
  RealityEnvironmentReplayBindingService,
  ENVIRONMENT_REPLAY_RUN_STAGE,
} = require(
  "./realityEnvironmentReplayBindingService"
);

const {
  ENVIRONMENT_REPLAY_MODE,
} = require(
  "../../constants/realityEnvironmentReplay"
);

const REALITY_KUBERNETES_REPLAY_RUNNER_VERSION =
  "23R.10D.0";

const CANONICAL_REALITY_KUBERNETES_PROFILE =
  Object.freeze({
    mode:
      ENVIRONMENT_REPLAY_MODE
        .KUBERNETES,

    namespace:
      "aira-reliability-lab",

    experimentKey:
      "kubernetes.pod.crash",

    experimentVersion:
      "1",

    failureKey:
      "kubernetes.pod.crash",

    targetResourceType:
      "kubernetes.pod",

    expectedPhase21Status:
      "WAITING_FOR_DIAGNOSIS",
  });

function runnerError(
  code,
  message,
  status = 422,
  metadata = {}
) {
  return Object.assign(
    new Error(
      message
    ),
    {
      name:
        "RealityKubernetesReplayRunnerError",

      code,

      status,

      productionCertified:
        false,

      executionAuthorized:
        false,

      ...metadata,
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
    value.trim() ===
      ""
  ) {
    throw runnerError(
      "REALITY_KUBERNETES_REPLAY_FIELD_REQUIRED",
      `${field} is required`
    );
  }

  return value.trim();
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
    throw runnerError(
      "REALITY_KUBERNETES_REPLAY_OBJECT_REQUIRED",
      `${field} must be an object`
    );
  }

  return value;
}

function assertCanonicalTarget(
  target
) {
  requireObject(
    target,
    "target"
  );

  if (
    target.production ===
      true ||
    target.executionAuthorized ===
      true ||
    target.productionAuthorized ===
      true
  ) {
    throw runnerError(
      "REALITY_KUBERNETES_REPLAY_TARGET_AUTHORITY_FORBIDDEN",
      (
        "Live Reality replay target must be " +
        "non-production and non-authorizing"
      )
    );
  }

  if (
    target.namespace !==
      CANONICAL_REALITY_KUBERNETES_PROFILE
        .namespace
  ) {
    throw runnerError(
      "REALITY_KUBERNETES_REPLAY_NAMESPACE_FORBIDDEN",
      (
        "Live Reality replay may only operate in " +
        CANONICAL_REALITY_KUBERNETES_PROFILE
          .namespace
      )
    );
  }

  if (
    target.resourceType !==
      CANONICAL_REALITY_KUBERNETES_PROFILE
        .targetResourceType
  ) {
    throw runnerError(
      "REALITY_KUBERNETES_REPLAY_TARGET_TYPE_INVALID",
      (
        "Live Reality replay requires " +
        CANONICAL_REALITY_KUBERNETES_PROFILE
          .targetResourceType
      )
    );
  }

  requireString(
    target.podName,
    "target.podName"
  );

  const labels =
    requireObject(
      target.labels,
      "target.labels"
    );

  const reliabilityLabLabel =
    labels[
      "aira.reliability-lab"
    ];

  if (
    reliabilityLabLabel !==
      true &&
    reliabilityLabLabel !==
      "true"
  ) {
    throw runnerError(
      "REALITY_KUBERNETES_REPLAY_LAB_LABEL_REQUIRED",
      (
        "Target must carry " +
        "aira.reliability-lab=true"
      )
    );
  }

  if (
    labels[
      "aira.safety-class"
    ] !==
      "LAB_ONLY"
  ) {
    throw runnerError(
      "REALITY_KUBERNETES_REPLAY_SAFETY_CLASS_REQUIRED",
      (
        "Target must carry " +
        "aira.safety-class=LAB_ONLY"
      )
    );
  }

  return true;
}

function assertRunnerInput(
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

  if (
    input.production ===
      true ||
    input.executionAuthorized ===
      true ||
    input.productionAuthorized ===
      true
  ) {
    throw runnerError(
      "REALITY_KUBERNETES_REPLAY_AUTHORITY_FORBIDDEN",
      (
        "Phase 23R.10D cannot grant " +
        "production or execution authority"
      )
    );
  }

  if (
    input.groundTruth !==
      undefined ||
    input.evaluatorGroundTruth !==
      undefined ||
    input.sealedEvaluation !==
      undefined
  ) {
    throw runnerError(
      "REALITY_KUBERNETES_REPLAY_GROUND_TRUTH_FORBIDDEN",
      (
        "Evaluator ground truth must remain " +
        "sealed from the live runner"
      )
    );
  }

  if (
    input.mode !==
      undefined &&
    input.mode !==
      ENVIRONMENT_REPLAY_MODE
        .KUBERNETES
  ) {
    throw runnerError(
      "REALITY_KUBERNETES_REPLAY_MODE_INVALID",
      (
        "Phase 23R.10D supports only " +
        "KUBERNETES mode"
      )
    );
  }

  if (
    input.experimentKey !==
      undefined &&
    input.experimentKey !==
      CANONICAL_REALITY_KUBERNETES_PROFILE
        .experimentKey
  ) {
    throw runnerError(
      "REALITY_KUBERNETES_REPLAY_EXPERIMENT_FORBIDDEN",
      (
        "Phase 23R.10D is locked to " +
        "kubernetes.pod.crash for first " +
        "live certification"
      )
    );
  }

  if (
    input.failureKey !==
      undefined &&
    input.failureKey !==
      CANONICAL_REALITY_KUBERNETES_PROFILE
        .failureKey
  ) {
    throw runnerError(
      "REALITY_KUBERNETES_REPLAY_FAILURE_FORBIDDEN",
      (
        "Phase 23R.10D is locked to " +
        "kubernetes.pod.crash for first " +
        "live certification"
      )
    );
  }

  assertCanonicalTarget(
    input.target
  );
}

function buildSafeTarget(
  target
) {
  assertCanonicalTarget(
    target
  );

  return {
    ...JSON.parse(
      JSON.stringify(
        target
      )
    ),

    namespace:
      CANONICAL_REALITY_KUBERNETES_PROFILE
        .namespace,

    resourceType:
      CANONICAL_REALITY_KUBERNETES_PROFILE
        .targetResourceType,

    production:
      false,

    executionAuthorized:
      false,
  };
}

function assertLiveResult(
  result
) {
  requireObject(
    result,
    "liveResult"
  );

  requireString(
    result.experimentRunId,
    "liveResult.experimentRunId"
  );

  if (
    result.phase21Status !==
      CANONICAL_REALITY_KUBERNETES_PROFILE
        .expectedPhase21Status
  ) {
    throw runnerError(
      "REALITY_KUBERNETES_REPLAY_PHASE21_STATUS_INVALID",
      (
        "Expected Phase 21 status " +
        CANONICAL_REALITY_KUBERNETES_PROFILE
          .expectedPhase21Status +
        ", received " +
        String(
          result.phase21Status
        )
      ),
      500
    );
  }

  if (
    result.executionAuthorized ===
      true ||
    result.productionCertified ===
      true ||
    result.evaluator
      ?.groundTruthPassedToAira ===
      true
  ) {
    throw runnerError(
      "REALITY_KUBERNETES_REPLAY_LIVE_RESULT_UNSAFE",
      (
        "Live Phase-21 result violated " +
        "Phase-23R safety invariants"
      ),
      500
    );
  }

  return true;
}

class RealityKubernetesReplayRunner {
  constructor(
    options = {}
  ) {
    this.bindingService =
      options.bindingService ||
      new RealityEnvironmentReplayBindingService(
        options
      );

    this.liveOrchestrator =
      options.liveOrchestrator ||
      new RealityEnvironmentReplayLiveOrchestrator(
        options
      );
  }

  async start(
    input = {}
  ) {
    assertRunnerInput(
      input
    );

    const correlationId =
      input.correlationId ||
      buildCorrelationId({
        replayRunId:
          input.replayRunId,

        realityCaseId:
          input.realityCaseId,
      });

    let binding =
      null;

    try {
      binding =
        await this
          .bindingService
          .createBinding({
            organizationId:
              input.organizationId,

            environmentId:
              input.environmentId,

            replayRunId:
              input.replayRunId,

            labEnvironmentId:
              input.labEnvironmentId,

            correlationId,

            mode:
              ENVIRONMENT_REPLAY_MODE
                .KUBERNETES,

            metadata: {
              runnerVersion:
                REALITY_KUBERNETES_REPLAY_RUNNER_VERSION,

              profile:
                "FIRST_LIVE_KUBERNETES_POD_CRASH",

              realityCaseId:
                input.realityCaseId,

              realityCaseVersion:
                input.realityCaseVersion ||
                null,

              groundTruthAgentVisible:
                false,

              productionCertified:
                false,

              executionAuthorized:
                false,
            },
          });

      const liveResult =
        await this
          .liveOrchestrator
          .start({
            organizationId:
              input.organizationId,

            environmentId:
              input.environmentId,

            tenantId:
              input.tenantId ||
              input.organizationId,

            labEnvironmentId:
              input.labEnvironmentId,

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
              input.replaySeed,

            correlationId,

            experimentKey:
              CANONICAL_REALITY_KUBERNETES_PROFILE
                .experimentKey,

            experimentVersion:
              CANONICAL_REALITY_KUBERNETES_PROFILE
                .experimentVersion,

            failureKey:
              CANONICAL_REALITY_KUBERNETES_PROFILE
                .failureKey,

            target:
              buildSafeTarget(
                input.target
              ),

            injectionParameters:
              input.injectionParameters ||
              {},

            ingestionContext:
              input.ingestionContext ||
              {},

            ingestionOptions:
              input.ingestionOptions ||
              {},

            observableSignalProvider:
              input.observableSignalProvider,

            observableSignal:
              input.observableSignal,

            metadata: {
              runnerVersion:
                REALITY_KUBERNETES_REPLAY_RUNNER_VERSION,

              environmentReplayRunId:
                binding
                  .environmentReplayRunId,

              groundTruthAgentVisible:
                false,
            },

            production:
              false,

            executionAuthorized:
              false,
          });

      assertLiveResult(
        liveResult
      );

      binding =
        await this
          .bindingService
          .bindExperimentRun({
            organizationId:
              input.organizationId,

            environmentId:
              input.environmentId,

            environmentReplayRunId:
              binding
                .environmentReplayRunId,

            experimentRunId:
              liveResult
                .experimentRunId,
          });

      binding =
        await this
          .bindingService
          .transitionStage({
            organizationId:
              input.organizationId,

            environmentId:
              input.environmentId,

            environmentReplayRunId:
              binding
                .environmentReplayRunId,

            stage:
              ENVIRONMENT_REPLAY_RUN_STAGE
                .OBSERVING,
          });

      return {
        runnerVersion:
          REALITY_KUBERNETES_REPLAY_RUNNER_VERSION,

        profile:
          "FIRST_LIVE_KUBERNETES_POD_CRASH",

        replayRunId:
          input.replayRunId,

        environmentReplayRunId:
          binding
            .environmentReplayRunId,

        experimentRunId:
          liveResult
            .experimentRunId,

        correlationId,

        mode:
          ENVIRONMENT_REPLAY_MODE
            .KUBERNETES,

        stage:
          binding.stage,

        phase21Status:
          liveResult
            .phase21Status,

        baseline:
          liveResult.baseline,

        injection:
          liveResult.injection,

        correlation:
          liveResult.correlation,

        evaluator: {
          groundTruthAvailable:
            liveResult
              .evaluator
              ?.groundTruthAvailable ===
              true,

          groundTruthPassedToAira:
            false,
        },

        groundTruthAgentVisible:
          false,

        productionCertified:
          false,

        executionAuthorized:
          false,
      };
    } catch (
      error
    ) {
      if (
        binding
          ?.environmentReplayRunId
      ) {
        try {
          await this
            .bindingService
            .transitionStage({
              organizationId:
                input.organizationId,

              environmentId:
                input.environmentId,

              environmentReplayRunId:
                binding
                  .environmentReplayRunId,

              stage:
                ENVIRONMENT_REPLAY_RUN_STAGE
                  .FAILED,

              failureCode:
                error
                  ?.code ||
                "REALITY_KUBERNETES_REPLAY_FAILED",

              failureMessage:
                error
                  ?.message ||
                (
                  "Live Kubernetes Reality " +
                  "replay failed"
                ),
            });
        } catch (
          transitionError
        ) {
          error
            .environmentReplayFailureTransition =
            {
              code:
                transitionError
                  ?.code ||
                null,

              message:
                transitionError
                  ?.message ||
                String(
                  transitionError
                ),
            };
        }
      }

      throw error;
    }
  }
}

module.exports = {
  REALITY_KUBERNETES_REPLAY_RUNNER_VERSION,

  CANONICAL_REALITY_KUBERNETES_PROFILE,

  RealityKubernetesReplayRunner,

  assertRunnerInput,

  assertCanonicalTarget,

  assertLiveResult,

  buildSafeTarget,
};