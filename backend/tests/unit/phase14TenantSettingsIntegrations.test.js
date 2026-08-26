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
  permissionRequiresEnvironment,
} =
  require(
    "../../constants/permissionScopes"
  );

const {
  AUTONOMY_MODES,
  validateOrganizationSettings,
} =
  require(
    "../../services/identity/tenantRuntimeSettingsService"
  );


const migration42 =
  path.join(
    __dirname,
    "..",
    "..",
    "persistence",
    "postgres",
    "migrations",
    "0042_tenant_runtime_settings.sql"
  );


const migration43 =
  path.join(
    __dirname,
    "..",
    "..",
    "persistence",
    "postgres",
    "migrations",
    "0043_integration_governance.sql"
  );


const integrationMiddleware =
  path.join(
    __dirname,
    "..",
    "..",
    "middleware",
    "integrationOwnershipMiddleware.js"
  );


describe(
  "Phase 14.8 + 14.9 tenant runtime and integration ownership",
  () => {

    test(
      "both control-plane migrations exist",
      () => {
        expect(
          fs.existsSync(
            migration42
          )
        ).toBe(
          true
        );

        expect(
          fs.existsSync(
            migration43
          )
        ).toBe(
          true
        );
      }
    );


    test(
      "tenant autonomy modes are explicit",
      () => {
        expect(
          AUTONOMY_MODES
        ).toEqual(
          expect.objectContaining({
            OBSERVE_ONLY:
              "observe_only",

            RECOMMEND_ONLY:
              "recommend_only",

            APPROVAL_REQUIRED:
              "approval_required",

            AUTONOMOUS:
              "autonomous",
          })
        );
      }
    );


    test(
      "invalid autonomy confidence fails closed",
      () => {
        expect(
          () =>
            validateOrganizationSettings({
              minimumConfidenceForAutonomy:
                1.5,
            })
        ).toThrow(
          expect.objectContaining({
            code:
              "AUTONOMY_CONFIDENCE_INVALID",

            executionAuthorized:
              false,
          })
        );
      }
    );


    test(
      "production autonomy has explicit tenant switch",
      () => {
        const source =
          fs.readFileSync(
            migration42,
            "utf8"
          );

        expect(
          source
        ).toContain(
          "allow_production_autonomy"
        );

        expect(
          source
        ).toContain(
          "require_approval_for_production"
        );
      }
    );


    test(
      "environment runtime settings are database tenant protected",
      () => {
        const source =
          fs.readFileSync(
            migration42,
            "utf8"
          );

        expect(
          source
        ).toContain(
          "aira_validate_environment_runtime_scope"
        );

        expect(
          source
        ).toContain(
          "environment runtime settings organization mismatch"
        );
      }
    );


    test(
      "integration governance does not duplicate credentials",
      () => {
        const source =
          fs.readFileSync(
            migration43,
            "utf8"
          );

        expect(
          source
        ).toContain(
          "connection_governance"
        );

        expect(
          source
        ).not.toMatch(
          /\bpassword\b/i
        );

        expect(
          source
        ).not.toMatch(
          /\baccess_token\b/i
        );

        expect(
          source
        ).not.toMatch(
          /\bclient_secret\b/i
        );
      }
    );


    test(
      "integration governance is environment scoped",
      () => {
        expect(
          permissionRequiresEnvironment(
            PERMISSIONS
              .INTEGRATION_GOVERNANCE_READ
          )
        ).toBe(
          true
        );

        expect(
          permissionRequiresEnvironment(
            PERMISSIONS
              .INTEGRATION_GOVERNANCE_MANAGE
          )
        ).toBe(
          true
        );
      }
    );


    test(
      "credential permission is separately environment scoped",
      () => {
        expect(
          permissionRequiresEnvironment(
            PERMISSIONS
              .INTEGRATION_CREDENTIALS_MANAGE
          )
        ).toBe(
          true
        );
      }
    );


    test(
      "tenant settings remain organization scoped",
      () => {
        expect(
          permissionRequiresEnvironment(
            PERMISSIONS
              .TENANT_SETTINGS_MANAGE
          )
        ).toBe(
          false
        );

        expect(
          permissionRequiresEnvironment(
            PERMISSIONS
              .AUTONOMY_MANAGE
          )
        ).toBe(
          false
        );
      }
    );


    test(
      "integration ownership middleware requires both organization and environment",
      () => {
        const source =
          fs.readFileSync(
            integrationMiddleware,
            "utf8"
          );

        expect(
          source
        ).toContain(
          "organizationId"
        );

        expect(
          source
        ).toContain(
          "environmentId"
        );

        expect(
          source
        ).toContain(
          "INTEGRATION_ENVIRONMENT_REQUIRED"
        );
      }
    );
  }
);