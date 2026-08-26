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
  ONBOARDING_STEPS,
  getStepDefinition,
} =
  require(
    "../../services/onboarding/onboardingService"
  );

const {
  buildRequiredAuditEvents,
} =
  require(
    "../../services/identity/auditCompletenessService"
  );

const {
  sanitizeMetadata,
} =
  require(
    "../../services/identity/identityAuditService"
  );


const migration46 =
  path.join(
    __dirname,
    "..",
    "..",
    "persistence",
    "postgres",
    "migrations",
    "0046_saas_onboarding.sql"
  );


const migration47 =
  path.join(
    __dirname,
    "..",
    "..",
    "persistence",
    "postgres",
    "migrations",
    "0047_audit_completeness.sql"
  );


describe(
  "Phase 14.12 + 14.13 SaaS onboarding and audit completeness",
  () => {

    test(
      "both migrations exist",
      () => {
        expect(
          fs.existsSync(
            migration46
          )
        ).toBe(
          true
        );

        expect(
          fs.existsSync(
            migration47
          )
        ).toBe(
          true
        );
      }
    );


    test(
      "onboarding has required production steps",
      () => {
        const keys =
          ONBOARDING_STEPS
            .map(
              (
                step
              ) =>
                step.key
            );

        expect(
          keys
        ).toEqual(
          expect.arrayContaining([
            "ORGANIZATION_PROFILE",
            "CREATE_ENVIRONMENT",
            "ADD_INTEGRATION",
            "CONFIGURE_AUTONOMY",
            "VERIFY_FIRST_SIGNAL",
          ])
        );
      }
    );


    test(
      "required onboarding steps cannot be treated as optional",
      () => {
        expect(
          getStepDefinition(
            "CREATE_ENVIRONMENT"
          )
            .required
        ).toBe(
          true
        );

        expect(
          getStepDefinition(
            "ADD_INTEGRATION"
          )
            .required
        ).toBe(
          true
        );
      }
    );


    test(
      "onboarding permissions are organization scoped",
      () => {
        expect(
          permissionRequiresEnvironment(
            PERMISSIONS
              .ONBOARDING_READ
          )
        ).toBe(
          false
        );

        expect(
          permissionRequiresEnvironment(
            PERMISSIONS
              .ONBOARDING_MANAGE
          )
        ).toBe(
          false
        );
      }
    );


    test(
      "audit verification is organization scoped",
      () => {
        expect(
          permissionRequiresEnvironment(
            PERMISSIONS
              .AUDIT_VERIFY
          )
        ).toBe(
          false
        );

        expect(
          permissionRequiresEnvironment(
            PERMISSIONS
              .AUDIT_EXPORT
          )
        ).toBe(
          false
        );
      }
    );


    test(
      "canonical audit registry is non-empty",
      () => {
        expect(
          buildRequiredAuditEvents()
            .length
        ).toBeGreaterThan(
          10
        );
      }
    );


    test(
      "audit sanitizer removes secrets",
      () => {
        const sanitized =
          sanitizeMetadata({
            normal:
              "safe",

            password:
              "should-not-survive",

            nested: {
              accessToken:
                "hidden",

              value:
                "visible",
            },
          });

        expect(
          sanitized
        ).toEqual({
          normal:
            "safe",

          nested: {
            value:
              "visible",
          },
        });
      }
    );


    test(
      "audit certification migration stores integrity state",
      () => {
        const source =
          fs.readFileSync(
            migration47,
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


    test(
      "onboarding completion is bounded between 0 and 100",
      () => {
        const source =
          fs.readFileSync(
            migration46,
            "utf8"
          );

        expect(
          source
        ).toContain(
          "completion_percent >= 0"
        );

        expect(
          source
        ).toContain(
          "completion_percent <= 100"
        );
      }
    );
  }
);