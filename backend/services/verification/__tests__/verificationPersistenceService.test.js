"use strict";

const {
  VerificationPersistenceService,
} =
  require(
    "../verificationPersistenceService"
  );

const {
  VERIFICATION_DECISION,
  VERIFICATION_CONFIDENCE,
  VERIFICATION_NEXT_ACTION,
} =
  require(
    "../verificationContracts"
  );

const {
  RECOVERY_ROUTE,
  RECOVERY_ROUTE_STATUS,
} =
  require(
    "../recoveryOutcomeRoutingService"
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

    executionRequestId:
      "request-1",

    authorizationId:
      "auth-1",

    recoveryDecisionId:
      "recovery-1",

    verificationPlan: {
      verificationPlanId:
        "verify-plan-1",

      planHash:
        "verify-hash-1",

      checks:
        [],

      executionAuthorized:
        false,
    },

    evidencePackage: {
      verificationPlanId:
        "verify-plan-1",

      verificationPlanHash:
        "verify-hash-1",

      organizationId:
        "org-1",

      environmentId:
        "env-1",

      incidentId:
        "incident-1",

      executionRequestId:
        "request-1",

      checks:
        [],

      complete:
        true,

      requiredCoverage:
        1,

      requiredSuccessRate:
        1,

      executionAuthorized:
        false,
    },

    decisionResult: {
      verificationId:
        "verification-1",

      organizationId:
        "org-1",

      environmentId:
        "env-1",

      incidentId:
        "incident-1",

      executionRequestId:
        "request-1",

      authorizationId:
        "auth-1",

      recoveryDecisionId:
        "recovery-1",

      decision:
        VERIFICATION_DECISION
          .RECOVERED,

      confidence:
        VERIFICATION_CONFIDENCE
          .HIGH,

      nextAction:
        VERIFICATION_NEXT_ACTION
          .CLOSE_INCIDENT,

      recovered:
        true,

      overallScore:
        1,

      metadata: {
        verificationPlanId:
          "verify-plan-1",

        verificationPlanHash:
          "verify-hash-1",
      },

      executionAuthorized:
        false,
    },

    criticResult: {
      criticDecision:
        "ACCEPT",

      accepted:
        true,

      rejected:
        false,

      requiresManualReview:
        false,

      recoveryConfirmed:
        true,

      violations:
        [],

      warnings:
        [],

      executionAuthorized:
        false,
    },

    routingResult: {
      route:
        RECOVERY_ROUTE
          .CLOSE_INCIDENT,

      status:
        RECOVERY_ROUTE_STATUS
          .READY,

      ready:
        true,

      blocked:
        false,

      requiresOperator:
        false,

      incidentClosed:
        false,

      retryStarted:
        false,

      rollbackStarted:
        false,

      executionAuthorized:
        false,
    },

    executionAuthorized:
      false,

    ...overrides,
  };
}

describe(
  "VerificationPersistenceService",
  () => {
    test(
      "requires verification persistence input",
      async () => {
        const service =
          new VerificationPersistenceService();

        await expect(
          service.persist()
        )
          .rejects
          .toMatchObject({
            code:
              "VERIFICATION_PERSISTENCE_INPUT_REQUIRED",
          });
      }
    );

    test(
      "requires execution request identity",
      async () => {
        const service =
          new VerificationPersistenceService();

        const input =
          baseInput();

        delete input
          .executionRequestId;

        await expect(
          service.persist(
            input
          )
        )
          .rejects
          .toMatchObject({
            code:
              "VERIFICATION_PERSISTENCE_EXECUTION_REQUEST_REQUIRED",
          });
      }
    );

    test(
      "requires verification plan",
      async () => {
        const service =
          new VerificationPersistenceService();

        const input =
          baseInput();

        delete input
          .verificationPlan;

        await expect(
          service.persist(
            input
          )
        )
          .rejects
          .toMatchObject({
            code:
              "VERIFICATION_PERSISTENCE_PLAN_REQUIRED",
          });
      }
    );

    test(
      "requires evidence package",
      async () => {
        const service =
          new VerificationPersistenceService();

        const input =
          baseInput();

        delete input
          .evidencePackage;

        await expect(
          service.persist(
            input
          )
        )
          .rejects
          .toMatchObject({
            code:
              "VERIFICATION_PERSISTENCE_EVIDENCE_REQUIRED",
          });
      }
    );

    test(
      "requires critic result",
      async () => {
        const service =
          new VerificationPersistenceService();

        const input =
          baseInput();

        delete input
          .criticResult;

        await expect(
          service.persist(
            input
          )
        )
          .rejects
          .toMatchObject({
            code:
              "VERIFICATION_PERSISTENCE_CRITIC_REQUIRED",
          });
      }
    );

    test(
      "requires routing result",
      async () => {
        const service =
          new VerificationPersistenceService();

        const input =
          baseInput();

        delete input
          .routingResult;

        await expect(
          service.persist(
            input
          )
        )
          .rejects
          .toMatchObject({
            code:
              "VERIFICATION_PERSISTENCE_ROUTING_REQUIRED",
          });
      }
    );

    test(
      "detects evidence plan hash mismatch",
      async () => {
        const service =
          new VerificationPersistenceService();

        const input =
          baseInput();

        input
          .evidencePackage
          .verificationPlanHash =
          "different-hash";

        await expect(
          service.persist(
            input
          )
        )
          .rejects
          .toMatchObject({
            code:
              "VERIFICATION_PERSISTENCE_PLAN_HASH_MISMATCH",
          });
      }
    );

    test(
      "detects decision plan hash mismatch",
      async () => {
        const service =
          new VerificationPersistenceService();

        const input =
          baseInput();

        input
          .decisionResult
          .metadata
          .verificationPlanHash =
          "different-hash";

        await expect(
          service.persist(
            input
          )
        )
          .rejects
          .toMatchObject({
            code:
              "VERIFICATION_PERSISTENCE_DECISION_PLAN_MISMATCH",
          });
      }
    );

    test(
      "generates unique verification run IDs",
      () => {
        const service =
          new VerificationPersistenceService();

        const first =
          service
            .generateRunId(
              baseInput()
            );

        const second =
          service
            .generateRunId(
              baseInput()
            );

        expect(
          first
        )
          .toMatch(
            /^verifyrun_/
          );

        expect(
          second
        )
          .toMatch(
            /^verifyrun_/
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
      "never accepts execution authorization",
      async () => {
        const service =
          new VerificationPersistenceService();

        await expect(
          service.persist({
            ...baseInput(),

            executionAuthorized:
              true,
          })
        )
          .rejects
          .toMatchObject({
            code:
              "VERIFICATION_PERSISTENCE_UNSAFE_INPUT",
          });
      }
    );
  }
);