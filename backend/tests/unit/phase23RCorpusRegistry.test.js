"use strict";


const fs =
  require(
    "node:fs"
  );


const path =
  require(
    "node:path"
  );


const {
  EVIDENCE_GRADE,

  REALITY_CASE_SOURCE_KIND,

  REALITY_ARTIFACT_KIND,

  REALITY_VISIBILITY,
} =
  require(
    "../../contracts/reality"
  );


const {
  RealityCorpusService,
} =
  require(
    "../../services/reality/realityCorpusService"
  );


const migration94 =
  path.join(
    __dirname,
    "..",
    "..",
    "persistence",
    "postgres",
    "migrations",
    "0094_reality_corpus_registry.sql"
  );


function buildRealityCase(
  overrides =
    {}
) {
  return {
    identity: {
      caseId:
        "case_dependency_failure_001",

      title:
        "Kubernetes dependency failure",
    },

    scope: {
      organizationId:
        "org_test",

      environmentId:
        "env_test",
    },

    provenance: {
      sourceKind:
        REALITY_CASE_SOURCE_KIND
          .AIRA_LAB,

      sourceName:
        "AIRA Reliability Lab",

      sourceVersion:
        "phase21",

      license:
        "INTERNAL",

      modified:
        false,

      groundTruthMethod:
        "controlled fault injection",
    },

    evidenceGrade:
      EVIDENCE_GRADE.E2,

    workload: {
      platform:
        "kubernetes",

      service:
        "api",
    },

    timeline: [
      {
        eventId:
          "evt_1",

        offsetMs:
          0,

        kind:
          "SIGNAL",
      },
    ],

    visibleEvidence: {
      signals:
        [],

      metrics:
        [],

      logs:
        [],

      traces:
        [],

      topology:
        [],

      resourceStates:
        [],
    },

    sealedEvaluation: {
      knownFault:
        "dependency unavailable",

      expectedDiagnosis:
        "upstream dependency outage",

      acceptableDiagnoses: [
        "dependency outage",
      ],

      expectedRecoveryFamily:
        "DEPENDENCY_RECOVERY",
    },

    safetyRestrictions: [
      "LAB_ONLY",
    ],

    evaluationRubric: {
      safetyDominates:
        true,
    },

    replayConfiguration: {
      seed:
        23,

      speedMultiplier:
        1,

      deterministicTimestamps:
        true,
    },

    artifacts: [
      {
        artifactId:
          "logs_1",

        kind:
          REALITY_ARTIFACT_KIND.LOG,

        /*
         * Physical object-storage hashing begins in 23R.2.
         */
        contentHash:
          "placeholder",
      },
    ],

    sealing: {
      evidenceVisibility:
        REALITY_VISIBILITY
          .EVIDENCE,

      evaluationVisibility:
        REALITY_VISIBILITY
          .SEALED_EVALUATION,

      groundTruthAgentVisible:
        false,
    },

    version: {
      revision:
        1,

      contentHash:
        null,
    },

    executionAuthorized:
      false,

    ...overrides,
  };
}


describe(
  "Phase 23R.1 canonical RealityCase + corpus registry",

  () => {
    test(
      "0094 creates the canonical reality registry tables",

      () => {
        const source =
          fs.readFileSync(
            migration94,
            "utf8"
          );

        for (
          const table
          of [
            "dataset_sources",
            "corpora",
            "cases",
            "case_versions",
            "case_ground_truth",
          ]
        ) {
          expect(
            source
          ).toContain(
            `reality.${table}`
          );
        }
      }
    );


    test(
      "database separates replay-visible case data from sealed ground truth",

      () => {
        const source =
          fs.readFileSync(
            migration94,
            "utf8"
          );

        expect(
          source
        ).toContain(
          "visible_case JSONB NOT NULL"
        );

        expect(
          source
        ).toContain(
          "sealed_evaluation JSONB NOT NULL"
        );

        expect(
          source
        ).toContain(
          "evaluation_rubric JSONB NOT NULL"
        );

        expect(
          source
        ).toContain(
          "reality_case_version_visible_has_no_ground_truth"
        );

        expect(
          source
        ).toContain(
          "NOT (\n                visible_case\n                ? 'sealedEvaluation'"
        );

        expect(
          source
        ).toContain(
          "NOT (\n                visible_case\n                ? 'evaluationRubric'"
        );
      }
    );


    test(
      "all reality registry state is FORCE RLS protected",

      () => {
        const source =
          fs.readFileSync(
            migration94,
            "utf8"
          );

        expect(
          source
        ).toContain(
          "ENABLE ROW LEVEL SECURITY"
        );

        expect(
          source
        ).toContain(
          "FORCE ROW LEVEL SECURITY"
        );

        expect(
          source
        ).toContain(
          "tenancy.current_organization_id()"
        );

        expect(
          source
        ).toContain(
          "tenancy.current_environment_id()"
        );
      }
    );


    test(
      "database cannot manufacture execution authorization",

      () => {
        const source =
          fs.readFileSync(
            migration94,
            "utf8"
          );

        expect(
          source
        ).toContain(
          "execution_authorized = FALSE"
        );

        expect(
          source
        ).toContain(
          "reality corpus state cannot authorize AIRA execution"
        );
      }
    );


    test(
      "case versions are content-addressed and exactly one version is current",

      () => {
        const source =
          fs.readFileSync(
            migration94,
            "utf8"
          );

        expect(
          source
        ).toContain(
          "reality_case_version_hash_sha256"
        );

        expect(
          source
        ).toContain(
          "idx_reality_case_versions_one_current"
        );

        expect(
          source
        ).toContain(
          "WHERE is_current = TRUE"
        );
      }
    );


    test(
      "registerCase separates replay evidence from evaluation truth",

      async () => {
        const repository = {
          registerCaseVersion:
            jest
              .fn()
              .mockResolvedValue({
                created:
                  true,

                duplicate:
                  false,

                version: {
                  revision:
                    1,
                },

                executionAuthorized:
                  false,
              }),
        };

        const service =
          new RealityCorpusService({
            repository,
          });

        const result =
          await service
            .registerCase({
              organizationId:
                "org_test",

              environmentId:
                "env_test",

              corpusId:
                "corpus_1",

              datasetSourceId:
                "source_1",

              realityCase:
                buildRealityCase(),
            });

        expect(
          result.created
        ).toBe(
          true
        );

        expect(
          result.executionAuthorized
        ).toBe(
          false
        );

        expect(
          result.contentHash
        ).toMatch(
          /^[a-f0-9]{64}$/
        );

        const persisted =
          repository
            .registerCaseVersion
            .mock
            .calls[0][0];

        expect(
          persisted
            .visibleCase
            .sealedEvaluation
        ).toBeUndefined();

        expect(
          persisted
            .visibleCase
            .evaluationRubric
        ).toBeUndefined();

        expect(
          persisted
            .sealedEvaluation
            .expectedDiagnosis
        ).toBe(
          "upstream dependency outage"
        );

        expect(
          persisted
            .evaluationRubric
            .safetyDominates
        ).toBe(
          true
        );

        expect(
          persisted
            .executionAuthorized
        ).toBe(
          false
        );
      }
    );


    test(
      "registration rejects organization/environment scope mismatch",

      async () => {
        const service =
          new RealityCorpusService({
            repository: {
              registerCaseVersion:
                jest.fn(),
            },
          });

        await expect(
          service.registerCase({
            organizationId:
              "other_org",

            environmentId:
              "env_test",

            corpusId:
              "corpus_1",

            realityCase:
              buildRealityCase(),
          })
        ).rejects.toMatchObject({
          code:
            "REALITY_SCOPE_MISMATCH",

          executionAuthorized:
            false,
        });
      }
    );


    test(
      "replay retrieval fails closed if repository leaks sealed truth",

      async () => {
        const service =
          new RealityCorpusService({
            repository: {
              getCaseForReplay:
                jest
                  .fn()
                  .mockResolvedValue({
                    realityCase: {
                      identity: {
                        caseId:
                          "case_1",
                      },

                      sealedEvaluation: {
                        expectedDiagnosis:
                          "secret",
                      },
                    },

                    groundTruthIncluded:
                      false,
                  }),
            },
          });

        await expect(
          service.getCaseForReplay({
            organizationId:
              "org_test",

            environmentId:
              "env_test",

            caseId:
              "case_1",
          })
        ).rejects.toMatchObject({
          code:
            "REALITY_GROUND_TRUTH_LEAKAGE",

          executionAuthorized:
            false,
        });
      }
    );


    test(
      "evaluation retrieval may contain sealed truth but still grants no authority",

      async () => {
        const service =
          new RealityCorpusService({
            repository: {
              getCaseForEvaluation:
                jest
                  .fn()
                  .mockResolvedValue({
                    realityCase: {
                      identity: {
                        caseId:
                          "case_1",
                      },

                      sealedEvaluation: {
                        expectedDiagnosis:
                          "dependency outage",
                      },
                    },

                    groundTruthIncluded:
                      true,

                    executionAuthorized:
                      false,
                  }),
            },
          });

        const result =
          await service
            .getCaseForEvaluation({
              organizationId:
                "org_test",

              environmentId:
                "env_test",

              caseId:
                "case_1",
            });

        expect(
          result.groundTruthIncluded
        ).toBe(
          true
        );

        expect(
          result.executionAuthorized
        ).toBe(
          false
        );

        expect(
          result
            .realityCase
            .sealedEvaluation
            .expectedDiagnosis
        ).toBe(
          "dependency outage"
        );
      }
    );
  }
);