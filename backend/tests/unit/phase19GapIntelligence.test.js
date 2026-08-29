"use strict";

const fs =
  require("fs");

const path =
  require("path");


const KnowledgeGapDetectionService =
  require(
    "../../coverage/KnowledgeGapDetectionService"
  );


const CriticalGapPrioritizationService =
  require(
    "../../coverage/CriticalGapPrioritizationService"
  );


const TopologyBlastRadiusCoverageService =
  require(
    "../../coverage/TopologyBlastRadiusCoverageService"
  );


const ROOT =
  path.resolve(
    __dirname,
    "../.."
  );


describe(
  "Phase 19.15-19.17 Gap Intelligence",
  () => {
    /*
     * ========================================================================
     * 19.15 BLIND SPOTS
     * ========================================================================
     */


    test(
      "resource with zero applicable Failure Modes becomes explicit blind spot",
      () => {
        const service =
          new KnowledgeGapDetectionService();


        const result =
          service.detect({
            resources: [
              {
                id:
                  "resource-1",

                resourceType:
                  "robotics.lidar",
              },
            ],

            evaluations:
              [],
          });


        expect(
          result.blindSpotDetected
        ).toBe(true);


        expect(
          result.gaps
        ).toHaveLength(
          1
        );


        expect(
          result.gaps[0]
            .reasonCode
        ).toBe(
          "NO_FAILURE_MODE"
        );


        expect(
          result.gaps[0]
            .classification
        ).toBe(
          "UNKNOWN"
        );
      }
    );


    test(
      "unsupported resource type is explicitly detected",
      () => {
        const service =
          new KnowledgeGapDetectionService();


        const result =
          service.detect({
            resources: [
              {
                id:
                  "resource-1",

                resourceType:
                  "vendor.future.database",
              },
            ],

            knownResourceTypes: [
              "postgres.database",
              "kubernetes.pod",
            ],

            evaluations:
              [],
          });


        expect(
          result.gaps.some(
            (
              gap
            ) =>
              gap.reasonCode ===
              "UNSUPPORTED_RESOURCE_TYPE"
          )
        ).toBe(true);
      }
    );


    test(
      "partial recovery produces precise remediation gap",
      () => {
        const service =
          new KnowledgeGapDetectionService();


        const result =
          service.detect({
            resources: [
              {
                id:
                  "resource-db",

                resourceType:
                  "postgres.database",
              },
            ],

            evaluations: [
              {
                id:
                  "evaluation-1",

                resourceId:
                  "resource-db",

                resourceType:
                  "postgres.database",

                failureModeId:
                  "fm-corruption",

                failureModeKey:
                  "FM-POSTGRES-CORRUPTION",

                classification:
                  "PARTIAL",

                reasonCodes: [
                  "VERIFICATION_MISSING",
                ],

                readiness: {
                  verificationReady:
                    false,
                },
              },
            ],
          });


        expect(
          result.gaps
        ).toHaveLength(
          1
        );


        expect(
          result.gaps[0].type
        ).toBe(
          "VERIFICATION_GAP"
        );


        expect(
          result.gaps[0]
            .reasonCode
        ).toBe(
          "VERIFICATION_MISSING"
        );
      }
    );


    test(
      "covered evaluations do not produce recovery gaps",
      () => {
        const service =
          new KnowledgeGapDetectionService();


        const result =
          service.detect({
            resources: [
              {
                id:
                  "resource-db",

                resourceType:
                  "postgres.database",
              },
            ],

            evaluations: [
              {
                resourceId:
                  "resource-db",

                resourceType:
                  "postgres.database",

                failureModeId:
                  "fm-1",

                classification:
                  "COVERED",

                reasonCodes:
                  [],
              },
            ],
          });


        expect(
          result.gaps
        ).toEqual([]);
      }
    );


    test(
      "observed incident without Failure Mode becomes knowledge blind spot",
      () => {
        const service =
          new KnowledgeGapDetectionService();


        const result =
          service.detect({
            incidentObservations: [
              {
                incidentId:
                  "incident-123",

                resourceId:
                  "resource-kafka",

                resourceType:
                  "kafka.cluster",

                matchedFailureMode:
                  false,

                occurrenceCount:
                  3,
              },
            ],
          });


        expect(
          result.gaps[0]
            .type
        ).toBe(
          "INCIDENT_WITHOUT_FAILURE_MODE"
        );


        expect(
          result.gaps[0]
            .occurrenceCount
        ).toBe(
          3
        );
      }
    );


    /*
     * ========================================================================
     * 19.17 TOPOLOGY
     * ========================================================================
     */


    test(
      "blast radius traverses canonical Phase 17 relationships",
      async () => {
        const relationshipsByResource = {
          root: [
            {
              id:
                "rel-1",

              sourceResourceId:
                "root",

              targetResourceId:
                "db",

              relationshipType:
                "DEPENDS_ON",

              confidence:
                1,
            },

            {
              id:
                "rel-2",

              sourceResourceId:
                "root",

              targetResourceId:
                "queue",

              relationshipType:
                "DEPENDS_ON",

              confidence:
                1,
            },
          ],

          db: [
            {
              id:
                "rel-1",

              sourceResourceId:
                "root",

              targetResourceId:
                "db",

              relationshipType:
                "DEPENDS_ON",

              confidence:
                1,
            },

            {
              id:
                "rel-3",

              sourceResourceId:
                "db",

              targetResourceId:
                "storage",

              relationshipType:
                "CONNECTED_TO",

              confidence:
                1,
            },
          ],

          queue: [],
        };


        const repository = {
          listRelationshipsForResource:
            jest.fn(
              async (
                input
              ) =>
                relationshipsByResource[
                  input.resourceId
                ] ||
                []
            ),
        };


        const service =
          new TopologyBlastRadiusCoverageService({
            relationshipRepository:
              repository,
          });


        const result =
          await service.evaluate({
            organizationId:
              "org",

            environmentId:
              "env",

            resourceId:
              "root",

            depth:
              2,

            maxNodes:
              100,
          });


        expect(
          result.affectedResourceIds
        ).toEqual(
          expect.arrayContaining([
            "db",
            "queue",
            "storage",
          ])
        );


        expect(
          result.affectedResourceCount
        ).toBe(
          3
        );


        expect(
          result.causalityEstablished
        ).toBe(false);


        expect(
          result.correlationIsCausation
        ).toBe(false);


        expect(
          result.executionAuthorized
        ).toBe(false);
      }
    );


    test(
      "isolated resource has zero blast radius score",
      async () => {
        const service =
          new TopologyBlastRadiusCoverageService({
            relationshipRepository: {
              listRelationshipsForResource:
                jest.fn()
                  .mockResolvedValue(
                    []
                  ),
            },
          });


        const result =
          await service.evaluate({
            organizationId:
              "org",

            environmentId:
              "env",

            resourceId:
              "isolated",
          });


        expect(
          result.affectedResourceCount
        ).toBe(0);


        expect(
          result.blastRadiusScore
        ).toBe(0);
      }
    );


    test(
      "topology service reuses Phase 17 relationship repository",
      () => {
        const source =
          fs.readFileSync(
            path.join(
              ROOT,
              "coverage/TopologyBlastRadiusCoverageService.js"
            ),
            "utf8"
          );


        expect(
          source
        ).toContain(
          "PostgresResourceRelationshipRepository"
        );


        expect(
          source
        ).toContain(
          "listRelationshipsForResource"
        );


        expect(
          source
        ).not.toMatch(
          /INSERT\s+INTO\s+resources\./i
        );
      }
    );


    /*
     * ========================================================================
     * 19.16 PRIORITY
     * ========================================================================
     */


    test(
      "critical unknown gap outranks low-risk human gate",
      () => {
        const service =
          new CriticalGapPrioritizationService();


        const result =
          service.prioritize({
            gaps: [
              {
                resourceId:
                  "critical-db",

                failureModeId:
                  "fm-corruption",

                reasonCode:
                  "NO_PLAYBOOK",

                classification:
                  "UNKNOWN",

                severity:
                  "CRITICAL",

                occurrenceCount:
                  4,
              },

              {
                resourceId:
                  "dev-pod",

                failureModeId:
                  "fm-restart",

                reasonCode:
                  "HUMAN_APPROVAL_REQUIRED",

                classification:
                  "HUMAN_ONLY",

                severity:
                  "LOW",

                occurrenceCount:
                  0,
              },
            ],

            resourceImportance: {
              "critical-db":
                "MISSION_CRITICAL",

              "dev-pod":
                "LOW",
            },

            topologyByResource: {
              "critical-db": {
                blastRadiusScore:
                  0.9,

                affectedResourceCount:
                  100,
              },

              "dev-pod": {
                blastRadiusScore:
                  0.1,

                affectedResourceCount:
                  1,
              },
            },
          });


        expect(
          result.gaps[0]
            .resourceId
        ).toBe(
          "critical-db"
        );


        expect(
          result.gaps[0]
            .priorityScore
        ).toBeGreaterThan(
          result.gaps[1]
            .priorityScore
        );
      }
    );


    test(
      "gap priority exposes transparent scoring factors",
      () => {
        const service =
          new CriticalGapPrioritizationService();


        const result =
          service.prioritize({
            gaps: [
              {
                resourceId:
                  "db",

                reasonCode:
                  "VERIFICATION_MISSING",

                severity:
                  "HIGH",

                occurrenceCount:
                  2,
              },
            ],

            resourceImportance: {
              db:
                "HIGH",
            },

            topologyByResource: {
              db: {
                blastRadiusScore:
                  0.5,

                affectedResourceCount:
                  10,
              },
            },
          });


        expect(
          result.gaps[0].factors
        ).toEqual(
          expect.objectContaining({
            severity:
              expect.any(
                Number
              ),

            productionImportance:
              expect.any(
                Number
              ),

            deficiency:
              expect.any(
                Number
              ),

            blastRadius:
              expect.any(
                Number
              ),

            incidentFrequency:
              expect.any(
                Number
              ),
          })
        );


        expect(
          result.gaps[0]
            .priorityExplanation
        ).toMatch(
          /VERIFICATION_MISSING/
        );
      }
    );


    test(
      "topology affects urgency but never proves causation",
      () => {
        const service =
          new CriticalGapPrioritizationService();


        const result =
          service.prioritize({
            gaps: [
              {
                resourceId:
                  "db",

                reasonCode:
                  "NO_PLAYBOOK",

                severity:
                  "HIGH",
              },
            ],

            topologyByResource: {
              db: {
                blastRadiusScore:
                  1,

                affectedResourceCount:
                  300,
              },
            },
          });


        expect(
          result.gaps[0]
            .topology
            .causalityEstablished
        ).toBe(false);


        expect(
          result.gaps[0]
            .executionAuthorized
        ).toBe(false);
      }
    );


    /*
     * ========================================================================
     * SAFETY / FUTURE EXTENSIBILITY
     * ========================================================================
     */


    test(
      "gap intelligence does not hardcode specific production technologies",
      () => {
        const source =
          fs.readFileSync(
            path.join(
              ROOT,
              "coverage/KnowledgeGapDetectionService.js"
            ),
            "utf8"
          );


        expect(
          source
        ).not.toMatch(
          /if\s*\([^)]*postgres/i
        );


        expect(
          source
        ).not.toMatch(
          /if\s*\([^)]*kubernetes/i
        );


        expect(
          source
        ).not.toMatch(
          /if\s*\([^)]*robotics/i
        );
      }
    );


    test(
      "coverage gap intelligence cannot authorize execution",
      () => {
        const files = [
          "coverage/KnowledgeGapDetectionService.js",

          "coverage/CriticalGapPrioritizationService.js",

          "coverage/TopologyBlastRadiusCoverageService.js",
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
            /require\s*\(\s*["']mongoose["']\s*\)/
          );


          expect(
            source
          ).not.toMatch(
            /require\s*\(\s*["']child_process["']\s*\)/
          );
        }
      }
    );
  }
);