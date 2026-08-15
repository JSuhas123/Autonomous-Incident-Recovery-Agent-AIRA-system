"use strict";

const {
  VerificationPlanBuilderService,
} =
  require(
    "../verificationPlanBuilderService"
  );

const {
  VERIFICATION_DIMENSION,
} =
  require(
    "../verificationContracts"
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

    executionPlan: {
      planId:
        "plan-1",

      planHash:
        "planhash-1",

      verificationHooks: [
        {
          id:
            "ready",

          type:
            "deployment_ready",

          description:
            "Deployment must become ready.",

          required:
            true,

          timeoutMs:
            30000,
        },
      ],
    },

    playbook: {
      postconditions: [
        {
          id:
            "healthy",

          type:
            "service_health",

          description:
            "Service must be healthy.",

          expectedValue:
            "healthy",
        },
      ],
    },

    incident: {
      symptoms: [
        {
          type:
            "high_cpu",

          recoveryThreshold:
            70,
        },
      ],
    },

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
  "VerificationPlanBuilderService",
  () => {
    test(
      "builds immutable verification plan",
      () => {
        const service =
          new VerificationPlanBuilderService();

        const result =
          service.build(
            baseInput()
          );

        expect(
          result.checks.length
        )
          .toBeGreaterThan(
            0
          );

        expect(
          result.planHash
        )
          .toMatch(
            /^verifyhash_/
          );

        expect(
          Object.isFrozen(
            result
          )
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
      "includes execution-plan verification hooks",
      () => {
        const service =
          new VerificationPlanBuilderService();

        const result =
          service.build(
            baseInput()
          );

        expect(
          result.checks
            .some(
              (
                check
              ) =>
                check.description ===
                "Deployment must become ready."
            )
        )
          .toBe(
            true
          );
      }
    );

    test(
      "includes playbook postconditions",
      () => {
        const service =
          new VerificationPlanBuilderService();

        const result =
          service.build(
            baseInput()
          );

        expect(
          result.checks
            .some(
              (
                check
              ) =>
                check.description ===
                "Service must be healthy."
            )
        )
          .toBe(
            true
          );
      }
    );

    test(
      "derives metric verification from CPU symptom",
      () => {
        const service =
          new VerificationPlanBuilderService();

        const result =
          service.build(
            baseInput()
          );

        const cpuCheck =
          result.checks
            .find(
              (
                check
              ) =>
                check.type ===
                "cpu_recovery"
            );

        expect(
          cpuCheck
        )
          .toBeDefined();

        expect(
          cpuCheck.dimension
        )
          .toBe(
            VERIFICATION_DIMENSION
              .METRICS
          );

        expect(
          cpuCheck.threshold
        )
          .toBe(
            70
          );
      }
    );

    test(
      "creates default health check when no verification criteria exist",
      () => {
        const service =
          new VerificationPlanBuilderService();

        const input =
          baseInput();

        input
          .executionPlan
          .verificationHooks =
          [];

        input.playbook = {
          postconditions:
            [],
        };

        input.incident = {
          symptoms:
            [],
        };

        const result =
          service.build(
            input
          );

        expect(
          result.checks
        )
          .toHaveLength(
            1
          );

        expect(
          result.checks[0]
            .type
        )
          .toBe(
            "service_health"
          );
      }
    );

    test(
      "deduplicates equivalent verification checks",
      () => {
        const service =
          new VerificationPlanBuilderService();

        const input =
          baseInput();

        input
          .executionPlan
          .verificationHooks = [
            {
              id:
                "one",

              type:
                "service_health",

              description:
                "Service must be healthy.",
            },
          ];

        input
          .playbook
          .postconditions = [
            {
              id:
                "two",

              type:
                "service_health",

              description:
                "Service must be healthy.",
            },
          ];

        input.incident = {
          symptoms:
            [],
        };

        const result =
          service.build(
            input
          );

        const matching =
          result.checks
            .filter(
              (
                check
              ) =>
                check.description ===
                "Service must be healthy."
            );

        expect(
          matching
        )
          .toHaveLength(
            1
          );
      }
    );

    test(
      "same criteria generate same verification plan hash",
      () => {
        const service =
          new VerificationPlanBuilderService();

        const first =
          service.build({
            ...baseInput(),

            verificationPlanId:
              "verify-a",
          });

        const second =
          service.build({
            ...baseInput(),

            verificationPlanId:
              "verify-b",
          });

        expect(
          first.planHash
        )
          .toBe(
            second.planHash
          );
      }
    );

    test(
      "changed verification criteria change plan hash",
      () => {
        const service =
          new VerificationPlanBuilderService();

        const first =
          service.build(
            baseInput()
          );

        const input =
          baseInput();

        input
          .playbook
          .postconditions[0]
          .expectedValue =
          "ready";

        const second =
          service.build(
            input
          );

        expect(
          first.planHash
        )
          .not
          .toBe(
            second.planHash
          );
      }
    );

    test(
      "requires execution request identity",
      () => {
        const service =
          new VerificationPlanBuilderService();

        const input =
          baseInput();

        delete input
          .executionRequestId;

        expect(
          () =>
            service.build(
              input
            )
        )
          .toThrow(
            "executionRequestId"
          );
      }
    );

    test(
      "never accepts execution authorization",
      () => {
        const service =
          new VerificationPlanBuilderService();

        expect(
          () =>
            service.build({
              ...baseInput(),

              executionAuthorized:
                true,
            })
        )
          .toThrow(
            "cannot receive execution authorization"
          );
      }
    );
  }
);