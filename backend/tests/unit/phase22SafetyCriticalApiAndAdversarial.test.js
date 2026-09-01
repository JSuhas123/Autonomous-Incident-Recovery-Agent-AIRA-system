"use strict";


const {
  AUTONOMY_LEVEL,

  CERTIFICATION_DOMAIN,
} =
  require(
    "../../constants/recoveryCertification"
  );


const {
  RESOURCE_CAPABILITIES,
} =
  require(
    "../../constants/resourceCapabilities"
  );


const {
  SafetyCriticalDomainBoundaryService,
} =
  require(
    "../../services/certification/safetyCriticalDomainBoundaryService"
  );


const {
  CertificationReadModelService,
} =
  require(
    "../../services/certification/certificationReadModelService"
  );


const {
  RuntimeAutonomyEligibilityGate,
} =
  require(
    "../../services/certification/runtimeAutonomyEligibilityGate"
  );


const {
  RecoveryOutcomeStatisticsService,
} =
  require(
    "../../services/certification/recoveryOutcomeStatisticsService"
  );


const {
  EvidenceSufficiencyService,
} =
  require(
    "../../services/certification/evidenceSufficiencyService"
  );


const {
  Phase21EvidenceIngestionService,
} =
  require(
    "../../services/certification/phase21EvidenceIngestionService"
  );


describe(
  "Phase 22.12 physical and safety-critical boundary",

  () => {
    const service =
      new SafetyCriticalDomainBoundaryService();


    test(
      "software certificate cannot be reused for robot capability",

      () => {
        const result =
          service.evaluate({
            domain:
              CERTIFICATION_DOMAIN
                .SOFTWARE_INFRASTRUCTURE,

            resourceCapability:
              RESOURCE_CAPABILITIES
                .ROBOT_RECALIBRATE,

            requestedLevel:
              AUTONOMY_LEVEL.L5,
          });


        expect(
          result.blocked
        )
          .toBe(
            true
          );


        expect(
          result.maximumLevel
        )
          .toBe(
            AUTONOMY_LEVEL.L0
          );


        expect(
          result
            .requiresSeparateCertification
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
      "physical-system certification cannot exceed L2",

      () => {
        const result =
          service.evaluate({
            domain:
              CERTIFICATION_DOMAIN
                .PHYSICAL_SYSTEM,

            resourceCapability:
              RESOURCE_CAPABILITIES
                .ROBOT_RETURN_HOME,

            requestedLevel:
              AUTONOMY_LEVEL.L5,
          });


        expect(
          result.maximumLevel
        )
          .toBe(
            AUTONOMY_LEVEL.L2
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
      "safety-critical certification cannot exceed L1",

      () => {
        const result =
          service.evaluate({
            domain:
              CERTIFICATION_DOMAIN
                .SAFETY_CRITICAL,

            resourceCapability:
              RESOURCE_CAPABILITIES
                .ROBOT_STOP,

            requestedLevel:
              AUTONOMY_LEVEL.L5,
          });


        expect(
          result.maximumLevel
        )
          .toBe(
            AUTONOMY_LEVEL.L1
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
      "ordinary Kubernetes software capability is not falsely classified physical",

      () => {
        const result =
          service.evaluate({
            domain:
              CERTIFICATION_DOMAIN
                .SOFTWARE_INFRASTRUCTURE,

            resourceCapability:
              RESOURCE_CAPABILITIES
                .RESTART,

            requestedLevel:
              AUTONOMY_LEVEL.L4,
          });


        expect(
          result.blocked
        )
          .toBe(
            false
          );


        expect(
          result.maximumLevel
        )
          .toBe(
            AUTONOMY_LEVEL.L4
          );
      }
    );
  }
);


describe(
  "Phase 22.13 certification dashboard read model",

  () => {
    function repository() {
      return {
        listCapabilities:
          jest.fn(
            async () => [
              {
                capabilityKey:
                  "K8S_DEPLOYMENT_RESTART",

                provider:
                  "kubernetes",

                resourceType:
                  "deployment",

                failureMode:
                  "kubernetes.pod.crash",

                recoveryStrategy:
                  "rolling-restart",

                resourceCapability:
                  "RESTART",

                playbookId:
                  "PB-K8S-RESTART",

                playbookVersion:
                  "1",

                domain:
                  "SOFTWARE_INFRASTRUCTURE",

                constraints:
                  {},

                certificate: {
                  qualifiedLevel:
                    AUTONOMY_LEVEL.L4,

                  status:
                    "CERTIFIED",

                  score:
                    98.5,

                  confidence:
                    0.995,

                  executionAuthorized:
                    false,
                },

                executionAuthorized:
                  false,
              },

              {
                capabilityKey:
                  "POSTGRES_RECOVERY",

                provider:
                  "postgresql",

                resourceType:
                  "database",

                failureMode:
                  "connection_failure",

                recoveryStrategy:
                  "reconnect",

                resourceCapability:
                  "RESTART",

                domain:
                  "DATA_INFRASTRUCTURE",

                constraints:
                  {},

                certificate:
                  null,

                executionAuthorized:
                  false,
              },
            ]
          ),

        getCapability:
          jest.fn(),

        listCapabilityHistory:
          jest.fn(),

        listEvidence:
          jest.fn(),
      };
    }


    test(
      "dashboard summarizes certification without implying authority",

      async () => {
        const service =
          new CertificationReadModelService({
            repository:
              repository(),
          });


        const result =
          await service.list({
            organizationId:
              "org",

            environmentId:
              "env",
          });


        expect(
          result.summary
            .totalCapabilities
        )
          .toBe(
            2
          );


        expect(
          result.summary
            .byLevel
            .L4
        )
          .toBe(
            1
          );


        expect(
          result.summary
            .byLevel
            .UNCERTIFIED
        )
          .toBe(
            1
          );


        expect(
          result
            .capabilities[0]
            .certification
            .autonomousRecoveryEligible
        )
          .toBe(
            true
          );


        expect(
          result
            .capabilities[0]
            .certification
            .executionAuthorized
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
  }
);


describe(
  "Phase 22.14 adversarial certification",

  () => {
    test(
      "one perfect test cannot manufacture high-confidence certification",

      () => {
        const statistics =
          new RecoveryOutcomeStatisticsService()
            .calculate({
              samples: [
                {
                  experimentRunId:
                    "experiment_1",

                  failureMode:
                    "failure",

                  infrastructureContext:
                    "cluster",

                  diagnosisCorrect:
                    true,

                  recoverySelectionCorrect:
                    true,

                  executionAttempted:
                    true,

                  executionSucceeded:
                    true,

                  recoveryVerified:
                    true,

                  falseRecovery:
                    false,

                  recurrenceDetected:
                    false,

                  verificationPerformed:
                    true,

                  evidenceComplete:
                    true,

                  unauthorizedAction:
                    false,

                  authorityLeak:
                    false,

                  safetyViolation:
                    false,

                  observedAt:
                    "2026-09-01T00:00:00.000Z",

                  executionAuthorized:
                    false,
                },
              ],
            });


        const sufficiency =
          new EvidenceSufficiencyService()
            .evaluate({
              statistics,

              now:
                "2026-09-02T00:00:00.000Z",
            });


        expect(
          sufficiency.sufficient
        )
          .toBe(
            false
          );
      }
    );


    test(
      "runtime rejects pre-granted Phase-22 authority",

      () => {
        expect(
          () =>
            new RuntimeAutonomyEligibilityGate()
              .evaluate({
                certification: {
                  qualifiedLevel:
                    AUTONOMY_LEVEL.L5,

                  status:
                    "CERTIFIED",

                  executionAuthorized:
                    false,
                },

                authorizationGranted:
                  true,
              })
        )
          .toThrow(
            "cannot receive pre-granted authority"
          );
      }
    );


    test(
      "unknown policy fails closed",

      () => {
        const result =
          new RuntimeAutonomyEligibilityGate()
            .evaluate({
              certification: {
                qualifiedLevel:
                  AUTONOMY_LEVEL.L5,

                status:
                  "CERTIFIED",

                confidence:
                  1,

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
                  "SOME_UNKNOWN_POLICY_RESULT",
              },

              actionRisk: {
                level:
                  "LOW",

                score:
                  0.1,
              },

              killSwitch: {
                allowed:
                  true,

                blocked:
                  false,
              },
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
      }
    );


    test(
      "unknown kill-switch state fails closed",

      () => {
        const result =
          new RuntimeAutonomyEligibilityGate()
            .evaluate({
              certification: {
                qualifiedLevel:
                  AUTONOMY_LEVEL.L4,

                status:
                  "CERTIFIED",

                confidence:
                  1,

                executionAuthorized:
                  false,
              },

              tenantSettings: {
                autonomyMode:
                  "autonomous",

                allowAutonomousRecovery:
                  true,
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
              },
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
      }
    );


    test(
      "cross-scope certificate constraints cannot be ignored",

      () => {
        const result =
          new RuntimeAutonomyEligibilityGate()
            .evaluate({
              certification: {
                qualifiedLevel:
                  AUTONOMY_LEVEL.L4,

                status:
                  "CERTIFIED",

                confidence:
                  1,

                executionAuthorized:
                  false,
              },

              tenantSettings: {
                autonomyMode:
                  "autonomous",

                allowAutonomousRecovery:
                  true,
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
              },

              killSwitch: {
                allowed:
                  true,

                blocked:
                  false,
              },

              constraints: [
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
                namespace:
                  "identity",
              },
            });


        expect(
          result.blocked
        )
          .toBe(
            true
          );


        expect(
          result.constraintsSatisfied
        )
          .toBe(
            false
          );
      }
    );


    test(
      "ground-truth leakage in Phase-21 artifact is rejected",

      async () => {
        const service =
          new Phase21EvidenceIngestionService({
            certificationRepository: {
              appendEvidenceLink:
                jest.fn(),
            },

            phase21Reader: {
              readExperimentEvidence:
                jest.fn(),
            },
          });


        await expect(
          service.ingest({
            organizationId:
              "org",

            environmentId:
              "env",

            certificationRunId:
              "run",

            artifacts: [
              {
                name:
                  "malicious-phase21.json",

                content: {
                  passed:
                    true,

                  productionCertified:
                    false,

                  phase21ExecutionAuthorized:
                    false,

                  groundTruthToAira:
                    true,
                },
              },
            ],
          })
        )
          .rejects
          .toThrow(
            "exposes evaluator ground truth"
          );
      }
    );


    test(
      "physical capability cannot inherit software L5 certificate",

      () => {
        const result =
          new SafetyCriticalDomainBoundaryService()
            .evaluate({
              domain:
                CERTIFICATION_DOMAIN
                  .SOFTWARE_INFRASTRUCTURE,

              resourceCapability:
                RESOURCE_CAPABILITIES
                  .ROBOT_STOP,

              requestedLevel:
                AUTONOMY_LEVEL.L5,
            });


        expect(
          result.maximumLevel
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