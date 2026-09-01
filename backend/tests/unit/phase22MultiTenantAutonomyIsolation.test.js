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


function certification() {
  return {
    qualifiedLevel:
      AUTONOMY_LEVEL.L5,

    confidence:
      1,

    status:
      "CERTIFIED",

    executionAuthorized:
      false,
  };
}


function runtimeInput(
  tenantSettings
) {
  return {
    certification:
      certification(),

    tenantSettings,

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
  "Phase 22.18 multi-tenant autonomy isolation",

  () => {
    test(
      "same L5 certification can produce different tenant ceilings",

      () => {
        const gate =
          new RuntimeAutonomyEligibilityGate();


        const tenantA =
          gate.evaluate(
            runtimeInput({
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
            })
          );


        const tenantB =
          gate.evaluate(
            runtimeInput({
              autonomyMode:
                "recommend_only",

              allowAutonomousRecovery:
                false,

              allowProductionAutonomy:
                false,

              requireApprovalForProduction:
                true,

              requireApprovalForDestructiveActions:
                true,

              minimumConfidenceForAutonomy:
                0.95,
            })
          );


        expect(
          tenantA.effectiveLevel
        )
          .toBe(
            AUTONOMY_LEVEL.L5
          );


        expect(
          tenantB.effectiveLevel
        )
          .toBe(
            AUTONOMY_LEVEL.L2
          );


        expect(
          tenantA
            .autonomousRecoveryEligible
        )
          .toBe(
            true
          );


        expect(
          tenantB
            .autonomousRecoveryEligible
        )
          .toBe(
            false
          );


        expect(
          tenantA.executionAuthorized
        )
          .toBe(
            false
          );


        expect(
          tenantB.executionAuthorized
        )
          .toBe(
            false
          );
      }
    );


    test(
      "tenant B cannot inherit tenant A autonomous setting",

      () => {
        const gate =
          new RuntimeAutonomyEligibilityGate();


        const tenantASettings = {
          autonomyMode:
            "autonomous",

          allowAutonomousRecovery:
            true,

          minimumConfidenceForAutonomy:
            0.95,
        };


        const tenantBSettings = {
          autonomyMode:
            "approval_required",

          allowAutonomousRecovery:
            false,

          minimumConfidenceForAutonomy:
            0.95,
        };


        const tenantA =
          gate.evaluate(
            runtimeInput(
              tenantASettings
            )
          );


        const tenantB =
          gate.evaluate(
            runtimeInput(
              tenantBSettings
            )
          );


        expect(
          tenantA.effectiveLevel
        )
          .toBe(
            AUTONOMY_LEVEL.L5
          );


        expect(
          tenantB.effectiveLevel
        )
          .toBe(
            AUTONOMY_LEVEL.L3
          );


        expect(
          tenantB
            .autonomousRecoveryEligible
        )
          .toBe(
            false
          );
      }
    );


    test(
      "environment ceiling independently reduces a tenant",

      () => {
        const input =
          runtimeInput({
            autonomyMode:
              "autonomous",

            allowAutonomousRecovery:
              true,

            minimumConfidenceForAutonomy:
              0.95,
          });


        input.environmentCeiling =
          AUTONOMY_LEVEL.L2;


        const result =
          new RuntimeAutonomyEligibilityGate()
            .evaluate(
              input
            );


        expect(
          result.certificationLevel
        )
          .toBe(
            AUTONOMY_LEVEL.L5
          );


        expect(
          result.effectiveLevel
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
      "tenant autonomy settings can never increase an L0 certification",

      () => {
        const input =
          runtimeInput({
            autonomyMode:
              "autonomous",

            allowAutonomousRecovery:
              true,

            minimumConfidenceForAutonomy:
              0,
          });


        input.certification = {
          qualifiedLevel:
            AUTONOMY_LEVEL.L0,

          confidence:
            1,

          status:
            "CERTIFIED",

          executionAuthorized:
            false,
        };


        const result =
          new RuntimeAutonomyEligibilityGate()
            .evaluate(
              input
            );


        expect(
          result.effectiveLevel
        )
          .toBe(
            AUTONOMY_LEVEL.L0
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
      "production autonomy remains tenant-specific",

      () => {
        const gate =
          new RuntimeAutonomyEligibilityGate();


        const productionEnabled =
          runtimeInput({
            autonomyMode:
              "autonomous",

            allowAutonomousRecovery:
              true,

            allowProductionAutonomy:
              true,

            requireApprovalForProduction:
              false,

            minimumConfidenceForAutonomy:
              0.95,
          });


        productionEnabled.production =
          true;


        const productionDisabled =
          runtimeInput({
            autonomyMode:
              "autonomous",

            allowAutonomousRecovery:
              true,

            allowProductionAutonomy:
              false,

            requireApprovalForProduction:
              false,

            minimumConfidenceForAutonomy:
              0.95,
          });


        productionDisabled.production =
          true;


        const enabled =
          gate.evaluate(
            productionEnabled
          );


        const disabled =
          gate.evaluate(
            productionDisabled
          );


        expect(
          enabled.effectiveLevel
        )
          .toBe(
            AUTONOMY_LEVEL.L5
          );


        expect(
          disabled.effectiveLevel
        )
          .toBe(
            AUTONOMY_LEVEL.L3
          );


        expect(
          enabled.productionCertified
        )
          .toBe(
            false
          );


        expect(
          disabled.productionCertified
        )
          .toBe(
            false
          );
      }
    );
  }
);