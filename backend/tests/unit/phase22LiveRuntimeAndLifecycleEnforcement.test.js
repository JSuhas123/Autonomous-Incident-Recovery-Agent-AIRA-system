"use strict";


const {
  AUTONOMY_LEVEL,
} =
  require(
    "../../constants/recoveryCertification"
  );


const {
  AUTONOMY_RUNTIME_DECISION,
} =
  require(
    "../../constants/runtimeAutonomyPolicy"
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


function permissiveRuntime(
  certification
) {
  return {
    certification,

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
  };
}


describe(
  "Phase 22.16 runtime enforcement",

  () => {
    test(
      "real 22.15 L0 qualification cannot become autonomous even with permissive surrounding gates",

      () => {
        const result =
          new RuntimeAutonomyEligibilityGate()
            .evaluate(
              permissiveRuntime({
                qualifiedLevel:
                  AUTONOMY_LEVEL.L0,

                confidence:
                  1,

                status:
                  "CERTIFIED",

                executionAuthorized:
                  false,
              })
            );


        expect(
          result.effectiveLevel
        )
          .toBe(
            AUTONOMY_LEVEL.L0
          );


        expect(
          result.decision
        )
          .toBe(
            AUTONOMY_RUNTIME_DECISION
              .OBSERVE
          );


        expect(
          result
            .autonomousRecoveryEligible
        )
          .toBe(
            false
          );


        expect(
          result.nextAuthority
        )
          .toBeNull();


        expect(
          result.executionAuthorized
        )
          .toBe(
            false
          );
      }
    );


    test(
      "certification cannot be increased by tenant settings",

      () => {
        const result =
          new RuntimeAutonomyEligibilityGate()
            .evaluate(
              permissiveRuntime({
                qualifiedLevel:
                  AUTONOMY_LEVEL.L2,

                confidence:
                  1,

                status:
                  "CERTIFIED",

                executionAuthorized:
                  false,
              })
            );


        expect(
          result.certificationLevel
        )
          .toBe(
            AUTONOMY_LEVEL.L2
          );


        expect(
          result.effectiveLevel
        )
          .toBe(
            AUTONOMY_LEVEL.L2
          );
      }
    );


    test(
      "tenant approval requirement can reduce L5 to L3",

      () => {
        const input =
          permissiveRuntime({
            qualifiedLevel:
              AUTONOMY_LEVEL.L5,

            confidence:
              1,

            status:
              "CERTIFIED",

            executionAuthorized:
              false,
          });


        input
          .tenantSettings
          .autonomyMode =
          "approval_required";


        const result =
          new RuntimeAutonomyEligibilityGate()
            .evaluate(
              input
            );


        expect(
          result.effectiveLevel
        )
          .toBe(
            AUTONOMY_LEVEL.L3
          );


        expect(
          result.approvalRequired
        )
          .toBe(
            true
          );


        expect(
          result
            .autonomousRecoveryEligible
        )
          .toBe(
            false
          );
      }
    );


    test(
      "kill switch defeats an otherwise autonomous L5 path",

      () => {
        const input =
          permissiveRuntime({
            qualifiedLevel:
              AUTONOMY_LEVEL.L5,

            confidence:
              1,

            status:
              "CERTIFIED",

            executionAuthorized:
              false,
          });


        input.killSwitch = {
          state:
            "DISABLED",

          allowed:
            false,

          blocked:
            true,
        };


        const result =
          new RuntimeAutonomyEligibilityGate()
            .evaluate(
              input
            );


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
  }
);


describe(
  "Phase 22.17 promotion and demotion enforcement",

  () => {
    function qualification(
      level,
      overrides =
        {}
    ) {
      return {
        qualifiedLevel:
          level,

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

        ...overrides,
      };
    }


    test(
      "better evidence makes promotion eligible but does not authorize",

      () => {
        const result =
          new AutonomyLifecycleEnforcementService()
            .evaluate({
              previousLevel:
                AUTONOMY_LEVEL.L3,

              qualification:
                qualification(
                  AUTONOMY_LEVEL.L4
                ),

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
          result.promotionEligible
        )
          .toBe(
            true
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


    test(
      "worse evidence forces demotion",

      () => {
        const result =
          new AutonomyLifecycleEnforcementService()
            .evaluate({
              previousLevel:
                AUTONOMY_LEVEL.L5,

              qualification:
                qualification(
                  AUTONOMY_LEVEL.L2,
                  {
                    demoted:
                      true,

                    safetyCap: {
                      capped:
                        true,

                      failed:
                        false,

                      suspended:
                        false,
                    },
                  }
                ),

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
              .DEMOTION_REQUIRED
          );


        expect(
          result.currentLevel
        )
          .toBe(
            AUTONOMY_LEVEL.L2
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
      "safety violation suspends instead of merely demoting",

      () => {
        const result =
          new AutonomyLifecycleEnforcementService()
            .evaluate({
              previousLevel:
                AUTONOMY_LEVEL.L4,

              qualification:
                qualification(
                  AUTONOMY_LEVEL.L2,
                  {
                    demoted:
                      true,

                    safetyCap: {
                      capped:
                        true,

                      failed:
                        false,

                      suspended:
                        true,
                    },
                  }
                ),

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
              .SUSPENSION_REQUIRED
          );


        expect(
          result.suspensionRequired
        )
          .toBe(
            true
          );
      }
    );


    test(
      "revoked certificate remains revoked even if qualification input looks good",

      () => {
        const result =
          new AutonomyLifecycleEnforcementService()
            .evaluate({
              previousLevel:
                AUTONOMY_LEVEL.L5,

              qualification:
                qualification(
                  AUTONOMY_LEVEL.L5
                ),

              certificate: {
                status:
                  "REVOKED",
              },

              now:
                "2026-09-02T00:00:00.000Z",
            });


        expect(
          result.action
        )
          .toBe(
            LIFECYCLE_ACTION
              .REVOCATION_ENFORCED
          );


        expect(
          result.revocationEnforced
        )
          .toBe(
            true
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
      "stable qualification does not create promotion",

      () => {
        const result =
          new AutonomyLifecycleEnforcementService()
            .evaluate({
              previousLevel:
                AUTONOMY_LEVEL.L3,

              qualification:
                qualification(
                  AUTONOMY_LEVEL.L3
                ),

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
          result.promotionEligible
        )
          .toBe(
            false
          );


        expect(
          result.demotionRequired
        )
          .toBe(
            false
          );
      }
    );
  }
);