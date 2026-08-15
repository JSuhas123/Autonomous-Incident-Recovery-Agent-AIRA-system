"use strict";

const {
  OUTBOX_STATUS,
  OUTBOX_EVENT_TYPE,
  OUTBOX_AGGREGATE_TYPE,
  OUTBOX_DELIVERY_DECISION,
  OUTBOX_FAILURE_CLASS,
  OUTBOX_ERROR_CODE,
  assertNoExecutionAuthority,
} =
  require(
    "../workflowOutboxContracts"
  );

describe(
  "Workflow Outbox Contracts",
  () => {
    test(
      "defines durable outbox states",
      () => {
        expect(
          OUTBOX_STATUS
        )
          .toMatchObject({
            PENDING:
              "PENDING",

            PROCESSING:
              "PROCESSING",

            DELIVERED:
              "DELIVERED",

            FAILED:
              "FAILED",

            DEAD_LETTER:
              "DEAD_LETTER",
          });
      }
    );

    test(
      "defines critical workflow handoff event types",
      () => {
        expect(
          OUTBOX_EVENT_TYPE
            .EXECUTION_REQUEST_READY
        )
          .toBe(
            "EXECUTION_REQUEST_READY"
          );

        expect(
          OUTBOX_EVENT_TYPE
            .VERIFICATION_REQUESTED
        )
          .toBe(
            "VERIFICATION_REQUESTED"
          );

        expect(
          OUTBOX_EVENT_TYPE
            .LIFECYCLE_REQUESTED
        )
          .toBe(
            "LIFECYCLE_REQUESTED"
          );
      }
    );

    test(
      "defines workflow aggregate types",
      () => {
        expect(
          OUTBOX_AGGREGATE_TYPE
            .RECOVERY_DECISION
        )
          .toBe(
            "RECOVERY_DECISION"
          );

        expect(
          OUTBOX_AGGREGATE_TYPE
            .EXECUTION_REQUEST
        )
          .toBe(
            "EXECUTION_REQUEST"
          );
      }
    );

    test(
      "defines delivery decisions",
      () => {
        expect(
          OUTBOX_DELIVERY_DECISION
            .DELIVER
        )
          .toBe(
            "DELIVER"
          );

        expect(
          OUTBOX_DELIVERY_DECISION
            .SKIP_DELIVERED
        )
          .toBe(
            "SKIP_DELIVERED"
          );

        expect(
          OUTBOX_DELIVERY_DECISION
            .DEAD_LETTER
        )
          .toBe(
            "DEAD_LETTER"
          );
      }
    );

    test(
      "defines failure classifications",
      () => {
        expect(
          OUTBOX_FAILURE_CLASS
            .RETRYABLE
        )
          .toBe(
            "RETRYABLE"
          );

        expect(
          OUTBOX_FAILURE_CLASS
            .NON_RETRYABLE
        )
          .toBe(
            "NON_RETRYABLE"
          );
      }
    );

    test(
      "outbox payload cannot manufacture execution authorization",
      () => {
        expect(
          () =>
            assertNoExecutionAuthority({
              executionAuthorized:
                true,
            })
        )
          .toThrow(
            expect.objectContaining({
              code:
                OUTBOX_ERROR_CODE
                  .UNSAFE_AUTHORITY,
            })
          );
      }
    );

    test(
      "outbox payload cannot manufacture persisted authorization grant",
      () => {
        expect(
          () =>
            assertNoExecutionAuthority({
              authorizationGranted:
                true,
            })
        )
          .toThrow(
            expect.objectContaining({
              code:
                OUTBOX_ERROR_CODE
                  .UNSAFE_AUTHORITY,
            })
          );
      }
    );

    test(
      "safe workflow payload is accepted",
      () => {
        expect(
          assertNoExecutionAuthority({
            organizationId:
              "org-1",

            environmentId:
              "prod",

            incidentId:
              "incident-1",

            executionRequestId:
              "execution-request-1",

            executionAuthorized:
              false,
          })
        )
          .toBe(
            true
          );
      }
    );
  }
);