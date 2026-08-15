"use strict";

const {
  ExecutionLeaseService,
} =
  require(
    "../executionLeaseService"
  );

const {
  EXECUTION_LOCK_STATE,
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

    selectedPlaybookId:
      "playbook-1",

    context: {
      service: {
        id:
          "payment-api",
      },
    },

    executionAuthorized:
      false,

    ...overrides,
  };
}

describe(
  "ExecutionLeaseService",
  () => {
    test(
      "successfully acquires execution lease",
      async () => {
        const service =
          new ExecutionLeaseService();

        const result =
          await service
            .acquire(
              baseInput(),
              {
                async acquireLock({
                  ownerId,
                }) {
                  return {
                    acquired:
                      true,

                    ownerId,
                  };
                },
              }
            );

        expect(
          result.state
        )
          .toBe(
            EXECUTION_LOCK_STATE
              .ACQUIRED
          );

        expect(
          result.acquired
        )
          .toBe(
            true
          );

        expect(
          result.leaseKey
        )
          .toMatch(
            /^execlease_/
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
      "missing lock provider fails closed",
      async () => {
        const service =
          new ExecutionLeaseService();

        const result =
          await service
            .acquire(
              baseInput(),
              {}
            );

        expect(
          result.state
        )
          .toBe(
            EXECUTION_LOCK_STATE
              .DENIED
          );

        expect(
          result.acquired
        )
          .toBe(
            false
          );
      }
    );

    test(
      "existing lock owner prevents acquisition",
      async () => {
        const service =
          new ExecutionLeaseService();

        const result =
          await service
            .acquire(
              baseInput({
                ownerId:
                  "worker-a",
              }),
              {
                async acquireLock() {
                  return {
                    acquired:
                      false,

                    ownerId:
                      "worker-b",

                    reason:
                      "Resource is already locked.",
                  };
                },
              }
            );

        expect(
          result.state
        )
          .toBe(
            EXECUTION_LOCK_STATE
              .DENIED
          );

        expect(
          result.existingOwnerId
        )
          .toBe(
            "worker-b"
          );
      }
    );

    test(
      "provider returning different owner fails closed",
      async () => {
        const service =
          new ExecutionLeaseService();

        const result =
          await service
            .acquire(
              baseInput({
                ownerId:
                  "worker-a",
              }),
              {
                async acquireLock() {
                  return {
                    acquired:
                      true,

                    ownerId:
                      "worker-other",
                  };
                },
              }
            );

        expect(
          result.acquired
        )
          .toBe(
            false
          );

        expect(
          result.state
        )
          .toBe(
            EXECUTION_LOCK_STATE
              .DENIED
          );
      }
    );

    test(
      "lease key is deterministic for same resource",
      () => {
        const service =
          new ExecutionLeaseService();

        const first =
          service.generateLeaseKey(
            baseInput()
          );

        const second =
          service.generateLeaseKey(
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
      "different resources generate different lease keys",
      () => {
        const service =
          new ExecutionLeaseService();

        const first =
          service.generateLeaseKey(
            baseInput({
              resourceId:
                "deployment-a",
            })
          );

        const second =
          service.generateLeaseKey(
            baseInput({
              resourceId:
                "deployment-b",
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
      "valid acquired lease passes validation",
      async () => {
        const service =
          new ExecutionLeaseService();

        const lease = {
          state:
            EXECUTION_LOCK_STATE
              .ACQUIRED,

          acquired:
            true,

          leaseKey:
            "lease-1",

          ownerId:
            "worker-1",

          expiresAt:
            new Date(
              Date.now() +
              60000
            ),
        };

        const result =
          await service
            .validate(
              lease,
              {
                async validateLock() {
                  return {
                    valid:
                      true,
                  };
                },
              }
            );

        expect(
          result.valid
        )
          .toBe(
            true
          );
      }
    );

    test(
      "expired lease fails validation",
      async () => {
        const service =
          new ExecutionLeaseService();

        const lease = {
          state:
            EXECUTION_LOCK_STATE
              .ACQUIRED,

          acquired:
            true,

          leaseKey:
            "lease-1",

          ownerId:
            "worker-1",

          expiresAt:
            new Date(
              Date.now() -
              1000
            ),
        };

        const result =
          await service
            .validate(
              lease
            );

        expect(
          result.state
        )
          .toBe(
            EXECUTION_LOCK_STATE
              .EXPIRED
          );

        expect(
          result.valid
        )
          .toBe(
            false
          );
      }
    );

    test(
      "lost lock ownership fails validation",
      async () => {
        const service =
          new ExecutionLeaseService();

        const lease = {
          state:
            EXECUTION_LOCK_STATE
              .ACQUIRED,

          acquired:
            true,

          leaseKey:
            "lease-1",

          ownerId:
            "worker-1",

          expiresAt:
            new Date(
              Date.now() +
              60000
            ),
        };

        const result =
          await service
            .validate(
              lease,
              {
                async validateLock() {
                  return {
                    valid:
                      false,

                    reason:
                      "Lease ownership changed.",
                  };
                },
              }
            );

        expect(
          result.valid
        )
          .toBe(
            false
          );

        expect(
          result.state
        )
          .toBe(
            EXECUTION_LOCK_STATE
              .DENIED
          );
      }
    );

    test(
      "lease can be released",
      async () => {
        const service =
          new ExecutionLeaseService();

        const result =
          await service
            .release(
              {
                leaseKey:
                  "lease-1",

                ownerId:
                  "worker-1",
              },
              {
                async releaseLock() {
                  return {
                    released:
                      true,
                  };
                },
              }
            );

        expect(
          result.state
        )
          .toBe(
            EXECUTION_LOCK_STATE
              .RELEASED
          );

        expect(
          result.released
        )
          .toBe(
            true
          );
      }
    );

    test(
      "release fails safely without provider",
      async () => {
        const service =
          new ExecutionLeaseService();

        const result =
          await service
            .release(
              {
                leaseKey:
                  "lease-1",

                ownerId:
                  "worker-1",
              }
            );

        expect(
          result.released
        )
          .toBe(
            false
          );

        expect(
          result.state
        )
          .toBe(
            EXECUTION_LOCK_STATE
              .RELEASED
          );
      }
    );

    test(
      "never accepts upstream execution authorization",
      async () => {
        const service =
          new ExecutionLeaseService();

        await expect(
          service
            .acquire({
              ...baseInput(),

              executionAuthorized:
                true,
            })
        )
          .rejects
          .toMatchObject({
            code:
              "EXECUTION_LEASE_UNSAFE_INPUT",
          });
      }
    );
  }
);