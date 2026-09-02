"use strict";


const PostgresHumanEscalationRepository =
  require(
    "../../persistence/postgres/PostgresHumanEscalationRepository"
  );


const PostgresHumanOperationsRepository =
  require(
    "../../persistence/postgres/PostgresHumanOperationsRepository"
  );


const humanEscalationDecisionService =
  require(
    "./humanEscalationDecisionService"
  );


const {
  ESCALATION_DECISION,
  ESCALATION_REASON,
  ESCALATION_STATUS,
  ON_CALL_TARGET_TYPE,
} = require(
  "../../constants/humanEscalation"
);


const {
  HUMAN_TASK_STATUS,
} = require(
  "../../constants/humanTakeover"
);


/*
 * ============================================================================
 * SAFETY ERROR
 * ============================================================================
 */


function createError(
  code,
  message,
  details = {}
) {
  return Object.assign(
    new Error(
      message
    ),
    {
      code,

      executionAuthorized:
        false,

      ...details,
    }
  );
}


/*
 * ============================================================================
 * VALIDATION
 * ============================================================================
 */


function requireValue(
  value,
  code,
  label
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
      code,
      `${label} is required`
    );
  }


  return value;
}


function normalizeObject(
  value
) {
  return (
    value &&
    typeof value ===
      "object" &&
    !Array.isArray(
      value
    )
  )
    ? value
    : {};
}


function normalizeArray(
  value
) {
  return Array.isArray(
    value
  )
    ? value
    : [];
}


/*
 * ============================================================================
 * ACK DEADLINE
 * ============================================================================
 */


function acknowledgementDeadline(
  seconds
) {
  const parsed =
    Number(
      seconds
    );


  const safeSeconds =
    Number.isFinite(
      parsed
    ) &&
    parsed >
      0
      ? parsed
      : 900;


  return new Date(
    Date.now() +
    safeSeconds *
      1000
  ).toISOString();
}


/*
 * ============================================================================
 * HUMAN TASK PRIORITY
 * ============================================================================
 *
 * Existing human_operations.tasks accepts:
 *
 *   CRITICAL
 *   HIGH
 *   MEDIUM
 *   LOW
 *
 * Do not invent another priority model here.
 * ============================================================================
 */


function priorityFromSeverity(
  severity
) {
  switch (
    String(
      severity ||
      ""
    )
      .trim()
      .toUpperCase()
  ) {
    case "CRITICAL":
    case "SEV0":
    case "SEV1":
      return "CRITICAL";


    case "HIGH":
    case "SEV2":
      return "HIGH";


    case "LOW":
    case "SEV4":
      return "LOW";


    default:
      return "MEDIUM";
  }
}


/*
 * ============================================================================
 * ESCALATION REASON -> EXISTING HUMAN TASK TYPE
 * ============================================================================
 *
 * We intentionally reuse the canonical task types already supported by
 * human_operations.tasks.
 *
 * No parallel task taxonomy is introduced.
 * ============================================================================
 */


function taskTypeFromReason(
  reasonCode
) {
  switch (
    reasonCode
  ) {
    case ESCALATION_REASON
      .APPROVAL_REQUIRED:
      return "APPROVAL_REQUIRED";


    case ESCALATION_REASON
      .RECOVERY_FAILED:
      return "RECOVERY_FAILED";


    case ESCALATION_REASON
      .VERIFICATION_FAILED:
      return "VERIFICATION_REVIEW";


    case ESCALATION_REASON
      .POLICY_ESCALATION:

    case ESCALATION_REASON
      .AUTONOMY_NOT_ELIGIBLE:
      return "POLICY_REVIEW";


    case ESCALATION_REASON
      .RECOVERY_UNSAFE:

    case ESCALATION_REASON
      .INSUFFICIENT_EVIDENCE:

    case ESCALATION_REASON
      .CONTROL_REQUIRED:

    case ESCALATION_REASON
      .MANUAL_ESCALATION:
      return "MANUAL_INTERVENTION";


    default:
      return "INCIDENT_REVIEW";
  }
}


/*
 * ============================================================================
 * HUMAN TASK TITLE
 * ============================================================================
 */


function taskTitle({
  incidentId,
  reasonCode,
}) {
  return [
    "Human escalation required for incident",
    incidentId,
    `(${reasonCode})`,
  ].join(
    " "
  );
}


/*
 * ============================================================================
 * DECISION SNAPSHOT
 * ============================================================================
 */


function buildDecisionSnapshot(
  decision
) {
  return {
    incidentId:
      decision.incidentId,

    decision:
      decision.decision,

    reasonCode:
      decision.reasonCode,

    triggerSource:
      decision.triggerSource,

    matchedPolicy:
      decision.matchedPolicy ||
      null,

    selectedTarget:
      decision.selectedTarget ||
      null,

    createHumanTask:
      decision.createHumanTask ===
      true,

    /*
     * Preserve what Phase 23.2A decided for auditability.
     *
     * The orchestrator may still hard-block autonomous continuation
     * whenever the final decision is ESCALATE.
     */
    requestedAutonomousRecoveryBlocked:
      decision
        .autonomousRecoveryBlocked ===
      true,

    deterministic:
      decision.deterministic ===
      true,

    humanControlGranted:
      false,

    executionAuthorized:
      false,
  };
}


/*
 * ============================================================================
 * ROUTING SNAPSHOT
 * ============================================================================
 */


function buildRoutingSnapshot({
  decision,
  task = null,
  assignment = null,
  routeState,
}) {
  return {
    routeState,

    target:
      decision.selectedTarget ||
      null,

    taskId:
      task?.publicId ||
      task?.id ||
      null,

    assignmentId:
      assignment?.publicId ||
      assignment?.id ||
      null,

    /*
     * Phase 23.2 does NOT publish notifications.
     */
    notificationDeliveryStarted:
      false,

    notificationTransportOwnedBy:
      "PHASE_23_3",

    humanControlGranted:
      false,

    executionAuthorized:
      false,
  };
}


/*
 * ============================================================================
 * ORCHESTRATOR
 * ============================================================================
 */


class HumanEscalationOrchestratorService {
  constructor(
    options = {}
  ) {
    this.escalationRepository =
      options
        .escalationRepository ||

      new PostgresHumanEscalationRepository(
        options.postgres ||
        {}
      );


    this.humanOperationsRepository =
      options
        .humanOperationsRepository ||

      new PostgresHumanOperationsRepository(
        options.postgres ||
        {}
      );


    this.decisionService =
      options
        .decisionService ||

      humanEscalationDecisionService;
  }


  /*
   * ==========================================================================
   * ESCALATE
   * ==========================================================================
   */


  async escalate(
    input = {}
  ) {
    const organizationId =
      requireValue(
        input.organizationId,

        "HUMAN_ESCALATION_ORGANIZATION_REQUIRED",

        "organizationId"
      );


    const environmentId =
      requireValue(
        input.environmentId,

        "HUMAN_ESCALATION_ENVIRONMENT_REQUIRED",

        "environmentId"
      );


    const incidentId =
      requireValue(
        input.incidentId,

        "HUMAN_ESCALATION_INCIDENT_REQUIRED",

        "incidentId"
      );


    /*
     * ------------------------------------------------------------------------
     * LOAD TENANT POLICIES
     * ------------------------------------------------------------------------
     */


    const policies =
      input.policies ||

      await this
        .escalationRepository
        .listPolicies({
          organizationId,

          environmentId,

          enabledOnly:
            true,
        });


    /*
     * ------------------------------------------------------------------------
     * LOAD TENANT ON-CALL TARGETS
     * ------------------------------------------------------------------------
     */


    const targets =
      input.targets ||

      await this
        .escalationRepository
        .listTargets({
          organizationId,

          environmentId,

          enabledOnly:
            true,
        });


    /*
     * ------------------------------------------------------------------------
     * DETERMINISTIC ESCALATION DECISION
     * ------------------------------------------------------------------------
     */


    const decision =
      this
        .decisionService
        .evaluate({
          context: {
            incidentId,

            reasonCode:
              input.reasonCode,

            triggerSource:
              input.triggerSource,

            severity:
              input.severity ||
              null,

            serviceId:
              input.serviceId ||
              null,

            provider:
              input.provider ||
              null,

            capabilityKey:
              input.capabilityKey ||
              null,

            production:
              input.production ===
              true,

            riskScore:
              input.riskScore,

            confidence:
              input.confidence,

            autonomousRecoveryBlocked:
              input
                .autonomousRecoveryBlocked ===
              true,

            tags:
              normalizeArray(
                input.tags
              ),

            preferredTargetKeys:
              normalizeArray(
                input.preferredTargetKeys
              ),
          },

          policies,

          targets,
        });


    /*
     * ------------------------------------------------------------------------
     * ACKNOWLEDGEMENT DEADLINE
     * ------------------------------------------------------------------------
     */


    const deadline =
      decision.decision ===
        ESCALATION_DECISION
          .ESCALATE
        ? acknowledgementDeadline(
            decision
              .acknowledgementTimeoutSeconds
          )
        : null;


    /*
     * ------------------------------------------------------------------------
     * PERSIST ESCALATION FIRST
     * ------------------------------------------------------------------------
     *
     * The EscalationRecord is canonical evidence of why AIRA stopped or
     * continued.
     *
     * HumanTask creation is downstream of this record.
     */


    const escalation =
      await this
        .escalationRepository
        .createEscalation({
          organizationId,

          environmentId,

          incidentId,

          policyId:
            decision
              .matchedPolicy
              ?.publicId ||

            decision
              .matchedPolicy
              ?.id ||

            null,

          selectedTargetId:
            decision
              .selectedTarget
              ?.publicId ||

            decision
              .selectedTarget
              ?.id ||

            null,

          decision:
            decision.decision,

          reasonCode:
            decision.reasonCode,

          severity:
            input.severity ||
            null,

          triggerSource:
            decision.triggerSource,

          status:
            ESCALATION_STATUS
              .DECIDED,

          decisionSnapshot:
            buildDecisionSnapshot(
              decision
            ),

          routingSnapshot: {
            routeState:
              "NOT_STARTED",

            notificationDeliveryStarted:
              false,

            executionAuthorized:
              false,
          },

          acknowledgementDeadline:
            deadline,

          createdByUserId:
            input.createdByUserId ||
            null,

          metadata: {
            ...normalizeObject(
              input.metadata
            ),

            phase:
              "23.2B",

            executionAuthorized:
              false,
          },
        });


    /*
     * ------------------------------------------------------------------------
     * NO ESCALATION
     * ------------------------------------------------------------------------
     *
     * The decision is still persisted for evidence/audit, but no HumanTask
     * or routing workflow is created.
     */


    if (
      decision.decision ===
      ESCALATION_DECISION
        .NO_ESCALATION
    ) {
      return {
        decision,

        escalation,

        task:
          null,

        assignment:
          null,

        autonomousRecoveryBlocked:
          false,

        notificationHandoff:
          null,

        humanControlGranted:
          false,

        executionAuthorized:
          false,
      };
    }


    /*
     * ========================================================================
     * HARD SAFETY BOUNDARY
     * ========================================================================
     *
     * Once this orchestrator has reached ESCALATE:
     *
     *   AUTONOMOUS CONTINUATION = BLOCKED
     *
     * A tenant policy may affect matching/routing/timeout, but an active
     * human escalation must never implicitly become permission for AIRA to
     * continue executing.
     */


    const autonomousRecoveryBlocked =
      true;


    let task =
      null;


    let assignment =
      null;


    /*
     * ------------------------------------------------------------------------
     * CREATE CANONICAL HUMAN TASK
     * ------------------------------------------------------------------------
     */


    if (
      decision.createHumanTask ===
      true
    ) {
      task =
        await this
          .humanOperationsRepository
          .createTask({
            organizationId,

            environmentId,

            incidentId,

            /*
             * human_operations.tasks.escalation_id is TEXT in the existing
             * Phase-14 schema, therefore the escalation public ID is the
             * preferred stable external reference.
             */
            escalationId:
              escalation.publicId ||
              escalation.id,

            taskType:
              taskTypeFromReason(
                decision.reasonCode
              ),

            title:
              input.taskTitle ||

              taskTitle({
                incidentId,

                reasonCode:
                  decision.reasonCode,
              }),

            description:
              input.taskDescription ||

              [
                "AIRA stopped autonomous continuation and created a human escalation.",

                `Reason: ${decision.reasonCode}.`,

                "Escalation does not grant execution authority or human control.",
              ].join(
                " "
              ),

            priority:
              input.taskPriority ||

              priorityFromSeverity(
                input.severity
              ),

            status:
              HUMAN_TASK_STATUS.OPEN,

            source:
              "PHASE23_ESCALATION_ENGINE",

            createdByUserId:
              input.createdByUserId ||
              null,

            acknowledgementRequired:
              true,

            recommendedActions:
              normalizeArray(
                input.recommendedActions
              ),

            evidence:
              normalizeArray(
                input.evidence
              ),

            /*
             * The acknowledgement deadline also serves as the operational
             * due time for this human task.
             */
            dueAt:
              deadline,

            expiresAt:
              input.taskExpiresAt ||
              null,

            controlEpoch:
              Number(
                input.controlEpoch ||
                0
              ),

            metadata: {
              ...normalizeObject(
                input.taskMetadata
              ),

              escalationPublicId:
                escalation.publicId ||
                null,

              escalationReason:
                decision.reasonCode,

              triggerSource:
                decision.triggerSource,

              autonomousRecoveryBlocked:
                true,

              executionAuthorized:
                false,
            },
          });


      /*
       * ----------------------------------------------------------------------
       * USER / TEAM ASSIGNMENT
       * ----------------------------------------------------------------------
       */


      const selectedTarget =
        decision.selectedTarget;


      if (
        selectedTarget?.targetType ===
          ON_CALL_TARGET_TYPE.USER ||

        selectedTarget?.targetType ===
          ON_CALL_TARGET_TYPE.TEAM
      ) {
        assignment =
          await this
            .humanOperationsRepository
            .createAssignment({
              organizationId,

              environmentId,

              taskId:
                task.publicId ||
                task.id,

              assignedUserId:
                selectedTarget
                  .targetType ===
                ON_CALL_TARGET_TYPE.USER
                  ? selectedTarget
                      .targetUserId
                  : null,

              assignedTeamId:
                selectedTarget
                  .targetType ===
                ON_CALL_TARGET_TYPE.TEAM
                  ? selectedTarget
                      .targetTeamId
                  : null,

              assignedByUserId:
                input.createdByUserId ||
                null,

              reason:
                `Escalation route: ${decision.reasonCode}`,

              metadata: {
                escalationPublicId:
                  escalation.publicId ||
                  null,

                targetKey:
                  selectedTarget.targetKey ||
                  null,

                executionAuthorized:
                  false,
              },
            });
      }


      /*
       * ----------------------------------------------------------------------
       * NO ROUTE FOUND
       * ----------------------------------------------------------------------
       *
       * HumanTask remains canonical, but we explicitly place it in WAITING.
       *
       * We do not manufacture an on-call target.
       */


      else if (
        !selectedTarget
      ) {
        task =
          await this
            .humanOperationsRepository
            .updateTaskStatus({
              organizationId,

              environmentId,

              taskId:
                task.publicId ||
                task.id,

              status:
                HUMAN_TASK_STATUS
                  .WAITING,

              actorUserId:
                input.createdByUserId ||
                null,

              reason:
                "No on-call target resolved; human routing required",

              metadata: {
                escalationPublicId:
                  escalation.publicId ||
                  null,

                executionAuthorized:
                  false,
              },
            });
      }
    }


    /*
     * ------------------------------------------------------------------------
     * DETERMINE ESCALATION ROUTING STATE
     * ------------------------------------------------------------------------
     */


    let finalStatus =
      ESCALATION_STATUS
        .DECIDED;


    let routeState =
      "UNRESOLVED";


    /*
     * USER / TEAM assignment means somebody now owns the task and we wait
     * for acknowledgement.
     */


    if (
      assignment
    ) {
      finalStatus =
        ESCALATION_STATUS
          .WAITING_ACK;


      routeState =
        "ASSIGNED_WAITING_ACK";
    }


    /*
     * An integration target is a valid routing destination, but Phase 23.2
     * does not actually publish a message.
     */


    else if (
      decision.selectedTarget
    ) {
      finalStatus =
        ESCALATION_STATUS
          .ROUTED;


      routeState =
        decision
          .selectedTarget
          .targetType ===
        ON_CALL_TARGET_TYPE
          .INTEGRATION
          ? "INTEGRATION_HANDOFF_PENDING"
          : "ROUTED";
    }


    /*
     * Human task exists, but no route exists.
     */


    else if (
      task
    ) {
      routeState =
        "WAITING_FOR_TARGET";
    }


    /*
     * ------------------------------------------------------------------------
     * PERSIST ROUTING RESULT
     * ------------------------------------------------------------------------
     */


    const routingSnapshot =
      buildRoutingSnapshot({
        decision,

        task,

        assignment,

        routeState,
      });


    const persistedEscalation =
      await this
        .escalationRepository
        .updateEscalationStatus({
          organizationId,

          environmentId,

          escalationId:
            escalation.publicId ||
            escalation.id,

          status:
            finalStatus,

          routingSnapshot,

          taskId:
            task
              ? (
                  task.publicId ||
                  task.id
                )
              : undefined,
        });


    /*
     * ------------------------------------------------------------------------
     * PHASE 23.3 HANDOFF CONTRACT
     * ------------------------------------------------------------------------
     *
     * IMPORTANT:
     *
     * This object represents notification INTENT only.
     *
     * No RabbitMQ publish happens here.
     * No workflow-outbox insert happens here.
     *
     * Phase 23.3 will own both.
     */


    const notificationHandoff =
      decision.selectedTarget
        ? {
            ready:
              true,

            deliveryStarted:
              false,

            owner:
              "PHASE_23_3_NOTIFICATION_PLATFORM",

            escalationId:
              persistedEscalation
                .publicId ||

              persistedEscalation
                .id,

            incidentId,

            taskId:
              task?.publicId ||
              task?.id ||
              null,

            assignmentId:
              assignment?.publicId ||
              assignment?.id ||
              null,

            target:
              decision.selectedTarget,

            acknowledgementDeadline:
              deadline,

            executionAuthorized:
              false,
          }

        : null;


    /*
     * ------------------------------------------------------------------------
     * FINAL RESULT
     * ------------------------------------------------------------------------
     */


    return {
      decision,

      escalation:
        persistedEscalation,

      task,

      assignment,

      autonomousRecoveryBlocked,

      notificationHandoff,

      humanControlGranted:
        false,

      executionAuthorized:
        false,
    };
  }
}


/*
 * ============================================================================
 * DEFAULT INSTANCE
 * ============================================================================
 */


const defaultService =
  new HumanEscalationOrchestratorService();


module.exports =
  defaultService;


module.exports
  .HumanEscalationOrchestratorService =
  HumanEscalationOrchestratorService;


module.exports
  .taskTypeFromReason =
  taskTypeFromReason;


module.exports
  .priorityFromSeverity =
  priorityFromSeverity;