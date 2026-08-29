"use strict";

const fs =
  require("fs");

const path =
  require("path");


const EvidenceReadinessService =
  require(
    "../../coverage/EvidenceReadinessService"
  );


const PostgresResourceCapabilityRepository =
  require(
    "../../persistence/postgres/PostgresResourceCapabilityRepository"
  );


const CapabilityCoverageService =
  require(
    "../../coverage/CapabilityCoverageService"
  );


const PolicyApprovalCoverageService =
  require(
    "../../coverage/PolicyApprovalCoverageService"
  );


const ROOT =
  path.resolve(
    __dirname,
    "../.."
  );


describe(
  "Phase 19.7-19.9 Recovery Readiness Coverage",
  () => {
    /*
     * ========================================================================
     * 19.7 EVIDENCE
     * ========================================================================
     */


    test(
      "structured evidence readiness delegates to Phase 18 engine",
      () => {
        const engine = {
          evaluate:
            jest.fn()
              .mockReturnValue({
                requiredCount:
                  1,

                satisfiedRequiredCount:
                  1,

                missingRequiredCount:
                  0,

                missingRequiredEvidence:
                  [],

                complete:
                  true,

                confidence:
                  1,

                executionAuthorized:
                  false,
              }),
        };


        const service =
          new EvidenceReadinessService({
            engine,
          });


        const result =
          service.evaluate({
            failureMode: {
              failureModeId:
                "FM-POSTGRES-001",

              evidenceRequirements: [
                {
                  requirementId:
                    "EVR-POSTGRES-HEALTH",

                  type:
                    "METRIC",

                  required:
                    true,
                },
              ],
            },

            evidence: [
              {
                id:
                  "evidence-1",

                type:
                  "METRIC",

                available:
                  true,
              },
            ],
          });


        expect(
          engine.evaluate
        ).toHaveBeenCalledTimes(
          1
        );


        expect(
          result.requirementModel
        ).toBe(
          "STRUCTURED"
        );


        expect(
          result.complete
        ).toBe(true);


        expect(
          result.executionAuthorized
        ).toBe(false);
      }
    );


    test(
      "canonical evidence requirement IDs are evaluated without inventing definitions",
      () => {
        const service =
          new EvidenceReadinessService();


        const result =
          service.evaluate({
            failureMode: {
              failureModeId:
                "FM-POSTGRES-001",

              evidenceRequirementIds: [
                "EVR-POSTGRES-HEALTH",

                "EVR-POSTGRES-REPLICATION",
              ],
            },

            availableEvidenceRequirementIds: [
              "EVR-POSTGRES-HEALTH",
            ],
          });


        expect(
          result.requirementModel
        ).toBe(
          "ID_BASED"
        );


        expect(
          result.complete
        ).toBe(false);


        expect(
          result.satisfiedRequiredCount
        ).toBe(1);


        expect(
          result.missingRequirementIds
        ).toEqual([
          "EVR-POSTGRES-REPLICATION",
        ]);


        expect(
          result.reasonCodes
        ).toContain(
          "EVIDENCE_UNAVAILABLE"
        );
      }
    );


    test(
      "Failure Mode with no evidence requirements is evidence-ready",
      () => {
        const service =
          new EvidenceReadinessService();


        const result =
          service.evaluate({
            failureMode: {
              failureModeId:
                "FM-SIMPLE-001",

              evidenceRequirementIds:
                [],
            },
          });


        expect(
          result.requirementModel
        ).toBe(
          "NONE"
        );


        expect(
          result.complete
        ).toBe(true);


        expect(
          result.confidence
        ).toBe(1);


        expect(
          result.reasonCodes
        ).toEqual([]);
      }
    );


    /*
     * ========================================================================
     * 19.8 CAPABILITY PERSISTENCE
     * ========================================================================
     */


    test(
      "resource capability repository reads canonical Phase 17 tables",
      () => {
        const source =
          fs.readFileSync(
            path.join(
              ROOT,
              "persistence/postgres/PostgresResourceCapabilityRepository.js"
            ),
            "utf8"
          );


        expect(
          source
        ).toMatch(
          /resources\.resource_capabilities/
        );


        expect(
          source
        ).toMatch(
          /resources\.capabilities/
        );


        expect(
          source
        ).toMatch(
          /PostgresTenantScope/
        );


        expect(
          source
        ).not.toMatch(
          /INSERT\s+INTO\s+resources\.resource_capabilities/i
        );


        expect(
          source
        ).not.toMatch(
          /UPDATE\s+resources\.resource_capabilities/i
        );
      }
    );


    test(
      "resource capability repository returns only available Phase 17 capabilities by default",
      async () => {
        const query =
          jest.fn()
            .mockResolvedValue({
              rows: [
                {
                  id:
                    "rc-uuid",

                  public_id:
                    "rc-public",

                  organization_id:
                    "org-uuid",

                  environment_id:
                    "env-uuid",

                  resource_id:
                    "resource-uuid",

                  capability_id:
                    "cap-uuid",

                  capability_key:
                    "READ_METRICS",

                  capability_description:
                    "Read metrics",

                  available:
                    true,

                  source:
                    "DISCOVERY",

                  observed_at:
                    new Date(),

                  metadata:
                    {},

                  capability_metadata:
                    {},

                  capability_status:
                    "ACTIVE",

                  created_at:
                    new Date(),

                  updated_at:
                    new Date(),
                },
              ],
            });


        const scope = {
          run:
            jest.fn(
              async (
                requestedScope,
                work
              ) => {
                expect(
                  requestedScope
                ).toEqual({
                  organizationId:
                    "org-public",

                  environmentId:
                    "env-public",
                });


                return work(
                  {
                    query,
                  },
                  {
                    organizationUuid:
                      "org-uuid",

                    environmentUuid:
                      "env-uuid",

                    applicationOrganizationId:
                      "org-public",

                    applicationEnvironmentId:
                      "env-public",
                  }
                );
              }
            ),
        };


        const repository =
          new PostgresResourceCapabilityRepository({
            scope,
          });


        const result =
          await repository
            .listResourceCapabilities({
              organizationId:
                "org-public",

              environmentId:
                "env-public",

              resourceId:
                "resource-uuid",
            });


        expect(
          result
        ).toHaveLength(
          1
        );


        expect(
          result[0]
            .capabilityKey
        ).toBe(
          "READ_METRICS"
        );


        expect(
          result[0]
            .executionAuthorized
        ).toBe(false);


        expect(
          query.mock
            .calls[0][0]
        ).toMatch(
          /rc\.available = true/
        );
      }
    );


    test(
      "capability coverage combines Phase 17 resource capabilities with explicitly available capabilities",
      async () => {
        const resourceCapabilityRepository = {
          listAvailableCapabilityKeys:
            jest.fn()
              .mockResolvedValue([
                "READ_STATE",

                "READ_METRICS",
              ]),
        };


        const service =
          new CapabilityCoverageService({
            resourceCapabilityRepository,
          });


        const result =
          await service.evaluate({
            organizationId:
              "org",

            environmentId:
              "env",

            resourceId:
              "resource",

            failureMode: {
              failureModeId:
                "FM-POSTGRES-001",

              requiredCapabilities: [
                "READ_STATE",

                "READ_METRICS",

                "FAILOVER",
              ],
            },

            availableCapabilities: [
              "FAILOVER",
            ],
          });


        expect(
          result.technicallyApplicable
        ).toBe(true);


        expect(
          result.complete
        ).toBe(true);


        expect(
          result.missingCapabilities
        ).toEqual([]);


        expect(
          result.capabilityCoverage
        ).toBe(1);


        expect(
          result.executionAuthorized
        ).toBe(false);
      }
    );


    test(
      "missing required capability prevents complete technical coverage",
      async () => {
        const resourceCapabilityRepository = {
          listAvailableCapabilityKeys:
            jest.fn()
              .mockResolvedValue([
                "READ_STATE",
              ]),
        };


        const service =
          new CapabilityCoverageService({
            resourceCapabilityRepository,
          });


        const result =
          await service.evaluate({
            organizationId:
              "org",

            environmentId:
              "env",

            resourceId:
              "resource",

            failureMode: {
              failureModeId:
                "FM-POSTGRES-FAILOVER",

              requiredCapabilities: [
                "READ_STATE",

                "FAILOVER",
              ],
            },
          });


        expect(
          result.technicallyApplicable
        ).toBe(false);


        expect(
          result.missingCapabilities
        ).toEqual([
          "FAILOVER",
        ]);


        expect(
          result.reasonCodes
        ).toContain(
          "CAPABILITY_MISSING"
        );


        expect(
          result.capabilityImpliesAuthorization
        ).toBe(false);
      }
    );


    /*
     * ========================================================================
     * 19.9 POLICY / HUMAN READINESS
     * ========================================================================
     */


    test(
      "missing policy decision fails closed",
      () => {
        const service =
          new PolicyApprovalCoverageService();


        const result =
          service.evaluate({
            failureMode: {
              failureModeId:
                "FM-POSTGRES-001",

              risk: {
                level:
                  "MEDIUM",
              },
            },
          });


        expect(
          result.policyReady
        ).toBe(false);


        expect(
          result.policyBlocked
        ).toBe(true);


        expect(
          result.reasonCodes
        ).toContain(
          "POLICY_BLOCKED"
        );


        expect(
          result.executionAuthorized
        ).toBe(false);
      }
    );


    test(
      "explicitly allowed low-risk recovery can be autonomously policy-ready",
      () => {
        const service =
          new PolicyApprovalCoverageService();


        const result =
          service.evaluate({
            failureMode: {
              failureModeId:
                "FM-K8S-POD-001",

              risk: {
                level:
                  "LOW",
              },
            },

            playbook: {
              playbookId:
                "PB-K8S-001",

              approval: {
                mode:
                  "AUTOMATIC",
              },
            },

            policyDecision: {
              allowed:
                true,

              decision:
                "ALLOW",
            },
          });


        expect(
          result.policyReady
        ).toBe(true);


        expect(
          result.approvalRequired
        ).toBe(false);


        expect(
          result.humanOnlyCandidate
        ).toBe(false);


        expect(
          result.autonomousPolicyReady
        ).toBe(true);


        expect(
          result.executionAuthorized
        ).toBe(false);
      }
    );


    test(
      "critical recovery becomes human-gated rather than policy-unknown",
      () => {
        const service =
          new PolicyApprovalCoverageService();


        const result =
          service.evaluate({
            failureMode: {
              failureModeId:
                "FM-POSTGRES-CORRUPTION",

              risk: {
                level:
                  "CRITICAL",
              },
            },

            playbook: {
              playbookId:
                "PB-POSTGRES-CORRUPTION",

              approval: {
                mode:
                  "MANUAL",
              },
            },

            policyDecision: {
              allowed:
                true,

              decision:
                "ALLOW",
            },
          });


        expect(
          result.policyReady
        ).toBe(true);


        expect(
          result.policyBlocked
        ).toBe(false);


        expect(
          result.approvalRequired
        ).toBe(true);


        expect(
          result.humanOnlyCandidate
        ).toBe(true);


        expect(
          result.autonomousPolicyReady
        ).toBe(false);


        expect(
          result.reasonCodes
        ).toContain(
          "HUMAN_APPROVAL_REQUIRED"
        );


        /*
         * Current approval is not present, so Phase 18 correctly says
         * requirements are not satisfied NOW.
         *
         * Phase 19 still knows a valid human-gated policy path exists.
         */

        expect(
          result.requirementsSatisfiedNow
        ).toBe(false);


        expect(
          result.executionAuthorized
        ).toBe(false);
      }
    );


    test(
      "explicit policy denial is not misclassified as HUMAN_ONLY readiness",
      () => {
        const service =
          new PolicyApprovalCoverageService();


        const result =
          service.evaluate({
            failureMode: {
              failureModeId:
                "FM-DANGEROUS-001",

              risk: {
                level:
                  "HIGH",
              },
            },

            policyDecision: {
              allowed:
                false,

              denied:
                true,

              decision:
                "DENY",

              reason:
                "Organization policy forbids this recovery.",
            },
          });


        expect(
          result.policyBlocked
        ).toBe(true);


        expect(
          result.policyReady
        ).toBe(false);


        expect(
          result.humanOnlyCandidate
        ).toBe(false);


        expect(
          result.reasonCodes
        ).toContain(
          "POLICY_BLOCKED"
        );
      }
    );


    /*
     * ========================================================================
     * SAFETY
     * ========================================================================
     */


    test(
      "Phase 19 readiness services reuse Phase 18 deterministic engines",
      () => {
        const evidenceSource =
          fs.readFileSync(
            path.join(
              ROOT,
              "coverage/EvidenceReadinessService.js"
            ),
            "utf8"
          );


        const capabilitySource =
          fs.readFileSync(
            path.join(
              ROOT,
              "coverage/CapabilityCoverageService.js"
            ),
            "utf8"
          );


        const policySource =
          fs.readFileSync(
            path.join(
              ROOT,
              "coverage/PolicyApprovalCoverageService.js"
            ),
            "utf8"
          );


        expect(
          evidenceSource
        ).toMatch(
          /EvidenceRequirementEngine/
        );


        expect(
          capabilitySource
        ).toMatch(
          /CapabilityRequirementEngine/
        );


        expect(
          policySource
        ).toMatch(
          /RiskPolicyRequirementEngine/
        );
      }
    );


    test(
      "readiness coverage cannot authorize infrastructure execution",
      () => {
        const files = [
          "coverage/EvidenceReadinessService.js",

          "coverage/CapabilityCoverageService.js",

          "coverage/PolicyApprovalCoverageService.js",

          "persistence/postgres/PostgresResourceCapabilityRepository.js",
        ];


        for (
          const relativePath
          of files
        ) {
          const source =
            fs.readFileSync(
              path.join(
                ROOT,
                relativePath
              ),
              "utf8"
            );


          expect(
            source
          ).not.toMatch(
            /executionAuthorized\s*:\s*true/
          );


          expect(
            source
          ).not.toMatch(
            /require\s*\(\s*["']child_process["']\s*\)/
          );


          expect(
            source
          ).not.toMatch(
            /require\s*\(\s*["']mongoose["']\s*\)/
          );
        }
      }
    );
  }
);