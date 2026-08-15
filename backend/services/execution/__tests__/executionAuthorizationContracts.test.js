"use strict";

const {
  AUTHORIZATION_DECISION,
  AUTHORIZATION_STATUS,
  EXECUTION_APPROVAL_STATE,
  EXECUTION_POLICY_STATE,
  EXECUTION_FRESHNESS_STATE,
  KILL_SWITCH_STATE,
  EXECUTION_LOCK_STATE,
  IDEMPOTENCY_STATE,
  EXECUTION_REQUEST_STATE,
  createExecutionAuthorization,
  createExecutionRequest,
  assertExecutionAuthorization,
} =
  require(
    "../executionAuthorizationContracts"
  );

describe(
  "Execution Authorization Contracts",
  () => {
    test(
      "creates blocked authorization by default",
      () => {
        const result =
          createExecutionAuthorization({
            organizationId:
              "org-1",

            environmentId:
              "env-1",

            incidentId:
              "incident-1",

            recoveryDecisionId:
              "recovery-1",
          });

        expect(
          result.decision
        )
          .toBe(
            AUTHORIZATION_DECISION
              .BLOCKED
          );

        expect(
          result.status
        )
          .toBe(
            AUTHORIZATION_STATUS
              .BLOCKED
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
      "creates valid authorized result only with authorized decision and status",
      () => {
        const result =
          createExecutionAuthorization({
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
          });

        expect(
          result.authorizationGranted
        )
          .toBe(
            true
          );

        expect(
          result.authorizedAt
        )
          .toBeInstanceOf(
            Date
          );
      }
    );

    test(
      "does not authorize when decision is authorized but status is blocked",
      () => {
        const result =
          createExecutionAuthorization({
            organizationId:
              "org-1",

            environmentId:
              "env-1",

            incidentId:
              "incident-1",

            recoveryDecisionId:
              "recovery-1",

            decision:
              AUTHORIZATION_DECISION
                .AUTHORIZED,

            status:
              AUTHORIZATION_STATUS
                .BLOCKED,
          });

        expect(
          result.authorizationGranted
        )
          .toBe(
            false
          );
      }
    );

    test(
      "creates execution request in CREATED state",
      () => {
        const result =
          createExecutionRequest({
            executionRequestId:
              "exec-1",

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

            candidateId:
              "candidate-1",

            playbookId:
              "playbook-1",

            parameters: {
              namespace:
                "production",
            },
          });

        expect(
          result.state
        )
          .toBe(
            EXECUTION_REQUEST_STATE
              .CREATED
          );

        expect(
          result.attempt
        )
          .toBe(
            0
          );

        expect(
          result.maxAttempts
        )
          .toBe(
            1
          );
      }
    );

    test(
      "authorization invariant requires scope",
      () => {
        const authorization =
          createExecutionAuthorization({
            recoveryDecisionId:
              "recovery-1",
          });

        expect(
          () =>
            assertExecutionAuthorization(
              authorization
            )
        )
          .toThrow(
            "organization, environment and incident scope"
          );
      }
    );

    test(
      "authorization invariant requires recovery decision",
      () => {
        const authorization =
          createExecutionAuthorization({
            organizationId:
              "org-1",

            environmentId:
              "env-1",

            incidentId:
              "incident-1",
          });

        expect(
          () =>
            assertExecutionAuthorization(
              authorization
            )
        )
          .toThrow(
            "recoveryDecisionId"
          );
      }
    );

    test(
      "valid blocked authorization passes structural validation",
      () => {
        const authorization =
          createExecutionAuthorization({
            organizationId:
              "org-1",

            environmentId:
              "env-1",

            incidentId:
              "incident-1",

            recoveryDecisionId:
              "recovery-1",

            decision:
              AUTHORIZATION_DECISION
                .BLOCKED,

            status:
              AUTHORIZATION_STATUS
                .BLOCKED,
          });

        expect(
          assertExecutionAuthorization(
            authorization
          )
        )
          .toBe(
            true
          );
      }
    );

    test(
      "exports all execution state contracts",
      () => {
        expect(
          EXECUTION_APPROVAL_STATE
            .APPROVED
        )
          .toBe(
            "APPROVED"
          );

        expect(
          EXECUTION_POLICY_STATE
            .DENIED
        )
          .toBe(
            "DENIED"
          );

        expect(
          EXECUTION_FRESHNESS_STATE
            .STALE
        )
          .toBe(
            "STALE"
          );

        expect(
          KILL_SWITCH_STATE
            .EMERGENCY_MODE
        )
          .toBe(
            "EMERGENCY_MODE"
          );

        expect(
          EXECUTION_LOCK_STATE
            .ACQUIRED
        )
          .toBe(
            "ACQUIRED"
          );

        expect(
          IDEMPOTENCY_STATE
            .DUPLICATE
        )
          .toBe(
            "DUPLICATE"
          );

        expect(
          EXECUTION_REQUEST_STATE
            .ROLLBACK_REQUIRED
        )
          .toBe(
            "ROLLBACK_REQUIRED"
          );
      }
    );
  }
);