"use strict";


/**
 * ============================================================================
 * AIRA PHASE 23.5
 * HUMAN TAKE CONTROL SERVICE
 * ============================================================================
 *
 * This service connects the already-certified Phase-23.1 building blocks
 * into the real incident-control workflow.
 *
 *
 * CANONICAL FLOW
 * --------------
 *
 * HumanTask
 *    ↓
 * ACKNOWLEDGED / IN_PROGRESS
 *    ↓
 * requestTakeover()
 *    ↓
 * REQUESTED
 *    ↓
 * authorizeTakeover()
 *    ↓
 * AUTHORIZED
 *    ↓
 * takeControl()
 *    ↓
 * ACTIVE ControlLease
 *
 *
 * SAFETY LAWS
 * -----------
 *
 * ASSIGNMENT != CONTROL
 * ACKNOWLEDGEMENT != CONTROL
 * TAKEOVER REQUEST != CONTROL
 * TAKEOVER AUTHORIZATION != CONTROL
 *
 * ACTIVE CONTROL LEASE = HUMAN CONTROL OWNERSHIP
 *
 * HUMAN CONTROL != EXECUTION AUTHORIZATION
 *
 * Exactly one ACTIVE lease may exist for an incident.
 *
 * PostgreSQL remains authoritative.
 *
 * ============================================================================
 */


const {
  HUMAN_TASK_STATUS,
  TAKEOVER_SESSION_STATUS,
  CONTROL_LEASE_STATUS,
} =
  require(
    "../../constants/humanTakeover"
  );


const {
  PostgresHumanOperationsRepository,
  PostgresHumanTakeoverRepository,
} =
  require(
    "../../persistence/postgres/humanOperations"
  );


const {
  HumanTakeoverLifecycleService,
} =
  require(
    "./humanTakeoverLifecycleService"
  );


const TAKE_CONTROL_INVARIANTS =
  Object.freeze({
    ACKNOWLEDGEMENT_IS_NOT_CONTROL:
      true,

    TAKEOVER_REQUEST_IS_NOT_CONTROL:
      true,

    TAKEOVER_AUTHORIZATION_IS_NOT_CONTROL:
      true,

    ACTIVE_LEASE_IS_CONTROL_AUTHORITY:
      true,

    HUMAN_CONTROL_NEVER_AUTHORIZES_EXECUTION:
      true,

    POSTGRES_IS_CONTROL_AUTHORITY:
      true,

    EXACTLY_ONE_ACTIVE_LEASE_PER_INCIDENT:
      true,

    LEASE_EXPIRY_FAILS_SAFE:
      true,

    STALE_PLAN_RESUME_PROHIBITED:
      true,
  });


function createError(
  message,
  code,
  status =
    409,
  details =
    {}
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

      ...details,
    }
  );
}


function requireValue(
  value,
  field,
  code
) {
  if (
    value ===
      undefined ||
    value ===
      null ||
    String(
      value
    ).trim() ===
      ""
  ) {
    throw createError(
      `${field} is required`,
      code,
      422
    );
  }


  return value;
}


function canonicalId(
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


  return String(
    value
  );
}


function taskIsControlEligible(
  task
) {
  return [
    HUMAN_TASK_STATUS
      .ACKNOWLEDGED,

    HUMAN_TASK_STATUS
      .IN_PROGRESS,
  ].includes(
    task?.status
  );
}


class HumanTakeControlService {
  constructor(
    options =
      {}
  ) {
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


    this.lifecycleService =
      options.lifecycleService ||

      new HumanTakeoverLifecycleService({
        ...options,

        humanOperationsRepository:
          this.humanOperationsRepository,

        takeoverRepository:
          this.takeoverRepository,
      });
  }


  /*
   * ==========================================================================
   * STATUS
   * ==========================================================================
   */


  async getIncidentControlState(
    input =
      {}
  ) {
    const organizationId =
      requireValue(
        input.organizationId,
        "organizationId",
        "HUMAN_CONTROL_ORGANIZATION_REQUIRED"
      );


    const environmentId =
      requireValue(
        input.environmentId,
        "environmentId",
        "HUMAN_CONTROL_ENVIRONMENT_REQUIRED"
      );


    const incidentId =
      requireValue(
        input.incidentId,
        "incidentId",
        "HUMAN_CONTROL_INCIDENT_REQUIRED"
      );


    const active =
      await this
        .takeoverRepository
        .getActiveLeaseForIncident({
          organizationId,

          environmentId,

          incidentId,
        });


    return {
      incidentId,

      active:
        Boolean(
          active
        ),

      humanControlActive:
        Boolean(
          active
        ),

      lease:
        active ||
        null,

      autonomousContinuationAllowed:
        !active,

      stalePlanResumeAllowed:
        false,

      executionAuthorized:
        false,
    };
  }


  /*
   * ==========================================================================
   * REQUEST
   * ==========================================================================
   */


  async requestControl(
    input =
      {}
  ) {
    const organizationId =
      requireValue(
        input.organizationId,
        "organizationId",
        "HUMAN_CONTROL_ORGANIZATION_REQUIRED"
      );


    const environmentId =
      requireValue(
        input.environmentId,
        "environmentId",
        "HUMAN_CONTROL_ENVIRONMENT_REQUIRED"
      );


    const incidentId =
      requireValue(
        input.incidentId,
        "incidentId",
        "HUMAN_CONTROL_INCIDENT_REQUIRED"
      );


    const taskId =
      requireValue(
        input.taskId,
        "taskId",
        "HUMAN_CONTROL_TASK_REQUIRED"
      );


    const actorUserId =
      requireValue(
        input.actorUserId,
        "actorUserId",
        "HUMAN_CONTROL_ACTOR_REQUIRED"
      );


    /*
     * ------------------------------------------------------------------------
     * HUMAN TASK IS THE ENTRY FENCE
     * ------------------------------------------------------------------------
     */


    const task =
      await this
        .humanOperationsRepository
        .getTask({
          organizationId,

          environmentId,

          taskId,
        });


    if (
      !task
    ) {
      throw createError(
        `Human task not found: ${taskId}`,
        "HUMAN_CONTROL_TASK_NOT_FOUND",
        404
      );
    }


    if (
      canonicalId(
        task.incidentId
      ) !==
      canonicalId(
        incidentId
      )
    ) {
      throw createError(
        "Human task does not belong to requested incident",
        "HUMAN_CONTROL_TASK_INCIDENT_MISMATCH",
        409
      );
    }


    /*
     * An assigned task is NOT enough.
     *
     * The operator must explicitly acknowledge the task first.
     */
    if (
      !taskIsControlEligible(
        task
      )
    ) {
      throw createError(
        [
          "Human control requires an",
          "ACKNOWLEDGED or IN_PROGRESS task.",
          `current=${task.status}`,
        ].join(
          " "
        ),
        "HUMAN_CONTROL_TASK_NOT_ACKNOWLEDGED",
        409,
        {
          taskStatus:
            task.status,
        }
      );
    }


    /*
     * If the task is assigned directly to one user, another user cannot
     * silently acquire incident control through it.
     *
     * TEAM assignments are governed by the authenticated/RBAC boundary.
     * Phase 23.7 exposes that boundary through the Incident Command API.
     */
    if (
      task.assignedUserId &&
      canonicalId(
        task.assignedUserId
      ) !==
      canonicalId(
        actorUserId
      )
    ) {
      throw createError(
        "Human task is assigned to another operator",
        "HUMAN_CONTROL_TASK_ASSIGNEE_MISMATCH",
        403,
        {
          assignedUserId:
            task.assignedUserId,
        }
      );
    }


    /*
     * ------------------------------------------------------------------------
     * EXISTING CONTROL CHECK
     * ------------------------------------------------------------------------
     */


    const existingLease =
      await this
        .takeoverRepository
        .getActiveLeaseForIncident({
          organizationId,

          environmentId,

          incidentId,
        });


    if (
      existingLease
    ) {
      throw createError(
        "Incident already has an active human control lease",
        "HUMAN_CONTROL_LEASE_CONFLICT",
        409,
        {
          activeLeaseId:
            existingLease.publicId ||
            existingLease.id,

          holderUserId:
            existingLease.holderUserId ||
            null,
        }
      );
    }


    /*
     * ------------------------------------------------------------------------
     * CREATE REQUESTED SESSION
     * ------------------------------------------------------------------------
     *
     * Still NO control.
     */


    const result =
      await this
        .lifecycleService
        .requestTakeover({
          organizationId,

          environmentId,

          incidentId,

          taskId:
            task.publicId ||
            task.id,

          actorUserId,

          reason:
            input.reason ||
            "Human operator requested incident control",

          expiresAt:
            input.sessionExpiresAt ||
            null,

          controlEpoch:
            Number(
              task.controlEpoch ||
              0
            ),

          metadata: {
            ...(
              input.metadata ||
              {}
            ),

            phase:
              "23.5",

            taskStatusAtRequest:
              task.status,

            humanControlGranted:
              false,

            executionAuthorized:
              false,
          },
        });


    if (
      result
        ?.session
        ?.status !==
      TAKEOVER_SESSION_STATUS
        .REQUESTED
    ) {
      throw createError(
        "Takeover request did not enter REQUESTED state",
        "HUMAN_CONTROL_REQUEST_STATE_INVALID",
        409
      );
    }


    return {
      task,

      session:
        result.session,

      humanControlActive:
        false,

      autonomousContinuationAllowed:
        true,

      authorizationRequired:
        true,

      executionAuthorized:
        false,
    };
  }


  /*
   * ==========================================================================
   * AUTHORIZE
   * ==========================================================================
   */


  async authorizeControl(
    input =
      {}
  ) {
    const organizationId =
      requireValue(
        input.organizationId,
        "organizationId",
        "HUMAN_CONTROL_ORGANIZATION_REQUIRED"
      );


    const environmentId =
      requireValue(
        input.environmentId,
        "environmentId",
        "HUMAN_CONTROL_ENVIRONMENT_REQUIRED"
      );


    const sessionId =
      requireValue(
        input.sessionId,
        "sessionId",
        "HUMAN_CONTROL_SESSION_REQUIRED"
      );


    const actorUserId =
      requireValue(
        input.actorUserId,
        "actorUserId",
        "HUMAN_CONTROL_AUTHORIZER_REQUIRED"
      );


    const session =
      await this
        .takeoverRepository
        .getSession({
          organizationId,

          environmentId,

          sessionId,
        });


    if (
      !session
    ) {
      throw createError(
        `Takeover session not found: ${sessionId}`,
        "HUMAN_CONTROL_SESSION_NOT_FOUND",
        404
      );
    }


    if (
      session.status ===
      TAKEOVER_SESSION_STATUS
        .AUTHORIZED
    ) {
      return {
        session,

        idempotent:
          true,

        humanControlActive:
          false,

        autonomousContinuationAllowed:
          true,

        executionAuthorized:
          false,
      };
    }


    if (
      session.status !==
      TAKEOVER_SESSION_STATUS
        .REQUESTED
    ) {
      throw createError(
        `Takeover session cannot be authorized from ${session.status}`,
        "HUMAN_CONTROL_SESSION_NOT_REQUESTED",
        409
      );
    }


    /*
     * AUTHORIZATION STILL DOES NOT GRANT CONTROL.
     */


    const result =
      await this
        .lifecycleService
        .authorizeTakeover({
          organizationId,

          environmentId,

          sessionId:
            session.publicId ||
            session.id,

          actorUserId,

          metadata: {
            ...(
              input.metadata ||
              {}
            ),

            phase:
              "23.5",

            humanControlGranted:
              false,

            executionAuthorized:
              false,
          },
        });


    if (
      result
        ?.session
        ?.status !==
      TAKEOVER_SESSION_STATUS
        .AUTHORIZED
    ) {
      throw createError(
        "Takeover authorization did not enter AUTHORIZED state",
        "HUMAN_CONTROL_AUTHORIZATION_STATE_INVALID",
        409
      );
    }


    return {
      session:
        result.session,

      idempotent:
        false,

      humanControlActive:
        false,

      autonomousContinuationAllowed:
        true,

      executionAuthorized:
        false,
    };
  }


  /*
   * ==========================================================================
   * ACQUIRE CONTROL
   * ==========================================================================
   */


  async acquireControl(
    input =
      {}
  ) {
    const organizationId =
      requireValue(
        input.organizationId,
        "organizationId",
        "HUMAN_CONTROL_ORGANIZATION_REQUIRED"
      );


    const environmentId =
      requireValue(
        input.environmentId,
        "environmentId",
        "HUMAN_CONTROL_ENVIRONMENT_REQUIRED"
      );


    const sessionId =
      requireValue(
        input.sessionId,
        "sessionId",
        "HUMAN_CONTROL_SESSION_REQUIRED"
      );


    const actorUserId =
      requireValue(
        input.actorUserId,
        "actorUserId",
        "HUMAN_CONTROL_HOLDER_REQUIRED"
      );


    const session =
      await this
        .takeoverRepository
        .getSession({
          organizationId,

          environmentId,

          sessionId,
        });


    if (
      !session
    ) {
      throw createError(
        `Takeover session not found: ${sessionId}`,
        "HUMAN_CONTROL_SESSION_NOT_FOUND",
        404
      );
    }


    /*
     * REQUESTED != CONTROL.
     */
    if (
      session.status !==
      TAKEOVER_SESSION_STATUS
        .AUTHORIZED
    ) {
      throw createError(
        [
          "Control lease acquisition requires",
          "an AUTHORIZED takeover session.",
          `current=${session.status}`,
        ].join(
          " "
        ),
        "HUMAN_CONTROL_SESSION_NOT_AUTHORIZED",
        409
      );
    }


    /*
     * The operator who requested control must be the operator who becomes the
     * lease holder.
     *
     * Authorization may be performed by another appropriately-authorized
     * principal, but lease ownership cannot silently move to another user.
     */
    if (
      session.requestedByUserId &&
      canonicalId(
        session.requestedByUserId
      ) !==
      canonicalId(
        actorUserId
      )
    ) {
      throw createError(
        "Only the requesting operator may acquire this takeover session",
        "HUMAN_CONTROL_REQUESTER_MISMATCH",
        403
      );
    }


    /*
     * ------------------------------------------------------------------------
     * ATOMIC LEASE ACQUISITION
     * ------------------------------------------------------------------------
     *
     * PostgresHumanTakeoverRepository owns the final concurrency fence.
     *
     * Even if two callers race past earlier reads, the PostgreSQL unique
     * ACTIVE-lease constraint remains authoritative.
     */


    const result =
      await this
        .lifecycleService
        .takeControl({
          organizationId,

          environmentId,

          sessionId:
            session.publicId ||
            session.id,

          actorUserId,

          leaseDurationMs:
            input.leaseDurationMs,

          expiresAt:
            input.expiresAt,

          metadata: {
            ...(
              input.metadata ||
              {}
            ),

            phase:
              "23.5",

            controlSource:
              "HUMAN_TAKE_CONTROL",

            executionAuthorized:
              false,
          },
        });


    const lease =
      result?.lease;


    if (
      !lease ||
      lease.status !==
        CONTROL_LEASE_STATUS
          .ACTIVE
    ) {
      throw createError(
        "Take Control did not produce an ACTIVE control lease",
        "HUMAN_CONTROL_LEASE_NOT_ACTIVE",
        409
      );
    }


    /*
     * Re-read authoritative incident control after acquisition.
     */
    const authoritativeLease =
      await this
        .takeoverRepository
        .getActiveLeaseForIncident({
          organizationId,

          environmentId,

          incidentId:
            session.incidentId,
        });


    if (
      !authoritativeLease
    ) {
      throw createError(
        "Control lease disappeared after acquisition",
        "HUMAN_CONTROL_POST_ACQUIRE_FENCE_FAILED",
        409
      );
    }


    if (
      canonicalId(
        authoritativeLease.publicId ||
        authoritativeLease.id
      ) !==
      canonicalId(
        lease.publicId ||
        lease.id
      )
    ) {
      throw createError(
        "Authoritative incident lease differs from acquired lease",
        "HUMAN_CONTROL_POST_ACQUIRE_CONFLICT",
        409
      );
    }


    return {
      incidentId:
        session.incidentId,

      sessionId:
        session.publicId ||
        session.id,

      lease:
        authoritativeLease,

      humanControlActive:
        true,

      /*
       * This is the operational fence consumed by autonomous components.
       */
      autonomousContinuationAllowed:
        false,

      controlEpoch:
        Number(
          authoritativeLease
            .controlEpoch ||
          0
        ),

      stalePlanResumeAllowed:
        false,

      executionAuthorized:
        false,
    };
  }


  /*
   * ==========================================================================
   * HEARTBEAT
   * ==========================================================================
   */


  async heartbeatControl(
    input =
      {}
  ) {
    requireValue(
      input.organizationId,
      "organizationId",
      "HUMAN_CONTROL_ORGANIZATION_REQUIRED"
    );


    requireValue(
      input.environmentId,
      "environmentId",
      "HUMAN_CONTROL_ENVIRONMENT_REQUIRED"
    );


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


    const result =
      await this
        .lifecycleService
        .heartbeatControl({
          organizationId:
            input.organizationId,

          environmentId:
            input.environmentId,

          leaseId:
            input.leaseId,

          actorUserId:
            input.actorUserId,

          extensionMs:
            input.extensionMs,
        });


    if (
      result
        ?.lease
        ?.status !==
      CONTROL_LEASE_STATUS
        .ACTIVE
    ) {
      throw createError(
        "Human control heartbeat did not preserve ACTIVE control",
        "HUMAN_CONTROL_HEARTBEAT_NOT_ACTIVE",
        409
      );
    }


    return {
      lease:
        result.lease,

      humanControlActive:
        true,

      autonomousContinuationAllowed:
        false,

      stalePlanResumeAllowed:
        false,

      executionAuthorized:
        false,
    };
  }


  /*
   * ==========================================================================
   * CONTROL FENCE
   * ==========================================================================
   */


  async assertAutonomousContinuationAllowed(
    input =
      {}
  ) {
    const state =
      await this
        .getIncidentControlState(
          input
        );


    if (
      state.humanControlActive ===
      true
    ) {
      throw createError(
        "AIRA autonomous continuation is blocked by active human control",
        "HUMAN_CONTROL_AUTONOMY_BLOCKED",
        423,
        {
          incidentId:
            state.incidentId,

          leaseId:
            state.lease
              ?.publicId ||
            state.lease
              ?.id ||
            null,

          holderUserId:
            state.lease
              ?.holderUserId ||
            null,

          controlEpoch:
            Number(
              state.lease
                ?.controlEpoch ||
              0
            ),

          humanControlActive:
            true,

          autonomousContinuationAllowed:
            false,

          stalePlanResumeAllowed:
            false,
        }
      );
    }


    return {
      allowed:
        true,

      incidentId:
        state.incidentId,

      humanControlActive:
        false,

      autonomousContinuationAllowed:
        true,

      stalePlanResumeAllowed:
        false,

      executionAuthorized:
        false,
    };
  }
}


const defaultService =
  new HumanTakeControlService();


module.exports =
  defaultService;


module.exports
  .HumanTakeControlService =
  HumanTakeControlService;


module.exports
  .TAKE_CONTROL_INVARIANTS =
  TAKE_CONTROL_INVARIANTS;


module.exports
  .taskIsControlEligible =
  taskIsControlEligible;