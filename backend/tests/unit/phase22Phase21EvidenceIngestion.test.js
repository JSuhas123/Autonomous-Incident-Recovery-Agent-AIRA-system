"use strict";


const {
  Phase21EvidenceIngestionService,

  assertPhase21ArtifactSafe,
} =
  require(
    "../../services/certification/phase21EvidenceIngestionService"
  );


const PostgresPhase21CertificationEvidenceReader =
  require(
    "../../persistence/postgres/PostgresPhase21CertificationEvidenceReader"
  );


describe(
  "Phase 22.3 Phase-21 evidence ingestion",

  () => {
    function passingArtifact(
      overrides =
        {}
    ) {
      return {
        certificateVersion:
          "21.16-batch8b-live-v3",

        certifiedAt:
          "2026-08-31T20:44:20.983Z",

        organizationId:
          "aira-dev-org",

        environmentId:
          "env_aira_development",

        experimentRunId:
          "exprun_test",

        incidentId:
          "incident_test",

        selectedFailureMode:
          "kubernetes.pod.crash",

        selectedPlaybookId:
          "PB-PHASE21-K8S-RESTART-LAB-001",

        evaluation: {
          result:
            "PASS",

          groundTruthExposed:
            false,

          executionAuthorized:
            false,
        },

        groundTruthToAira:
          false,

        productionCertified:
          false,

        phase21ExecutionAuthorized:
          false,

        /*
         * This is legal.
         *
         * It means canonical Phase-20 authorization was observed.
         * It does NOT mean Phase 21 granted authorization.
         */
        canonicalExecutionAuthorizationObserved:
          true,

        passed:
          true,

        ...overrides,
      };
    }


    test(
      "passing Phase-21 evidence is accepted without creating authority",

      () => {
        expect(
          assertPhase21ArtifactSafe(
            passingArtifact(),

            "batch8b.json"
          )
        )
          .toBe(
            true
          );
      }
    );


    test(
      "canonical Phase-20 authorization evidence is allowed while Phase-21 authority remains false",

      () => {
        expect(
          assertPhase21ArtifactSafe(
            passingArtifact({
              canonicalExecutionAuthorizationObserved:
                true,

              phase21ExecutionAuthorized:
                false,
            }),

            "batch8b.json"
          )
        )
          .toBe(
            true
          );
      }
    );


    test(
      "Phase-21 execution authority claim is rejected",

      () => {
        expect(
          () =>
            assertPhase21ArtifactSafe(
              passingArtifact({
                phase21ExecutionAuthorized:
                  true,
              }),

              "unsafe.json"
            )
        )
          .toThrow(
            "claims Phase-21 execution authority"
          );
      }
    );


    test(
      "production certification claim is rejected",

      () => {
        expect(
          () =>
            assertPhase21ArtifactSafe(
              passingArtifact({
                productionCertified:
                  true,
              }),

              "unsafe.json"
            )
        )
          .toThrow(
            "claims production certification"
          );
      }
    );


    test(
      "ground truth leakage is rejected",

      () => {
        expect(
          () =>
            assertPhase21ArtifactSafe(
              passingArtifact({
                groundTruthToAira:
                  true,
              }),

              "unsafe.json"
            )
        )
          .toThrow(
            "exposes evaluator ground truth"
          );
      }
    );


    test(
      "non-passing evidence is rejected",

      () => {
        expect(
          () =>
            assertPhase21ArtifactSafe(
              passingArtifact({
                passed:
                  false,

                evaluation: {
                  result:
                    "FAIL",

                  groundTruthExposed:
                    false,
                },
              }),

              "failed.json"
            )
        )
          .toThrow(
            "is not passing evidence"
          );
      }
    );


    test(
      "ingestion persists artifact hashes and canonical PostgreSQL evidence",

      async () => {
        const appendEvidenceLink =
          jest
            .fn()
            .mockImplementation(
              async (
                input
              ) => ({
                publicId:
                  `evidence_${appendEvidenceLink.mock.calls.length + 1}`,

                ...input,

                executionAuthorized:
                  false,
              })
            );


        const certificationRepository = {
          appendEvidenceLink,
        };


        const phase21Reader = {
          readExperimentEvidence:
            jest.fn(
              async () => ({
                source:
                  "POSTGRESQL_RELIABILITY_SCHEMA",

                experimentRun: {
                  public_id:
                    "exprun_test",

                  status:
                    "COMPLETED",

                  execution_authorized:
                    false,
                },

                failureInjections: [
                  {
                    public_id:
                      "inject_1",

                    failure_type:
                      "kubernetes.pod.crash",

                    execution_authorized:
                      false,
                  },
                ],

                observations: [
                  {
                    public_id:
                      "obs_1",

                    observation_type:
                      "HEALTH",

                    execution_authorized:
                      false,
                  },
                ],

                assertionResults: [
                  {
                    public_id:
                      "assert_1",

                    assertion_key:
                      "RECOVERY_VERIFIED",

                    status:
                      "PASS",

                    execution_authorized:
                      false,
                  },
                ],

                metrics: [
                  {
                    public_id:
                      "metric_1",

                    metric_key:
                      "experiment_score",

                    value:
                      100,

                    execution_authorized:
                      false,
                  },
                ],

                executionAuthorized:
                  false,
              })
            ),
        };


        const service =
          new Phase21EvidenceIngestionService({
            certificationRepository,

            phase21Reader,
          });


        const result =
          await service.ingest({
            organizationId:
              "aira-dev-org",

            environmentId:
              "env_aira_development",

            certificationRunId:
              "certrun_phase22_3",

            experimentRunId:
              "exprun_test",

            artifacts: [
              {
                name:
                  "phase21-batch8b-live-certification.json",

                rawText:
                  JSON.stringify(
                    passingArtifact()
                  ),
              },
            ],
          });


        expect(
          result.artifactCount
        )
          .toBe(
            1
          );


        expect(
          result
            .postgresEvidence
            .experimentRunId
        )
          .toBe(
            "exprun_test"
          );


        expect(
          result
            .postgresEvidence
            .failureInjectionCount
        )
          .toBe(
            1
          );


        expect(
          result
            .postgresEvidence
            .observationCount
        )
          .toBe(
            1
          );


        expect(
          result
            .postgresEvidence
            .assertionCount
        )
          .toBe(
            1
          );


        expect(
          result
            .postgresEvidence
            .metricCount
        )
          .toBe(
            1
          );


        expect(
          result.evidenceDigest
        )
          .toMatch(
            /^[0-9a-f]{64}$/
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


        expect(
          result.phase21EvidenceMutated
        )
          .toBe(
            false
          );


        expect(
          appendEvidenceLink
        )
          .toHaveBeenCalledTimes(
            2
          );
      }
    );


    test(
      "canonical PostgreSQL evidence with execution_authorized=true fails closed",

      async () => {
        const service =
          new Phase21EvidenceIngestionService({
            certificationRepository: {
              appendEvidenceLink:
                jest.fn(
                  async (
                    input
                  ) =>
                    input
                ),
            },

            phase21Reader: {
              readExperimentEvidence:
                jest.fn(
                  async () => ({
                    experimentRun: {
                      public_id:
                        "exprun_test",

                      execution_authorized:
                        false,
                    },

                    failureInjections:
                      [],

                    observations:
                      [],

                    assertionResults:
                      [],

                    metrics: [
                      {
                        metric_key:
                          "unsafe",

                        execution_authorized:
                          true,
                      },
                    ],
                  })
                ),
            },
          });


        await expect(
          service.ingest({
            organizationId:
              "aira-dev-org",

            environmentId:
              "env_aira_development",

            certificationRunId:
              "certrun_phase22_3",

            experimentRunId:
              "exprun_test",

            artifacts: [
              {
                name:
                  "phase21-batch8b-live-certification.json",

                content:
                  passingArtifact(),
              },
            ],
          })
        )
          .rejects
          .toThrow(
            "contains execution_authorized=true"
          );
      }
    );


    test(
      "PostgreSQL reader uses canonical reliability tables and tenant scope",

      async () => {
        const query =
          jest
            .fn()

            .mockResolvedValueOnce({
              rows: [
                {
                  id:
                    "run-uuid",

                  public_id:
                    "exprun_test",

                  execution_authorized:
                    false,
                },
              ],
            })

            .mockResolvedValue({
              rows:
                [],
            });


        const scope = {
          run:
            jest.fn(
              async (
                requestedScope,
                work
              ) =>
                work(
                  {
                    query,
                  },

                  requestedScope
                )
            ),
        };


        const reader =
          new PostgresPhase21CertificationEvidenceReader({
            scope,
          });


        const result =
          await reader
            .readExperimentEvidence({
              organizationId:
                "aira-dev-org",

              environmentId:
                "env_aira_development",

              experimentRunId:
                "exprun_test",
            });


        expect(
          scope.run
        )
          .toHaveBeenCalledWith(
            {
              organizationId:
                "aira-dev-org",

              environmentId:
                "env_aira_development",
            },

            expect.any(
              Function
            ),

            null
          );


        const sql =
          query
            .mock
            .calls
            .map(
              call =>
                call[0]
            )
            .join(
              "\n"
            );


        expect(
          sql
        )
          .toContain(
            "reliability.experiment_runs"
          );


        expect(
          sql
        )
          .toContain(
            "reliability.failure_injections"
          );


        expect(
          sql
        )
          .toContain(
            "reliability.observations"
          );


        expect(
          sql
        )
          .toContain(
            "reliability.assertion_results"
          );


        expect(
          sql
        )
          .toContain(
            "reliability.metrics"
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