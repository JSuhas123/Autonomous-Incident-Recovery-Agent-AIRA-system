"use strict";

const {
  HUMAN_TASK_STATUS,
  TAKEOVER_SESSION_STATUS,
  CONTROL_LEASE_STATUS,
  ACKNOWLEDGEMENT_OUTCOME,
} = require(
  "../../constants/humanTakeover"
);

const {
  assertHumanTaskTransition,
  assertTakeoverSessionTransition,
  assertControlLeaseTransition,
  isTerminalHumanTaskState,
} = require(
  "./humanTakeoverStateMachine"
);

const {
  PostgresHumanOperationsRepository,
  PostgresHumanTakeoverRepository,
} = require(
  "../../persistence/postgres/humanOperations"
);


function createError(
  message,
  code,
  status = 409
) {
  return Object.assign(
    new Error(message),
    {
      code,
      status,
      executionAuthorized:
        false,
    }
  );
}


function requireValue(
  value,
  field,
  code
) {
  if (
    value === null ||
    value === undefined ||
    String(value).trim() === ""
  ) {
    throw createError(
      `${field} is required`,
      code,
      422
    );
  }
}


class HumanTakeoverLifecycleService {
  constructor(options = {}) {
    this.humanOperationsRepository =
      options.humanOperationsRepository ||
      new PostgresHumanOperationsRepository(
        options
      );

    this.takeoverRepository =
      options.takeoverRepository ||
      new PostgresHumanTakeoverRepository(
        options
      );
  }


  async markTaskWaiting(
    input
  ) {
    const task =
      await this.#requireTask(
        input
      );

    if (
      task.status ===
      HUMAN_TASK_STATUS.WAITING
    ) {
      return task;
    }

    assertHumanTaskTransition(
      task.status,
      HUMAN_TASK_STATUS.WAITING
    );

    return this
      .humanOperationsRepository
      .updateTaskStatus({
        organizationId:
          input.organizationId,

        environmentId:
          input.environmentId,

        taskId:
          task.publicId ||
          task.id,

        status:
          HUMAN_TASK_STATUS.WAITING,

        actorUserId:
          input.actorUserId ||
          null,

        reason:
          input.reason ||
          "Human intervention waiting",

        metadata: {
          ...(input.metadata || {}),

          lifecycleAction:
            "MARK_WAITING",

          executionAuthorized:
            false,
        },
      });
  }


  async startTaskWork(
    input
  ) {
    requireValue(
      input.actorUserId,
      "actorUserId",
      "HUMAN_TASK_ACTOR_REQUIRED"
    );

    const task =
      await this.#requireTask(
        input
      );

    if (
      task.status ===
      HUMAN_TASK_STATUS.IN_PROGRESS
    ) {
      return task;
    }

    assertHumanTaskTransition(
      task.status,
      HUMAN_TASK_STATUS.IN_PROGRESS
    );

    return this
      .humanOperationsRepository
      .updateTaskStatus({
        organizationId:
          input.organizationId,

        environmentId:
          input.environmentId,

        taskId:
          task.publicId ||
          task.id,

        status:
          HUMAN_TASK_STATUS.IN_PROGRESS,

        actorUserId:
          input.actorUserId,

        reason:
          input.reason ||
          "Human operator began incident work",

        metadata: {
          ...(input.metadata || {}),

          lifecycleAction:
            "START_WORK",

          executionAuthorized:
            false,
        },
      });
  }


  async expireTask(
    input
  ) {
    const task =
      await this.#requireTask(
        input
      );

    if (
      task.status ===
      HUMAN_TASK_STATUS.EXPIRED
    ) {
      return task;
    }

    if (
      isTerminalHumanTaskState(
        task.status
      )
    ) {
      throw createError(
        `Terminal human task ${task.status} cannot expire`,
        "HUMAN_TASK_TERMINAL",
        409
      );
    }

    assertHumanTaskTransition(
      task.status,
      HUMAN_TASK_STATUS.EXPIRED
    );

    return this
      .humanOperationsRepository
      .updateTaskStatus({
        organizationId:
          input.organizationId,

        environmentId:
          input.environmentId,

        taskId:
          task.publicId ||
          task.id,

        status:
          HUMAN_TASK_STATUS.EXPIRED,

        actorUserId:
          input.actorUserId ||
          null,

        reason:
          input.reason ||
          "Human task expired",

        metadata: {
          ...(input.metadata || {}),

          lifecycleAction:
            "EXPIRE_TASK",

          executionAuthorized:
            false,
        },
      });
  }


  async assignTask(
    input
  ) {
    requireValue(
      input.actorUserId,
      "actorUserId",
      "HUMAN_TASK_ACTOR_REQUIRED"
    );

    if (
      !input.assignedUserId &&
      !input.assignedTeamId
    ) {
      throw createError(
        "Human task assignment requires user or team",
        "HUMAN_ASSIGNMENT_TARGET_REQUIRED",
        422
      );
    }

    const task =
      await this.#requireTask(
        input
      );

    if (
      isTerminalHumanTaskState(
        task.status
      )
    ) {
      throw createError(
        "Terminal human task cannot be assigned",
        "HUMAN_TASK_TERMINAL",
        409
      );
    }

    if (
      task.status !==
      HUMAN_TASK_STATUS.ASSIGNED
    ) {
      assertHumanTaskTransition(
        task.status,
        HUMAN_TASK_STATUS.ASSIGNED
      );
    }

    const assignment =
      await this
        .humanOperationsRepository
        .createAssignment({
          organizationId:
            input.organizationId,

          environmentId:
            input.environmentId,

          taskId:
            task.publicId ||
            task.id,

          assignedUserId:
            input.assignedUserId ||
            null,

          assignedTeamId:
            input.assignedTeamId ||
            null,

          assignedByUserId:
            input.actorUserId,

          reason:
            input.reason ||
            null,

          metadata: {
            ...(input.metadata || {}),

            lifecycleAction:
              "ASSIGN_TASK",

            executionAuthorized:
              false,
          },
        });

    return {
      taskId:
        task.publicId ||
        task.id,

      assignment,

      executionAuthorized:
        false,
    };
  }


  async acknowledgeTask(
    input
  ) {
    requireValue(
      input.actorUserId,
      "actorUserId",
      "HUMAN_TASK_ACTOR_REQUIRED"
    );

    const task =
      await this.#requireTask(
        input
      );

    if (
      isTerminalHumanTaskState(
        task.status
      )
    ) {
      throw createError(
        "Terminal human task cannot be acknowledged",
        "HUMAN_TASK_TERMINAL",
        409
      );
    }

    if (
      task.status !==
      HUMAN_TASK_STATUS.ACKNOWLEDGED
    ) {
      assertHumanTaskTransition(
        task.status,
        HUMAN_TASK_STATUS.ACKNOWLEDGED
      );
    }

    const acknowledgement =
      await this
        .humanOperationsRepository
        .acknowledgeTask({
          organizationId:
            input.organizationId,

          environmentId:
            input.environmentId,

          taskId:
            task.publicId ||
            task.id,

          assignmentId:
            input.assignmentId ||
            null,

          acknowledgedByUserId:
            input.actorUserId,

          outcome:
            input.outcome ||
            ACKNOWLEDGEMENT_OUTCOME
              .ACKNOWLEDGED,

          note:
            input.note ||
            null,

          metadata: {
            ...(input.metadata || {}),

            lifecycleAction:
              "ACKNOWLEDGE_TASK",

            executionAuthorized:
              false,
          },
        });

    return {
      taskId:
        task.publicId ||
        task.id,

      acknowledgement,

      executionAuthorized:
        false,
    };
  }


  async resolveTask(
    input
  ) {
    requireValue(
      input.actorUserId,
      "actorUserId",
      "HUMAN_TASK_ACTOR_REQUIRED"
    );

    const task =
      await this.#requireTask(
        input
      );

    if (
      task.status ===
      HUMAN_TASK_STATUS.RESOLVED
    ) {
      return {
        task,
        resolution:
          null,

        idempotent:
          true,

        executionAuthorized:
          false,
      };
    }

    if (
      isTerminalHumanTaskState(
        task.status
      )
    ) {
      throw createError(
        `Human task in ${task.status} cannot be resolved`,
        "HUMAN_TASK_TERMINAL",
        409
      );
    }

    assertHumanTaskTransition(
      task.status,
      HUMAN_TASK_STATUS.RESOLVED
    );

    const resolution =
      await this
        .humanOperationsRepository
        .resolveTask({
          organizationId:
            input.organizationId,

          environmentId:
            input.environmentId,

          taskId:
            task.publicId ||
            task.id,

          resolvedByUserId:
            input.actorUserId,

          resolutionType:
            input.resolutionType ||
            "MANUAL",

          summary:
            input.summary ||
            null,

          details:
            input.details ||
            {},

          verificationRequired:
            input.verificationRequired !==
            false,
        });

    return {
      taskId:
        task.publicId ||
        task.id,

      resolution,

      requiresFreshEvaluation:
        true,

      executionAuthorized:
        false,
    };
  }


  async requestTakeover(
    input
  ) {
    requireValue(
      input.incidentId,
      "incidentId",
      "HUMAN_TAKEOVER_INCIDENT_REQUIRED"
    );

    requireValue(
      input.actorUserId,
      "actorUserId",
      "HUMAN_TAKEOVER_REQUESTER_REQUIRED"
    );

    if (
      input.taskId
    ) {
      const task =
        await this.#requireTask({
          organizationId:
            input.organizationId,

          environmentId:
            input.environmentId,

          taskId:
            input.taskId,
        });

      if (
        isTerminalHumanTaskState(
          task.status
        )
      ) {
        throw createError(
          "Takeover cannot be requested from a terminal human task",
          "HUMAN_TAKEOVER_TASK_TERMINAL",
          409
        );
      }
    }

    const session =
      await this
        .takeoverRepository
        .createTakeoverSession({
          organizationId:
            input.organizationId,

          environmentId:
            input.environmentId,

          incidentId:
            input.incidentId,

          taskId:
            input.taskId ||
            null,

          requestedByUserId:
            input.actorUserId,

          reason:
            input.reason ||
            null,

          expiresAt:
            input.expiresAt ||
            null,

          controlEpoch:
            Number(
              input.controlEpoch ||
              0
            ),

          metadata: {
            ...(input.metadata || {}),

            lifecycleAction:
              "REQUEST_TAKEOVER",

            executionAuthorized:
              false,
          },
        });

    return {
      session,

      controlGranted:
        false,

      executionAuthorized:
        false,
    };
  }


  async authorizeTakeover(
    input
  ) {
    requireValue(
      input.sessionId,
      "sessionId",
      "HUMAN_TAKEOVER_SESSION_REQUIRED"
    );

    requireValue(
      input.actorUserId,
      "actorUserId",
      "HUMAN_TAKEOVER_AUTHORIZER_REQUIRED"
    );

    const session =
      await this
        .takeoverRepository
        .getSession({
          organizationId:
            input.organizationId,

          environmentId:
            input.environmentId,

          sessionId:
            input.sessionId,
        });

    if (!session) {
      throw createError(
        "Takeover session not found",
        "HUMAN_TAKEOVER_SESSION_NOT_FOUND",
        404
      );
    }

    if (
      session.status ===
      TAKEOVER_SESSION_STATUS.AUTHORIZED
    ) {
      return {
        session,

        controlGranted:
          false,

        executionAuthorized:
          false,
      };
    }

    assertTakeoverSessionTransition(
      session.status,
      TAKEOVER_SESSION_STATUS.AUTHORIZED
    );

    const authorizedSession =
      await this
        .takeoverRepository
        .authorizeSession({
          organizationId:
            input.organizationId,

          environmentId:
            input.environmentId,

          sessionId:
            input.sessionId,

          authorizedByUserId:
            input.actorUserId,

          metadata:
            input.metadata ||
            {},
        });

    return {
      session:
        authorizedSession,

      /*
       * AUTHORIZED != ACTIVE CONTROL.
       *
       * The operator still has to acquire the exclusive
       * control lease.
       */
      controlGranted:
        false,

      executionAuthorized:
        false,
    };
  }


  async takeControl(
    input
  ) {
    requireValue(
      input.sessionId,
      "sessionId",
      "HUMAN_TAKEOVER_SESSION_REQUIRED"
    );

    requireValue(
      input.actorUserId,
      "actorUserId",
      "HUMAN_CONTROL_HOLDER_REQUIRED"
    );

    const session =
      await this
        .takeoverRepository
        .getSession({
          organizationId:
            input.organizationId,

          environmentId:
            input.environmentId,

          sessionId:
            input.sessionId,
        });

    if (!session) {
      throw createError(
        "Takeover session not found",
        "HUMAN_TAKEOVER_SESSION_NOT_FOUND",
        404
      );
    }

    assertTakeoverSessionTransition(
      session.status,
      TAKEOVER_SESSION_STATUS.ACTIVE
    );

    const lease =
      await this
        .takeoverRepository
        .acquireControlLease({
          organizationId:
            input.organizationId,

          environmentId:
            input.environmentId,

          sessionId:
            input.sessionId,

          holderUserId:
            input.actorUserId,

          leaseDurationMs:
            input.leaseDurationMs,

          expiresAt:
            input.expiresAt,

          metadata: {
            ...(input.metadata || {}),

            lifecycleAction:
              "TAKE_CONTROL",

            executionAuthorized:
              false,
          },
        });

    if (
      lease.status !==
      CONTROL_LEASE_STATUS.ACTIVE
    ) {
      throw createError(
        "Control lease was not activated",
        "HUMAN_CONTROL_LEASE_NOT_ACTIVE",
        409
      );
    }

    return {
      sessionId:
        session.publicId ||
        session.id,

      lease,

      humanControlActive:
        true,

      /*
       * Human control ownership is deliberately separate
       * from AIRA execution authorization.
       */
      executionAuthorized:
        false,
    };
  }


  async heartbeatControl(
    input
  ) {
    requireValue(
      input.leaseId,
      "leaseId",
      "HUMAN_CONTROL_LEASE_REQUIRED"
    );

    requireValue(
      input.actorUserId,
      "actorUserId",
      "HUMAN_CONTROL_HOLDER_REQUIRED"
    );

    const lease =
      await this
        .takeoverRepository
        .heartbeatLease({
          organizationId:
            input.organizationId,

          environmentId:
            input.environmentId,

          leaseId:
            input.leaseId,

          holderUserId:
            input.actorUserId,

          extensionMs:
            input.extensionMs,
        });

    return {
      lease,

      humanControlActive:
        lease.status ===
        CONTROL_LEASE_STATUS.ACTIVE,

      executionAuthorized:
        false,
    };
  }


async releaseControl(
  input
) {
  requireValue(
    input.leaseId,
    "leaseId",
    "HUMAN_CONTROL_LEASE_REQUIRED"
  );

  requireValue(
    input.actorUserId,
    "actorUserId",
    "HUMAN_CONTROL_RELEASE_USER_REQUIRED"
  );

  /*
   * ACTIVE -> RELEASING -> RELEASED is the conceptual
   * takeover lifecycle.
   *
   * The repository performs:
   *
   *   lease ACTIVE -> RELEASED
   *   session ACTIVE -> RELEASING -> RELEASED
   *
   * atomically inside PostgreSQL.
   *
   * Phase 23.6 additionally installs a database trigger that creates the
   * durable fresh-evaluation fence inside that same transaction.
   */
  assertControlLeaseTransition(
    CONTROL_LEASE_STATUS.ACTIVE,
    CONTROL_LEASE_STATUS.RELEASED
  );

  assertTakeoverSessionTransition(
    TAKEOVER_SESSION_STATUS.ACTIVE,
    TAKEOVER_SESSION_STATUS.RELEASING
  );

  assertTakeoverSessionTransition(
    TAKEOVER_SESSION_STATUS.RELEASING,
    TAKEOVER_SESSION_STATUS.RELEASED
  );

  const lease =
    await this
      .takeoverRepository
      .releaseControlLease({
        organizationId:
          input.organizationId,

        environmentId:
          input.environmentId,

        leaseId:
          input.leaseId,

        /*
         * Canonical Phase-23 repository argument.
         *
         * Do NOT use the historical releasedByUserId alias here.
         */
        actorUserId:
          input.actorUserId,

        reason:
          input.reason ||
          "Human operator returned control",

        force:
          Boolean(
            input.force
          ),

        metadata: {
          ...(
            input.metadata ||
            {}
          ),

          requiresFreshEvaluation:
            true,

          stalePlanResumeAllowed:
            false,

          executionAuthorized:
            false,
        },
      });

  return {
    lease,

    humanControlActive:
      false,

    requiresFreshEvaluation:
      true,

    stalePlanResumeAllowed:
      false,

    executionAuthorized:
      false,
  };
}


  async expireControl(
    input
  ) {
    requireValue(
      input.leaseId,
      "leaseId",
      "HUMAN_CONTROL_LEASE_REQUIRED"
    );

    assertControlLeaseTransition(
      CONTROL_LEASE_STATUS.ACTIVE,
      CONTROL_LEASE_STATUS.EXPIRED
    );

    const lease =
      await this
        .takeoverRepository
        .expireControlLease({
          organizationId:
            input.organizationId,

          environmentId:
            input.environmentId,

          leaseId:
            input.leaseId,

          reason:
            input.reason ||
            "CONTROL_LEASE_EXPIRED",
        });

    return {
      lease,

      humanControlActive:
        false,

      /*
       * Lease expiry never restores an old autonomous plan.
       */
      requiresFreshEvaluation:
        true,

      stalePlanResumeAllowed:
        false,

      executionAuthorized:
        false,
    };
  }


  async getActiveControl(
    input
  ) {
    requireValue(
      input.incidentId,
      "incidentId",
      "HUMAN_TAKEOVER_INCIDENT_REQUIRED"
    );

    const lease =
      await this
        .takeoverRepository
        .getActiveLeaseForIncident({
          organizationId:
            input.organizationId,

          environmentId:
            input.environmentId,

          incidentId:
            input.incidentId,
        });

    return {
      active:
        Boolean(lease),

      lease:
        lease ||
        null,

      executionAuthorized:
        false,
    };
  }


  async #requireTask(
    input
  ) {
    requireValue(
      input.organizationId,
      "organizationId",
      "HUMAN_OPERATIONS_ORGANIZATION_REQUIRED"
    );

    requireValue(
      input.environmentId,
      "environmentId",
      "HUMAN_OPERATIONS_ENVIRONMENT_REQUIRED"
    );

    requireValue(
      input.taskId,
      "taskId",
      "HUMAN_TASK_ID_REQUIRED"
    );

    const task =
      await this
        .humanOperationsRepository
        .getTask({
          organizationId:
            input.organizationId,

          environmentId:
            input.environmentId,

          taskId:
            input.taskId,
        });

    if (!task) {
      throw createError(
        "Human task not found",
        "HUMAN_TASK_NOT_FOUND",
        404
      );
    }

    return task;
  }
}


const defaultService =
  new HumanTakeoverLifecycleService();


module.exports = {
  HumanTakeoverLifecycleService,

  markTaskWaiting:
    defaultService
      .markTaskWaiting
      .bind(
        defaultService
      ),

  startTaskWork:
    defaultService
      .startTaskWork
      .bind(
        defaultService
      ),

  expireTask:
    defaultService
      .expireTask
      .bind(
        defaultService
      ),

  assignTask:
    defaultService
      .assignTask
      .bind(
        defaultService
      ),

  acknowledgeTask:
    defaultService
      .acknowledgeTask
      .bind(
        defaultService
      ),

  resolveTask:
    defaultService
      .resolveTask
      .bind(
        defaultService
      ),

  requestTakeover:
    defaultService
      .requestTakeover
      .bind(
        defaultService
      ),

  authorizeTakeover:
    defaultService
      .authorizeTakeover
      .bind(
        defaultService
      ),

  takeControl:
    defaultService
      .takeControl
      .bind(
        defaultService
      ),

  heartbeatControl:
    defaultService
      .heartbeatControl
      .bind(
        defaultService
      ),

  releaseControl:
    defaultService
      .releaseControl
      .bind(
        defaultService
      ),

  expireControl:
    defaultService
      .expireControl
      .bind(
        defaultService
      ),

  getActiveControl:
    defaultService
      .getActiveControl
      .bind(
        defaultService
      ),
};