"use strict";


/**
 * ============================================================================
 * AIRA PHASE 23.7
 * INCIDENT COMMAND READ MODEL
 * ============================================================================
 *
 * This is the canonical backend projection consumed by Incident Command UI.
 *
 *
 * UI DOES NOT INFER AUTHORITY.
 *
 * The server computes user-specific command capabilities from:
 *
 * - canonical task state
 * - assignment
 * - acknowledgement
 * - takeover state
 * - active lease
 * - return-control fence
 * - authenticated user identity
 *
 *
 * CAPABILITY != CONTROL
 * CAPABILITY != EXECUTION AUTHORIZATION
 *
 * ============================================================================
 */


const PostgresIncidentCommandReadRepository =
  require(
    "../../persistence/postgres/PostgresIncidentCommandReadRepository"
  );


const {
  HUMAN_TASK_STATUS,
  TAKEOVER_SESSION_STATUS,
} =
  require(
    "../../constants/humanTakeover"
  );


const INCIDENT_COMMAND_INVARIANTS =
  Object.freeze({
    UI_NEVER_INVENTS_AUTHORITY:
      true,

    CAPABILITY_IS_NOT_CONTROL:
      true,

    CAPABILITY_IS_NOT_EXECUTION_AUTHORIZATION:
      true,

    ACTIVE_LEASE_IS_HUMAN_CONTROL:
      true,

    RETURN_FENCE_BLOCKS_RESUME:
      true,

    STALE_PLAN_RESUME_PROHIBITED:
      true,

    EXECUTION_AUTHORIZATION_ALWAYS_SEPARATE:
      true,
  });


function sameId(
  left,
  right
) {
  if (
    left ===
      undefined ||
    left ===
      null ||
    right ===
      undefined ||
    right ===
      null
  ) {
    return false;
  }


  return (
    String(
      left
    ) ===
    String(
      right
    )
  );
}


function terminalTask(
  status
) {
  return [
    HUMAN_TASK_STATUS
      .RESOLVED,

    HUMAN_TASK_STATUS
      .CANCELLED,

    HUMAN_TASK_STATUS
      .EXPIRED,
  ].includes(
    status
  );
}


function computeCapabilities({
  projection,
  actorUserId,
} = {}) {
  const task =
    projection?.task ||
    null;


  const acknowledgement =
    projection?.acknowledgement ||
    null;


  const session =
    projection
      ?.takeoverSession ||
    null;


  const lease =
    projection
      ?.activeLease ||
    null;


  const returnFence =
    projection
      ?.returnFence ||
    null;


  const taskStatus =
    task?.status ||
    null;


  const actorOwnsDirectTask =
    !task?.assignedUserId ||
    sameId(
      task.assignedUserId,
      actorUserId
    );


  const actorOwnsLease =
    Boolean(
      lease
    ) &&
    sameId(
      lease.holderUserId,
      actorUserId
    );


  const actorRequestedSession =
    Boolean(
      session
    ) &&
    sameId(
      session.requestedByUserId,
      actorUserId
    );


  const acknowledged =
    acknowledgement
      ?.outcome ===
        "ACKNOWLEDGED" ||
    [
      HUMAN_TASK_STATUS
        .ACKNOWLEDGED,

      HUMAN_TASK_STATUS
        .IN_PROGRESS,
    ].includes(
      taskStatus
    );


  const hasNonTerminalSession =
    Boolean(
      session
    ) &&
    [
      TAKEOVER_SESSION_STATUS
        .REQUESTED,

      TAKEOVER_SESSION_STATUS
        .AUTHORIZED,

      TAKEOVER_SESSION_STATUS
        .ACTIVE,

      TAKEOVER_SESSION_STATUS
        .RELEASING,
    ].includes(
      session.status
    );


  const pendingReturnFence =
    returnFence
      ?.state ===
      "REQUIRES_FRESH_EVALUATION";


  const acknowledge =
    Boolean(
      task
    ) &&
    actorOwnsDirectTask &&
    !terminalTask(
      taskStatus
    ) &&
    [
      HUMAN_TASK_STATUS
        .ASSIGNED,

      HUMAN_TASK_STATUS
        .WAITING,
    ].includes(
      taskStatus
    ) &&
    !acknowledged;


  const requestControl =
    Boolean(
      task
    ) &&
    actorOwnsDirectTask &&
    acknowledged &&
    !terminalTask(
      taskStatus
    ) &&
    !lease &&
    !hasNonTerminalSession &&
    !pendingReturnFence;


  /*
   * Authorization is deliberately separate from requester ownership.
   *
   * Route-level RBAC decides whether the current principal is permitted to
   * invoke the authorize command.
   */
  const authorizeControl =
    Boolean(
      session
    ) &&
    session.status ===
      TAKEOVER_SESSION_STATUS
        .REQUESTED &&
    !lease;


  const acquireControl =
    Boolean(
      session
    ) &&
    session.status ===
      TAKEOVER_SESSION_STATUS
        .AUTHORIZED &&
    actorRequestedSession &&
    !lease &&
    !pendingReturnFence;


  const heartbeatControl =
    actorOwnsLease &&
    lease?.status ===
      "ACTIVE";


  const returnControl =
    actorOwnsLease &&
    lease?.status ===
      "ACTIVE";


  return {
    acknowledge,

    requestControl,

    authorizeControl,

    acquireControl,

    heartbeatControl,

    returnControl,

    executionAuthorized:
      false,
  };
}


class IncidentCommandReadModelService {
  constructor(
    options =
      {}
  ) {
    this.repository =
      options.repository ||

      new PostgresIncidentCommandReadRepository(
        options
      );
  }


  async getReadModel(
    input =
      {}
  ) {
    const projection =
      await this
        .repository
        .getProjection(
          input
        );


    const capabilities =
      computeCapabilities({
        projection,

        actorUserId:
          input.actorUserId,
      });


    const lease =
      projection
        .activeLease;


    const returnFence =
      projection
        .returnFence;


    const requiresFreshEvaluation =
      returnFence
        ?.state ===
      "REQUIRES_FRESH_EVALUATION";


    const freshEvaluationSatisfied =
      returnFence
        ?.state ===
      "SATISFIED";


    const humanControlActive =
      Boolean(
        lease &&
        lease.status ===
          "ACTIVE"
      );


    return {
      incidentId:
        projection.incidentId,

      escalation:
        projection.escalation,

      task:
        projection.task,

      assignment:
        projection.assignment,

      acknowledgement:
        projection
          .acknowledgement,

      notification:
        projection.notification,

      handoff:
        projection.handoff,

      control: {
        session:
          projection
            .takeoverSession,

        lease,

        humanControlActive,

        holderUserId:
          lease
            ?.holderUserId ||
          null,

        controlEpoch:
          lease
            ? Number(
                lease.controlEpoch ||
                0
              )
            : null,

        executionAuthorized:
          false,
      },

      returnControl: {
        fence:
          returnFence,

        requiresFreshEvaluation,

        freshEvaluationSatisfied,

        requiredControlEpoch:
          returnFence
            ?.requiredControlEpoch ||
          null,

        stalePlanResumeAllowed:
          false,

        executionAuthorized:
          false,
      },

      capabilities,

      autonomousContinuationBlocked:
        humanControlActive ||
        requiresFreshEvaluation ||
        projection
          .task
          ?.autonomousRecoveryBlocked ===
          true,

      stalePlanResumeAllowed:
        false,

      executionAuthorized:
        false,
    };
  }
}


const defaultService =
  new IncidentCommandReadModelService();


module.exports =
  defaultService;


module.exports
  .IncidentCommandReadModelService =
  IncidentCommandReadModelService;


module.exports
  .INCIDENT_COMMAND_INVARIANTS =
  INCIDENT_COMMAND_INVARIANTS;


module.exports
  .computeCapabilities =
  computeCapabilities;


module.exports
  .terminalTask =
  terminalTask;