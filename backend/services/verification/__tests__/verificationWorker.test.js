"use strict";

const {
  VerificationWorker,
} =
  require(
    "../../../workers/verificationWorker"
  );

function executionRequest(
  overrides = {}
) {
  return {
    executionRequestId:
      "request-1",

    authorizationId:
      "auth-1",

    organizationId:
      "org-1",

    environmentId:
      "env-1",

    incidentId:
      "incident-1",

    recoveryDecisionId:
      "recovery-1",

    playbookId:
      "playbook-1",

    state:
      "SUCCEEDED",

    planId:
      "plan-1",

    planHash:
      "planhash-1",

    attempt:
      1,

    maxAttempts:
      3,

    executionPlan: {
      planId:
        "plan-1",

      planHash:
        "planhash-1",

      verificationHooks:
        [],
    },

    result: {
      success:
        true,

      rollbackRequired:
        false,
    },

    metadata: {},

    ...overrides,
  };
}

function repository(
  request
) {
  return {
    findOne:
      jest.fn(
        async () =>
          request
      ),
  };
}

function queue() {
  return {
    publishStarted:
      jest.fn(),

    publishCompleted:
      jest.fn(),

    publishFailed:
      jest.fn(),

    publishBlocked:
      jest.fn(),
  };
}

describe(
  "VerificationWorker",
  () => {
    test(
      "blocks execution request that is still running",
      async () => {
        const q =
          queue();

        const worker =
          new VerificationWorker({
            ExecutionRequest:
              repository(
                executionRequest({
                  state:
                    "RUNNING",
                })
              ),

            queue:
              q,
          });

        const result =
          await worker.process({
            executionRequestId:
              "request-1",

            organizationId:
              "org-1",

            environmentId:
              "env-1",

            incidentId:
              "incident-1",
          });

        expect(
          result.blocked
        )
          .toBe(
            true
          );

        expect(
          result.verificationStarted
        )
          .toBe(
            false
          );

        expect(
          q.publishBlocked
        )
          .toHaveBeenCalled();
      }
    );

    test(
      "blocks request without immutable execution plan",
      async () => {
        const worker =
          new VerificationWorker({
            ExecutionRequest:
              repository(
                executionRequest({
                  executionPlan:
                    null,
                })
              ),

            queue:
              queue(),
          });

        const result =
          await worker.process({
            executionRequestId:
              "request-1",

            organizationId:
              "org-1",

            environmentId:
              "env-1",

            incidentId:
              "incident-1",
          });

        expect(
          result.blocked
        )
          .toBe(
            true
          );
      }
    );

    test(
      "never accepts execution authorization",
      async () => {
        const worker =
          new VerificationWorker({
            ExecutionRequest:
              repository(
                executionRequest()
              ),
          });

        await expect(
          worker.process({
            executionRequestId:
              "request-1",

            organizationId:
              "org-1",

            environmentId:
              "env-1",

            incidentId:
              "incident-1",

            executionAuthorized:
              true,
          })
        )
          .rejects
          .toMatchObject({
            code:
              "VERIFICATION_JOB_UNSAFE_INPUT",
          });
      }
    );

    test(
      "successful lifecycle remains side-effect free",
      async () => {
        const q =
          queue();

        const worker =
          new VerificationWorker({
            ExecutionRequest:
              repository(
                executionRequest()
              ),

            planBuilder: {
              build:
                jest.fn(
                  () => ({
                    verificationPlanId:
                      "verify-plan-1",

                    planHash:
                      "verify-hash-1",

                    checks:
                      [],

                    executionAuthorized:
                      false,
                  })
                ),
            },

            healthVerifier: {
              verify:
                jest.fn(
                  async () => ({
                    checks:
                      [],

                    passedCount:
                      0,

                    failedCount:
                      0,

                    inconclusiveCount:
                      0,
                  })
                ),
            },

            metricsVerifier: {
              verify:
                jest.fn(
                  async () => ({
                    checks:
                      [],

                    passedCount:
                      0,

                    failedCount:
                      0,

                    inconclusiveCount:
                      0,
                  })
                ),
            },

            logVerifier: {
              verify:
                jest.fn(
                  async () => ({
                    checks:
                      [],

                    passedCount:
                      0,

                    failedCount:
                      0,

                    inconclusiveCount:
                      0,
                  })
                ),
            },

            incidentVerifier: {
              verify:
                jest.fn(
                  async () => ({
                    checks:
                      [],

                    passedCount:
                      0,

                    failedCount:
                      0,

                    inconclusiveCount:
                      0,
                  })
                ),
            },

            aggregator: {
              aggregate:
                jest.fn(
                  () => ({
                    verificationPlanId:
                      "verify-plan-1",

                    verificationPlanHash:
                      "verify-hash-1",

                    checks:
                      [],

                    totals: {
                      planned:
                        0,

                      collected:
                        0,

                      completed:
                        0,

                      passed:
                        0,

                      failed:
                        0,

                      inconclusive:
                        0,
                    },

                    required: {
                      planned:
                        0,

                      passed:
                        0,

                      failed:
                        0,

                      missing:
                        0,

                      inconclusive:
                        0,
                    },

                    completeness:
                      0,

                    requiredCoverage:
                      1,

                    requiredSuccessRate:
                      1,

                    averageScore:
                      null,

                    hasConflicts:
                      false,

                    conflicts:
                      [],

                    warnings:
                      [],

                    complete:
                      true,

                    executionAuthorized:
                      false,
                  })
                ),
            },

            decisionEngine: {
              decide:
                jest.fn(
                  () => ({
                    verificationId:
                      "verification-1",

                    decision:
                      "INCONCLUSIVE",

                    confidence:
                      "LOW",

                    nextAction:
                      "COLLECT_MORE_EVIDENCE",

                    executionAuthorized:
                      false,
                  })
                ),
            },

            critic: {
              review:
                jest.fn(
                  () => ({
                    accepted:
                      true,

                    rejected:
                      false,

                    requiresManualReview:
                      false,

                    recoveryConfirmed:
                      false,

                    executionAuthorized:
                      false,
                  })
                ),
            },

            router: {
              route:
                jest.fn(
                  () => ({
                    route:
                      "COLLECT_MORE_EVIDENCE",

                    ready:
                      true,

                    executionAuthorized:
                      false,
                  })
                ),
            },

            persistence: {
              persist:
                jest.fn(
                  async () => ({
                    incidentClosureEligible:
                      false,

                    executionAuthorized:
                      false,
                  })
                ),
            },

            queue:
              q,
          });

        const result =
          await worker.process({
            executionRequestId:
              "request-1",

            organizationId:
              "org-1",

            environmentId:
              "env-1",

            incidentId:
              "incident-1",
          });

        expect(
          result.processed
        )
          .toBe(
            true
          );

        expect(
          result.verificationStarted
        )
          .toBe(
            true
          );

        expect(
          result.incidentClosed
        )
          .toBe(
            false
          );

        expect(
          result.retryStarted
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
          result.executionAuthorized
        )
          .toBe(
            false
          );

        expect(
          q.publishCompleted
        )
          .toHaveBeenCalled();
      }
    );
  }
);