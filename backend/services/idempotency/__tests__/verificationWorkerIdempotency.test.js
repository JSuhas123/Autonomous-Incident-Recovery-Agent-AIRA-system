"use strict";

const {
  IDEMPOTENCY_OPERATION,
} =
  require(
    "../idempotencyContracts"
  );

describe(
  "Verification Worker Idempotency",
  () => {
    let VerificationWorker;

    beforeAll(
      () => {
        ({
          VerificationWorker,
        } =
          require(
            "../../../workers/verificationWorker"
          ));
      }
    );

    function baseJob(
      overrides = {}
    ) {
      return {
        organizationId:
          "org-1",

        environmentId:
          "prod",

        incidentId:
          "incident-1",

        executionRequestId:
          "execution-1",

        verificationId:
          "verification-1",

        verificationPlanId:
          "verify-plan-1",

        verificationPlanHash:
          "verify-hash-1",

        verificationPlan: {
          planId:
            "verify-plan-1",

          planHash:
            "verify-hash-1",
        },

        executionResult: {
          executionRequestId:
            "execution-1",

          success:
            true,
        },

        executionAuthorized:
          false,

        ...overrides,
      };
    }

    test(
      "uses VERIFICATION idempotency identity",
      async () => {
        const idempotentWorker = {
          run:
            jest.fn(
              async () => ({
                executed:
                  false,

                duplicate:
                  true,

                decision:
                  "DUPLICATE_PROCESSING",

                executionAuthorized:
                  false,
              })
            ),
        };

        const worker =
          new VerificationWorker({
            idempotentWorker,

            workerId:
              "verification-test",
          });

        await worker.process(
          baseJob()
        );

        const input =
          idempotentWorker
            .run
            .mock
            .calls[0][0];

        expect(
          input.identity
        )
          .toEqual({
            organizationId:
              "org-1",

            environmentId:
              "prod",

            operation:
              IDEMPOTENCY_OPERATION
                .VERIFICATION,

            executionRequestId:
              "execution-1",

            verificationPlanId:
              "verify-plan-1",

            verificationPlanHash:
              "verify-hash-1",
          });
      }
    );

    test(
      "duplicate processing does not run verification",
      async () => {
        const idempotentWorker = {
          run:
            jest.fn(
              async () => ({
                executed:
                  false,

                duplicate:
                  true,

                decision:
                  "DUPLICATE_PROCESSING",
              })
            ),
        };

        const worker =
          new VerificationWorker({
            idempotentWorker,
          });

        worker.processVerification =
          jest.fn();

        const result =
          await worker.process(
            baseJob()
          );

        expect(
          worker.processVerification
        )
          .not
          .toHaveBeenCalled();

        expect(
          result.verificationPerformed
        )
          .toBe(
            false
          );
      }
    );

    test(
      "duplicate completed returns previous result",
      async () => {
        const previousResult = {
          decision:
            "RECOVERED",
        };

        const idempotentWorker = {
          run:
            jest.fn(
              async () => ({
                executed:
                  false,

                duplicate:
                  true,

                decision:
                  "DUPLICATE_COMPLETED",

                previousResult,
              })
            ),
        };

        const worker =
          new VerificationWorker({
            idempotentWorker,
          });

        worker.processVerification =
          jest.fn();

        const result =
          await worker.process(
            baseJob()
          );

        expect(
          result.previousResult
        )
          .toEqual(
            previousResult
          );

        expect(
          worker.processVerification
        )
          .not
          .toHaveBeenCalled();
      }
    );

    test(
      "acquired claim runs existing verification logic once",
      async () => {
        const idempotentWorker = {
          run:
            jest.fn(
              async (
                input
              ) => ({
                executed:
                  true,

                duplicate:
                  false,

                decision:
                  "ACQUIRED",

                result:
                  await input.handler(),
              })
            ),
        };

        const worker =
          new VerificationWorker({
            idempotentWorker,
          });

        worker.processVerification =
          jest.fn(
            async () => ({
              decision:
                "RECOVERED",
            })
          );

        const result =
          await worker.process(
            baseJob()
          );

        expect(
          worker.processVerification
        )
          .toHaveBeenCalledTimes(
            1
          );

        expect(
          result.verificationPerformed
        )
          .toBe(
            true
          );
      }
    );

    test(
      "verification plan hash participates in identity",
      async () => {
        const identities =
          [];

        const idempotentWorker = {
          run:
            jest.fn(
              async (
                input
              ) => {
                identities.push(
                  input.identity
                );

                return {
                  executed:
                    false,

                  decision:
                    "DUPLICATE_PROCESSING",
                };
              }
            ),
        };

        const worker =
          new VerificationWorker({
            idempotentWorker,
          });

        await worker.process(
          baseJob()
        );

        await worker.process(
          baseJob({
            verificationPlanHash:
              "verify-hash-2",

            verificationPlan: {
              planId:
                "verify-plan-1",

              planHash:
                "verify-hash-2",
            },
          })
        );

        expect(
          identities[0]
            .verificationPlanHash
        )
          .not
          .toBe(
            identities[1]
              .verificationPlanHash
          );
      }
    );

    test(
      "missing immutable verification identity is rejected",
      async () => {
        const worker =
          new VerificationWorker({
            idempotentWorker: {
              run:
                jest.fn(),
            },
          });

        await expect(
          worker.process(
            baseJob({
              verificationPlanHash:
                null,

              verificationPlan:
                {},
            })
          )
        )
          .rejects
          .toMatchObject({
            code:
              "VERIFICATION_JOB_IDENTITY_REQUIRED",
          });
      }
    );

    test(
      "wrapper never exposes execution authorization",
      async () => {
        const idempotentWorker = {
          run:
            jest.fn(
              async () => ({
                executed:
                  false,

                duplicate:
                  true,

                decision:
                  "DUPLICATE_COMPLETED",
              })
            ),
        };

        const worker =
          new VerificationWorker({
            idempotentWorker,
          });

        const result =
          await worker.process(
            baseJob()
          );

        expect(
          result.executionAuthorized
        )
          .toBe(
            false
          );
      }
    );
  }
);