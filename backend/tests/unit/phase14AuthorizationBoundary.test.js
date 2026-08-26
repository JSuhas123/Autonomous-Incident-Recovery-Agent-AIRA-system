"use strict";

const {
  PERMISSIONS,
  PERMISSION_VALUES,
} =
  require(
    "../../constants/permissions"
  );


const {
  PERMISSION_SCOPES,
  PERMISSION_SCOPE_MAP,

  getPermissionScope,

  permissionRequiresEnvironment,
} =
  require(
    "../../constants/permissionScopes"
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
  authorize,

  AUTHORIZATION_DENIAL_REASONS,
} =
  require(
    "../../services/identity/centralAuthorizationService"
  );


describe(
  "Phase 14.6 enterprise authorization boundary",
  () => {

    test(
      "every canonical permission has an explicit scope",
      () => {
        for (
          const permission
          of PERMISSION_VALUES
        ) {
          expect(
            PERMISSION_SCOPE_MAP[
              permission
            ]
          ).toBeDefined();


          expect([
            PERMISSION_SCOPES
              .ORGANIZATION,

            PERMISSION_SCOPES
              .ENVIRONMENT,
          ]).toContain(
            PERMISSION_SCOPE_MAP[
              permission
            ]
          );
        }
      }
    );


    test(
      "incident permissions are environment scoped",
      () => {
        expect(
          getPermissionScope(
            PERMISSIONS
              .INCIDENT_READ
          )
        ).toBe(
          PERMISSION_SCOPES
            .ENVIRONMENT
        );


        expect(
          permissionRequiresEnvironment(
            PERMISSIONS
              .INCIDENT_MANAGE
          )
        ).toBe(
          true
        );
      }
    );


    test(
      "execution permissions are environment scoped",
      () => {
        expect(
          permissionRequiresEnvironment(
            PERMISSIONS
              .EXECUTION_EXECUTE
          )
        ).toBe(
          true
        );


        expect(
          permissionRequiresEnvironment(
            PERMISSIONS
              .EXECUTION_APPROVE
          )
        ).toBe(
          true
        );
      }
    );


    test(
      "integration permissions are environment scoped",
      () => {
        expect(
          permissionRequiresEnvironment(
            PERMISSIONS
              .INTEGRATION_READ
          )
        ).toBe(
          true
        );


        expect(
          permissionRequiresEnvironment(
            PERMISSIONS
              .INTEGRATION_MANAGE
          )
        ).toBe(
          true
        );
      }
    );


    test(
      "organization management remains organization scoped",
      () => {
        expect(
          permissionRequiresEnvironment(
            PERMISSIONS
              .ORGANIZATION_MANAGE
          )
        ).toBe(
          false
        );
      }
    );


    test(
      "team management remains organization scoped",
      () => {
        expect(
          permissionRequiresEnvironment(
            PERMISSIONS
              .TEAM_MANAGE
          )
        ).toBe(
          false
        );
      }
    );


    test(
      "owner cannot cross organization boundary",
      () => {
        const principal =
          createUserPrincipal({
            userId:
              "user-a",

            organizationId:
              "org-a",

            role:
              ORGANIZATION_ROLES
                .OWNER,
          });


        const decision =
          authorize({
            principal,

            permission:
              PERMISSIONS
                .ORGANIZATION_READ,

            organizationId:
              "org-b",
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
      "even owner requires environment when operational permission is used",
      () => {
        const principal =
          createUserPrincipal({
            userId:
              "user-a",

            organizationId:
              "org-a",

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
              "org-a",

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
      "service account cannot escape environment allow-list",
      () => {
        const principal =
          createServiceAccountPrincipal({
            serviceAccountId:
              "svc-a",

            organizationId:
              "org-a",

            permissions: [
              PERMISSIONS
                .RESOURCE_READ,
            ],

            environmentIds: [
              "env-dev",
            ],
          });


        const decision =
          authorize({
            principal,

            permission:
              PERMISSIONS
                .RESOURCE_READ,

            organizationId:
              "org-a",

            environmentId:
              "env-production",

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
      "service account cannot use unknown permission",
      () => {
        const principal =
          createServiceAccountPrincipal({
            serviceAccountId:
              "svc-a",

            organizationId:
              "org-a",

            permissions: [
              PERMISSIONS
                .INCIDENT_READ,
            ],

            environmentIds: [
              "env-dev",
            ],
          });


        const decision =
          authorize({
            principal,

            permission:
              "aira.root.everything",

            organizationId:
              "org-a",

            environmentId:
              "env-dev",

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
            .PERMISSION_UNKNOWN
        );
      }
    );
  }
);