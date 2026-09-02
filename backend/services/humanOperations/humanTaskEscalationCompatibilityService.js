"use strict";


/**
 * ============================================================================
 * AIRA PHASE 23.2D
 * LEGACY HUMAN TASK ESCALATION COMPATIBILITY
 * ============================================================================
 *
 * Phase 14 exposed:
 *
 *   POST /human-tasks/:taskId/escalate
 *
 * and represented the result with:
 *
 *   status = ESCALATED
 *
 * Phase 23 deliberately removed ESCALATED from the canonical HumanTask state
 * machine.
 *
 * The compatibility mapping is:
 *
 *   old "escalate this human task"
 *
 *                 ↓
 *
 *   WAITING
 *
 * meaning the task is waiting for higher-level human routing / escalation.
 *
 * It does NOT mean:
 *
 *   control acquired
 *   approval granted
 *   execution authorized
 *
 * ============================================================================
 */


const PostgresHumanOperationsRepository =
  require(
    "../../persistence/postgres/PostgresHumanOperationsRepository"
  );


const {
  HUMAN_TASK_STATUS,
} = require(
  "../../constants/humanTakeover"
);


class HumanTaskEscalationCompatibilityService {
  constructor(
    options = {}
  ) {
    this.repository =
      options.repository ||

      new PostgresHumanOperationsRepository(
        options
      );
  }


  async escalateTask(
    input = {}
  ) {
    const task =
      await this
        .repository
        .getTask({
          organizationId:
            input
              .organizationId,

          environmentId:
            input
              .environmentId,

          taskId:
            input
              .taskId,
        });


    if (
      !task
    ) {
      throw Object.assign(
        new Error(
          "Human task not found"
        ),
        {
          code:
            "HUMAN_TASK_NOT_FOUND",

          status:
            404,

          executionAuthorized:
            false,
        }
      );
    }


    if (
      [
        HUMAN_TASK_STATUS
          .RESOLVED,

        HUMAN_TASK_STATUS
          .CANCELLED,

        HUMAN_TASK_STATUS
          .EXPIRED,
      ].includes(
        task.status
      )
    ) {
      throw Object.assign(
        new Error(
          "Closed human task cannot be escalated"
        ),
        {
          code:
            "HUMAN_TASK_CLOSED",

          status:
            409,

          executionAuthorized:
            false,
        }
      );
    }


    const updated =
      await this
        .repository
        .updateTaskStatus({
          organizationId:
            input
              .organizationId,

          environmentId:
            input
              .environmentId,

          taskId:
            input
              .taskId,

          status:
            HUMAN_TASK_STATUS
              .WAITING,

          actorUserId:
            input
              .actorUserId ||
            null,

          reason:
            "Legacy task escalation mapped to Phase-23 WAITING",

          metadata: {
            compatibilityCutover:
              "PHASE_23_2D",

            legacyRequestedPriority:
              input.priority ||
              "CRITICAL",

            oldStatusProhibited:
              "ESCALATED",

            executionAuthorized:
              false,
          },
        });


    return {
      ...updated,

      legacyEscalationMappedTo:
        HUMAN_TASK_STATUS
          .WAITING,

      requestedPriority:
        input.priority ||
        "CRITICAL",

      humanControlGranted:
        false,

      executionAuthorized:
        false,
    };
  }
}


const defaultService =
  new HumanTaskEscalationCompatibilityService();


module.exports =
  defaultService;


module.exports
  .HumanTaskEscalationCompatibilityService =
  HumanTaskEscalationCompatibilityService;