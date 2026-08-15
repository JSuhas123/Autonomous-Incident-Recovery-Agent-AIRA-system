"use strict";

const {
  EscalationService,
  ESCALATION_STATUS,
  ESCALATION_PRIORITY,
} =
  require(
    "../escalationService"
  );

const {
  INCIDENT_LIFECYCLE_STATE,
  ESCALATION_REASON,
} =
  require(
    "../incidentLifecycleContracts"
  );

function baseInput(
  overrides = {}
) {
  return {
    organizationId:
      "org-1",

    environmentId:
      "env-1",

    incidentId:
      "incident-1",

    verificationId:
      "verification-1",

    recoveryDecisionId:
      "recovery-1",

    executionRequestId:
      "execution-1",

    reason:
      ESCALATION_REASON
        .RETRIES_EXHAUSTED,

    recoveryAttempt:
      3,

    maxRecoveryAttempts:
      3,

    evidence: [
      {
        type:
          "verification",

        result:
          "NOT_RECOVERED",
      },
    ],

    incident: {
      lifecycleState:
        INCIDENT_LIFECYCLE_STATE
          .RETRY_PENDING,
    },

    executionAuthorized:
      false,

    ...overrides,
  };
}

describe(
  "EscalationService",
  () => {
    test(
      "creates structured escalation",
      async () => {
        const service =
          new EscalationService();

        const result =
          await service
            .escalate(
              baseInput()
            );

        expect(
          result.status
        )
          .toBe(
            ESCALATION_STATUS
              .CREATED
          );

        expect(
          result.escalated
        )
          .toBe(
            true
          );

        expect(
          result.escalation
            .requiresOperator
        )
          .toBe(
            true
          );
      }
    );

    test(
      "transitions incident to escalated",
      async () => {
        const service =
          new EscalationService();

        const result =
          await service
            .escalate(
              baseInput()
            );

        expect(
          result.transition
            .toState
        )
          .toBe(
            INCIDENT_LIFECYCLE_STATE
              .ESCALATED
          );
      }
    );

    test(
      "retries exhausted receives high priority",
      async () => {
        const service =
          new EscalationService();

        const result =
          await service
            .escalate(
              baseInput()
            );

        expect(
          result.escalation
            .priority
        )
          .toBe(
            ESCALATION_PRIORITY
              .HIGH
          );
      }
    );

    test(
      "rollback failure receives critical priority",
      async () => {
        const service =
          new EscalationService();

        const result =
          await service
            .escalate(
              baseInput({
                reason:
                  ESCALATION_REASON
                    .ROLLBACK_FAILED,

                incident: {
                  lifecycleState:
                    INCIDENT_LIFECYCLE_STATE
                      .ROLLBACK_PENDING,
                },
              })
            );

        expect(
          result.escalation
            .priority
        )
          .toBe(
            ESCALATION_PRIORITY
              .CRITICAL
          );
      }
    );

    test(
      "stability regression receives critical priority",
      async () => {
        const service =
          new EscalationService();

        const result =
          await service
            .escalate(
              baseInput({
                reason:
                  ESCALATION_REASON
                    .STABILITY_REGRESSION,

                incident: {
                  lifecycleState:
                    INCIDENT_LIFECYCLE_STATE
                      .REGRESSED,
                },
              })
            );

        expect(
          result.escalation
            .priority
        )
          .toBe(
            ESCALATION_PRIORITY
              .CRITICAL
          );
      }
    );

    test(
      "queues escalation when provider exists",
      async () => {
        const enqueue =
          jest.fn();

        const service =
          new EscalationService();

        const result =
          await service
            .escalate(
              baseInput(),
              {
                enqueueEscalation:
                  enqueue,
              }
            );

        expect(
          enqueue
        )
          .toHaveBeenCalledTimes(
            1
          );

        expect(
          result.status
        )
          .toBe(
            ESCALATION_STATUS
              .QUEUED
          );

        expect(
          result.queued
        )
          .toBe(
            true
          );
      }
    );

    test(
      "already escalated incident is idempotent",
      async () => {
        const service =
          new EscalationService();

        const result =
          await service
            .escalate(
              baseInput({
                incident: {
                  lifecycleState:
                    INCIDENT_LIFECYCLE_STATE
                      .ESCALATED,
                },
              })
            );

        expect(
          result.escalated
        )
          .toBe(
            true
          );

        expect(
          result.transition
        )
          .toBeNull();
      }
    );

    test(
      "preserves evidence",
      async () => {
        const service =
          new EscalationService();

        const result =
          await service
            .escalate(
              baseInput()
            );

        expect(
          result.escalation
            .evidence
        )
          .toHaveLength(
            1
          );
      }
    );

    test(
      "provides recommended operator actions",
      async () => {
        const service =
          new EscalationService();

        const result =
          await service
            .escalate(
              baseInput()
            );

        expect(
          result.escalation
            .recommendedActions
            .length
        )
          .toBeGreaterThan(
            0
          );
      }
    );

    test(
      "does not start recovery rollback or execution",
      async () => {
        const service =
          new EscalationService();

        const result =
          await service
            .escalate(
              baseInput()
            );

        expect(
          result.recoveryStarted
        )
          .toBe(
            false
          );

        expect(
          result.rollbackStarted
        )
          .toBe(
            false
          );

        expect(
          result.executionStarted
        )
          .toBe(
            false
          );
      }
    );

    test(
      "uses external incident provider",
      async () => {
        const service =
          new EscalationService();

        const input =
          baseInput();

        delete input.incident;

        const getIncident =
          jest.fn(
            async () => ({
              lifecycleState:
                INCIDENT_LIFECYCLE_STATE
                  .RETRY_PENDING,
            })
          );

        const result =
          await service
            .escalate(
              input,
              {
                getIncident,
              }
            );

        expect(
          result.escalated
        )
          .toBe(
            true
          );

        expect(
          getIncident
        )
          .toHaveBeenCalled();
      }
    );

    test(
      "rejects invalid escalation reason",
      async () => {
        const service =
          new EscalationService();

        await expect(
          service.escalate(
            baseInput({
              reason:
                "MADE_UP_REASON",
            })
          )
        )
          .rejects
          .toMatchObject({
            code:
              "ESCALATION_REASON_INVALID",
          });
      }
    );

    test(
      "never authorizes execution",
      async () => {
        const service =
          new EscalationService();

        const result =
          await service
            .escalate(
              baseInput()
            );

        expect(
          result.executionAuthorized
        )
          .toBe(
            false
          );

        expect(
          result.escalation
            .executionAuthorized
        )
          .toBe(
            false
          );
      }
    );

    test(
      "rejects unsafe execution authorization input",
      async () => {
        const service =
          new EscalationService();

        await expect(
          service.escalate(
            baseInput({
              executionAuthorized:
                true,
            })
          )
        )
          .rejects
          .toMatchObject({
            code:
              "ESCALATION_UNSAFE_INPUT",
          });
      }
    );
  }
);