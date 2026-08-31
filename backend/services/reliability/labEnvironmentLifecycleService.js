"use strict";

const PostgresReliabilityLabRepository =
  require(
    "../../persistence/postgres/PostgresReliabilityLabRepository"
  );


const {
  LAB_ENVIRONMENT_STATUS,

  LAB_SAFETY_CLASS,
} =
  require(
    "../../constants/reliabilityLab"
  );


const {
  assertLabEnvironmentContract,

  isEnvironmentRunnable,
} =
  require(
    "../../contracts/reliability"
  );


const ALLOWED_TRANSITIONS =
  Object.freeze({
    ABSENT:
      Object.freeze([
        "PROVISIONING",
      ]),

    PROVISIONING:
      Object.freeze([
        "READY",
        "PROVISION_FAILED",
      ]),

    READY:
      Object.freeze([
        "BASELINING",
        "UNHEALTHY",
      ]),

    BASELINING:
      Object.freeze([
        "AVAILABLE",
        "DIRTY",
        "UNHEALTHY",
      ]),

    AVAILABLE:
      Object.freeze([
        "RUNNING_EXPERIMENT",
        "RESETTING",
        "UNHEALTHY",
        "DIRTY",
      ]),

    RUNNING_EXPERIMENT:
      Object.freeze([
        "RESETTING",
        "DIRTY",
        "UNHEALTHY",
      ]),

    RESETTING:
      Object.freeze([
        "AVAILABLE",
        "RESET_FAILED",
        "DIRTY",
      ]),

    PROVISION_FAILED:
      Object.freeze([
        "PROVISIONING",
      ]),

    DIRTY:
      Object.freeze([
        "RESETTING",
      ]),

    RESET_FAILED:
      Object.freeze([
        "RESETTING",
        "DIRTY",
      ]),

    UNHEALTHY:
      Object.freeze([
        "RESETTING",
        "DIRTY",
      ]),
  });


class LabEnvironmentLifecycleService {
  constructor(
    options =
      {}
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


  async register(
    {
      organizationId,

      environmentId,

      name,

      kind,

      infrastructureRef =
        null,

      namespace =
        null,

      labels =
        {},

      configuration =
        {},
    }
  ) {
    const contractCandidate = {
      organizationId,

      environmentId:
        "pending-canonical-resolution",

      environmentPublicId:
        environmentId,

      kind,

      status:
        LAB_ENVIRONMENT_STATUS
          .ABSENT,

      safetyClass:
        LAB_SAFETY_CLASS
          .LAB_ONLY,

      production:
        false,

      executionAuthorized:
        false,
    };


    assertLabEnvironmentContract(
      contractCandidate
    );


    return this.repository
      .createLabEnvironment({
        organizationId,

        environmentId,

        name,

        kind,

        status:
          LAB_ENVIRONMENT_STATUS
            .ABSENT,

        infrastructureRef,

        namespace,

        labels: {
          ...labels,

          "aira.reliability-lab":
            true,
        },

        configuration: {
          ...configuration,

          production:
            false,

          safetyClass:
            LAB_SAFETY_CLASS
              .LAB_ONLY,
        },
      });
  }


  async requireEnvironment(
    {
      organizationId,

      environmentId,

      labEnvironmentId,
    }
  ) {
    const environment =
      await this.repository
        .getLabEnvironment({
          organizationId,

          environmentId,

          labEnvironmentId,
        });


    if (
      !environment
    ) {
      throw lifecycleError(
        "RELIABILITY_LAB_ENVIRONMENT_NOT_FOUND",
        "Reliability Lab environment was not found"
      );
    }


    assertLabEnvironmentContract({
      organizationId,

      environmentId:
        environment.id,

      environmentPublicId:
        environmentId,

      kind:
        environment.kind,

      status:
        environment.status,

      safetyClass:
        environment.safetyClass,

      production:
        environment.production,

      executionAuthorized:
        false,
    });


    return environment;
  }


  async transition(
    {
      organizationId,

      environmentId,

      labEnvironmentId,

      toStatus,

      dirtyReason =
        undefined,

      baseline =
        undefined,
    }
  ) {
    const environment =
      await this
        .requireEnvironment({
          organizationId,

          environmentId,

          labEnvironmentId,
        });


    assertTransitionAllowed(
      environment.status,

      toStatus
    );


    const now =
      this.now();


    const patch = {
      organizationId,

      environmentId,

      labEnvironmentId,

      status:
        toStatus,
    };


    if (
      dirtyReason !==
      undefined
    ) {
      patch.dirtyReason =
        dirtyReason;
    }


    if (
      toStatus ===
      LAB_ENVIRONMENT_STATUS
        .DIRTY &&
      !dirtyReason
    ) {
      patch.dirtyReason =
        "Reliability Lab environment marked dirty";
    }


    if (
      toStatus ===
      LAB_ENVIRONMENT_STATUS
        .AVAILABLE &&
      baseline !==
      undefined
    ) {
      patch.baseline =
        baseline;

      patch.lastBaselinedAt =
        now;

      patch.dirtyReason =
        null;
    }


    if (
      environment.status ===
        LAB_ENVIRONMENT_STATUS
          .RESETTING &&
      toStatus ===
        LAB_ENVIRONMENT_STATUS
          .AVAILABLE
    ) {
      patch.lastResetAt =
        now;

      patch.dirtyReason =
        null;
    }


    return this.repository
      .updateLabEnvironmentState(
        patch
      );
  }


  async assertRunnable(
    scope
  ) {
    const environment =
      await this
        .requireEnvironment(
          scope
        );


    if (
      !isEnvironmentRunnable({
        organizationId:
          scope.organizationId,

        environmentId:
          environment.id,

        environmentPublicId:
          scope.environmentId,

        kind:
          environment.kind,

        status:
          environment.status,

        safetyClass:
          environment.safetyClass,

        production:
          environment.production,

        executionAuthorized:
          false,
      })
    ) {
      throw lifecycleError(
        "RELIABILITY_LAB_NOT_RUNNABLE",
        `Reliability Lab environment is not runnable while status=${environment.status}`,
        {
          status:
            environment.status,
        }
      );
    }


    return {
      environment,

      runnable:
        true,

      executionAuthorized:
        false,
    };
  }

    async beginBaselining(
    scope
  ) {
    return this.transition({
      ...scope,

      toStatus:
        LAB_ENVIRONMENT_STATUS
          .BASELINING,
    });
  }


  async completeBaselining(
    scope,
    baseline
  ) {
    return this.transition({
      ...scope,

      toStatus:
        LAB_ENVIRONMENT_STATUS
          .AVAILABLE,

      baseline,
    });
  }

  async beginExperiment(
    scope
  ) {
    await this.assertRunnable(
      scope
    );


    return this.transition({
      ...scope,

      toStatus:
        LAB_ENVIRONMENT_STATUS
          .RUNNING_EXPERIMENT,
    });
  }


  async beginReset(
    scope
  ) {
    const environment =
      await this
        .requireEnvironment(
          scope
        );


    if (
      environment.status ===
        LAB_ENVIRONMENT_STATUS
          .ABSENT ||
      environment.status ===
        LAB_ENVIRONMENT_STATUS
          .PROVISIONING
    ) {
      throw lifecycleError(
        "RELIABILITY_LAB_RESET_NOT_ALLOWED",
        `Cannot reset environment while status=${environment.status}`
      );
    }


    return this.transition({
      ...scope,

      toStatus:
        LAB_ENVIRONMENT_STATUS
          .RESETTING,
    });
  }


  async completeReset(
    scope,
    baseline
  ) {
    return this.transition({
      ...scope,

      toStatus:
        LAB_ENVIRONMENT_STATUS
          .AVAILABLE,

      baseline,
    });
  }


  async failReset(
    scope,
    reason
  ) {
    return this.transition({
      ...scope,

      toStatus:
        LAB_ENVIRONMENT_STATUS
          .RESET_FAILED,

      dirtyReason:
        reason ||
        "Reliability Lab reset failed",
    });
  }


  async markDirty(
    scope,
    reason
  ) {
    return this.transition({
      ...scope,

      toStatus:
        LAB_ENVIRONMENT_STATUS
          .DIRTY,

      dirtyReason:
        reason,
    });
  }
}


function assertTransitionAllowed(
  fromStatus,
  toStatus
) {
  if (
    fromStatus ===
    toStatus
  ) {
    return true;
  }


  const allowed =
    ALLOWED_TRANSITIONS[
      fromStatus
    ] ||
    [];


  if (
    !allowed.includes(
      toStatus
    )
  ) {
    throw lifecycleError(
      "RELIABILITY_LAB_TRANSITION_INVALID",
      `Invalid Reliability Lab transition ${fromStatus} -> ${toStatus}`,
      {
        fromStatus,

        toStatus,
      }
    );
  }


  return true;
}


function lifecycleError(
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
        "ReliabilityLabLifecycleError",

      code,

      ...metadata,

      executionAuthorized:
        false,
    }
  );
}


module.exports = {
  LabEnvironmentLifecycleService,

  ALLOWED_TRANSITIONS,

  assertTransitionAllowed,
};