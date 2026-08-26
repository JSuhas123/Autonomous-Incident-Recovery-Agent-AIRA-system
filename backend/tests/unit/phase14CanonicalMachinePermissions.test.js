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
  PERMISSIONS,
} =
  require(
    "../../constants/permissions"
  );

const {
  normalizeAndValidatePermissions,
} =
  require(
    "../../services/identity/serviceAccountService"
  );


const routePath =
  path.join(
    __dirname,
    "..",
    "..",
    "routes",
    "serviceAccountRoutes.js"
  );


const servicePath =
  path.join(
    __dirname,
    "..",
    "..",
    "services",
    "identity",
    "serviceAccountService.js"
  );


describe(
  "Phase 14.5B canonical machine permissions",
  () => {

    test(
      "canonical service-account permissions are accepted",
      () => {
        expect(
          normalizeAndValidatePermissions([
            PERMISSIONS
              .INCIDENT_READ,

            PERMISSIONS
              .EXECUTION_READ,

            PERMISSIONS
              .INCIDENT_READ,
          ])
        ).toEqual([
          PERMISSIONS
            .INCIDENT_READ,

          PERMISSIONS
            .EXECUTION_READ,
        ]);
      }
    );


    test(
      "unknown service-account permission fails closed",
      () => {
        expect(
          () =>
            normalizeAndValidatePermissions([
              PERMISSIONS
                .INCIDENT_READ,

              "aira.root.everything",
            ])
        ).toThrow(
          expect.objectContaining({
            code:
              "SERVICE_ACCOUNT_PERMISSION_UNKNOWN",

            status:
              422,

            executionAuthorized:
              false,
          })
        );
      }
    );


    test(
      "machine identity routes no longer use permission fallbacks",
      () => {
        const source =
          fs.readFileSync(
            routePath,
            "utf8"
          );

        expect(
          source
        ).not.toMatch(
          /SERVICE_ACCOUNT_MANAGE\s*\|\|/
        );

        expect(
          source
        ).not.toMatch(
          /SERVICE_ACCOUNT_READ\s*\|\|/
        );

        expect(
          source
        ).not.toMatch(
          /API_KEY_MANAGE\s*\|\|/
        );

        expect(
          source
        ).not.toMatch(
          /API_KEY_READ\s*\|\|/
        );

        expect(
          source
        ).not.toMatch(
          /ORGANIZATION_MANAGE\s*\|\|/
        );
      }
    );


    test(
      "API key management requires API_KEY_MANAGE",
      () => {
        const source =
          fs.readFileSync(
            routePath,
            "utf8"
          );

        expect(
          source
        ).toContain(
          "API_KEY_MANAGE"
        );

        expect(
          source
        ).toContain(
          "API_KEY_READ"
        );
      }
    );


    test(
      "authenticated machine permissions are normalized canonically",
      () => {
        const source =
          fs.readFileSync(
            servicePath,
            "utf8"
          );

        expect(
          source
        ).toContain(
          "normalizePermissions"
        );

        expect(
          source
        ).toContain(
          "isKnownPermission"
        );
      }
    );
  }
);