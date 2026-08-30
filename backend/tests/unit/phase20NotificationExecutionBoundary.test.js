"use strict";

const {
  IntegrationNotificationGateway,

  NOTIFICATION_TYPE,

  NOTIFICATION_SEVERITY,

  normalizeNotification,

  sanitizeMetadata,
} =
  require(
    "../../services/integrations/integrationNotificationGateway"
  );

const {
  IntegrationExecutionAuthorizationBoundary,
} =
  require(
    "../../services/integrations/integrationExecutionAuthorizationBoundary"
  );


function buildAuthorization(
  overrides =
    {}
) {
  return {
    authorizationId:
      "auth_123",

    organizationId:
      "aira-dev-org",

    environmentId:
      "env_aira_development",

    incidentId:
      "inc_123",

    decision:
      "AUTHORIZED",

    status:
      "AUTHORIZED",

    authorizationGranted:
      true,

    approvalState:
      "NOT_REQUIRED",

    policyState:
      "ALLOWED",

    freshnessState:
      "FRESH",

    killSwitchState:
      "ENABLED",

    lockState:
      "ACQUIRED",

    idempotencyState:
      "NEW",

    planId:
      "plan_123",

    planHash:
      "hash_123",

    executionPlan: {
      planId:
        "plan_123",

      planHash:
        "hash_123",
    },

    validFrom:
      "2026-08-30T00:00:00.000Z",

    expiresAt:
      "2026-08-30T02:00:00.000Z",

    revokedAt:
      null,

    consumedAt:
      null,

    ...overrides,
  };
}


function buildExecutionRequest(
  overrides =
    {}
) {
  return {
    executionRequestId:
      "execreq_123",

    authorizationId:
      "auth_123",

    organizationId:
      "aira-dev-org",

    environmentId:
      "env_aira_development",

    incidentId:
      "inc_123",

    state:
      "AUTHORIZED",

    planId:
      "plan_123",

    planHash:
      "hash_123",

    executionPlan: {
      planId:
        "plan_123",

      planHash:
        "hash_123",
    },

    ...overrides,
  };
}


function buildBoundary({
  authorization =
    buildAuthorization(),

  executionRequest =
    buildExecutionRequest(),
} = {}) {
  const repository = {
    findAuthorizationByIdentifier:
      jest.fn(
        async () =>
          authorization
      ),

    findExecutionRequestByIdentifier:
      jest.fn(
        async () =>
          executionRequest
      ),
  };


  const boundary =
    new IntegrationExecutionAuthorizationBoundary({
      executionAuthorizationRepository:
        repository,

      now:
        () =>
          new Date(
            "2026-08-30T01:00:00.000Z"
          ),
    });


  return {
    boundary,

    repository,
  };
}


const EXECUTION_REFERENCE = {
  organizationId:
    "aira-dev-org",

  environmentId:
    "env_aira_development",

  incidentId:
    "inc_123",

  authorizationId:
    "auth_123",

  executionRequestId:
    "execreq_123",

  planId:
    "plan_123",

  planHash:
    "hash_123",

  capability:
    "restart_service",
};


describe(
  "Phase 20.12 Integration Notification Framework",
  () => {
    test(
      "notification routes through IntegrationRuntime and remains non-authorizing",
      async () => {
        const runtime = {
          sendNotification:
            jest.fn(
              async (
                _context,
                notification
              ) => ({
                status:
                  "SUCCESS",

                data: {
                  delivered:
                    true,

                  externalMessageId:
                    "msg_123",

                  receivedType:
                    notification
                      .type,
                },

                provenance: {
                  invocationId:
                    "int_inv_notification",
                },

                observedAt:
                  "2026-08-30T01:00:00.000Z",

                executionAuthorized:
                  false,
              })
            ),
        };


        const gateway =
          new IntegrationNotificationGateway({
            runtime,

            randomUUID:
              () =>
                "notification-test",

            now:
              () =>
                new Date(
                  "2026-08-30T01:00:00.000Z"
                ),
          });


        const result =
          await gateway
            .send({
              organizationId:
                "aira-dev-org",

              environmentId:
                "env_aira_development",

              integrationId:
                "int_slack",

              provider:
                "slack",

              notification: {
                type:
                  "INCIDENT",

                severity:
                  "HIGH",

                title:
                  "Database unavailable",

                message:
                  "PostgreSQL health check failed.",

                incidentId:
                  "inc_123",
              },
            });


        expect(
          runtime
            .sendNotification
        ).toHaveBeenCalledTimes(
          1
        );


        expect(
          result.notificationId
        ).toBe(
          "ntf_notification-test"
        );


        expect(
          result.delivered
        ).toBe(
          true
        );


        expect(
          result.executionAuthorized
        ).toBe(
          false
        );
      }
    );


    test(
      "notification metadata redacts credential-bearing fields",
      () => {
        const safe =
          sanitizeMetadata({
            incidentId:
              "inc_123",

            apiKey:
              "secret-value",

            nested: {
              accessToken:
                "abc",

              status:
                "failed",
            },
          });


        expect(
          safe.apiKey
        ).toBe(
          "[REDACTED]"
        );


        expect(
          safe.nested
            .accessToken
        ).toBe(
          "[REDACTED]"
        );


        expect(
          safe.nested
            .status
        ).toBe(
          "failed"
        );
      }
    );


    test(
      "notification payload gets canonical type and severity",
      () => {
        const result =
          normalizeNotification({
            notification: {
              type:
                "incident",

              severity:
                "critical",

              title:
                "Outage",

              message:
                "API unavailable",
            },

            notificationId:
              "ntf_1",

            createdAt:
              new Date(
                "2026-08-30T00:00:00.000Z"
              ),
          });


        expect(
          result.type
        ).toBe(
          NOTIFICATION_TYPE
            .INCIDENT
        );


        expect(
          result.severity
        ).toBe(
          NOTIFICATION_SEVERITY
            .CRITICAL
        );


        expect(
          result.executionAuthorized
        ).toBe(
          false
        );
      }
    );


    test(
      "provider notification cannot grant execution authority",
      async () => {
        const gateway =
          new IntegrationNotificationGateway({
            runtime: {
              sendNotification:
                jest.fn(
                  async () => ({
                    status:
                      "SUCCESS",

                    executionAuthorized:
                      true,
                  })
                ),
            },
          });


        await expect(
          gateway
            .send({
              organizationId:
                "aira-dev-org",

              environmentId:
                "env_aira_development",

              integrationId:
                "int_slack",

              provider:
                "slack",

              notification: {
                title:
                  "Test",

                message:
                  "Test",
              },
            })
        ).rejects
          .toMatchObject({
            code:
              "INTEGRATION_NOTIFICATION_AUTHORITY_VIOLATION",

            executionAuthorized:
              false,
          });
      }
    );
  }
);


describe(
  "Phase 20.13 Deterministic executeCapability boundary",
  () => {
    test(
      "valid persisted authorization and execution request are accepted",
      async () => {
        const {
          boundary,
          repository,
        } =
          buildBoundary();


        const result =
          await boundary
            .verify(
              EXECUTION_REFERENCE
            );


        expect(
          repository
            .findAuthorizationByIdentifier
        ).toHaveBeenCalledWith(
          {
            organizationId:
              "aira-dev-org",

            environmentId:
              "env_aira_development",

            incidentId:
              "inc_123",
          },

          "auth_123"
        );


        expect(
          repository
            .findExecutionRequestByIdentifier
        ).toHaveBeenCalled();


        expect(
          result.verified
        ).toBe(
          true
        );


        expect(
          result.authorizationId
        ).toBe(
          "auth_123"
        );


        expect(
          result.executionRequestId
        ).toBe(
          "execreq_123"
        );


        expect(
          result.executionAuthorized
        ).toBe(
          false
        );
      }
    );


    test(
      "caller supplied authorized true has no meaning",
      async () => {
        const {
          boundary,
        } =
          buildBoundary({
            authorization:
              null,

            executionRequest:
              null,
          });


        await expect(
          boundary
            .verify({
              ...EXECUTION_REFERENCE,

              authorized:
                true,

              decisionId:
                "fake-decision",
            })
        ).rejects
          .toMatchObject({
            code:
              "INTEGRATION_EXECUTION_AUTHORIZATION_NOT_FOUND",

            executionAuthorized:
              false,
          });
      }
    );


    test(
      "authorization must actually be granted",
      async () => {
        const {
          boundary,
        } =
          buildBoundary({
            authorization:
              buildAuthorization({
                authorizationGranted:
                  false,

                decision:
                  "BLOCKED",

                status:
                  "BLOCKED",
              }),
          });


        await expect(
          boundary
            .verify(
              EXECUTION_REFERENCE
            )
        ).rejects
          .toMatchObject({
            code:
              "INTEGRATION_EXECUTION_NOT_AUTHORIZED",

            executionAuthorized:
              false,
          });
      }
    );


    test(
      "pending approval fails closed",
      async () => {
        const {
          boundary,
        } =
          buildBoundary({
            authorization:
              buildAuthorization({
                approvalState:
                  "PENDING",

                policyState:
                  "REQUIRES_APPROVAL",
              }),
          });


        await expect(
          boundary
            .verify(
              EXECUTION_REFERENCE
            )
        ).rejects
          .toMatchObject({
            code:
              "INTEGRATION_EXECUTION_APPROVAL_NOT_SATISFIED",

            executionAuthorized:
              false,
          });
      }
    );


    test(
      "approved policy-required execution is accepted",
      async () => {
        const {
          boundary,
        } =
          buildBoundary({
            authorization:
              buildAuthorization({
                approvalState:
                  "APPROVED",

                policyState:
                  "REQUIRES_APPROVAL",
              }),
          });


        const result =
          await boundary
            .verify(
              EXECUTION_REFERENCE
            );


        expect(
          result.verified
        ).toBe(
          true
        );


        expect(
          result.approvalState
        ).toBe(
          "APPROVED"
        );
      }
    );


    test(
      "stale authorization fails closed",
      async () => {
        const {
          boundary,
        } =
          buildBoundary({
            authorization:
              buildAuthorization({
                freshnessState:
                  "STALE",
              }),
          });


        await expect(
          boundary
            .verify(
              EXECUTION_REFERENCE
            )
        ).rejects
          .toMatchObject({
            code:
              "INTEGRATION_EXECUTION_STALE",

            executionAuthorized:
              false,
          });
      }
    );


    test(
      "kill switch blocks provider execution",
      async () => {
        const {
          boundary,
        } =
          buildBoundary({
            authorization:
              buildAuthorization({
                killSwitchState:
                  "DISABLED",
              }),
          });


        await expect(
          boundary
            .verify(
              EXECUTION_REFERENCE
            )
        ).rejects
          .toMatchObject({
            code:
              "INTEGRATION_EXECUTION_KILL_SWITCH_BLOCKED",

            executionAuthorized:
              false,
          });
      }
    );


    test(
      "expired authorization fails closed",
      async () => {
        const {
          boundary,
        } =
          buildBoundary({
            authorization:
              buildAuthorization({
                expiresAt:
                  "2026-08-30T00:30:00.000Z",
              }),
          });


        await expect(
          boundary
            .verify(
              EXECUTION_REFERENCE
            )
        ).rejects
          .toMatchObject({
            code:
              "INTEGRATION_EXECUTION_AUTHORIZATION_EXPIRED",

            executionAuthorized:
              false,
          });
      }
    );


    test(
      "revoked authorization fails closed",
      async () => {
        const {
          boundary,
        } =
          buildBoundary({
            authorization:
              buildAuthorization({
                revokedAt:
                  "2026-08-30T00:45:00.000Z",
              }),
          });


        await expect(
          boundary
            .verify(
              EXECUTION_REFERENCE
            )
        ).rejects
          .toMatchObject({
            code:
              "INTEGRATION_EXECUTION_AUTHORIZATION_REVOKED",

            executionAuthorized:
              false,
          });
      }
    );


    test(
      "execution request must link to same authorization",
      async () => {
        const {
          boundary,
        } =
          buildBoundary({
            executionRequest:
              buildExecutionRequest({
                authorizationId:
                  "auth_different",
              }),
          });


        await expect(
          boundary
            .verify(
              EXECUTION_REFERENCE
            )
        ).rejects
          .toMatchObject({
            code:
              "INTEGRATION_EXECUTION_AUTHORIZATION_LINK_MISMATCH",

            executionAuthorized:
              false,
          });
      }
    );


    test(
      "plan hash mismatch blocks execution",
      async () => {
        const {
          boundary,
        } =
          buildBoundary({
            executionRequest:
              buildExecutionRequest({
                planHash:
                  "tampered-hash",
              }),
          });


        await expect(
          boundary
            .verify(
              EXECUTION_REFERENCE
            )
        ).rejects
          .toMatchObject({
            code:
              "INTEGRATION_EXECUTION_PLAN_HASH_MISMATCH",

            executionAuthorized:
              false,
          });
      }
    );


    test(
      "completed execution request cannot execute provider capability again",
      async () => {
        const {
          boundary,
        } =
          buildBoundary({
            executionRequest:
              buildExecutionRequest({
                state:
                  "SUCCEEDED",
              }),
          });


        await expect(
          boundary
            .verify(
              EXECUTION_REFERENCE
            )
        ).rejects
          .toMatchObject({
            code:
              "INTEGRATION_EXECUTION_REQUEST_STATE_INVALID",

            executionAuthorized:
              false,
          });
      }
    );
  }
);