"use strict";


const {
  RESOURCE_CAPABILITIES,
} =
  require(
    "../../constants/resourceCapabilities"
  );


const {
  AUTONOMY_LEVEL,

  CERTIFICATION_DOMAIN,

  DOMAIN_AUTONOMY_CEILING,

  autonomyRank,

  lowerAutonomyLevel,

  capAutonomyForDomain,
} =
  require(
    "../../constants/recoveryCertification"
  );


const {
  RECOVERY_CERTIFICATION_ARCHITECTURE_CONTRACT,

  validateRecoveryCertificationArchitectureContract,

  evaluateDomainAutonomyCeiling,

  assertCertificationResult,
} =
  require(
    "../../contracts/certification/recoveryCertificationContract"
  );


const {
  validateCertifiedCapability,

  assertValidCertifiedCapability,
} =
  require(
    "../../contracts/certification/certifiedCapabilityContract"
  );


const {
  buildCertifiedCapabilityIdentity,

  sameCertifiedCapability,
} =
  require(
    "../../services/certification/certifiedCapabilityIdentity"
  );


describe(
  "Phase 22.0 recovery certification architecture",
  () => {
    test(
      "architecture contract is valid and non-authorizing",
      () => {
        const result =
          validateRecoveryCertificationArchitectureContract();


        expect(
          result.valid
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
          result.productionCertified
        )
          .toBe(
            false
          );
      }
    );


    test(
      "certification contract explicitly separates capability, certification and authorization",
      () => {
        expect(
          RECOVERY_CERTIFICATION_ARCHITECTURE_CONTRACT
            .invariants
        )
          .toEqual(
            expect.arrayContaining([
              "RESOURCE_CAPABILITY_IS_NOT_CERTIFICATION",

              "CERTIFICATION_IS_NOT_AUTHORIZATION",

              "CERTIFICATION_NEVER_GRANTS_EXECUTION_AUTHORIZATION",

              "PHASE_22_CONSUMES_PHASE_21_EVIDENCE",
            ])
          );
      }
    );


    test(
      "autonomy levels are strictly ordered L0 through L5",
      () => {
        expect(
          autonomyRank(
            AUTONOMY_LEVEL.L0
          )
        )
          .toBeLessThan(
            autonomyRank(
              AUTONOMY_LEVEL.L1
            )
          );


        expect(
          autonomyRank(
            AUTONOMY_LEVEL.L1
          )
        )
          .toBeLessThan(
            autonomyRank(
              AUTONOMY_LEVEL.L2
            )
          );


        expect(
          autonomyRank(
            AUTONOMY_LEVEL.L2
          )
        )
          .toBeLessThan(
            autonomyRank(
              AUTONOMY_LEVEL.L3
            )
          );


        expect(
          autonomyRank(
            AUTONOMY_LEVEL.L3
          )
        )
          .toBeLessThan(
            autonomyRank(
              AUTONOMY_LEVEL.L4
            )
          );


        expect(
          autonomyRank(
            AUTONOMY_LEVEL.L4
          )
        )
          .toBeLessThan(
            autonomyRank(
              AUTONOMY_LEVEL.L5
            )
          );
      }
    );


    test(
      "unknown autonomy level fails closed",
      () => {
        expect(
          () =>
            autonomyRank(
              "L99"
            )
        )
          .toThrow(
            "Unknown autonomy level"
          );
      }
    );


    test(
      "minimum autonomy helper can only reduce the result",
      () => {
        expect(
          lowerAutonomyLevel(
            AUTONOMY_LEVEL.L5,
            AUTONOMY_LEVEL.L3
          )
        )
          .toBe(
            AUTONOMY_LEVEL.L3
          );
      }
    );


    test(
      "physical systems are capped below autonomous execution levels",
      () => {
        const result =
          evaluateDomainAutonomyCeiling({
            requestedLevel:
              AUTONOMY_LEVEL.L5,

            domain:
              CERTIFICATION_DOMAIN
                .PHYSICAL_SYSTEM,
          });


        expect(
          DOMAIN_AUTONOMY_CEILING[
            CERTIFICATION_DOMAIN
              .PHYSICAL_SYSTEM
          ]
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


        expect(
          result.capped
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
      "safety-critical systems have the strictest autonomy ceiling",
      () => {
        expect(
          capAutonomyForDomain(
            AUTONOMY_LEVEL.L5,

            CERTIFICATION_DOMAIN
              .SAFETY_CRITICAL
          )
        )
          .toBe(
            AUTONOMY_LEVEL.L1
          );
      }
    );


    test(
      "certification result cannot grant execution authority",
      () => {
        expect(
          () =>
            assertCertificationResult({
              qualifiedLevel:
                AUTONOMY_LEVEL.L3,

              domain:
                CERTIFICATION_DOMAIN
                  .SOFTWARE_INFRASTRUCTURE,

              executionAuthorized:
                true,
            })
        )
          .toThrow(
            "cannot authorize execution"
          );
      }
    );


    test(
      "certification result cannot exceed its domain ceiling",
      () => {
        expect(
          () =>
            assertCertificationResult({
              qualifiedLevel:
                AUTONOMY_LEVEL.L4,

              domain:
                CERTIFICATION_DOMAIN
                  .PHYSICAL_SYSTEM,

              executionAuthorized:
                false,
            })
        )
          .toThrow(
            "exceeds PHYSICAL_SYSTEM ceiling"
          );
      }
    );
  }
);


describe(
  "Phase 22.1 certified capability identity",
  () => {
    function capability(
      overrides = {}
    ) {
      return {
        capabilityKey:
          "K8S_CRASHLOOP_RECOVERY",

        provider:
          "kubernetes",

        resourceType:
          "deployment",

        failureMode:
          "kubernetes.pod.crashloop",

        recoveryStrategy:
          "rolling-restart",

        resourceCapability:
          RESOURCE_CAPABILITIES
            .RESTART,

        playbookId:
          "pb_k8s_crashloop_recovery",

        playbookVersion:
          1,

        domain:
          CERTIFICATION_DOMAIN
            .SOFTWARE_INFRASTRUCTURE,

        constraints: {
          maximumAffectedResources:
            1,

          rollbackRequired:
            true,

          verificationRequired:
            true,
        },

        executionAuthorized:
          false,

        ...overrides,
      };
    }


    test(
      "valid certified capability remains non-authorizing",
      () => {
        const result =
          assertValidCertifiedCapability(
            capability()
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
      "known resource capability is required",
      () => {
        const result =
          validateCertifiedCapability(
            capability({
              resourceCapability:
                "MAKE_EVERYTHING_ADMIN",
            })
          );


        expect(
          result.error
        )
          .toBeTruthy();
      }
    );


    test(
      "unknown certification domain is rejected",
      () => {
        const result =
          validateCertifiedCapability(
            capability({
              domain:
                "UNBOUNDED",
            })
          );


        expect(
          result.error
        )
          .toBeTruthy();
      }
    );


    test(
      "executionAuthorized true is rejected by capability contract",
      () => {
        const result =
          validateCertifiedCapability(
            capability({
              executionAuthorized:
                true,
            })
          );


        expect(
          result.error
        )
          .toBeTruthy();
      }
    );


    test(
      "same capability definition produces deterministic identity",
      () => {
        const first =
          capability();

        const second =
          capability({
            constraints: {
              verificationRequired:
                true,

              rollbackRequired:
                true,

              maximumAffectedResources:
                1,
            },
          });


        const firstIdentity =
          buildCertifiedCapabilityIdentity(
            first
          );

        const secondIdentity =
          buildCertifiedCapabilityIdentity(
            second
          );


        expect(
          firstIdentity.fingerprint
        )
          .toBe(
            secondIdentity.fingerprint
          );


        expect(
          sameCertifiedCapability(
            first,
            second
          )
        )
          .toBe(
            true
          );


        expect(
          firstIdentity.executionAuthorized
        )
          .toBe(
            false
          );
      }
    );


    test(
      "different playbook version changes certification identity",
      () => {
        expect(
          sameCertifiedCapability(
            capability(),

            capability({
              playbookVersion:
                2,
            })
          )
        )
          .toBe(
            false
          );
      }
    );


    test(
      "different failure mode changes certification identity",
      () => {
        expect(
          sameCertifiedCapability(
            capability(),

            capability({
              failureMode:
                "kubernetes.pod.oomkilled",
            })
          )
        )
          .toBe(
            false
          );
      }
    );


    test(
      "different recovery strategy changes certification identity",
      () => {
        expect(
          sameCertifiedCapability(
            capability(),

            capability({
              recoveryStrategy:
                "rollout-rollback",
            })
          )
        )
          .toBe(
            false
          );
      }
    );


    test(
      "different certification constraints change identity",
      () => {
        expect(
          sameCertifiedCapability(
            capability(),

            capability({
              constraints: {
                maximumAffectedResources:
                  3,

                rollbackRequired:
                  true,

                verificationRequired:
                  true,
              },
            })
          )
        )
          .toBe(
            false
          );
      }
    );


    test(
      "physical robot capability can be represented but remains a physical domain",
      () => {
        const result =
          buildCertifiedCapabilityIdentity(
            capability({
              capabilityKey:
                "ROBOT_RETURN_HOME_RECOVERY",

              provider:
                "robotics",

              resourceType:
                "mobile_robot",

              failureMode:
                "robot.localization.degraded",

              recoveryStrategy:
                "return-home",

              resourceCapability:
                RESOURCE_CAPABILITIES
                  .ROBOT_RETURN_HOME,

              playbookId:
                "pb_robot_return_home",

              domain:
                CERTIFICATION_DOMAIN
                  .PHYSICAL_SYSTEM,
            })
          );


        expect(
          result.scope.domain
        )
          .toBe(
            CERTIFICATION_DOMAIN
              .PHYSICAL_SYSTEM
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