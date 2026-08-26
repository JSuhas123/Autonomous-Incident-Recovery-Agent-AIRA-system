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
  PRINCIPAL_TYPES,
  AUTHENTICATION_TYPES,
  createUserPrincipal,
  createServiceAccountPrincipal,
  resolveEffectivePermissions,
} =
  require(
    "../../services/identity/principalService"
  );


describe(
  "Phase 14.5C principal normalization",
  () => {

    test(
      "user principal resolves role permissions",
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
          principal.actorType
        ).toBe(
          PRINCIPAL_TYPES
            .USER
        );

        expect(
          principal
            .authenticationType
        ).toBe(
          AUTHENTICATION_TYPES
            .SESSION
        );

        expect(
          principal.permissions
        ).toContain(
          PERMISSIONS
            .INCIDENT_READ
        );

        expect(
          principal.permissions
        ).not.toContain(
          PERMISSIONS
            .INCIDENT_MANAGE
        );
      }
    );


    test(
      "user explicit permissions merge with role permissions",
      () => {
        const permissions =
          resolveEffectivePermissions({
            role:
              ORGANIZATION_ROLES
                .VIEWER,

            explicitPermissions: [
              PERMISSIONS
                .INCIDENT_MANAGE,
            ],
          });

        expect(
          permissions
        ).toContain(
          PERMISSIONS
            .INCIDENT_READ
        );

        expect(
          permissions
        ).toContain(
          PERMISSIONS
            .INCIDENT_MANAGE
        );
      }
    );


    test(
      "unknown explicit permission is discarded",
      () => {
        const permissions =
          resolveEffectivePermissions({
            explicitPermissions: [
              "aira.root.everything",
              PERMISSIONS
                .INCIDENT_READ,
            ],
          });

        expect(
          permissions
        ).toEqual([
          PERMISSIONS
            .INCIDENT_READ,
        ]);
      }
    );


    test(
      "service account principal never becomes human user",
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

        expect(
          principal.actorType
        ).toBe(
          PRINCIPAL_TYPES
            .SERVICE_ACCOUNT
        );

        expect(
          principal.userId
        ).toBeNull();

        expect(
          principal
            .serviceAccountId
        ).toBe(
          "svc-1"
        );

        expect(
          principal
            .authenticationType
        ).toBe(
          AUTHENTICATION_TYPES
            .API_KEY
        );
      }
    );


    test(
      "principal objects are immutable",
      () => {
        const principal =
          createServiceAccountPrincipal({
            serviceAccountId:
              "svc-1",

            organizationId:
              "org-1",
          });

        expect(
          Object.isFrozen(
            principal
          )
        ).toBe(
          true
        );
      }
    );
  }
);