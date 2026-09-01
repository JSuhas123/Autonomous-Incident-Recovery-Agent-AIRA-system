"use strict";


const {
  AUTONOMY_LEVEL,
} =
  require(
    "../../constants/recoveryCertification"
  );


const {
  AUTONOMY_RUNTIME_DECISION,

  REPUTATION_TREND,

  RECERTIFICATION_REASON,
} =
  require(
    "../../constants/runtimeAutonomyPolicy"
  );


const {
  BoundedAutonomyConstraintService,
} =
  require(
    "../../services/certification/boundedAutonomyConstraintService"
  );


const {
  RuntimeAutonomyEligibilityGate,
} =
  require(
    "../../services/certification/runtimeAutonomyEligibilityGate"
  );


const {
  AutonomyReputationService,
} =
  require(
    "../../services/certification/autonomyReputationService"
  );


function certification(
  overrides =
    {}
) {
  return {
    qualifiedLevel:
      AUTONOMY_LEVEL.L5,

    confidence:
      0.999,

    status:
      "CERTIFIED",

    expiresAt:
      "2026-12-31T00:00:00.000Z",

    executionAuthorized:
      false,

    ...overrides,
  };
}


function tenantSettings(
  overrides =
    {}
) {
  return {
    autonomyMode:
      "autonomous",

    allowAutonomousRecovery:
      true,

    allowProductionAutonomy:
      false,

    requireApprovalForDestructiveActions:
      true,

    requireApprovalForProduction:
      true,

    minimumConfidenceForAutonomy:
      0.95,

    verificationRequired:
      true,

    rollbackRequiredWhenAvailable:
      true,

    ...overrides,
  };
}


function runtimeInput(
  overrides =
    {}
) {
  return {
    certification:
      certification(),

    tenantSettings:
      tenantSettings(),

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
        0.20,
    },

    killSwitch: {
      state:
        "ENABLED",

      allowed:
        true,

      blocked:
        false,

      executionAuthorized:
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

    now:
      "2026-09-02T00:00:00.000Z",

    executionAuthorized:
      false,

    authorizationGranted:
      false,

    ...overrides,
  };
}


describe(
  "Phase 22.9 bounded autonomy constraints",

  () => {
    const service =
      new BoundedAutonomyConstraintService();


    test(
      "valid bounded recovery scope passes",

      () => {
        const result =
          service.evaluate({
            constraints: [
              {
                constraintKey:
                  "provider",

                operator:
                  "EQ",

                constraintValue:
                  "kubernetes",
              },

              {
                constraintKey:
                  "resource.replicas",

                operator:
                  "LTE",

                constraintValue:
                  5,
              },

              {
                constraintKey:
                  "rollbackAvailable",

                operator:
                  "REQUIRED_TRUE",

                constraintValue:
                  true,
              },

              {
                constraintKey:
                  "production",

                operator:
                  "REQUIRED_FALSE",

                constraintValue:
                  false,
              },
            ],

            context: {
              provider:
                "kubernetes",

              resource: {
                replicas:
                  3,
              },

              rollbackAvailable:
                true,

              production:
                false,
            },
          });


        expect(
          result.satisfied
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
      "constraint violation fails closed",

      () => {
        const result =
          service.evaluate({
            constraints: [
              {
                constraintKey:
                  "resource.replicas",

                operator:
                  "LTE",

                constraintValue:
                  5,
              },
            ],

            context: {
              resource: {
                replicas:
                  20,
              },
            },
          });


        expect(
          result.satisfied
        )
          .toBe(
            false
          );


        expect(
          result.failedConstraints
        )
          .toContain(
            "resource.replicas"
          );
      }
    );


    test(
      "missing required true value fails",

      () => {
        const result =
          service.evaluate({
            constraints: [
              {
                constraintKey:
                  "verificationRequired",

                operator:
                  "REQUIRED_TRUE",

                constraintValue:
                  true,
              },
            ],

            context:
              {},
          });


        expect(
          result.satisfied
        )
          .toBe(
            false
          );
      }
    );
  }
);


describe(
  "Phase 22.10 runtime autonomy eligibility",

  () => {
    test(
      "L5 certificate with permissive gates remains L5 eligible but never authorized",

      () => {
        const result =
          new RuntimeAutonomyEligibilityGate()
            .evaluate(
              runtimeInput()
            );


        expect(
          result.effectiveLevel
        )
          .toBe(
            AUTONOMY_LEVEL.L5
          );


        expect(
          result.decision
        )
          .toBe(
            AUTONOMY_RUNTIME_DECISION
              .AUTONOMOUSLY_ELIGIBLE
          );


        expect(
          result
            .autonomousRecoveryEligible
        )
          .toBe(
            true
          );


        expect(
          result.nextAuthority
        )
          .toBe(
            "CANONICAL_EXECUTION_AUTHORIZATION"
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
      "tenant approval-required mode reduces L5 certification to L3",

      () => {
        const result =
          new RuntimeAutonomyEligibilityGate()
            .evaluate(
              runtimeInput({
                tenantSettings:
                  tenantSettings({
                    autonomyMode:
                      "approval_required",

                    allowAutonomousRecovery:
                      true,
                  }),
              })
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
      "recommend-only tenant cannot exceed L2",

      () => {
        const result =
          new RuntimeAutonomyEligibilityGate()
            .evaluate(
              runtimeInput({
                tenantSettings:
                  tenantSettings({
                    autonomyMode:
                      "recommend_only",

                    allowAutonomousRecovery:
                      false,
                  }),
              })
            );


        expect(
          result.effectiveLevel
        )
          .toBe(
            AUTONOMY_LEVEL.L2
          );


        expect(
          result.decision
        )
          .toBe(
            AUTONOMY_RUNTIME_DECISION
              .RECOMMEND
          );
      }
    );


    test(
      "production autonomy requires separate tenant permission",

      () => {
        const result =
          new RuntimeAutonomyEligibilityGate()
            .evaluate(
              runtimeInput({
                production:
                  true,

                tenantSettings:
                  tenantSettings({
                    autonomyMode:
                      "autonomous",

                    allowAutonomousRecovery:
                      true,

                    allowProductionAutonomy:
                      false,

                    requireApprovalForProduction:
                      false,
                  }),
              })
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
          result.productionCertified
        )
          .toBe(
            false
          );
      }
    );


    test(
      "policy approval requirement reduces autonomy to L3",

      () => {
        const result =
          new RuntimeAutonomyEligibilityGate()
            .evaluate(
              runtimeInput({
                policy: {
                  status:
                    "REQUIRES_APPROVAL",
                },
              })
            );


        expect(
          result.policyCeiling
        )
          .toBe(
            AUTONOMY_LEVEL.L3
          );


        expect(
          result.effectiveLevel
        )
          .toBe(
            AUTONOMY_LEVEL.L3
          );
      }
    );


    test(
      "policy block fails closed",

      () => {
        const result =
          new RuntimeAutonomyEligibilityGate()
            .evaluate(
              runtimeInput({
                policy: {
                  status:
                    "BLOCKED",
                },
              })
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
          result.nextAuthority
        )
          .toBeNull();
      }
    );


    test(
      "high risk reduces autonomous certificate to approval-gated L3",

      () => {
        const result =
          new RuntimeAutonomyEligibilityGate()
            .evaluate(
              runtimeInput({
                actionRisk: {
                  level:
                    "HIGH",

                  score:
                    0.70,
                },
              })
            );


        expect(
          result.riskCeiling
        )
          .toBe(
            AUTONOMY_LEVEL.L3
          );


        expect(
          result.effectiveLevel
        )
          .toBe(
            AUTONOMY_LEVEL.L3
          );
      }
    );


    test(
      "critical risk blocks runtime eligibility",

      () => {
        const result =
          new RuntimeAutonomyEligibilityGate()
            .evaluate(
              runtimeInput({
                actionRisk: {
                  level:
                    "CRITICAL",

                  score:
                    0.90,
                },
              })
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
      }
    );


    test(
      "kill switch always wins",

      () => {
        const result =
          new RuntimeAutonomyEligibilityGate()
            .evaluate(
              runtimeInput({
                killSwitch: {
                  state:
                    "DISABLED",

                  allowed:
                    false,

                  blocked:
                    true,

                  executionAuthorized:
                    false,
                },
              })
            );


        expect(
          result.blocked
        )
          .toBe(
            true
          );


        expect(
          result.killSwitchAllowed
        )
          .toBe(
            false
          );


        expect(
          result.effectiveLevel
        )
          .toBe(
            AUTONOMY_LEVEL.L0
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
      "revoked certificate cannot be replayed",

      () => {
        const result =
          new RuntimeAutonomyEligibilityGate()
            .evaluate(
              runtimeInput({
                certification:
                  certification({
                    status:
                      "REVOKED",
                  }),
              })
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
      }
    );


    test(
      "expired certificate fails closed",

      () => {
        const result =
          new RuntimeAutonomyEligibilityGate()
            .evaluate(
              runtimeInput({
                certification:
                  certification({
                    expiresAt:
                      "2026-08-01T00:00:00.000Z",
                  }),
              })
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
      }
    );


    test(
      "bounded certificate cannot escape its certified resource scope",

      () => {
        const result =
          new RuntimeAutonomyEligibilityGate()
            .evaluate(
              runtimeInput({
                constraints: [
                  {
                    constraintKey:
                      "provider",

                    operator:
                      "EQ",

                    constraintValue:
                      "kubernetes",
                  },

                  {
                    constraintKey:
                      "namespace",

                    operator:
                      "EQ",

                    constraintValue:
                      "payments",
                  },
                ],

                constraintContext: {
                  provider:
                    "kubernetes",

                  namespace:
                    "identity",
                },
              })
            );


        expect(
          result
            .constraintsSatisfied
        )
          .toBe(
            false
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
      }
    );


    test(
      "environment ceiling can only reduce certification",

      () => {
        const result =
          new RuntimeAutonomyEligibilityGate()
            .evaluate(
              runtimeInput({
                environmentCeiling:
                  AUTONOMY_LEVEL.L2,
              })
            );


        expect(
          result.effectiveLevel
        )
          .toBe(
            AUTONOMY_LEVEL.L2
          );
      }
    );
  }
);


describe(
  "Phase 22.11 autonomy reputation and continuous qualification",

  () => {
    test(
      "new certification starts a new reputation record",

      () => {
        const result =
          new AutonomyReputationService()
            .evaluate({
              qualification: {
                qualifiedLevel:
                  AUTONOMY_LEVEL.L3,

                executionAuthorized:
                  false,

                safetyCap: {
                  capped:
                    false,

                  failed:
                    false,

                  suspended:
                    false,
                },
              },

              certificate: {
                status:
                  "CERTIFIED",

                issuedAt:
                  "2026-09-01T00:00:00.000Z",

                expiresAt:
                  "2026-12-31T00:00:00.000Z",

                confidence:
                  0.97,
              },

              evidenceCount:
                100,

              now:
                "2026-09-02T00:00:00.000Z",
            });


        expect(
          result.trend
        )
          .toBe(
            REPUTATION_TREND
              .NEW
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
      "higher evidence-derived level records promoting trend",

      () => {
        const result =
          new AutonomyReputationService()
            .evaluate({
              previousLevel:
                AUTONOMY_LEVEL.L3,

              qualification: {
                qualifiedLevel:
                  AUTONOMY_LEVEL.L4,

                executionAuthorized:
                  false,

                safetyCap: {
                  capped:
                    false,

                  failed:
                    false,

                  suspended:
                    false,
                },
              },

              certificate: {
                status:
                  "CERTIFIED",

                expiresAt:
                  "2026-12-31T00:00:00.000Z",
              },

              evidenceCount:
                500,

              now:
                "2026-09-02T00:00:00.000Z",
            });


        expect(
          result.trend
        )
          .toBe(
            REPUTATION_TREND
              .PROMOTING
          );


        expect(
          result.promotionEligible
        )
          .toBe(
            true
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
      "demotion requires recertification",

      () => {
        const result =
          new AutonomyReputationService()
            .evaluate({
              previousLevel:
                AUTONOMY_LEVEL.L5,

              qualification: {
                qualifiedLevel:
                  AUTONOMY_LEVEL.L2,

                demoted:
                  true,

                executionAuthorized:
                  false,

                safetyCap: {
                  capped:
                    true,

                  failed:
                    false,

                  suspended:
                    false,
                },
              },

              certificate: {
                status:
                  "CERTIFIED",

                expiresAt:
                  "2026-12-31T00:00:00.000Z",
              },

              evidenceCount:
                1500,

              now:
                "2026-09-02T00:00:00.000Z",
            });


        expect(
          result.trend
        )
          .toBe(
            REPUTATION_TREND
              .DEGRADING
          );


        expect(
          result.recertificationRequired
        )
          .toBe(
            true
          );


        expect(
          result.recertificationReason
        )
          .toBe(
            RECERTIFICATION_REASON
              .LEVEL_DEMOTION
          );
      }
    );


    test(
      "safety suspension overrides ordinary reputation trend",

      () => {
        const result =
          new AutonomyReputationService()
            .evaluate({
              previousLevel:
                AUTONOMY_LEVEL.L4,

              qualification: {
                qualifiedLevel:
                  AUTONOMY_LEVEL.L2,

                executionAuthorized:
                  false,

                safetyCap: {
                  capped:
                    true,

                  failed:
                    false,

                  suspended:
                    true,
                },
              },

              certificate: {
                status:
                  "CERTIFIED",

                expiresAt:
                  "2026-12-31T00:00:00.000Z",
              },

              now:
                "2026-09-02T00:00:00.000Z",
            });


        expect(
          result.trend
        )
          .toBe(
            REPUTATION_TREND
              .SUSPENDED
          );


        expect(
          result.suspended
        )
          .toBe(
            true
          );


        expect(
          result.recertificationReason
        )
          .toBe(
            RECERTIFICATION_REASON
              .SAFETY_REGRESSION
          );
      }
    );


    test(
      "revoked reputation cannot create authority",

      () => {
        const result =
          new AutonomyReputationService()
            .evaluate({
              previousLevel:
                AUTONOMY_LEVEL.L5,

              qualification: {
                qualifiedLevel:
                  AUTONOMY_LEVEL.L0,

                executionAuthorized:
                  false,

                safetyCap: {
                  capped:
                    true,

                  failed:
                    true,

                  suspended:
                    false,
                },
              },

              certificate: {
                status:
                  "REVOKED",
              },

              now:
                "2026-09-02T00:00:00.000Z",
            });


        expect(
          result.trend
        )
          .toBe(
            REPUTATION_TREND
              .REVOKED
          );


        expect(
          result.revoked
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
      "significant new evidence requests continuous recertification",

      () => {
        const result =
          new AutonomyReputationService()
            .evaluate({
              previousLevel:
                AUTONOMY_LEVEL.L4,

              qualification: {
                qualifiedLevel:
                  AUTONOMY_LEVEL.L4,

                executionAuthorized:
                  false,

                safetyCap: {
                  capped:
                    false,

                  failed:
                    false,

                  suspended:
                    false,
                },
              },

              certificate: {
                status:
                  "CERTIFIED",

                expiresAt:
                  "2026-12-31T00:00:00.000Z",
              },

              newEvidenceCount:
                30,

              now:
                "2026-09-02T00:00:00.000Z",
            });


        expect(
          result.trend
        )
          .toBe(
            REPUTATION_TREND
              .STABLE
          );


        expect(
          result.recertificationRequired
        )
          .toBe(
            true
          );


        expect(
          result.recertificationReason
        )
          .toBe(
            RECERTIFICATION_REASON
              .NEW_EVIDENCE_AVAILABLE
          );
      }
    );


    test(
      "certificate approaching expiry requests recertification",

      () => {
        const result =
          new AutonomyReputationService()
            .evaluate({
              qualification: {
                qualifiedLevel:
                  AUTONOMY_LEVEL.L4,

                executionAuthorized:
                  false,

                safetyCap: {
                  capped:
                    false,

                  failed:
                    false,

                  suspended:
                    false,
                },
              },

              certificate: {
                status:
                  "CERTIFIED",

                expiresAt:
                  "2026-09-10T00:00:00.000Z",
              },

              now:
                "2026-09-02T00:00:00.000Z",
            });


        expect(
          result.recertificationRequired
        )
          .toBe(
            true
          );


        expect(
          result.recertificationReason
        )
          .toBe(
            RECERTIFICATION_REASON
              .EXPIRING_SOON
          );
      }
    );
  }
);