"use strict";

const {
  IDEMPOTENCY_STATUS,
  IDEMPOTENCY_DECISION,
  IDEMPOTENCY_OPERATION,
  IDEMPOTENCY_RESULT,

  isValidIdempotencyStatus,
  isValidIdempotencyDecision,
  isValidIdempotencyOperation,
  isTerminalIdempotencyStatus,

  assertValidIdempotencyStatus,
  assertValidIdempotencyOperation,
} =
  require(
    "../idempotencyContracts"
  );

describe(
  "Idempotency Contracts",
  () => {
    test(
      "defines required statuses",
      () => {
        expect(
          IDEMPOTENCY_STATUS
            .PROCESSING
        )
          .toBe(
            "PROCESSING"
          );

        expect(
          IDEMPOTENCY_STATUS
            .COMPLETED
        )
          .toBe(
            "COMPLETED"
          );

        expect(
          IDEMPOTENCY_STATUS
            .FAILED
        )
          .toBe(
            "FAILED"
          );

        expect(
          IDEMPOTENCY_STATUS
            .EXPIRED
        )
          .toBe(
            "EXPIRED"
          );
      }
    );

    test(
      "defines duplicate processing decisions",
      () => {
        expect(
          IDEMPOTENCY_DECISION
            .ACQUIRED
        )
          .toBe(
            "ACQUIRED"
          );

        expect(
          IDEMPOTENCY_DECISION
            .DUPLICATE_COMPLETED
        )
          .toBe(
            "DUPLICATE_COMPLETED"
          );

        expect(
          IDEMPOTENCY_DECISION
            .DUPLICATE_PROCESSING
        )
          .toBe(
            "DUPLICATE_PROCESSING"
          );
      }
    );

    test(
      "defines protected operations",
      () => {
        expect(
          IDEMPOTENCY_OPERATION
            .RECOVERY_DECISION
        )
          .toBe(
            "RECOVERY_DECISION"
          );

        expect(
          IDEMPOTENCY_OPERATION
            .EXECUTION
        )
          .toBe(
            "EXECUTION"
          );

        expect(
          IDEMPOTENCY_OPERATION
            .VERIFICATION
        )
          .toBe(
            "VERIFICATION"
          );

        expect(
          IDEMPOTENCY_OPERATION
            .LIFECYCLE
        )
          .toBe(
            "LIFECYCLE"
          );
      }
    );

    test(
      "validates statuses",
      () => {
        expect(
          isValidIdempotencyStatus(
            "PROCESSING"
          )
        )
          .toBe(
            true
          );

        expect(
          isValidIdempotencyStatus(
            "UNKNOWN"
          )
        )
          .toBe(
            false
          );
      }
    );

    test(
      "validates decisions",
      () => {
        expect(
          isValidIdempotencyDecision(
            "ACQUIRED"
          )
        )
          .toBe(
            true
          );

        expect(
          isValidIdempotencyDecision(
            "EXECUTE_ANYWAY"
          )
        )
          .toBe(
            false
          );
      }
    );

    test(
      "validates operations",
      () => {
        expect(
          isValidIdempotencyOperation(
            "EXECUTION"
          )
        )
          .toBe(
            true
          );

        expect(
          isValidIdempotencyOperation(
            "RAW_SHELL"
          )
        )
          .toBe(
            false
          );
      }
    );

    test(
      "recognizes terminal statuses",
      () => {
        expect(
          isTerminalIdempotencyStatus(
            IDEMPOTENCY_STATUS
              .COMPLETED
          )
        )
          .toBe(
            true
          );

        expect(
          isTerminalIdempotencyStatus(
            IDEMPOTENCY_STATUS
              .FAILED
          )
        )
          .toBe(
            true
          );

        expect(
          isTerminalIdempotencyStatus(
            IDEMPOTENCY_STATUS
              .PROCESSING
          )
        )
          .toBe(
            false
          );
      }
    );

    test(
      "assert status rejects unknown value",
      () => {
        expect(
          () =>
            assertValidIdempotencyStatus(
              "BROKEN"
            )
        )
          .toThrow(
            "Invalid idempotency status"
          );
      }
    );

    test(
      "assert operation rejects unknown value",
      () => {
        expect(
          () =>
            assertValidIdempotencyOperation(
              "RUN_ANYTHING"
            )
        )
          .toThrow(
            "Invalid idempotency operation"
          );
      }
    );

    test(
      "result contract does not contain authorization state",
      () => {
        expect(
          Object.values(
            IDEMPOTENCY_RESULT
          )
        )
          .toEqual(
            expect.arrayContaining([
              "SUCCESS",
              "FAILURE",
              "DUPLICATE",
              "IN_PROGRESS",
            ])
          );

        expect(
          IDEMPOTENCY_RESULT
            .AUTHORIZED
        )
          .toBeUndefined();
      }
    );

    test(
      "contracts are immutable",
      () => {
        expect(
          Object.isFrozen(
            IDEMPOTENCY_STATUS
          )
        )
          .toBe(
            true
          );

        expect(
          Object.isFrozen(
            IDEMPOTENCY_DECISION
          )
        )
          .toBe(
            true
          );

        expect(
          Object.isFrozen(
            IDEMPOTENCY_OPERATION
          )
        )
          .toBe(
            true
          );
      }
    );
  }
);