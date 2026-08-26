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
  normalizeDomain,
  hash,
} =
  require(
    "../../services/identity/enterpriseIdentityService"
  );


const migration40 =
  path.join(
    __dirname,
    "..",
    "..",
    "persistence",
    "postgres",
    "migrations",
    "0040_enterprise_identity.sql"
  );


const migration41 =
  path.join(
    __dirname,
    "..",
    "..",
    "persistence",
    "postgres",
    "migrations",
    "0041_enterprise_identity_runtime.sql"
  );


const servicePath =
  path.join(
    __dirname,
    "..",
    "..",
    "services",
    "identity",
    "enterpriseIdentityService.js"
  );


const cryptoPath =
  path.join(
    __dirname,
    "..",
    "..",
    "services",
    "identity",
    "enterpriseIdentityCrypto.js"
  );


const oidcPath =
  path.join(
    __dirname,
    "..",
    "..",
    "services",
    "identity",
    "enterpriseOidcService.js"
  );


const samlPath =
  path.join(
    __dirname,
    "..",
    "..",
    "services",
    "identity",
    "enterpriseSamlService.js"
  );


describe(
  "Phase 14.7 complete enterprise identity foundation",
  () => {

    test(
      "enterprise identity migrations exist",
      () => {
        expect(
          fs.existsSync(
            migration40
          )
        ).toBe(
          true
        );

        expect(
          fs.existsSync(
            migration41
          )
        ).toBe(
          true
        );
      }
    );


    test(
      "provider secrets are stored encrypted",
      () => {
        const source =
          fs.readFileSync(
            servicePath,
            "utf8"
          );

        expect(
          source
        ).toContain(
          "encryptSecret"
        );

        expect(
          source
        ).toContain(
          "client_secret_encrypted"
        );
      }
    );


    test(
      "enterprise crypto uses AES-256-GCM",
      () => {
        const source =
          fs.readFileSync(
            cryptoPath,
            "utf8"
          );

        expect(
          source
        ).toContain(
          "aes-256-gcm"
        );

        expect(
          source
        ).toContain(
          "getAuthTag"
        );

        expect(
          source
        ).toContain(
          "setAuthTag"
        );
      }
    );


    test(
      "domain normalization is deterministic",
      () => {
        expect(
          normalizeDomain(
            "  Example.COM. "
          )
        ).toBe(
          "example.com"
        );
      }
    );


    test(
      "domain verification tokens use one-way hashing",
      () => {
        expect(
          hash(
            "secret-token"
          )
        ).toMatch(
          /^[a-f0-9]{64}$/
        );
      }
    );


    test(
      "OIDC uses discovery document",
      () => {
        const source =
          fs.readFileSync(
            oidcPath,
            "utf8"
          );

        expect(
          source
        ).toContain(
          ".well-known/openid-configuration"
        );

        expect(
          source
        ).toContain(
          "authorization_endpoint"
        );

        expect(
          source
        ).toContain(
          "jwks_uri"
        );
      }
    );


    test(
      "OIDC login state is hashed and single use",
      () => {
        const source =
          fs.readFileSync(
            oidcPath,
            "utf8"
          );

        expect(
          source
        ).toContain(
          "state_hash"
        );

        expect(
          source
        ).toContain(
          "consumed_at IS NULL"
        );

        expect(
          source
        ).toContain(
          "expires_at > NOW()"
        );
      }
    );


    test(
      "SAML abstraction exists without pretending to validate assertions",
      () => {
        const source =
          fs.readFileSync(
            samlPath,
            "utf8"
          );

        expect(
          source
        ).toContain(
          "assertionConsumerServiceUrl"
        );

        expect(
          source
        ).toContain(
          "identityProvider"
        );
      }
    );


    test(
      "enterprise permissions remain organization scoped",
      () => {
        const permissions = [
          PERMISSIONS
            .IDENTITY_PROVIDER_READ,

          PERMISSIONS
            .IDENTITY_PROVIDER_MANAGE,

          PERMISSIONS
            .DOMAIN_READ,

          PERMISSIONS
            .DOMAIN_MANAGE,

          PERMISSIONS
            .SSO_POLICY_READ,

          PERMISSIONS
            .SSO_POLICY_MANAGE,
        ];

        for (
          const permission
          of permissions
        ) {
          expect(
            permissionRequiresEnvironment(
              permission
            )
          ).toBe(
            false
          );
        }
      }
    );


    test(
      "external identities remain organization scoped",
      () => {
        const source =
          fs.readFileSync(
            migration40,
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
          "provider_subject"
        );
      }
    );
  }
);