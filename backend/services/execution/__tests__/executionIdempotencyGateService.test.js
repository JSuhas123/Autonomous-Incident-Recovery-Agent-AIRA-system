"use strict";

const {
  ExecutionIdempotencyGateService,
} =
  require(
    "../executionIdempotencyGateService"
  );

const {
  IDEMPOTENCY_STATE,
} =
  require(
    "../executionAuthorizationContracts"
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

    recoveryDecisionId:
      "recovery-1",

    recoveryDecisionRevision:
      3,

    selectedPlaybookId:
      "playbook-1",

    retryAllowed:
      false,

    maxAttempts:
      1,

    executionAuthorized:
      false,

    ...overrides,
  };
}

describe(
  "ExecutionIdempotencyGateService",
  () => {
    test(
      "new execution attempt is allowed",
      async () => {
        const service =
          new ExecutionIdempotencyGateService();

        const result =
          await service
            .evaluate(
              baseInput(),
              {
                async checkIdempotency() {
                  return null;
                },
              }
            );

        expect(
          result.state
        )
          .toBe(
            IDEMPOTENCY_STATE
              .NEW
          );

        expect(
          result.allowed
        )
          .toBe(
            true
          );

        expect(
          result.executionAuthorized
        )
          .toBe(
            false
          );
      }
    );

    test(
      "same input generates deterministic idempotency key",
      () => {
        const service =
          new ExecutionIdempotencyGateService();

        const first =
          service.generateKey(
            baseInput()
          );

        const second =
          service.generateKey(
            baseInput()
          );

        expect(
          first
        )
          .toBe(
            second
          );
      }
    );

    test(
      "different recovery revisions generate different keys",
      () => {
        const service =
          new ExecutionIdempotencyGateService();

        const first =
          service.generateKey(
            baseInput({
              recoveryDecisionRevision:
                1,
            })
          );

        const second =
          service.generateKey(
            baseInput({
              recoveryDecisionRevision:
                2,
            })
          );

        expect(
          first
        )
          .not
          .toBe(
            second
          );
      }
    );

    test(
      "already completed execution is blocked",
      async () => {
        const service =
          new ExecutionIdempotencyGateService();

        const result =
          await service
            .evaluate(
              baseInput(),
              {
                async checkIdempotency() {
                  return {
                    organizationId:
                      "org-1",

                    environmentId:
                      "env-1",

                    state:
                      "completed",
                  };
                },
              }
            );

        expect(
          result.state
        )
          .toBe(
            IDEMPOTENCY_STATE
              .COMPLETED
          );

        expect(
          result.allowed
        )
          .toBe(
            false
          );

        expect(
          result.duplicate
        )
          .toBe(
            true
          );
      }
    );

    test(
      "active execution is treated as duplicate",
      async () => {
        const service =
          new ExecutionIdempotencyGateService();

        const result =
          await service
            .evaluate(
              baseInput(),
              {
                async checkIdempotency() {
                  return {
                    organizationId:
                      "org-1",

                    environmentId:
                      "env-1",

                    state:
                      "running",
                  };
                },
              }
            );

        expect(
          result.state
        )
          .toBe(
            IDEMPOTENCY_STATE
              .DUPLICATE
          );

        expect(
          result.allowed
        )
          .toBe(
            false
          );
      }
    );

    test(
      "failed execution remains blocked when retries are disabled",
      async () => {
        const service =
          new ExecutionIdempotencyGateService();

        const result =
          await service
            .evaluate(
              baseInput(),
              {
                async checkIdempotency() {
                  return {
                    organizationId:
                      "org-1",

                    environmentId:
                      "env-1",

                    state:
                      "failed",

                    attempt:
                      1,
                  };
                },
              }
            );

        expect(
          result.state
        )
          .toBe(
            IDEMPOTENCY_STATE
              .FAILED
          );

        expect(
          result.allowed
        )
          .toBe(
            false
          );
      }
    );

    test(
      "failed execution can retry when retry policy permits",
      async () => {
        const service =
          new ExecutionIdempotencyGateService();

        const result =
          await service
            .evaluate(
              baseInput({
                retryAllowed:
                  true,

                maxAttempts:
                  3,
              }),
              {
                async checkIdempotency() {
                  return {
                    organizationId:
                      "org-1",

                    environmentId:
                      "env-1",

                    state:
                      "failed",

                    attempt:
                      1,
                  };
                },
              }
            );

        expect(
          result.state
        )
          .toBe(
            IDEMPOTENCY_STATE
              .FAILED
          );

        expect(
          result.allowed
        )
          .toBe(
            true
          );

        expect(
          result.retryAllowed
        )
          .toBe(
            true
          );
      }
    );

    test(
      "retry is blocked after max attempts",
      async () => {
        const service =
          new ExecutionIdempotencyGateService();

        const result =
          await service
            .evaluate(
              baseInput({
                retryAllowed:
                  true,

                maxAttempts:
                  3,
              }),
              {
                async checkIdempotency() {
                  return {
                    organizationId:
                      "org-1",

                    environmentId:
                      "env-1",

                    state:
                      "failed",

                    attempt:
                      3,
                  };
                },
              }
            );

        expect(
          result.allowed
        )
          .toBe(
            false
          );
      }
    );

    test(
      "cross-organization idempotency record fails closed",
      async () => {
        const service =
          new ExecutionIdempotencyGateService();

        const result =
          await service
            .evaluate(
              baseInput(),
              {
                async checkIdempotency() {
                  return {
                    organizationId:
                      "org-other",

                    environmentId:
                      "env-1",

                    state:
                      "running",
                  };
                },
              }
            );

        expect(
          result.state
        )
          .toBe(
            IDEMPOTENCY_STATE
              .UNKNOWN
          );

        expect(
          result.allowed
        )
          .toBe(
            false
          );
      }
    );

    test(
      "missing idempotency provider fails closed",
      async () => {
        const service =
          new ExecutionIdempotencyGateService();

        const result =
          await service
            .evaluate(
              baseInput(),
              {}
            );

        expect(
          result.state
        )
          .toBe(
            IDEMPOTENCY_STATE
              .UNKNOWN
          );

        expect(
          result.allowed
        )
          .toBe(
            false
          );
      }
    );

    test(
      "custom idempotency key is preserved",
      async () => {
        const service =
          new ExecutionIdempotencyGateService();

        const result =
          await service
            .evaluate(
              baseInput({
                idempotencyKey:
                  "custom-key-123",
              }),
              {
                async checkIdempotency() {
                  return null;
                },
              }
            );

        expect(
          result.idempotencyKey
        )
          .toBe(
            "custom-key-123"
          );
      }
    );

    test(
      "never accepts upstream execution authorization",
      async () => {
        const service =
          new ExecutionIdempotencyGateService();

        await expect(
          service
            .evaluate({
              ...baseInput(),

              executionAuthorized:
                true,
            })
        )
          .rejects
          .toMatchObject({
            code:
              "EXECUTION_IDEMPOTENCY_UNSAFE_INPUT",
          });
      }
    );
  }
);