"use strict";

/**
 * Mock audit persistence before authorizationMiddleware is imported.
 *
 * These unit tests validate authorization behavior, not PostgreSQL audit
 * persistence. Audit persistence already has its own test suites.
 */
jest.mock(
  "../../services/identity/identityAuditService",
  () => ({
    record:
      jest
        .fn()
        .mockResolvedValue({
          recorded:
            true,

          executionAuthorized:
            false,
        }),
  })
);

const {
  ORGANIZATION_ROLES,
} = require(
  "../../constants/roles"
);

const {
  PERMISSIONS,
  PERMISSION_VALUES,
} = require(
  "../../constants/permissions"
);

const {
  getPermissionsForRole,
} = require(
  "../../constants/rolePermissions"
);

const {
  resolvePermissions,
  can,
  canAll,
  canAny,
  assertCan,
} = require(
  "../../services/identity/authorizationService"
);

const {
  requirePermission,
} = require(
  "../../middleware/authorizationMiddleware"
);

const IdentityAuditService =
  require(
    "../../services/identity/identityAuditService"
  );

describe(
  "Phase 14.1 fine-grained authorization foundation",
  () => {
    beforeEach(
      () => {
        jest
          .clearAllMocks();
      }
    );

    test(
      "owner receives every registered permission",
      () => {
        const ownerPermissions =
          getPermissionsForRole(
            ORGANIZATION_ROLES
              .OWNER
          );

        expect(
          new Set(
            ownerPermissions
          )
        ).toEqual(
          new Set(
            PERMISSION_VALUES
          )
        );
      }
    );

    test(
      "viewer is read-only for execution",
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
              .EXECUTION_READ
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
      "platform engineer can manage environments but cannot archive them",
      () => {
        const principal = {
          role:
            ORGANIZATION_ROLES
              .PLATFORM_ENGINEER,
        };

        expect(
          can(
            principal,
            PERMISSIONS
              .ENVIRONMENT_MANAGE
          )
        ).toBe(
          true
        );

        expect(
          can(
            principal,
            PERMISSIONS
              .ENVIRONMENT_ARCHIVE
          )
        ).toBe(
          false
        );
      }
    );

    test(
      "unknown role fails closed",
      () => {
        expect(
          resolvePermissions({
            role:
              "made_up_role",
          })
        ).toEqual(
          []
        );
      }
    );

    test(
      "unknown explicit permissions are discarded",
      () => {
        const permissions =
          resolvePermissions({
            permissions: [
              PERMISSIONS
                .INCIDENT_READ,

              "root.everything",
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
      "legacy machine scopes are not automatically promoted to enterprise permissions",
      () => {
        const permissions =
          resolvePermissions({
            scopes: [
              "read:*",
              "write:*",
            ],
          });

        expect(
          permissions
        ).toEqual(
          []
        );
      }
    );

    test(
      "canAll and canAny evaluate permission bundles correctly",
      () => {
        const principal = {
          role:
            ORGANIZATION_ROLES
              .SECURITY_ANALYST,
        };

        expect(
          canAll(
            principal,
            [
              PERMISSIONS
                .INCIDENT_READ,

              PERMISSIONS
                .AUDIT_READ,
            ]
          )
        ).toBe(
          true
        );

        expect(
          canAny(
            principal,
            [
              PERMISSIONS
                .BILLING_MANAGE,

              PERMISSIONS
                .POLICY_MANAGE,
            ]
          )
        ).toBe(
          true
        );
      }
    );

    test(
      "assertCan throws stable PERMISSION_DENIED error",
      () => {
        expect(
          () =>
            assertCan(
              {
                role:
                  ORGANIZATION_ROLES
                    .VIEWER,
              },

              PERMISSIONS
                .EXECUTION_EXECUTE
            )
        ).toThrow(
          expect
            .objectContaining({
              code:
                "PERMISSION_DENIED",

              status:
                403,

              executionAuthorized:
                false,
            })
        );
      }
    );

    test(
      "permission middleware allows authorized request",
      () => {
        const middleware =
          requirePermission(
            PERMISSIONS
              .ENVIRONMENT_MANAGE
          );

        const req = {
          context: {
            role:
              ORGANIZATION_ROLES
                .ADMIN,
          },
        };

        const next =
          jest.fn();

        middleware(
          req,
          {},
          next
        );

        expect(
          next
        ).toHaveBeenCalledTimes(
          1
        );

        expect(
          next
        ).toHaveBeenCalledWith();

        expect(
          IdentityAuditService
            .record
        ).not
          .toHaveBeenCalled();
      }
    );

    test(
      "permission middleware denies and audits unauthorized request",
      () => {
        const middleware =
          requirePermission(
            PERMISSIONS
              .ENVIRONMENT_MANAGE
          );

        const req = {
          method:
            "POST",

          path:
            "/api/v1/environments",

          originalUrl:
            "/api/v1/environments",

          correlationId:
            "req-phase14-1",

          context: {
            authenticationType:
              "user_session",

            role:
              ORGANIZATION_ROLES
                .VIEWER,

            userId:
              "user-1",

            organizationId:
              "org-1",

            sessionId:
              "session-1",

            requestId:
              "req-phase14-1",
          },
        };

        const next =
          jest.fn();

        middleware(
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
          next
            .mock
            .calls[0][0];

        expect(
          error
        ).toMatchObject({
          status:
            403,

          code:
            "PERMISSION_DENIED",

          executionAuthorized:
            false,
        });

        expect(
          IdentityAuditService
            .record
        ).toHaveBeenCalledTimes(
          1
        );
      }
    );
  }
);