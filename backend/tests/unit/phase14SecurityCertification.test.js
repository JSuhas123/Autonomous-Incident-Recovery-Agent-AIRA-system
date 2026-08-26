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

const {
  sanitizeMetadata,
} =
  require(
    "../../services/identity/identityAuditService"
  );


// ============================================================================
// SOURCE PATHS
// ============================================================================

const integrationRoutesPath =
  path.join(
    __dirname,
    "..",
    "..",
    "routes",
    "integrationRoutes.js"
  );


const humanTaskServicePath =
  path.join(
    __dirname,
    "..",
    "..",
    "services",
    "humanOperations",
    "humanTaskService.js"
  );


const notificationServicePath =
  path.join(
    __dirname,
    "..",
    "..",
    "services",
    "notifications",
    "notificationRoutingService.js"
  );


const enterpriseIdentityServicePath =
  path.join(
    __dirname,
    "..",
    "..",
    "services",
    "identity",
    "enterpriseIdentityService.js"
  );


const onboardingServicePath =
  path.join(
    __dirname,
    "..",
    "..",
    "services",
    "onboarding",
    "onboardingService.js"
  );


const authorizationMiddlewarePath =
  path.join(
    __dirname,
    "..",
    "..",
    "middleware",
    "authorizationMiddleware.js"
  );


const migration40Path =
  path.join(
    __dirname,
    "..",
    "..",
    "persistence",
    "postgres",
    "migrations",
    "0040_enterprise_identity.sql"
  );


const migration42Path =
  path.join(
    __dirname,
    "..",
    "..",
    "persistence",
    "postgres",
    "migrations",
    "0042_tenant_runtime_settings.sql"
  );


const migration43Path =
  path.join(
    __dirname,
    "..",
    "..",
    "persistence",
    "postgres",
    "migrations",
    "0043_integration_governance.sql"
  );


const migration44Path =
  path.join(
    __dirname,
    "..",
    "..",
    "persistence",
    "postgres",
    "migrations",
    "0044_notification_routing.sql"
  );


const migration45Path =
  path.join(
    __dirname,
    "..",
    "..",
    "persistence",
    "postgres",
    "migrations",
    "0045_human_tasks.sql"
  );


const migration46Path =
  path.join(
    __dirname,
    "..",
    "..",
    "persistence",
    "postgres",
    "migrations",
    "0046_saas_onboarding.sql"
  );


const migration47Path =
  path.join(
    __dirname,
    "..",
    "..",
    "persistence",
    "postgres",
    "migrations",
    "0047_audit_completeness.sql"
  );


// ============================================================================
// CERTIFICATION
// ============================================================================

describe(
  "Phase 14.14 cross-tenant security certification",
  () => {

    // ========================================================================
    // CENTRAL AUTHORIZATION
    // ========================================================================

    test(
      "organization owner cannot cross tenant boundary",
      () => {
        const principal =
          createUserPrincipal({
            userId:
              "user-org-a",

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


        expect(
          decision.executionAuthorized
        ).toBe(
          false
        );
      }
    );


    test(
      "owner privilege does not bypass environment requirement",
      () => {
        const principal =
          createUserPrincipal({
            userId:
              "owner-a",

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
      "unknown permission cannot bypass owner role",
      () => {
        const principal =
          createUserPrincipal({
            userId:
              "owner-a",

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
              "aira.security.root",

            organizationId:
              "org-a",
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


    // ========================================================================
    // MACHINE IDENTITY ESCAPE TESTS
    // ========================================================================

    test(
      "service account cannot cross organization boundary",
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
              "env-a",
            ],

            apiKeyId:
              "key-a",
          });


        const decision =
          authorize({
            principal,

            permission:
              PERMISSIONS
                .INCIDENT_READ,

            organizationId:
              "org-b",

            environmentId:
              "env-a",

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
            .ORGANIZATION_SCOPE_MISMATCH
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
              "env-development",
            ],

            apiKeyId:
              "key-a",
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
      "service account with empty environment list gets no environment access",
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

            environmentIds:
              [],

            apiKeyId:
              "key-a",
          });


        const decision =
          authorize({
            principal,

            permission:
              PERMISSIONS
                .INCIDENT_READ,

            organizationId:
              "org-a",

            environmentId:
              "env-a",

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


    // ========================================================================
    // AUTHORIZATION MIDDLEWARE CERTIFICATION
    // ========================================================================

    test(
      "normal authorization middleware delegates to central engine",
      () => {
        const source =
          fs.readFileSync(
            authorizationMiddlewarePath,
            "utf8"
          );


        expect(
          source
        ).toContain(
          "centralAuthorizationService"
        );


        expect(
          source
        ).toMatch(
          /\bauthorize\s*\(/
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
      }
    );


    // ========================================================================
    // INTEGRATION TENANT ISOLATION
    // ========================================================================

    test(
      "integration lookup always carries organization and environment scope",
      () => {
        const source =
          fs.readFileSync(
            integrationRoutesPath,
            "utf8"
          );


        expect(
          source
        ).toMatch(
          /IntegrationConnection[\s\S]*?findOne\s*\(\s*\{[\s\S]*?organizationId[\s\S]*?environmentId/
        );
      }
    );


    test(
      "foreign integration lookup hides existence behind 404",
      () => {
        const source =
          fs.readFileSync(
            integrationRoutesPath,
            "utf8"
          );


        expect(
          source
        ).toContain(
          "INTEGRATION_NOT_FOUND"
        );


        expect(
          source
        ).toContain(
          "404"
        );
      }
    );


    test(
      "integration ciphertext remains opt-in",
      () => {
        const source =
          fs.readFileSync(
            integrationRoutesPath,
            "utf8"
          );


        expect(
          source
        ).toContain(
          "includeSecret = false"
        );


        expect(
          source
        ).toContain(
          "+encryptedSecretReference"
        );


        expect(
          source
        ).toContain(
          "INTEGRATION_CREDENTIALS_MANAGE"
        );
      }
    );


    test(
      "safe integration response does not return encrypted credential material",
      () => {
        const source =
          fs.readFileSync(
            integrationRoutesPath,
            "utf8"
          );


        expect(
          source
        ).toContain(
          "hasSecret"
        );


        expect(
          source
        ).not.toMatch(
          /return\s*\{[\s\S]{0,3000}encryptedSecretReference\s*:/
        );
      }
    );


    // ========================================================================
    // DATABASE SCOPE CERTIFICATION
    // ========================================================================

    test(
      "enterprise external identities enforce provider organization boundary",
      () => {
        const source =
          fs.readFileSync(
            migration40Path,
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
      "environment runtime settings reject cross-tenant environment",
      () => {
        const source =
          fs.readFileSync(
            migration42Path,
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
      "integration governance rejects cross-tenant environment",
      () => {
        const source =
          fs.readFileSync(
            migration43Path,
            "utf8"
          );


        expect(
          source
        ).toContain(
          "aira_validate_integration_governance_scope"
        );


        expect(
          source
        ).toContain(
          "integration governance organization mismatch"
        );
      }
    );


    test(
      "notification routing rejects organization/environment mismatch",
      () => {
        const source =
          fs.readFileSync(
            migration44Path,
            "utf8"
          );


        expect(
          source
        ).toContain(
          "aira_validate_notification_environment_scope"
        );


        expect(
          source
        ).toContain(
          "notification organization/environment mismatch"
        );
      }
    );


    test(
      "human tasks reject organization/environment mismatch",
      () => {
        const source =
          fs.readFileSync(
            migration45Path,
            "utf8"
          );


        expect(
          source
        ).toContain(
          "aira_validate_human_task_scope"
        );


        expect(
          source
        ).toContain(
          "human task organization/environment mismatch"
        );
      }
    );


    // ========================================================================
    // HUMAN OPERATOR SAFETY
    // ========================================================================

    test(
      "human task cannot directly authorize infrastructure execution",
      () => {
        const source =
          fs.readFileSync(
            migration45Path,
            "utf8"
          );


        expect(
          source
        ).toContain(
          "human_task_never_authorizes_execution"
        );


        expect(
          source
        ).toMatch(
          /execution_authorized\s*=\s*FALSE/i
        );
      }
    );


    test(
      "human task queries include tenant and environment scope",
      () => {
        const source =
          fs.readFileSync(
            humanTaskServicePath,
            "utf8"
          );


        expect(
          source
        ).toMatch(
          /organization_id\s*=\s*\$1[\s\S]*?environment_id\s*=\s*\$2/
        );
      }
    );


    // ========================================================================
    // NOTIFICATION SAFETY
    // ========================================================================

    test(
      "notification routing does not permit credential material in routing config",
      () => {
        const source =
          fs.readFileSync(
            notificationServicePath,
            "utf8"
          );


        expect(
          source
        ).toContain(
          "NOTIFICATION_SECRET_CONFIGURATION_FORBIDDEN"
        );


        expect(
          source
        ).toContain(
          "ensureSafeConfiguration"
        );
      }
    );


    test(
      "notification routing queries are organization scoped",
      () => {
        const source =
          fs.readFileSync(
            notificationServicePath,
            "utf8"
          );


        expect(
          source
        ).toMatch(
          /notifications\.channels[\s\S]*?organization_id\s*=\s*\$1/
        );


        expect(
          source
        ).toMatch(
          /notifications\.routing_rules[\s\S]*?organization_id\s*=\s*\$1/
        );
      }
    );


    // ========================================================================
    // ENTERPRISE IDENTITY
    // ========================================================================

    test(
      "identity provider service always resolves provider inside organization",
      () => {
        const source =
          fs.readFileSync(
            enterpriseIdentityServicePath,
            "utf8"
          );


        expect(
          source
        ).toMatch(
          /identity\.identity_providers[\s\S]*?organization_id\s*=\s*\$1/
        );
      }
    );


    test(
      "identity provider serialization does not expose encrypted client secret",
      () => {
        const source =
          fs.readFileSync(
            enterpriseIdentityServicePath,
            "utf8"
          );


        expect(
          source
        ).toContain(
          "hasClientSecret"
        );


        expect(
          source
        ).not.toMatch(
          /return\s*\{[\s\S]{0,2500}clientSecretEncrypted\s*:/
        );
      }
    );


    // ========================================================================
    // ONBOARDING ISOLATION
    // ========================================================================

    test(
      "onboarding persistence is organization scoped",
      () => {
        const migration =
          fs.readFileSync(
            migration46Path,
            "utf8"
          );


        const service =
          fs.readFileSync(
            onboardingServicePath,
            "utf8"
          );


        expect(
          migration
        ).toContain(
          "organization_id UUID"
        );


        expect(
          service
        ).toMatch(
          /organization_id\s*=\s*\$1/
        );
      }
    );


    // ========================================================================
    // AUDIT SAFETY
    // ========================================================================

    test(
      "audit sanitizer removes credential and authentication secrets",
      () => {
        const result =
          sanitizeMetadata({
            organizationId:
              "org-a",

            password:
              "password-value",

            token:
              "token-value",

            apiKey:
              "api-key-value",

            clientSecret:
              "client-secret-value",

            safe:
              "visible",

            nested: {
              accessToken:
                "hidden",

              safeValue:
                "visible",
            },
          });


        expect(
          result
        ).toEqual({
          organizationId:
            "org-a",

          safe:
            "visible",

          nested: {
            safeValue:
              "visible",
          },
        });
      }
    );


    test(
      "audit certification records integrity and coverage status",
      () => {
        const source =
          fs.readFileSync(
            migration47Path,
            "utf8"
          );


        expect(
          source
        ).toContain(
          "integrity_valid"
        );


        expect(
          source
        ).toContain(
          "event_type_coverage_valid"
        );


        expect(
          source
        ).toContain(
          "missing_event_types"
        );
      }
    );


        // ========================================================================
    // FINAL SECURITY INVARIANTS
    // ========================================================================

    test(
      "all critical tenant-owned operational systems have explicit scope protection",
      () => {
        const protectedSources = [
          fs.readFileSync(
            migration42Path,
            "utf8"
          ),

          fs.readFileSync(
            migration43Path,
            "utf8"
          ),

          fs.readFileSync(
            migration44Path,
            "utf8"
          ),

          fs.readFileSync(
            migration45Path,
            "utf8"
          ),
        ];


        for (
          const source
          of protectedSources
        ) {
          expect(
            source
          ).toContain(
            "organization_id"
          );


          expect(
            source
          ).toContain(
            "environment_id"
          );
        }
      }
    );


    test(
      "certification contains no authorization bypass marker",
      () => {
        const sources = [
          fs.readFileSync(
            authorizationMiddlewarePath,
            "utf8"
          ),

          fs.readFileSync(
            integrationRoutesPath,
            "utf8"
          ),

          fs.readFileSync(
            humanTaskServicePath,
            "utf8"
          ),
        ];


        for (
          const source
          of sources
        ) {
          expect(
            source
          ).not.toMatch(
            /\bBYPASS_AUTHORIZATION\b/
          );


          expect(
            source
          ).not.toMatch(
            /\bSKIP_TENANT_CHECK\b/
          );


          expect(
            source
          ).not.toMatch(
            /\bALLOW_CROSS_TENANT\b/
          );
        }
      }
    );
  }
);