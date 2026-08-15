"use strict";

const RuntimeRecoveryCheckpoint =
  require(
    "../RuntimeRecoveryCheckpoint"
  );

const {
  RUNTIME_STAGE,
  CHECKPOINT_STATUS,
  RESUME_SAFETY,
} =
  require(
    "../../services/recoveryRuntime/recoveryRuntimeContracts"
  );

describe(
  "RuntimeRecoveryCheckpoint Model",
  () => {
    const validInput =
      () => ({
        organizationId:
          "64b000000000000000000001",

        environmentId:
          "64b000000000000000000002",

        incidentId:
          "64b000000000000000000003",

        operationKey:
          "incident-003:execution:revision-4",

        stage:
          RUNTIME_STAGE
            .EXECUTION,

        workflowIdentity: {
          diagnosisId:
            "diag-001",

          diagnosisRevision:
            4,

          recoveryDecisionId:
            "recovery-001",

          executionRequestId:
            "execution-001",

          executionPlanHash:
            "sha256:test-plan",
        },
      });

    test(
      "creates a valid durable checkpoint",
      async () => {
        const checkpoint =
          new RuntimeRecoveryCheckpoint(
            validInput()
          );

        await expect(
          checkpoint.validate()
        )
          .resolves
          .toBeUndefined();

        expect(
          checkpoint.status
        )
          .toBe(
            CHECKPOINT_STATUS
              .PENDING
          );

        expect(
          checkpoint.resumeSafety
        )
          .toBe(
            RESUME_SAFETY
              .UNKNOWN
          );

        expect(
          checkpoint.executionAuthorized
        )
          .toBe(
            false
          );
      }
    );

    test(
      "requires organization scope",
      async () => {
        const input =
          validInput();

        delete input
          .organizationId;

        const checkpoint =
          new RuntimeRecoveryCheckpoint(
            input
          );

        await expect(
          checkpoint.validate()
        )
          .rejects
          .toMatchObject({
            name:
              "ValidationError",
          });

        expect(
          checkpoint
            .validateSync()
            .errors
            .organizationId
        )
          .toBeDefined();
      }
    );

    test(
      "requires environment scope",
      () => {
        const input =
          validInput();

        delete input
          .environmentId;

        const checkpoint =
          new RuntimeRecoveryCheckpoint(
            input
          );

        const error =
          checkpoint
            .validateSync();

        expect(
          error
            .errors
            .environmentId
        )
          .toBeDefined();
      }
    );

    test(
      "requires incident scope",
      () => {
        const input =
          validInput();

        delete input
          .incidentId;

        const checkpoint =
          new RuntimeRecoveryCheckpoint(
            input
          );

        const error =
          checkpoint
            .validateSync();

        expect(
          error
            .errors
            .incidentId
        )
          .toBeDefined();
      }
    );

    test(
      "requires operation key",
      () => {
        const input =
          validInput();

        delete input
          .operationKey;

        const checkpoint =
          new RuntimeRecoveryCheckpoint(
            input
          );

        const error =
          checkpoint
            .validateSync();

        expect(
          error
            .errors
            .operationKey
        )
          .toBeDefined();
      }
    );

    test(
      "rejects invalid runtime stage",
      () => {
        const input =
          validInput();

        input.stage =
          "ARBITRARY_EXECUTION";

        const checkpoint =
          new RuntimeRecoveryCheckpoint(
            input
          );

        const error =
          checkpoint
            .validateSync();

        expect(
          error
            .errors
            .stage
        )
          .toBeDefined();
      }
    );

    test(
      "rejects invalid checkpoint status",
      () => {
        const input =
          validInput();

        input.status =
          "RUN_IT_AGAIN";

        const checkpoint =
          new RuntimeRecoveryCheckpoint(
            input
          );

        const error =
          checkpoint
            .validateSync();

        expect(
          error
            .errors
            .status
        )
          .toBeDefined();
      }
    );

    test(
      "execution authorization can never be true",
      () => {
        const input =
          validInput();

        input.executionAuthorized =
          true;

        const checkpoint =
          new RuntimeRecoveryCheckpoint(
            input
          );

        const error =
          checkpoint
            .validateSync();

        expect(
          error
            .errors
            .executionAuthorized
        )
          .toBeDefined();
      }
    );

    test(
      "stores immutable workflow identity",
      async () => {
        const checkpoint =
          new RuntimeRecoveryCheckpoint(
            validInput()
          );

        await checkpoint
          .validate();

        expect(
          checkpoint
            .workflowIdentity
            .diagnosisId
        )
          .toBe(
            "diag-001"
          );

        expect(
          checkpoint
            .workflowIdentity
            .diagnosisRevision
        )
          .toBe(
            4
          );

        expect(
          checkpoint
            .workflowIdentity
            .executionRequestId
        )
          .toBe(
            "execution-001"
          );

        expect(
          checkpoint
            .workflowIdentity
            .executionPlanHash
        )
          .toBe(
            "sha256:test-plan"
          );
      }
    );

    test(
      "starts with no runtime owner",
      () => {
        const checkpoint =
          new RuntimeRecoveryCheckpoint(
            validInput()
          );

        expect(
          checkpoint
            .owner
            .workerId
        )
          .toBeNull();

        expect(
          checkpoint
            .owner
            .claimToken
        )
          .toBeNull();

        expect(
          checkpoint
            .owner
            .leaseExpiresAt
        )
          .toBeNull();
      }
    );

    test(
      "starts with zero attempts",
      () => {
        const checkpoint =
          new RuntimeRecoveryCheckpoint(
            validInput()
          );

        expect(
          checkpoint.attempt
        )
          .toBe(
            0
          );
      }
    );

    test(
      "attempt cannot be negative",
      () => {
        const input =
          validInput();

        input.attempt =
          -1;

        const checkpoint =
          new RuntimeRecoveryCheckpoint(
            input
          );

        const error =
          checkpoint
            .validateSync();

        expect(
          error
            .errors
            .attempt
        )
          .toBeDefined();
      }
    );

    test(
      "starts without interruption",
      () => {
        const checkpoint =
          new RuntimeRecoveryCheckpoint(
            validInput()
          );

        expect(
          checkpoint
            .interruption
            .interrupted
        )
          .toBe(
            false
          );

        expect(
          checkpoint
            .interruption
            .reason
        )
          .toBeNull();
      }
    );

    test(
      "defines unique durable workflow identity index",
      () => {
        const indexes =
          RuntimeRecoveryCheckpoint
            .schema
            .indexes();

        const identityIndex =
          indexes.find(
            ([, options]) =>
              options.name ===
              "runtime_recovery_checkpoint_identity"
          );

        expect(
          identityIndex
        )
          .toBeDefined();

        expect(
          identityIndex[1]
            .unique
        )
          .toBe(
            true
          );
      }
    );

    test(
      "defines resume scan index",
      () => {
        const indexes =
          RuntimeRecoveryCheckpoint
            .schema
            .indexes();

        const resumeIndex =
          indexes.find(
            ([, options]) =>
              options.name ===
              "runtime_recovery_checkpoint_resume_scan"
          );

        expect(
          resumeIndex
        )
          .toBeDefined();
      }
    );
  }
);