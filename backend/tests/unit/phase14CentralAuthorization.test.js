"use strict";

const {
  PERMISSIONS,
} =
  require(
    "../../constants/permissions"
  );

const {
  ORGANIZATION_ROLES,
} =
  require(
    "../../constants/roles"
  );

const {
  createUserPrincipal,
  createServiceAccountPrincipal,
} =
  require(
    "../../services/identity/principalService"
  );

const {
  AUTHORIZATION_DECISIONS,
  AUTHORIZATION_DENIAL_REASONS,

  authorize,
  assertAuthorized,
} =
  require(
    "../../services/identity/centralAuthorizationService"
  );


describe(
  "Phase 14.6 central authorization",
  () => {

    test(
      "allows canonical human permission inside organization",
      () => {
        const principal =
          createUserPrincipal({
            userId:
              "user-1",

            organizationId:
              "org-1",

            role:
              ORGANIZATION_ROLES
                .VIEWER,
          });


        const decision =
          authorize({
            principal,

            permission:
              PERMISSIONS
                .INCIDENT_READ,

            organizationId:
              "org-1",
          });


        expect(
          decision.allowed
        ).toBe(
          true
        );

        expect(
          decision.decision
        ).toBe(
          AUTHORIZATION_DECISIONS
            .ALLOW
        );

        expect(
          decision.executionAuthorized
        ).toBe(
          true
        );
      }
    );


    test(
      "denies permission absent from role",
      () => {
        const principal =
          createUserPrincipal({
            userId:
              "user-1",

            organizationId:
              "org-1",

            role:
              ORGANIZATION_ROLES
                .VIEWER,
          });


        const decision =
          authorize({
            principal,

            permission:
              PERMISSIONS
                .INCIDENT_MANAGE,

            organizationId:
              "org-1",
          });


        expect(
          decision.allowed
        ).toBe(
          false
        );

        expect(
          decision.reason
        ).toBe(
          AUTHORIZATION_DENIAL_REASONS
            .PERMISSION_DENIED
        );
      }
    );


    test(
      "cross-organization access fails closed",
      () => {
        const principal =
          createUserPrincipal({
            userId:
              "user-1",

            organizationId:
              "org-1",

            role:
              ORGANIZATION_ROLES
                .OWNER,
          });


        const decision =
          authorize({
            principal,

            permission:
              PERMISSIONS
                .INCIDENT_READ,

            organizationId:
              "org-2",
          });


        expect(
          decision.allowed
        ).toBe(
          false
        );

        expect(
          decision.reason
        ).toBe(
          AUTHORIZATION_DENIAL_REASONS
            .ORGANIZATION_SCOPE_MISMATCH
        );
      }
    );


    test(
      "unknown permission fails closed",
      () => {
        const principal =
          createUserPrincipal({
            userId:
              "user-1",

            organizationId:
              "org-1",

            role:
              ORGANIZATION_ROLES
                .OWNER,
          });


        const decision =
          authorize({
            principal,

            permission:
              "aira.root.everything",

            organizationId:
              "org-1",
          });


        expect(
          decision.allowed
        ).toBe(
          false
        );

        expect(
          decision.reason
        ).toBe(
          AUTHORIZATION_DENIAL_REASONS
            .PERMISSION_UNKNOWN
        );
      }
    );


    test(
      "service account is limited to assigned environments",
      () => {
        const principal =
          createServiceAccountPrincipal({
            serviceAccountId:
              "svc-1",

            organizationId:
              "org-1",

            permissions: [
              PERMISSIONS
                .INCIDENT_READ,
            ],

            environmentIds: [
              "env-1",
            ],

            apiKeyId:
              "key-1",
          });


        const allowed =
          authorize({
            principal,

            permission:
              PERMISSIONS
                .INCIDENT_READ,

            organizationId:
              "org-1",

            environmentId:
              "env-1",

            requireEnvironment:
              true,
          });


        expect(
          allowed.allowed
        ).toBe(
          true
        );


        const denied =
          authorize({
            principal,

            permission:
              PERMISSIONS
                .INCIDENT_READ,

            organizationId:
              "org-1",

            environmentId:
              "env-2",

            requireEnvironment:
              true,
          });


        expect(
          denied.allowed
        ).toBe(
          false
        );

        expect(
          denied.reason
        ).toBe(
          AUTHORIZATION_DENIAL_REASONS
            .ENVIRONMENT_SCOPE_DENIED
        );
      }
    );


    test(
      "service account with empty environment scope cannot access environment",
      () => {
        const principal =
          createServiceAccountPrincipal({
            serviceAccountId:
              "svc-1",

            organizationId:
              "org-1",

            permissions: [
              PERMISSIONS
                .INCIDENT_READ,
            ],

            environmentIds:
              [],

            apiKeyId:
              "key-1",
          });


        const decision =
          authorize({
            principal,

            permission:
              PERMISSIONS
                .INCIDENT_READ,

            organizationId:
              "org-1",

            environmentId:
              "env-1",

            requireEnvironment:
              true,
          });


        expect(
          decision.allowed
        ).toBe(
          false
        );

        expect(
          decision.reason
        ).toBe(
          AUTHORIZATION_DENIAL_REASONS
            .ENVIRONMENT_SCOPE_DENIED
        );
      }
    );


    test(
      "required environment must be supplied",
      () => {
        const principal =
          createUserPrincipal({
            userId:
              "user-1",

            organizationId:
              "org-1",

            role:
              ORGANIZATION_ROLES
                .OWNER,
          });


        const decision =
          authorize({
            principal,

            permission:
              PERMISSIONS
                .INCIDENT_READ,

            organizationId:
              "org-1",

            requireEnvironment:
              true,
          });


        expect(
          decision.allowed
        ).toBe(
          false
        );

        expect(
          decision.reason
        ).toBe(
          AUTHORIZATION_DENIAL_REASONS
            .ENVIRONMENT_SCOPE_REQUIRED
        );
      }
    );


    test(
      "assertAuthorized throws fail-closed authorization error",
      () => {
        const principal =
          createUserPrincipal({
            userId:
              "user-1",

            organizationId:
              "org-1",

            role:
              ORGANIZATION_ROLES
                .VIEWER,
          });


        expect(
          () =>
            assertAuthorized({
              principal,

              permission:
                PERMISSIONS
                  .ORGANIZATION_MANAGE,

              organizationId:
                "org-1",
            })
        ).toThrow(
          expect.objectContaining({
            status:
              403,

            code:
              "PERMISSION_DENIED",

            executionAuthorized:
              false,
          })
        );
      }
    );
  }
);