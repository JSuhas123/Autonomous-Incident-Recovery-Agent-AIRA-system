"use strict";

const {
  ExecutionAuthorizationCritic,
  AUTHORIZATION_CRITIC_DECISION,
} =
  require(
    "../executionAuthorizationCritic"
  );

const {
  AUTHORIZATION_DECISION,
  AUTHORIZATION_STATUS,
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

function authorization(
  overrides = {}
) {
  const now =
    new Date();

  return {
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

    recoveryDecisionRevision:
      1,

    selectedCandidateId:
      "candidate-1",

    selectedPlaybookId:
      "playbook-1",

    decision:
      AUTHORIZATION_DECISION
        .AUTHORIZED,

    status:
      AUTHORIZATION_STATUS
        .AUTHORIZED,

    authorizationGranted:
      true,

    approvalState:
      EXECUTION_APPROVAL_STATE
        .NOT_REQUIRED,

    policyState:
      EXECUTION_POLICY_STATE
        .ALLOWED,

    freshnessState:
      EXECUTION_FRESHNESS_STATE
        .FRESH,

    killSwitchState:
      KILL_SWITCH_STATE
        .ENABLED,

    lockState:
      EXECUTION_LOCK_STATE
        .ACQUIRED,

    idempotencyState:
      IDEMPOTENCY_STATE
        .NEW,

    validFrom:
      new Date(
        now.getTime() -
        1000
      ),

    expiresAt:
      new Date(
        now.getTime() +
        60000
      ),

    metadata: {
      planId:
        "plan-1",

      planHash:
        "planhash-test",
    },

    ...overrides,
  };
}

function plan(
  overrides = {}
) {
  return {
    planId:
      "plan-1",

    planHash:
      "planhash-test",

    organizationId:
      "org-1",

    environmentId:
      "env-1",

    incidentId:
      "incident-1",

    recoveryDecisionId:
      "recovery-1",

    recoveryDecisionRevision:
      1,

    candidateId:
      "candidate-1",

    playbookId:
      "playbook-1",

    executionAuthorized:
      false,

    ...overrides,
  };
}

function successfulTrace() {
  return [
    "freshness",
    "approval_state",
    "policy_revalidation",
    "kill_switch",
    "idempotency",
    "execution_lease",
    "execution_plan",
  ].map(
    (
      stage
    ) => ({
      stage,

      status:
        "SUCCESS",
    })
  );
}

function engineResult(
  overrides = {}
) {
  return {
    authorization:
      authorization(),

    authorizationGranted:
      true,

    executionPlan:
      plan(),

    lease: {
      acquired:
        true,

      leaseKey:
        "lease-1",

      ownerId:
        "owner-1",
    },

    idempotency: {
      state:
        IDEMPOTENCY_STATE
          .NEW,
    },

    trace:
      successfulTrace(),

    executionStarted:
      false,

    ...overrides,
  };
}

describe(
  "ExecutionAuthorizationCritic",
  () => {
    test(
      "accepts internally consistent authorization",
      async () => {
        const critic =
          new ExecutionAuthorizationCritic();

        const result =
          await critic
            .review(
              engineResult()
            );

        expect(
          result.criticDecision
        )
          .toBe(
            AUTHORIZATION_CRITIC_DECISION
              .ACCEPT
          );

        expect(
          result.accepted
        )
          .toBe(
            true
          );

        expect(
          result.authorizationGranted
        )
          .toBe(
            true
          );
      }
    );

    test(
      "rejects authorization with stale freshness state",
      async () => {
        const resultInput =
          engineResult();

        resultInput
          .authorization
          .freshnessState =
          EXECUTION_FRESHNESS_STATE
            .STALE;

        const critic =
          new ExecutionAuthorizationCritic();

        const result =
          await critic
            .review(
              resultInput
            );

        expect(
          result.rejected
        )
          .toBe(
            true
          );
      }
    );

    test(
      "rejects unauthorized approval state",
      async () => {
        const resultInput =
          engineResult();

        resultInput
          .authorization
          .approvalState =
          EXECUTION_APPROVAL_STATE
            .PENDING;

        const critic =
          new ExecutionAuthorizationCritic();

        const result =
          await critic
            .review(
              resultInput
            );

        expect(
          result.rejected
        )
          .toBe(
            true
          );
      }
    );

    test(
      "rejects non-allowed policy state",
      async () => {
        const resultInput =
          engineResult();

        resultInput
          .authorization
          .policyState =
          EXECUTION_POLICY_STATE
            .DENIED;

        const critic =
          new ExecutionAuthorizationCritic();

        const result =
          await critic
            .review(
              resultInput
            );

        expect(
          result.rejected
        )
          .toBe(
            true
          );
      }
    );

    test(
      "rejects disabled kill switch",
      async () => {
        const resultInput =
          engineResult();

        resultInput
          .authorization
          .killSwitchState =
          KILL_SWITCH_STATE
            .DISABLED;

        const critic =
          new ExecutionAuthorizationCritic();

        const result =
          await critic
            .review(
              resultInput
            );

        expect(
          result.rejected
        )
          .toBe(
            true
          );
      }
    );

    test(
      "rejects missing execution lease",
      async () => {
        const resultInput =
          engineResult({
            lease: {
              acquired:
                false,
            },
          });

        const critic =
          new ExecutionAuthorizationCritic();

        const result =
          await critic
            .review(
              resultInput
            );

        expect(
          result.rejected
        )
          .toBe(
            true
          );
      }
    );

    test(
      "rejects plan hash mismatch",
      async () => {
        const resultInput =
          engineResult();

        resultInput
          .executionPlan
          .planHash =
          "different-hash";

        const critic =
          new ExecutionAuthorizationCritic();

        const result =
          await critic
            .review(
              resultInput
            );

        expect(
          result.rejected
        )
          .toBe(
            true
          );
      }
    );

    test(
      "rejects expired authorization",
      async () => {
        const resultInput =
          engineResult();

        resultInput
          .authorization
          .expiresAt =
          new Date(
            Date.now() -
            1000
          );

        const critic =
          new ExecutionAuthorizationCritic();

        const result =
          await critic
            .review(
              resultInput
            );

        expect(
          result.rejected
        )
          .toBe(
            true
          );
      }
    );

    test(
      "rejects execution plan that independently authorizes execution",
      async () => {
        const resultInput =
          engineResult();

        resultInput
          .executionPlan
          .executionAuthorized =
          true;

        const critic =
          new ExecutionAuthorizationCritic();

        const result =
          await critic
            .review(
              resultInput
            );

        expect(
          result.rejected
        )
          .toBe(
            true
          );
      }
    );

    test(
      "rejects missing successful authorization stage",
      async () => {
        const resultInput =
          engineResult();

        resultInput.trace =
          successfulTrace()
            .filter(
              (
                stage
              ) =>
                stage.stage !==
                "execution_lease"
            );

        const critic =
          new ExecutionAuthorizationCritic();

        const result =
          await critic
            .review(
              resultInput
            );

        expect(
          result.rejected
        )
          .toBe(
            true
          );

        expect(
          result.violations
        )
          .toContain(
            "Authorized execution is missing successful stage execution_lease."
          );
      }
    );

    test(
      "rejects engine that already started execution",
      async () => {
        const critic =
          new ExecutionAuthorizationCritic();

        const result =
          await critic
            .review(
              engineResult({
                executionStarted:
                  true,
              })
            );

        expect(
          result.rejected
        )
          .toBe(
            true
          );
      }
    );

    test(
      "blocked authorization can be reviewed safely",
      async () => {
        const resultInput =
          engineResult();

        resultInput.authorization = {
          ...authorization(),

          decision:
            AUTHORIZATION_DECISION
              .BLOCKED,

          status:
            AUTHORIZATION_STATUS
              .BLOCKED,

          authorizationGranted:
            false,
        };

        resultInput.authorizationGranted =
          false;

        resultInput.executionPlan =
          null;

        resultInput.lease =
          null;

        resultInput.trace =
          [];

        const critic =
          new ExecutionAuthorizationCritic();

        const result =
          await critic
            .review(
              resultInput
            );

        expect(
          result.authorizationGranted
        )
          .toBe(
            false
          );

        expect(
          result.accepted
        )
          .toBe(
            true
          );
      }
    );
  }
);