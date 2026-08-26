"use strict";

const {
  ACTOR_TYPES,
  getActorType,
  isServiceAccountRequest,
  validateServiceAccountContext,
  serviceAccountCanAccessEnvironment,
  requireMachineEnvironmentScope,
} =
  require(
    "../../middleware/machineAuthorizationMiddleware"
  );


// ============================================================================
// HELPERS
// ============================================================================

function createNext() {
  return jest.fn();
}


// ============================================================================
// TESTS
// ============================================================================

describe(
  "Phase 14.4E machine authorization",
  () => {
    test(
      "service account remains a distinct actor type",
      () => {
        const req = {
          actor: {
            actorType:
              "SERVICE_ACCOUNT",

            organizationId:
              "org-a",

            serviceAccountId:
              "svc-a",
          },

          context: {
            actorType:
              "SERVICE_ACCOUNT",

            organizationId:
              "org-a",

            serviceAccountId:
              "svc-a",

            userId:
              null,
          },
        };

        expect(
          getActorType(
            req
          )
        ).toBe(
          ACTOR_TYPES
            .SERVICE_ACCOUNT
        );

        expect(
          isServiceAccountRequest(
            req
          )
        ).toBe(
          true
        );
      }
    );


    test(
      "service account organization mismatch fails closed",
      () => {
        const req = {
          actor: {
            actorType:
              "SERVICE_ACCOUNT",

            organizationId:
              "org-a",

            serviceAccountId:
              "svc-a",
          },

          context: {
            actorType:
              "SERVICE_ACCOUNT",

            organizationId:
              "org-b",

            serviceAccountId:
              "svc-a",

            userId:
              null,
          },
        };

        expect(
          () =>
            validateServiceAccountContext(
              req
            )
        ).toThrow(
          expect.objectContaining({
            code:
              "SERVICE_ACCOUNT_ORGANIZATION_MISMATCH",
          })
        );
      }
    );


    test(
      "service account cannot impersonate a user",
      () => {
        const req = {
          actor: {
            actorType:
              "SERVICE_ACCOUNT",

            organizationId:
              "org-a",

            serviceAccountId:
              "svc-a",
          },

          context: {
            actorType:
              "SERVICE_ACCOUNT",

            organizationId:
              "org-a",

            serviceAccountId:
              "svc-a",

            userId:
              "human-user-id",
          },
        };

        expect(
          () =>
            validateServiceAccountContext(
              req
            )
        ).toThrow(
          expect.objectContaining({
            code:
              "SERVICE_ACCOUNT_USER_IMPERSONATION_FORBIDDEN",
          })
        );
      }
    );


    test(
      "explicit environment scope allows access",
      () => {
        const req = {
          actor: {
            actorType:
              "SERVICE_ACCOUNT",

            organizationId:
              "org-a",

            serviceAccountId:
              "svc-a",

            environmentIds: [
              "env-dev",
              "env-prod",
            ],
          },

          context: {
            actorType:
              "SERVICE_ACCOUNT",

            organizationId:
              "org-a",

            serviceAccountId:
              "svc-a",

            environmentIds: [
              "env-dev",
              "env-prod",
            ],

            userId:
              null,
          },
        };

        expect(
          serviceAccountCanAccessEnvironment(
            req,
            "env-prod"
          )
        ).toBe(
          true
        );

        expect(
          serviceAccountCanAccessEnvironment(
            req,
            "env-staging"
          )
        ).toBe(
          false
        );
      }
    );


    test(
      "empty machine environment scope means no environment access",
      () => {
        const req = {
          actor: {
            actorType:
              "SERVICE_ACCOUNT",

            organizationId:
              "org-a",

            serviceAccountId:
              "svc-a",

            environmentIds:
              [],
          },

          context: {
            actorType:
              "SERVICE_ACCOUNT",

            organizationId:
              "org-a",

            serviceAccountId:
              "svc-a",

            environmentIds:
              [],

            userId:
              null,
          },
        };

        expect(
          serviceAccountCanAccessEnvironment(
            req,
            "env-prod"
          )
        ).toBe(
          false
        );
      }
    );


    test(
      "machine environment middleware rejects environment outside scope",
      () => {
        const req = {
          actor: {
            actorType:
              "SERVICE_ACCOUNT",

            organizationId:
              "org-a",

            serviceAccountId:
              "svc-a",

            environmentIds: [
              "env-dev",
            ],
          },

          context: {
            actorType:
              "SERVICE_ACCOUNT",

            organizationId:
              "org-a",

            serviceAccountId:
              "svc-a",

            environmentIds: [
              "env-dev",
            ],

            environmentId:
              "env-prod",

            userId:
              null,
          },
        };

        const next =
          createNext();

        requireMachineEnvironmentScope(
          req,
          {},
          next
        );

        expect(
          next
        ).toHaveBeenCalledTimes(
          1
        );

        const error =
          next.mock
            .calls[0][0];

        expect(
          error.code
        ).toBe(
          "SERVICE_ACCOUNT_ENVIRONMENT_FORBIDDEN"
        );

        expect(
          error.executionAuthorized
        ).toBe(
          false
        );
      }
    );


    test(
      "human actor is not restricted by machine environment scope",
      () => {
        const req = {
          actor: {
            actorType:
              "USER",
          },

          context: {
            actorType:
              "USER",

            organizationId:
              "org-a",

            userId:
              "user-a",

            environmentId:
              "env-prod",
          },
        };

        const next =
          createNext();

        requireMachineEnvironmentScope(
          req,
          {},
          next
        );

        expect(
          next
        ).toHaveBeenCalledWith();
      }
    );
  }
);