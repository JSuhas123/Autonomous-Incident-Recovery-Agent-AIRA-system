"use strict";


const {
  AUTONOMY_LEVEL,
} =
  require(
    "../../constants/recoveryCertification"
  );


const {
  RuntimeAutonomyEligibilityGate,
} =
  require(
    "../../services/certification/runtimeAutonomyEligibilityGate"
  );


const {
  AutonomyLifecycleEnforcementService,

  LIFECYCLE_ACTION,
} =
  require(
    "../../services/certification/autonomyLifecycleEnforcementService"
  );


describe(
  "Phase 22.19/22.20 master recovery certification invariants",

  () => {
    test(
      "certification level never directly grants execution authority",

      () => {
        const gate =
          new RuntimeAutonomyEligibilityGate();


        const result =
          gate.evaluate({
            certification: {
              qualifiedLevel:
                AUTONOMY_LEVEL.L5,

              confidence:
                1,

              status:
                "CERTIFIED",

              executionAuthorized:
                false,
            },

            tenantSettings: {
              autonomyMode:
                "autonomous",

              allowAutonomousRecovery:
                true,

              allowProductionAutonomy:
                false,

              requireApprovalForProduction:
                true,

              requireApprovalForDestructiveActions:
                true,

              minimumConfidenceForAutonomy:
                0.95,
            },

            environmentCeiling:
              AUTONOMY_LEVEL.L5,

            policy: {
              status:
                "ELIGIBLE",
            },

            actionRisk: {
              level:
                "LOW",

              score:
                0.1,
            },

            killSwitch: {
              state:
                "ENABLED",

              allowed:
                true,

              blocked:
                false,
            },

            production:
              false,

            destructive:
              false,

            constraints:
              [],

            constraintContext:
              {},

            executionAuthorized:
              false,

            authorizationGranted:
              false,
          });


        expect(
          result.effectiveLevel
        )
          .toBe(
            AUTONOMY_LEVEL.L5
          );


        expect(
          result.autonomousRecoveryEligible
        )
          .toBe(
            true
          );


        /*
         * Eligible is deliberately not Authorized.
         */
        expect(
          result.executionAuthorized
        )
          .toBe(
            false
          );


        expect(
          result.authorizationGranted
        )
          .toBe(
            false
          );


        expect(
          result.nextAuthority
        )
          .toBe(
            "CANONICAL_EXECUTION_AUTHORIZATION"
          );
      }
    );


    test(
      "real insufficient L0 evidence remains L0 under permissive runtime controls",

      () => {
        const result =
          new RuntimeAutonomyEligibilityGate()
            .evaluate({
              certification: {
                qualifiedLevel:
                  AUTONOMY_LEVEL.L0,

                confidence:
                  1,

                status:
                  "CERTIFIED",

                executionAuthorized:
                  false,
              },

              tenantSettings: {
                autonomyMode:
                  "autonomous",

                allowAutonomousRecovery:
                  true,

                allowProductionAutonomy:
                  true,

                requireApprovalForProduction:
                  false,

                requireApprovalForDestructiveActions:
                  false,

                minimumConfidenceForAutonomy:
                  0,
              },

              environmentCeiling:
                AUTONOMY_LEVEL.L5,

              policy: {
                status:
                  "ELIGIBLE",
              },

              actionRisk: {
                level:
                  "LOW",

                score:
                  0,
              },

              killSwitch: {
                state:
                  "ENABLED",

                allowed:
                  true,

                blocked:
                  false,
              },

              production:
                false,

              destructive:
                false,

              executionAuthorized:
                false,
            });


        expect(
          result.effectiveLevel
        )
          .toBe(
            AUTONOMY_LEVEL.L0
          );


        expect(
          result.autonomousRecoveryEligible
        )
          .toBe(
            false
          );


        expect(
          result.executionAuthorized
        )
          .toBe(
            false
          );
      }
    );


    test(
      "policy can reduce autonomy but cannot increase it",

      () => {
        const gate =
          new RuntimeAutonomyEligibilityGate();


        const base = {
          certification: {
            qualifiedLevel:
              AUTONOMY_LEVEL.L5,

            confidence:
              1,

            status:
              "CERTIFIED",

            executionAuthorized:
              false,
          },

          tenantSettings: {
            autonomyMode:
              "autonomous",

            allowAutonomousRecovery:
              true,

            allowProductionAutonomy:
              false,

            requireApprovalForProduction:
              true,

            requireApprovalForDestructiveActions:
              true,

            minimumConfidenceForAutonomy:
              0.95,
          },

          environmentCeiling:
            AUTONOMY_LEVEL.L5,

          actionRisk: {
            level:
              "LOW",

            score:
              0.1,
          },

          killSwitch: {
            state:
              "ENABLED",

            allowed:
              true,

            blocked:
              false,
          },

          production:
            false,

          destructive:
            false,
        };


        const approval =
          gate.evaluate({
            ...base,

            policy: {
              status:
                "REQUIRES_APPROVAL",
            },
          });


        const blocked =
          gate.evaluate({
            ...base,

            policy: {
              status:
                "BLOCKED",
            },
          });


        expect(
          approval.effectiveLevel
        )
          .toBe(
            AUTONOMY_LEVEL.L3
          );


        expect(
          blocked.effectiveLevel
        )
          .toBe(
            AUTONOMY_LEVEL.L0
          );
      }
    );


    test(
      "kill switch is stronger than L5 certification",

      () => {
        const result =
          new RuntimeAutonomyEligibilityGate()
            .evaluate({
              certification: {
                qualifiedLevel:
                  AUTONOMY_LEVEL.L5,

                confidence:
                  1,

                status:
                  "CERTIFIED",

                executionAuthorized:
                  false,
              },

              tenantSettings: {
                autonomyMode:
                  "autonomous",

                allowAutonomousRecovery:
                  true,

                minimumConfidenceForAutonomy:
                  0.95,
              },

              environmentCeiling:
                AUTONOMY_LEVEL.L5,

              policy: {
                status:
                  "ELIGIBLE",
              },

              actionRisk: {
                level:
                  "LOW",

                score:
                  0.1,
              },

              killSwitch: {
                state:
                  "DISABLED",

                allowed:
                  false,

                blocked:
                  true,
              },

              production:
                false,

              destructive:
                false,
            });


        expect(
          result.blocked
        )
          .toBe(
            true
          );


        expect(
          result.effectiveLevel
        )
          .toBe(
            AUTONOMY_LEVEL.L0
          );


        expect(
          result.executionAuthorized
        )
          .toBe(
            false
          );
      }
    );


    test(
      "revocation cannot be overcome by good reputation",

      () => {
        const result =
          new AutonomyLifecycleEnforcementService()
            .evaluate({
              previousLevel:
                AUTONOMY_LEVEL.L5,

              qualification: {
                qualifiedLevel:
                  AUTONOMY_LEVEL.L5,

                confidence:
                  1,

                demoted:
                  false,

                safetyCap: {
                  capped:
                    false,

                  failed:
                    false,

                  suspended:
                    false,
                },

                executionAuthorized:
                  false,
              },

              certificate: {
                status:
                  "REVOKED",
              },
            });


        expect(
          result.action
        )
          .toBe(
            LIFECYCLE_ACTION
              .REVOCATION_ENFORCED
          );


        expect(
          result.executionAuthorized
        )
          .toBe(
            false
          );
      }
    );


    test(
      "promotion is eligibility only",

      () => {
        const result =
          new AutonomyLifecycleEnforcementService()
            .evaluate({
              previousLevel:
                AUTONOMY_LEVEL.L3,

              qualification: {
                qualifiedLevel:
                  AUTONOMY_LEVEL.L4,

                confidence:
                  0.999,

                demoted:
                  false,

                safetyCap: {
                  capped:
                    false,

                  failed:
                    false,

                  suspended:
                    false,
                },

                executionAuthorized:
                  false,
              },

              certificate: {
                status:
                  "CERTIFIED",

                expiresAt:
                  "2027-01-01T00:00:00.000Z",
              },

              now:
                "2026-09-02T00:00:00.000Z",
            });


        expect(
          result.action
        )
          .toBe(
            LIFECYCLE_ACTION
              .PROMOTION_ELIGIBLE
          );


        expect(
          result.executionAuthorized
        )
          .toBe(
            false
          );


        expect(
          result.authorizationGranted
        )
          .toBe(
            false
          );
      }
    );
  }
);