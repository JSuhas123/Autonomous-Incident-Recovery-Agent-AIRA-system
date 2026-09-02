"use strict";


const crypto =
  require(
    "node:crypto"
  );


const PostgresHumanEscalationRepository =
  require(
    "../../persistence/postgres/PostgresHumanEscalationRepository"
  );


const PostgresHumanEscalationRuntimeRepository =
  require(
    "../../persistence/postgres/PostgresHumanEscalationRuntimeRepository"
  );


const PostgresHumanOperationsRepository =
  require(
    "../../persistence/postgres/PostgresHumanOperationsRepository"
  );


const {
  HumanEscalationOrchestratorService,
} =
  require(
    "./humanEscalationOrchestratorService"
  );


const humanEscalationDecisionService =
  require(
    "./humanEscalationDecisionService"
  );


const {
  ESCALATION_DECISION,
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


function createError(
  message,
  code,
  status = 409,
  details = {}
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
  label,
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
      `${label} is required`,
      code,
      422
    );
  }


  return value;
}


/*
 * ============================================================================
 * DETERMINISTIC ESCALATION ID
 * ============================================================================
 *
 * Same:
 *
 *   tenant + environment + idempotency key
 *
 * always produces the same escalation public ID.
 *
 * The existing global unique constraint on escalation.public_id therefore
 * becomes the final concurrency fence.
 * ============================================================================
 */


function deterministicEscalationPublicId(
  input
) {
  const organizationId =
    requireValue(
      input.organizationId,
      "organizationId",
      "HUMAN_ESCALATION_ORGANIZATION_REQUIRED"
    );


  const environmentId =
    requireValue(
      input.environmentId,
      "environmentId",
      "HUMAN_ESCALATION_ENVIRONMENT_REQUIRED"
    );


  const idempotencyKey =
    requireValue(
      input.idempotencyKey,
      "idempotencyKey",
      "HUMAN_ESCALATION_IDEMPOTENCY_KEY_REQUIRED"
    );


  const digest =
    crypto
      .createHash(
        "sha256"
      )
      .update(
        [
          organizationId,
          environmentId,
          idempotencyKey,
        ].join(
          "\n"
        )
      )
      .digest(
        "hex"
      )
      .slice(
        0,
        32
      );


  return (
    "esc_idem_" +
    digest
  );
}


function targetSort(
  left,
  right
) {
  const priorityDelta =
    Number(
      left?.priority ??
      100
    ) -
    Number(
      right?.priority ??
      100
    );


  if (
    priorityDelta !==
    0
  ) {
    return priorityDelta;
  }


  return String(
    left?.publicId ||
    left?.targetKey ||
    ""
  ).localeCompare(
    String(
      right?.publicId ||
      right?.targetKey ||
      ""
    )
  );
}


function selectRetryTarget(
  targets,
  currentTargetId
) {
  const enabled =
    (
      Array.isArray(
        targets
      )
        ? targets
        : []
    )
      .filter(
        (
          target
        ) =>
          target?.enabled !==
          false
      )
      .sort(
        targetSort
      );


  if (
    enabled.length ===
    0
  ) {
    return null;
  }


  const currentIndex =
    enabled.findIndex(
      (
        target
      ) =>
        String(
          target.id ||
          ""
        ) ===
        String(
          currentTargetId ||
          ""
        ) ||

        String(
          target.publicId ||
          ""
        ) ===
        String(
          currentTargetId ||
          ""
        )
    );


  /*
   * Move through the on-call ladder when another target exists.
   */
  if (
    currentIndex >=
      0 &&
    currentIndex + 1 <
      enabled.length
  ) {
    return enabled[
      currentIndex +
      1
    ];
  }


  /*
   * We reached the last target.
   *
   * Retry the final destination until maxDeliveryAttempts is exhausted.
   */
  if (
    currentIndex >=
    0
  ) {
    return enabled[
      currentIndex
    ];
  }


  return enabled[0];
}


class HumanEscalationReliabilityService {
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


    this.runtimeRepository =
      options
        .runtimeRepository ||

      new PostgresHumanEscalationRuntimeRepository(
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


    this.orchestratorFactory =
      options
        .orchestratorFactory ||

      (
        (
          repository
        ) =>
          new HumanEscalationOrchestratorService({
            escalationRepository:
              repository,

            humanOperationsRepository:
              this
                .humanOperationsRepository,

            decisionService:
              this
                .decisionService,
          })
      );
  }


  /*
   * ==========================================================================
   * IDEMPOTENT ESCALATION ENTRY
   * ==========================================================================
   */


  async escalate(
    input = {}
  ) {
    requireValue(
      input.incidentId,
      "incidentId",
      "HUMAN_ESCALATION_INCIDENT_REQUIRED"
    );


    const escalationPublicId =
      deterministicEscalationPublicId(
        input
      );


    const scope = {
      organizationId:
        input.organizationId,

      environmentId:
        input.environmentId,
    };


    /*
     * Fast replay path.
     */
    const existing =
      await this
        .escalationRepository
        .getEscalation({
          ...scope,

          escalationId:
            escalationPublicId,
        });


    if (
      existing
    ) {
      return this
        .#buildReplay(
          scope,
          existing
        );
    }


    /*
     * The decorated repository forces the deterministic public ID into the
     * already-passed 23.2B orchestrator.
     */
    const decoratedRepository =
      this
        .#idempotentRepository(
          escalationPublicId
        );


    const orchestrator =
      this
        .orchestratorFactory(
          decoratedRepository
        );


    let result;


    try {
      result =
        await orchestrator
          .escalate({
            ...input,

            metadata: {
              ...(
                input.metadata ||
                {}
              ),

              idempotencyKey:
                input
                  .idempotencyKey,

              escalationPublicId,

              executionAuthorized:
                false,
            },
          });
    } catch (
      error
    ) {
      /*
       * Two callers may both observe "not found".
       *
       * PostgreSQL unique public_id is the final concurrency fence.
       */
      if (
        error?.code !==
        "HUMAN_ESCALATION_IDEMPOTENCY_CONFLICT"
      ) {
        throw error;
      }


      const winner =
        await this
          .escalationRepository
          .getEscalation({
            ...scope,

            escalationId:
              escalationPublicId,
          });


      if (
        !winner
      ) {
        throw error;
      }


      return this
        .#buildReplay(
          scope,
          winner
        );
    }


    /*
     * Only actual ESCALATE decisions participate in delivery retry state.
     */
    if (
      result
        ?.decision
        ?.decision ===
        ESCALATION_DECISION
          .ESCALATE &&

      result
        ?.escalation
    ) {
      const maxDeliveryAttempts =
        Math.max(
          1,

          Number(
            result
              .decision
              ?.matchedPolicy
              ?.maxDeliveryAttempts ||

            input
              .maxDeliveryAttempts ||

            3
          )
        );


      result.escalation =
        await this
          .runtimeRepository
          .initializeRuntime({
            ...scope,

            escalationId:
              result
                .escalation
                .publicId ||

              result
                .escalation
                .id,

            maxDeliveryAttempts,
          });
    }


    return {
      ...result,

      idempotentReplay:
        false,

      escalationPublicId,

      humanControlGranted:
        false,

      executionAuthorized:
        false,
    };
  }


  /*
   * ==========================================================================
   * ACKNOWLEDGEMENT TIMEOUT
   * ==========================================================================
   */


  async processAcknowledgementTimeout(
    input = {}
  ) {
    const scope = {
      organizationId:
        requireValue(
          input.organizationId,
          "organizationId",
          "HUMAN_ESCALATION_ORGANIZATION_REQUIRED"
        ),

      environmentId:
        requireValue(
          input.environmentId,
          "environmentId",
          "HUMAN_ESCALATION_ENVIRONMENT_REQUIRED"
        ),
    };


    const escalation =
      await this
        .runtimeRepository
        .getByPublicId({
          ...scope,

          escalationId:
            requireValue(
              input.escalationId,
              "escalationId",
              "HUMAN_ESCALATION_ID_REQUIRED"
            ),
        });


    if (
      !escalation
    ) {
      throw createError(
        `Escalation not found: ${input.escalationId}`,
        "HUMAN_ESCALATION_NOT_FOUND",
        404
      );
    }


    if (
      ![
        ESCALATION_STATUS
          .WAITING_ACK,

        ESCALATION_STATUS
          .ROUTED,
      ].includes(
        escalation.status
      )
    ) {
      return {
        action:
          "NOOP",

        reason:
          "ESCALATION_NOT_WAITING_FOR_ACK",

        escalation,

        executionAuthorized:
          false,
      };
    }


    if (
      escalation
        .acknowledgementDeadline &&

      new Date(
        escalation
          .acknowledgementDeadline
      ).getTime() >
      Date.now()
    ) {
      return {
        action:
          "NOOP",

        reason:
          "ACK_DEADLINE_NOT_REACHED",

        escalation,

        executionAuthorized:
          false,
      };
    }


    /*
     * Resolve the canonical HumanTask.
     */
    const task =
      escalation.taskId

        ? await this
            .humanOperationsRepository
            .getTask({
              ...scope,

              taskId:
                escalation
                  .taskId,
            })

        : await this
            .runtimeRepository
            .getTaskByEscalationPublicId({
              ...scope,

              escalationPublicId:
                escalation
                  .publicId,
            });


    /*
     * ========================================================================
     * RETRY BUDGET EXHAUSTED
     * ========================================================================
     */


    if (
      escalation
        .deliveryAttemptCount >=
      escalation
        .maxDeliveryAttempts
    ) {
      const failed =
        await this
          .runtimeRepository
          .markRetryExhausted({
            ...scope,

            escalationId:
              escalation
                .publicId,

            actorUserId:
              input.actorUserId ||
              null,
          });


      let waitingTask =
        task;


      if (
        task &&

        ![
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
        waitingTask =
          await this
            .humanOperationsRepository
            .updateTaskStatus({
              ...scope,

              taskId:
                task.publicId ||
                task.id,

              status:
                HUMAN_TASK_STATUS
                  .WAITING,

              actorUserId:
                input.actorUserId ||
                null,

              reason:
                "Escalation acknowledgement retry budget exhausted",

              metadata: {
                escalationId:
                  escalation
                    .publicId,

                executionAuthorized:
                  false,
              },
            });
      }


      return {
        action:
          "RETRY_EXHAUSTED",

        escalation:
          failed,

        task:
          waitingTask,

        autonomousRecoveryBlocked:
          true,

        requiresHumanReview:
          true,

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
     * FIND RETRY / NEXT ON-CALL TARGET
     * ========================================================================
     */


    const targets =
      await this
        .escalationRepository
        .listTargets({
          ...scope,

          enabledOnly:
            true,
        });


    const target =
      selectRetryTarget(
        targets,

        escalation
          .selectedTargetId
      );


    /*
     * No target can accept the escalation.
     */
    if (
      !target
    ) {
      const failed =
        await this
          .runtimeRepository
          .markRetryExhausted({
            ...scope,

            escalationId:
              escalation
                .publicId,

            actorUserId:
              input.actorUserId ||
              null,

            metadata: {
              reason:
                "NO_ON_CALL_TARGET_AVAILABLE",
            },
          });


      return {
        action:
          "RETRY_EXHAUSTED",

        escalation:
          failed,

        task,

        autonomousRecoveryBlocked:
          true,

        requiresHumanReview:
          true,

        notificationHandoff:
          null,

        humanControlGranted:
          false,

        executionAuthorized:
          false,
      };
    }


    /*
     * Resolve policy timeout.
     */
    const policy =
      escalation.policyId

        ? (
            await this
              .escalationRepository
              .listPolicies({
                ...scope,

                enabledOnly:
                  false,
              })
          ).find(
            (
              candidate
            ) =>
              String(
                candidate.id
              ) ===
                String(
                  escalation
                    .policyId
                ) ||

              String(
                candidate.publicId
              ) ===
                String(
                  escalation
                    .policyId
                )
          )

        : null;


    const acknowledgementTimeoutSeconds =
      Math.max(
        1,

        Number(
          input
            .acknowledgementTimeoutSeconds ||

          policy
            ?.acknowledgementTimeoutSeconds ||

          900
        )
      );


    const nextStatus =
      target
        .targetType ===
      ON_CALL_TARGET_TYPE
        .INTEGRATION

        ? ESCALATION_STATUS
            .ROUTED

        : ESCALATION_STATUS
            .WAITING_ACK;


    const retried =
      await this
        .runtimeRepository
        .recordRetry({
          ...scope,

          escalationId:
            escalation
              .publicId,

          targetId:
            target.publicId ||
            target.id,

          status:
            nextStatus,

          acknowledgementTimeoutSeconds,

          actorUserId:
            input.actorUserId ||
            null,
        });


    /*
     * USER / TEAM targets become canonical task assignments.
     */
    let assignment =
      null;


    if (
      task &&

      [
        ON_CALL_TARGET_TYPE
          .USER,

        ON_CALL_TARGET_TYPE
          .TEAM,
      ].includes(
        target.targetType
      )
    ) {
      assignment =
        await this
          .humanOperationsRepository
          .createAssignment({
            ...scope,

            taskId:
              task.publicId ||
              task.id,

            assignedUserId:
              target
                .targetType ===
              ON_CALL_TARGET_TYPE
                .USER

                ? target
                    .targetUserId

                : null,

            assignedTeamId:
              target
                .targetType ===
              ON_CALL_TARGET_TYPE
                .TEAM

                ? target
                    .targetTeamId

                : null,

            assignedByUserId:
              input.actorUserId ||
              null,

            reason:
              "Escalation acknowledgement timeout retry",

            metadata: {
              escalationId:
                escalation
                  .publicId,

              attemptNumber:
                retried
                  .deliveryAttemptCount,

              executionAuthorized:
                false,
            },
          });
    }


    /*
     * Actual notification delivery belongs to Phase 23.3.
     */
    return {
      action:
        "RETRY_SCHEDULED",

      escalation:
        retried,

      task,

      assignment,

      autonomousRecoveryBlocked:
        true,

      notificationHandoff: {
        ready:
          true,

        deliveryStarted:
          false,

        owner:
          "PHASE_23_3_NOTIFICATION_PLATFORM",

        escalationId:
          retried
            .publicId,

        incidentId:
          retried
            .incidentId,

        taskId:
          task?.publicId ||
          task?.id ||
          null,

        assignmentId:
          assignment
            ?.publicId ||
          assignment
            ?.id ||
          null,

        target,

        attemptNumber:
          retried
            .deliveryAttemptCount,

        acknowledgementDeadline:
          retried
            .acknowledgementDeadline,

        executionAuthorized:
          false,
      },

      humanControlGranted:
        false,

      executionAuthorized:
        false,
    };
  }


  /*
   * ==========================================================================
   * BATCH TIMEOUT PROCESSING
   * ==========================================================================
   */


  async processDueAcknowledgementTimeouts(
    input = {}
  ) {
    const due =
      await this
        .runtimeRepository
        .listAcknowledgementTimeouts({
          organizationId:
            input.organizationId,

          environmentId:
            input.environmentId,

          limit:
            input.limit ||
            50,
        });


    const results =
      [];


    for (
      const escalation
      of due
    ) {
      results.push(
        await this
          .processAcknowledgementTimeout({
            organizationId:
              input.organizationId,

            environmentId:
              input.environmentId,

            escalationId:
              escalation
                .publicId,

            actorUserId:
              input.actorUserId ||
              null,
          })
      );
    }


    return {
      processed:
        results.length,

      results,

      executionAuthorized:
        false,
    };
  }


  /*
   * ==========================================================================
   * IDEMPOTENCY DECORATOR
   * ==========================================================================
   */


  #idempotentRepository(
    escalationPublicId
  ) {
    const base =
      this
        .escalationRepository;


    return {
      listPolicies:
        base
          .listPolicies
          .bind(
            base
          ),

      listTargets:
        base
          .listTargets
          .bind(
            base
          ),

      getEscalation:
        base
          .getEscalation
          .bind(
            base
          ),

      updateEscalationStatus:
        base
          .updateEscalationStatus
          .bind(
            base
          ),


      createEscalation:
        async (
          input
        ) => {
          try {
            return await base
              .createEscalation({
                ...input,

                publicId:
                  escalationPublicId,
              });
          } catch (
            error
          ) {
            if (
              error?.code ===
              "23505"
            ) {
              throw createError(
                "Concurrent escalation request already owns this idempotency key",
                "HUMAN_ESCALATION_IDEMPOTENCY_CONFLICT",
                409,
                {
                  cause:
                    error,
                }
              );
            }


            throw error;
          }
        },
    };
  }


  /*
   * ==========================================================================
   * IDEMPOTENT REPLAY
   * ==========================================================================
   */


  async #buildReplay(
    scope,
    escalation
  ) {
    const task =
      await this
        .runtimeRepository
        .getTaskByEscalationPublicId({
          ...scope,

          escalationPublicId:
            escalation
              .publicId,
        });


    return {
      decision: {
        decision:
          escalation
            .decision,

        reasonCode:
          escalation
            .reasonCode,

        triggerSource:
          escalation
            .triggerSource,
      },

      escalation,

      task,

      assignment:
        null,

      autonomousRecoveryBlocked:
        escalation
          .decision ===
        ESCALATION_DECISION
          .ESCALATE,

      notificationHandoff:
        null,

      idempotentReplay:
        true,

      /*
       * In a concurrent race, the escalation transaction can commit before
       * the winning caller finishes creating the HumanTask.
       *
       * We return PENDING instead of creating another HumanTask.
       */
      orchestrationPending:
        escalation
          .decision ===
          ESCALATION_DECISION
            .ESCALATE &&
        !task,

      escalationPublicId:
        escalation
          .publicId,

      humanControlGranted:
        false,

      executionAuthorized:
        false,
    };
  }
}


const defaultService =
  new HumanEscalationReliabilityService();


module.exports =
  defaultService;


module.exports
  .HumanEscalationReliabilityService =
  HumanEscalationReliabilityService;


module.exports
  .deterministicEscalationPublicId =
  deterministicEscalationPublicId;


module.exports
  .selectRetryTarget =
  selectRetryTarget;