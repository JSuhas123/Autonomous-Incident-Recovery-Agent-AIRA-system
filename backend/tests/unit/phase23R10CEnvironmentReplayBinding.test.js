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
  RealityEnvironmentReplayBindingService,
  REALITY_ENVIRONMENT_REPLAY_BINDING_VERSION,
  ENVIRONMENT_REPLAY_RUN_STAGE,
} = require(
  "../../services/reality/realityEnvironmentReplayBindingService"
);

const {
  PostgresRealityEnvironmentReplayRepository,
} = require(
  "../../persistence/postgres/PostgresRealityEnvironmentReplayRepository"
);

function makeBinding(
  overrides = {}
) {
  return {
    id:
      "binding-db-id",

    environmentReplayRunId:
      "envreplay_001",

    replayRunId:
      "replay_001",

    caseId:
      "case_001",

    caseRevision:
      1,

    caseContentHash:
      "a".repeat(
        64
      ),

    labEnvironmentId:
      "lab_kind_001",

    experimentRunId:
      null,

    correlationId:
      "phase23r:replay_001:case_001",

    mode:
      "KUBERNETES",

    stage:
      ENVIRONMENT_REPLAY_RUN_STAGE
        .LAB_RESERVED,

    metadata:
      {},

    groundTruthAgentVisible:
      false,

    productionCertified:
      false,

    executionAuthorized:
      false,

    ...overrides,
  };
}

describe(
  "AIRA Phase 23R.10C — persisted environment replay binding",
  () => {
    test(
      "exports the 23R.10C binding version",
      () => {
        expect(
          REALITY_ENVIRONMENT_REPLAY_BINDING_VERSION
        ).toBe(
          "23R.10C.0"
        );
      }
    );

    test(
      "creates a safe replay-to-lab binding without authority",
      async () => {
        const repository = {
          createBinding:
            jest
              .fn()
              .mockResolvedValue(
                makeBinding()
              ),
        };

        const service =
          new RealityEnvironmentReplayBindingService({
            repository,
          });

        const result =
          await service.createBinding({
            organizationId:
              "org_test",

            environmentId:
              "env_test",

            replayRunId:
              "replay_001",

            labEnvironmentId:
              "lab_kind_001",

            correlationId:
              "phase23r:replay_001:case_001",

            mode:
              "KUBERNETES",

            metadata: {
              certification:
                "23R.10C",
            },
          });

        expect(
          repository.createBinding
        ).toHaveBeenCalledTimes(
          1
        );

        expect(
          result.stage
        ).toBe(
          "LAB_RESERVED"
        );

        expect(
          result.executionAuthorized
        ).toBe(
          false
        );

        expect(
          result.groundTruthAgentVisible
        ).toBe(
          false
        );

        expect(
          result.productionCertified
        ).toBe(
          false
        );
      }
    );

    test(
      "binds exactly one Phase-21 experiment identity",
      async () => {
        const repository = {
          bindExperimentRun:
            jest
              .fn()
              .mockResolvedValue(
                makeBinding({
                  experimentRunId:
                    "exprun_001",

                  stage:
                    "EXPERIMENT_BOUND",
                })
              ),
        };

        const service =
          new RealityEnvironmentReplayBindingService({
            repository,
          });

        const result =
          await service.bindExperimentRun({
            organizationId:
              "org_test",

            environmentId:
              "env_test",

            environmentReplayRunId:
              "envreplay_001",

            experimentRunId:
              "exprun_001",
          });

        expect(
          result.experimentRunId
        ).toBe(
          "exprun_001"
        );

        expect(
          result.stage
        ).toBe(
          "EXPERIMENT_BOUND"
        );

        expect(
          result.executionAuthorized
        ).toBe(
          false
        );
      }
    );

    test(
      "rejects production or execution authority at the binding boundary",
      async () => {
        const service =
          new RealityEnvironmentReplayBindingService({
            repository: {
              createBinding:
                jest.fn(),
            },
          });

        await expect(
          service.createBinding({
            executionAuthorized:
              true,
          })
        ).rejects.toMatchObject({
          code:
            "REALITY_ENVIRONMENT_REPLAY_BINDING_AUTHORITY_FORBIDDEN",
        });
      }
    );

    test(
      "rejects evaluator ground truth at the binding boundary",
      async () => {
        const service =
          new RealityEnvironmentReplayBindingService({
            repository: {
              createBinding:
                jest.fn(),
            },
          });

        await expect(
          service.createBinding({
            expectedDiagnosis:
              "pod crash",
          })
        ).rejects.toMatchObject({
          code:
            "REALITY_ENVIRONMENT_REPLAY_BINDING_GROUND_TRUTH_FORBIDDEN",
        });
      }
    );

    test(
      "fails closed if persisted binding reports authority or production proof",
      async () => {
        const service =
          new RealityEnvironmentReplayBindingService({
            repository: {
              createBinding:
                jest
                  .fn()
                  .mockResolvedValue(
                    makeBinding({
                      executionAuthorized:
                        true,
                    })
                  ),
            },
          });

        await expect(
          service.createBinding({
            organizationId:
              "org_test",

            environmentId:
              "env_test",

            replayRunId:
              "replay_001",

            labEnvironmentId:
              "lab_kind_001",

            correlationId:
              "phase23r:replay_001:case_001",

            mode:
              "KUBERNETES",
          })
        ).rejects.toMatchObject({
          code:
            "REALITY_ENVIRONMENT_REPLAY_BINDING_SAFETY_VIOLATION",
        });
      }
    );

    test(
      "repository binds experiment only when tenant lab and correlation identities match",
      async () => {
        const queries = [];

        const tenantScope = {
          run:
            async (
              _scope,
              work
            ) => work(
              {
                query:
                  async (
                    sql,
                    params
                  ) => {
                    queries.push({
                      sql,
                      params,
                    });

                    return {
                      rows: [
                        {
                          id:
                            "binding-db-id",

                          public_id:
                            "envreplay_001",

                          replay_run_id:
                            "replay-db-id",

                          replay_run_public_id:
                            "replay_001",

                          case_public_id:
                            "case_001",

                          case_revision:
                            1,

                          case_content_hash:
                            "a".repeat(
                              64
                            ),

                          lab_environment_id:
                            "lab-db-id",

                          lab_environment_public_id:
                            "lab_kind_001",

                          experiment_run_id:
                            "experiment-db-id",

                          experiment_run_public_id:
                            "exprun_001",

                          correlation_id:
                            "phase23r:replay_001:case_001",

                          mode:
                            "KUBERNETES",

                          stage:
                            "EXPERIMENT_BOUND",

                          execution_authorized:
                            false,
                        },
                      ],
                    };
                  },
              },
              {
                organizationUuid:
                  "11111111-1111-1111-1111-111111111111",

                environmentUuid:
                  "22222222-2222-2222-2222-222222222222",
              }
            ),
        };

        const repository =
          new PostgresRealityEnvironmentReplayRepository({
            tenantScope,
          });

        const result =
          await repository.bindExperimentRun({
            organizationId:
              "org_test",

            environmentId:
              "env_test",

            environmentReplayRunId:
              "envreplay_001",

            experimentRunId:
              "exprun_001",
          });

        expect(
          result.stage
        ).toBe(
          "EXPERIMENT_BOUND"
        );

        expect(
          queries[
            0
          ].sql
        ).toContain(
          "er.lab_environment_id = err.lab_environment_id"
        );

        expect(
          queries[
            0
          ].sql
        ).toContain(
          "er.correlation_id = err.correlation_id"
        );
      }
    );

    test(
      "migration enforces RLS immutable identity LAB_ONLY binding and no authority",
      () => {
        const migrationPath =
          path.join(
            __dirname,
            "../../persistence/postgres/migrations/0097_reality_environment_replay_binding.sql"
          );

        const migration =
          fs.readFileSync(
            migrationPath,
            "utf8"
          );

        expect(
          migration
        ).toContain(
          "CREATE TABLE IF NOT EXISTS\n    reality.environment_replay_runs"
        );

        expect(
          migration
        ).toContain(
          "safety_class IS DISTINCT FROM 'LAB_ONLY'"
        );

        expect(
          migration
        ).toContain(
          "execution_authorized = FALSE"
        );

        expect(
          migration
        ).toContain(
          "FORCE ROW LEVEL SECURITY"
        );

        expect(
          migration
        ).toContain(
          "Reality environment replay identity is immutable"
        );

        expect(
          migration
        ).toContain(
          "Phase 21 experiment binding is immutable once established"
        );
      }
    );
  }
);