"use strict";

/**
 * ============================================================================
 * AIRA PHASE 14.2 — PERMISSION / ROLE BUNDLE INTEGRITY
 * ============================================================================
 *
 * This suite freezes the key invariants introduced during Phase 14.1/14.2.
 *
 * It protects against:
 *
 * - unknown permissions entering role bundles
 * - duplicate permissions
 * - missing system roles
 * - privilege escalation of viewer/auditor
 * - loss of owner permissions
 * - accidental coupling between approval and execution privileges
 */

const {
  ORGANIZATION_ROLES,
  ORGANIZATION_ROLE_VALUES,
} = require(
  "../../constants/roles"
);

const {
  PERMISSIONS,
  PERMISSION_VALUES,
  isKnownPermission,
} = require(
  "../../constants/permissions"
);

const {
  ROLE_PERMISSIONS,
  getPermissionsForRole,
} = require(
  "../../constants/rolePermissions"
);

const {
  can,
} = require(
  "../../services/identity/authorizationService"
);

describe(
  "Phase 14.2 permission architecture integrity",
  () => {
    test(
      "every system role has a permission bundle",
      () => {
        for (
          const role
          of ORGANIZATION_ROLE_VALUES
        ) {
          expect(
            ROLE_PERMISSIONS[
              role
            ]
          ).toBeDefined();

          expect(
            Array.isArray(
              ROLE_PERMISSIONS[
                role
              ]
            )
          ).toBe(
            true
          );
        }
      }
    );

    test(
      "every role bundle contains only canonical permissions",
      () => {
        for (
          const [
            role,
            permissions,
          ]
          of Object.entries(
            ROLE_PERMISSIONS
          )
        ) {
          for (
            const permission
            of permissions
          ) {
            expect({
              role,
              permission,
              known:
                isKnownPermission(
                  permission
                ),
            }).toMatchObject({
              known:
                true,
            });
          }
        }
      }
    );

    test(
      "role bundles contain no duplicates",
      () => {
        for (
          const [
            role,
            permissions,
          ]
          of Object.entries(
            ROLE_PERMISSIONS
          )
        ) {
          const unique =
            new Set(
              permissions
            );

          expect({
            role,
            total:
              permissions.length,
            unique:
              unique.size,
          }).toEqual({
            role,
            total:
              unique.size,
            unique:
              unique.size,
          });
        }
      }
    );

    test(
      "owner receives every canonical permission",
      () => {
        expect(
          new Set(
            getPermissionsForRole(
              ORGANIZATION_ROLES
                .OWNER
            )
          )
        ).toEqual(
          new Set(
            PERMISSION_VALUES
          )
        );
      }
    );

    test(
      "viewer remains read-only",
      () => {
        const principal = {
          role:
            ORGANIZATION_ROLES
              .VIEWER,
        };

        expect(
          can(
            principal,
            PERMISSIONS
              .INCIDENT_READ
          )
        ).toBe(
          true
        );

        expect(
          can(
            principal,
            PERMISSIONS
              .ENVIRONMENT_READ
          )
        ).toBe(
          true
        );

        expect(
          can(
            principal,
            PERMISSIONS
              .EXECUTION_READ
          )
        ).toBe(
          true
        );

        expect(
          can(
            principal,
            PERMISSIONS
              .INTEGRATION_READ
          )
        ).toBe(
          true
        );

        const forbidden = [
          PERMISSIONS
            .ORGANIZATION_MANAGE,

          PERMISSIONS
            .MEMBER_INVITE,

          PERMISSIONS
            .MEMBER_MANAGE,

          PERMISSIONS
            .TEAM_MANAGE,

          PERMISSIONS
            .ENVIRONMENT_MANAGE,

          PERMISSIONS
            .ENVIRONMENT_ARCHIVE,

          PERMISSIONS
            .INCIDENT_MANAGE,

          PERMISSIONS
            .RESOURCE_MANAGE,

          PERMISSIONS
            .EXECUTION_APPROVE,

          PERMISSIONS
            .EXECUTION_EXECUTE,

          PERMISSIONS
            .EXECUTION_CANCEL,

          PERMISSIONS
            .PLAYBOOK_CREATE,

          PERMISSIONS
            .PLAYBOOK_UPDATE,

          PERMISSIONS
            .PLAYBOOK_PUBLISH,

          PERMISSIONS
            .POLICY_MANAGE,

          PERMISSIONS
            .INTEGRATION_MANAGE,

          PERMISSIONS
            .API_KEY_MANAGE,

          PERMISSIONS
            .SERVICE_ACCOUNT_MANAGE,

          PERMISSIONS
            .BILLING_MANAGE,
        ];

        for (
          const permission
          of forbidden
        ) {
          expect(
            can(
              principal,
              permission
            )
          ).toBe(
            false
          );
        }
      }
    );

    test(
      "developer can request execution but cannot approve it",
      () => {
        const principal = {
          role:
            ORGANIZATION_ROLES
              .DEVELOPER,
        };

        expect(
          can(
            principal,
            PERMISSIONS
              .EXECUTION_EXECUTE
          )
        ).toBe(
          true
        );

        expect(
          can(
            principal,
            PERMISSIONS
              .EXECUTION_APPROVE
          )
        ).toBe(
          false
        );
      }
    );

    test(
      "security analyst can approve but cannot initiate execution",
      () => {
        const principal = {
          role:
            ORGANIZATION_ROLES
              .SECURITY_ANALYST,
        };

        expect(
          can(
            principal,
            PERMISSIONS
              .EXECUTION_APPROVE
          )
        ).toBe(
          true
        );

        expect(
          can(
            principal,
            PERMISSIONS
              .EXECUTION_EXECUTE
          )
        ).toBe(
          false
        );
      }
    );

    test(
      "platform engineer can manage integrations",
      () => {
        expect(
          can(
            {
              role:
                ORGANIZATION_ROLES
                  .PLATFORM_ENGINEER,
            },

            PERMISSIONS
              .INTEGRATION_MANAGE
          )
        ).toBe(
          true
        );
      }
    );

    test(
      "developer cannot manage integrations",
      () => {
        expect(
          can(
            {
              role:
                ORGANIZATION_ROLES
                  .DEVELOPER,
            },

            PERMISSIONS
              .INTEGRATION_MANAGE
          )
        ).toBe(
          false
        );
      }
    );

    test(
      "unknown role receives zero privileges",
      () => {
        expect(
          getPermissionsForRole(
            "super_root_hacker"
          )
        ).toEqual(
          []
        );
      }
    );

    test(
      "unknown permission fails closed",
      () => {
        expect(
          can(
            {
              role:
                ORGANIZATION_ROLES
                  .OWNER,
            },

            "aira.root.everything"
          )
        ).toBe(
          false
        );
      }
    );
  }
);