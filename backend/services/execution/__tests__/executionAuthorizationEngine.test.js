"use strict";

const {
  ExecutionAuthorizationEngine,
} =
  require(
    "../executionAuthorizationEngine"
  );

const {
  AUTHORIZATION_DECISION,
  EXECUTION_APPROVAL_STATE,
  EXECUTION_POLICY_STATE,
  EXECUTION_FRESHNESS_STATE,
  KILL_SWITCH_STATE,
  EXECUTION_LOCK_STATE,
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

    diagnosisId:
      "diagnosis-1",

    diagnosisRevision:
      2,

    selectedCandidateId:
      "candidate-1",

    selectedPlaybookId:
      "playbook-1",

    recoveryDecision: {
      decisionId:
        "recovery-1",

      revision:
        3,

      approvalRequired:
        false,

      policyStatus:
        "eligible",

      generatedAt:
        new Date(),

      executionAuthorized:
        false,
    },

    selectedCandidate: {
      candidateId:
        "candidate-1",

      playbookId:
        "playbook-1",

      metadata: {
        actionType:
          "restart_deployment",
      },

      executionAuthorized:
        false,
    },

    playbook: {
      playbookId:
        "playbook-1",

      version:
        "1.0.0",

      requiredParameters:
        [],

      steps: [
        {
          id:
            "step-1",

          action:
            "restart_deployment",
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

function passingServices() {
  return {
    freshnessService: {
      async validate() {
        return {
          state:
            EXECUTION_FRESHNESS_STATE
              .FRESH,

          fresh:
            true,

          reasons:
            [],

          warnings:
            [],

          executionAuthorized:
            false,
        };
      },
    },

    approvalService: {
      async resolve() {
        return {
          state:
            EXECUTION_APPROVAL_STATE
              .NOT_REQUIRED,

          satisfied:
            true,

          reasons:
            [],

          warnings:
            [],

          executionAuthorized:
            false,
        };
      },
    },

    policyService: {
      async validate() {
        return {
          state:
            EXECUTION_POLICY_STATE
              .ALLOWED,

          allowed:
            true,

          reasons:
            [],

          warnings:
            [],

          executionAuthorized:
            false,
        };
      },
    },

    killSwitchService: {
      async evaluate() {
        return {
          state:
            KILL_SWITCH_STATE
              .ENABLED,

          allowed:
            true,

          reasons:
            [],

          warnings:
            [],

          executionAuthorized:
            false,
        };
      },
    },

    idempotencyService: {
      async evaluate() {
        return {
          state:
            IDEMPOTENCY_STATE
              .NEW,

          allowed:
            true,

          idempotencyKey:
            "idem-1",

          reasons:
            [],

          warnings:
            [],

          executionAuthorized:
            false,
        };
      },
    },

    leaseService: {
      async acquire() {
        return {
          state:
            EXECUTION_LOCK_STATE
              .ACQUIRED,

          acquired:
            true,

          leaseKey:
            "lease-1",

          ownerId:
            "owner-1",

          reasons:
            [],

          warnings:
            [],

          executionAuthorized:
            false,
        };
      },

      async release() {
        return {
          released:
            true,
        };
      },
    },

    planBuilder: {
      build() {
        return Object.freeze({
          planId:
            "plan-1",

          planHash:
            "planhash-1",

          executionAuthorized:
            false,
        });
      },
    },
  };
}

describe(
  "ExecutionAuthorizationEngine",
  () => {
    test(
      "authorizes only when every gate passes",
      async () => {
        const engine =
          new ExecutionAuthorizationEngine(
            passingServices()
          );

        const result =
          await engine
            .authorize(
              baseInput()
            );

        expect(
          result
            .authorization
            .decision
        )
          .toBe(
            AUTHORIZATION_DECISION
              .AUTHORIZED
          );

        expect(
          result.authorizationGranted
        )
          .toBe(
            true
          );

        expect(
          result
            .authorization
            .authorizationGranted
        )
          .toBe(
            true
          );

        expect(
          result.executionStarted
        )
          .toBe(
            false
          );

        expect(
          result.executionPlan
        )
          .toBeDefined();
      }
    );

    test(
      "stale recovery decision is not authorized",
      async () => {
        const services =
          passingServices();

        services.freshnessService = {
          async validate() {
            return {
              state:
                EXECUTION_FRESHNESS_STATE
                  .STALE,

              fresh:
                false,

              reasons: [
                "Decision superseded.",
              ],

              warnings:
                [],
            };
          },
        };

        const engine =
          new ExecutionAuthorizationEngine(
            services
          );

        const result =
          await engine
            .authorize(
              baseInput()
            );

        expect(
          result.authorizationGranted
        )
          .toBe(
            false
          );

        expect(
          result
            .authorization
            .decision
        )
          .toBe(
            AUTHORIZATION_DECISION
              .STALE
          );
      }
    );

    test(
      "expired recovery decision returns EXPIRED",
      async () => {
        const services =
          passingServices();

        services.freshnessService = {
          async validate() {
            return {
              state:
                EXECUTION_FRESHNESS_STATE
                  .EXPIRED,

              fresh:
                false,

              reasons: [
                "Expired.",
              ],

              warnings:
                [],
            };
          },
        };

        const engine =
          new ExecutionAuthorizationEngine(
            services
          );

        const result =
          await engine
            .authorize(
              baseInput()
            );

        expect(
          result
            .authorization
            .decision
        )
          .toBe(
            AUTHORIZATION_DECISION
              .EXPIRED
          );
      }
    );

    test(
      "pending required approval returns REQUIRES_APPROVAL",
      async () => {
        const services =
          passingServices();

        services.approvalService = {
          async resolve() {
            return {
              state:
                EXECUTION_APPROVAL_STATE
                  .PENDING,

              satisfied:
                false,

              reasons: [
                "Approval pending.",
              ],

              warnings:
                [],
            };
          },
        };

        const input =
          baseInput();

        input
          .recoveryDecision
          .approvalRequired =
          true;

        const engine =
          new ExecutionAuthorizationEngine(
            services
          );

        const result =
          await engine
            .authorize(
              input
            );

        expect(
          result
            .authorization
            .decision
        )
          .toBe(
            AUTHORIZATION_DECISION
              .REQUIRES_APPROVAL
          );

        expect(
          result.authorizationGranted
        )
          .toBe(
            false
          );
      }
    );

    test(
      "policy denial blocks authorization",
      async () => {
        const services =
          passingServices();

        services.policyService = {
          async validate() {
            return {
              state:
                EXECUTION_POLICY_STATE
                  .DENIED,

              allowed:
                false,

              reasons: [
                "Policy denied.",
              ],

              warnings:
                [],
            };
          },
        };

        const engine =
          new ExecutionAuthorizationEngine(
            services
          );

        const result =
          await engine
            .authorize(
              baseInput()
            );

        expect(
          result
            .authorization
            .decision
        )
          .toBe(
            AUTHORIZATION_DECISION
              .BLOCKED
          );
      }
    );

    test(
      "kill switch blocks authorization",
      async () => {
        const services =
          passingServices();

        services.killSwitchService = {
          async evaluate() {
            return {
              state:
                KILL_SWITCH_STATE
                  .DISABLED,

              allowed:
                false,

              reasons: [
                "Kill switch disabled.",
              ],

              warnings:
                [],
            };
          },
        };

        const engine =
          new ExecutionAuthorizationEngine(
            services
          );

        const result =
          await engine
            .authorize(
              baseInput()
            );

        expect(
          result.authorizationGranted
        )
          .toBe(
            false
          );
      }
    );

    test(
      "duplicate execution is blocked",
      async () => {
        const services =
          passingServices();

        services.idempotencyService = {
          async evaluate() {
            return {
              state:
                IDEMPOTENCY_STATE
                  .DUPLICATE,

              allowed:
                false,

              reasons: [
                "Execution already active.",
              ],

              warnings:
                [],
            };
          },
        };

        const engine =
          new ExecutionAuthorizationEngine(
            services
          );

        const result =
          await engine
            .authorize(
              baseInput()
            );

        expect(
          result.authorizationGranted
        )
          .toBe(
            false
          );
      }
    );

    test(
      "lease failure blocks authorization",
      async () => {
        const services =
          passingServices();

        services.leaseService = {
          async acquire() {
            return {
              state:
                EXECUTION_LOCK_STATE
                  .DENIED,

              acquired:
                false,

              reasons: [
                "Resource already locked.",
              ],

              warnings:
                [],
            };
          },
        };

        const engine =
          new ExecutionAuthorizationEngine(
            services
          );

        const result =
          await engine
            .authorize(
              baseInput()
            );

        expect(
          result.authorizationGranted
        )
          .toBe(
            false
          );
      }
    );

    test(
      "plan-builder failure releases acquired lease",
      async () => {
        const services =
          passingServices();

        let released =
          false;

        services.leaseService = {
          async acquire() {
            return {
              state:
                EXECUTION_LOCK_STATE
                  .ACQUIRED,

              acquired:
                true,

              leaseKey:
                "lease-1",

              ownerId:
                "owner-1",

              reasons:
                [],

              warnings:
                [],
            };
          },

          async release() {
            released =
              true;

            return {
              released:
                true,
            };
          },
        };

        services.planBuilder = {
          build() {
            throw new Error(
              "Plan invalid"
            );
          },
        };

        const engine =
          new ExecutionAuthorizationEngine(
            services
          );

        await expect(
          engine.authorize(
            baseInput()
          )
        )
          .rejects
          .toThrow(
            "Plan invalid"
          );

        expect(
          released
        )
          .toBe(
            true
          );
      }
    );

    test(
      "successful authorization records all seven stages",
      async () => {
        const engine =
          new ExecutionAuthorizationEngine(
            passingServices()
          );

        const result =
          await engine
            .authorize(
              baseInput()
            );

        expect(
          result.trace
        )
          .toHaveLength(
            7
          );

        expect(
          result.trace
            .every(
              (
                stage
              ) =>
                stage.status ===
                "SUCCESS"
            )
        )
          .toBe(
            true
          );
      }
    );

    test(
      "authorization contains bounded lifetime",
      async () => {
        const engine =
          new ExecutionAuthorizationEngine({
            ...passingServices(),

            authorizationTtlMs:
              30000,
          });

        const result =
          await engine
            .authorize(
              baseInput()
            );

        expect(
          result
            .authorization
            .validFrom
        )
          .toBeInstanceOf(
            Date
          );

        expect(
          result
            .authorization
            .expiresAt
        )
          .toBeInstanceOf(
            Date
          );

        expect(
          result
            .authorization
            .expiresAt
            .getTime()
        )
          .toBeGreaterThan(
            result
              .authorization
              .validFrom
              .getTime()
          );
      }
    );

    test(
      "never accepts execution authorization from Phase 7",
      async () => {
        const engine =
          new ExecutionAuthorizationEngine(
            passingServices()
          );

        await expect(
          engine.authorize({
            ...baseInput(),

            executionAuthorized:
              true,
          })
        )
          .rejects
          .toMatchObject({
            code:
              "EXECUTION_AUTHORIZATION_ENGINE_UNSAFE_INPUT",
          });
      }
    );
  }
);