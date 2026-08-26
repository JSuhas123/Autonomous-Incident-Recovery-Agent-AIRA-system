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


const migrationPath =
  path.join(
    __dirname,
    "..",
    "..",
    "persistence",
    "postgres",
    "migrations",
    "0040_enterprise_identity.sql"
  );


describe(
  "Phase 14.7A enterprise identity foundation",
  () => {

    test(
      "enterprise identity migration exists",
      () => {
        expect(
          fs.existsSync(
            migrationPath
          )
        ).toBe(
          true
        );
      }
    );


    test(
      "migration defines provider infrastructure",
      () => {
        const source =
          fs.readFileSync(
            migrationPath,
            "utf8"
          );

        expect(
          source
        ).toContain(
          "identity.identity_providers"
        );

        expect(
          source
        ).toContain(
          "identity.organization_domains"
        );

        expect(
          source
        ).toContain(
          "identity.organization_authentication_policies"
        );

        expect(
          source
        ).toContain(
          "identity.external_identities"
        );
      }
    );


    test(
      "OIDC and SAML are supported provider types",
      () => {
        const source =
          fs.readFileSync(
            migrationPath,
            "utf8"
          );

        expect(
          source
        ).toContain(
          "'oidc'"
        );

        expect(
          source
        ).toContain(
          "'saml'"
        );
      }
    );


    test(
      "external identity is tenant protected",
      () => {
        const source =
          fs.readFileSync(
            migrationPath,
            "utf8"
          );

        expect(
          source
        ).toContain(
          "aira_validate_external_identity_scope"
        );

        expect(
          source
        ).toContain(
          "external identity organization does not match provider organization"
        );
      }
    );


    test(
      "enterprise identity permissions are organization scoped",
      () => {
        expect(
          permissionRequiresEnvironment(
            PERMISSIONS
              .IDENTITY_PROVIDER_MANAGE
          )
        ).toBe(
          false
        );

        expect(
          permissionRequiresEnvironment(
            PERMISSIONS
              .SSO_POLICY_MANAGE
          )
        ).toBe(
          false
        );

        expect(
          permissionRequiresEnvironment(
            PERMISSIONS
              .DOMAIN_MANAGE
          )
        ).toBe(
          false
        );
      }
    );
  }
);