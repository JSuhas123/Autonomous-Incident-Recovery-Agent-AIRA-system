"use strict";

const fs =
  require(
    "fs"
  );

const path =
  require(
    "path"
  );

const {
  PERMISSION_VALUES,
} =
  require(
    "../../constants/permissions"
  );

const {
  PERMISSION_SCOPE_MAP,
  PERMISSION_SCOPES,
} =
  require(
    "../../constants/permissionScopes"
  );

const {
  ROLE_PERMISSIONS,
} =
  require(
    "../../constants/rolePermissions"
  );

const {
  ORGANIZATION_ROLE_VALUES,
} =
  require(
    "../../constants/roles"
  );


const serverPath =
  path.join(
    __dirname,
    "..",
    "..",
    "server.js"
  );


describe(
  "Phase 14 final architecture certification",
  () => {

    test(
      "every canonical permission has an explicit authorization scope",
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
      "every canonical organization role has a permission bundle",
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
      "role bundles never contain unknown permissions",
      () => {
        const canonical =
          new Set(
            PERMISSION_VALUES
          );


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
              valid:
                canonical.has(
                  permission
                ),
            }).toMatchObject({
              valid:
                true,
            });
          }
        }
      }
    );


    test(
      "role bundles contain no duplicate permissions",
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
          expect({
            role,

            permissionCount:
              permissions.length,

            uniqueCount:
              new Set(
                permissions
              ).size,
          }).toEqual({
            role,

            permissionCount:
              new Set(
                permissions
              ).size,

            uniqueCount:
              new Set(
                permissions
              ).size,
          });
        }
      }
    );


    test(
      "Phase 14 control-plane routes are mounted",
      () => {
        const source =
          fs.readFileSync(
            serverPath,
            "utf8"
          );


        const expectedRoutes = [
          "enterprise-identity",
          "tenant-settings",
          "integration-governance",
          "notification-routing",
          "human-tasks",
          "onboarding",
          "audit-control",
        ];


        for (
          const route
          of expectedRoutes
        ) {
          expect(
            source
          ).toContain(
            route
          );
        }
      }
    );


    test(
      "Phase 14 server retains centralized authorization infrastructure",
      () => {
        const source =
          fs.readFileSync(
            path.join(
              __dirname,
              "..",
              "..",
              "middleware",
              "authorizationMiddleware.js"
            ),
            "utf8"
          );


        expect(
          source
        ).toContain(
          "centralAuthorizationService"
        );


        expect(
          source
        ).toContain(
          "principalFromRequest"
        );


        expect(
          source
        ).toContain(
          "permissionRequiresEnvironment"
        );
      }
    );
  }
);