"use strict";

const fs =
  require(
    "node:fs"
  );

const path =
  require(
    "node:path"
  );


const PostgresReliabilityLabRepository =
  require(
    "../../persistence/postgres/PostgresReliabilityLabRepository"
  );


const {
  LabEnvironmentLifecycleService,

  assertTransitionAllowed,
} =
  require(
    "../../services/reliability/labEnvironmentLifecycleService"
  );


const {
  LAB_ENVIRONMENT_KIND,

  LAB_ENVIRONMENT_STATUS,
} =
  require(
    "../../constants/reliabilityLab"
  );


describe(
  "Phase 21.2 PostgreSQL Reliability Lab evidence",
  () => {
    test(
      "0082 creates all canonical Phase 21 reliability tables",
      () => {
        const migration =
          fs.readFileSync(
            path.join(
              __dirname,

              "../../persistence/postgres/migrations/0082_reliability_lab_foundation.sql"
            ),

            "utf8"
          );


        const tables = [
          "reliability.lab_environments",

          "reliability.experiment_definitions",

          "reliability.experiment_runs",

          "reliability.failure_injections",

          "reliability.observations",

          "reliability.assertion_results",

          "reliability.metrics",
        ];


        for (
          const table
          of tables
        ) {
          expect(
            migration
          ).toContain(
            table
          );
        }
      }
    );


    test(
      "Phase 21 canonical tables enforce RLS and never-authorize semantics",
      () => {
        const migration =
          fs.readFileSync(
            path.join(
              __dirname,

              "../../persistence/postgres/migrations/0082_reliability_lab_foundation.sql"
            ),

            "utf8"
          );


        expect(
          migration
        ).toContain(
          "ENABLE ROW LEVEL SECURITY"
        );


        expect(
          migration
        ).toContain(
          "FORCE ROW LEVEL SECURITY"
        );


        expect(
          migration
        ).toContain(
          "execution_authorized = FALSE"
        );


        expect(
          migration
        ).toContain(
          "reliability_lab_environment_not_production"
        );
      }
    );


    test(
      "experiment definitions are immutable and versioned",
      () => {
        const migration =
          fs.readFileSync(
            path.join(
              __dirname,

              "../../persistence/postgres/migrations/0082_reliability_lab_foundation.sql"
            ),

            "utf8"
          );


        expect(
          migration
        ).toContain(
          "Reliability experiment definitions are immutable"
        );


        expect(
          migration
        ).toContain(
          "experiment_key"
        );


        expect(
          migration
        ).toContain(
          "version"
        );
      }
    );


    test(
      "repository scopes lab environment writes through PostgresTenantScope",
      async () => {
        const scope = {
          run:
            jest.fn(
              async (
                requestedScope,
                work
              ) => {
                const client = {
                  query:
                    jest.fn(
                      async () => ({
                        rows: [
                          {
                            id:
                              "lab-uuid",

                            public_id:
                              "lab_primary",

                            organization_id:
                              "org-uuid",

                            environment_id:
                              "env-uuid",

                            name:
                              "Primary Lab",

                            kind:
                              "KIND",

                            status:
                              "ABSENT",

                            safety_class:
                              "LAB_ONLY",

                            production:
                              false,

                            labels:
                              {},

                            configuration:
                              {},

                            baseline:
                              {},

                            execution_authorized:
                              false,
                          },
                        ],
                      })
                    ),
                };


                return work(
                  client,

                  {
                    organizationUuid:
                      "org-uuid",

                    environmentUuid:
                      "env-uuid",
                  }
                );
              }
            ),
        };


        const repository =
          new PostgresReliabilityLabRepository({
            scope,
          });


        const result =
          await repository
            .createLabEnvironment({
              organizationId:
                "aira-dev-org",

              environmentId:
                "env_aira_development",

              name:
                "Primary Lab",

              kind:
                "KIND",
            });


        expect(
          scope.run
        ).toHaveBeenCalledWith(
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


        expect(
          result.executionAuthorized
        ).toBe(
          false
        );


        expect(
          result.production
        ).toBe(
          false
        );
      }
    );


    test(
      "repository-generated experiment run remains non-authorizing",
      async () => {
        const scope = {
          run:
            jest.fn(
              async (
                _requestedScope,
                work
              ) => {
                const client = {
                  query:
                    jest.fn(
                      async () => ({
                        rows: [
                          {
                            id:
                              "run-uuid",

                            public_id:
                              "exprun_123",

                            organization_id:
                              "org-uuid",

                            environment_id:
                              "env-uuid",

                            lab_environment_id:
                              "lab-uuid",

                            experiment_definition_id:
                              "def-uuid",

                            experiment_key:
                              "k8s.pod.crash.recovery",

                            experiment_version:
                              1,

                            correlation_id:
                              "corr_123",

                            status:
                              "CREATED",

                            outcome:
                              null,

                            baseline_snapshot:
                              {},

                            final_snapshot:
                              {},

                            failure_summary:
                              {},

                            recovery_summary:
                              {},

                            verification_summary:
                              {},

                            reset_summary:
                              {},

                            metadata:
                              {},

                            execution_authorized:
                              false,
                          },
                        ],
                      })
                    ),
                };


                return work(
                  client,

                  {
                    organizationUuid:
                      "org-uuid",

                    environmentUuid:
                      "env-uuid",
                  }
                );
              }
            ),
        };


        const repository =
          new PostgresReliabilityLabRepository({
            scope,
          });


        const run =
          await repository
            .createExperimentRun({
              organizationId:
                "aira-dev-org",

              environmentId:
                "env_aira_development",

              labEnvironmentId:
                "lab_primary",

              experimentKey:
                "k8s.pod.crash.recovery",

              experimentVersion:
                1,

              correlationId:
                "corr_123",
            });


        expect(
          run.executionAuthorized
        ).toBe(
          false
        );


        expect(
          run.status
        ).toBe(
          "CREATED"
        );
      }
    );
  }
);


describe(
  "Phase 21.3 Reliability Lab environment lifecycle",
  () => {
    test(
      "valid lifecycle permits ABSENT -> PROVISIONING -> READY",
      () => {
        expect(
          assertTransitionAllowed(
            "ABSENT",
            "PROVISIONING"
          )
        ).toBe(
          true
        );


        expect(
          assertTransitionAllowed(
            "PROVISIONING",
            "READY"
          )
        ).toBe(
          true
        );
      }
    );


    test(
      "invalid lifecycle transition fails explicitly",
      () => {
        expect(
          () =>
            assertTransitionAllowed(
              "ABSENT",
              "AVAILABLE"
            )
        ).toThrow(
          expect.objectContaining({
            code:
              "RELIABILITY_LAB_TRANSITION_INVALID",

            executionAuthorized:
              false,
          })
        );
      }
    );


    test(
      "DIRTY environment cannot jump directly to AVAILABLE",
      () => {
        expect(
          () =>
            assertTransitionAllowed(
              "DIRTY",
              "AVAILABLE"
            )
        ).toThrow(
          expect.objectContaining({
            code:
              "RELIABILITY_LAB_TRANSITION_INVALID",
          })
        );
      }
    );


    test(
      "AVAILABLE environment may begin experiment",
      async () => {
        const repository = {
          getLabEnvironment:
            jest.fn(
              async () => ({
                id:
                  "lab-uuid",

                publicId:
                  "lab_primary",

                kind:
                  LAB_ENVIRONMENT_KIND
                    .KIND,

                status:
                  LAB_ENVIRONMENT_STATUS
                    .AVAILABLE,

                safetyClass:
                  "LAB_ONLY",

                production:
                  false,

                executionAuthorized:
                  false,
              })
            ),

          updateLabEnvironmentState:
            jest.fn(
              async (
                input
              ) => ({
                publicId:
                  input
                    .labEnvironmentId,

                status:
                  input.status,

                executionAuthorized:
                  false,
              })
            ),
        };


        const service =
          new LabEnvironmentLifecycleService({
            repository,
          });


        const result =
          await service
            .beginExperiment({
              organizationId:
                "aira-dev-org",

              environmentId:
                "env_aira_development",

              labEnvironmentId:
                "lab_primary",
            });


        expect(
          result.status
        ).toBe(
          "RUNNING_EXPERIMENT"
        );


        expect(
          result.executionAuthorized
        ).toBe(
          false
        );
      }
    );


    test(
      "DIRTY environment is rejected before experiment starts",
      async () => {
        const repository = {
          getLabEnvironment:
            jest.fn(
              async () => ({
                id:
                  "lab-uuid",

                publicId:
                  "lab_primary",

                kind:
                  "KIND",

                status:
                  "DIRTY",

                safetyClass:
                  "LAB_ONLY",

                production:
                  false,

                executionAuthorized:
                  false,
              })
            ),
        };


        const service =
          new LabEnvironmentLifecycleService({
            repository,
          });


        await expect(
          service
            .beginExperiment({
              organizationId:
                "aira-dev-org",

              environmentId:
                "env_aira_development",

              labEnvironmentId:
                "lab_primary",
            })
        ).rejects
          .toMatchObject({
            code:
              "RELIABILITY_LAB_NOT_RUNNABLE",

            executionAuthorized:
              false,
          });
      }
    );


    test(
      "failed reset cannot silently restore availability",
      async () => {
        const repository = {
          getLabEnvironment:
            jest.fn(
              async () => ({
                id:
                  "lab-uuid",

                publicId:
                  "lab_primary",

                kind:
                  "KIND",

                status:
                  "RESETTING",

                safetyClass:
                  "LAB_ONLY",

                production:
                  false,

                executionAuthorized:
                  false,
              })
            ),

          updateLabEnvironmentState:
            jest.fn(
              async (
                input
              ) => ({
                status:
                  input.status,

                dirtyReason:
                  input.dirtyReason,

                executionAuthorized:
                  false,
              })
            ),
        };


        const service =
          new LabEnvironmentLifecycleService({
            repository,
          });


        const result =
          await service
            .failReset(
              {
                organizationId:
                  "aira-dev-org",

                environmentId:
                  "env_aira_development",

                labEnvironmentId:
                  "lab_primary",
              },

              "workload still unhealthy"
            );


        expect(
          result.status
        ).toBe(
          "RESET_FAILED"
        );


        expect(
          result.dirtyReason
        ).toBe(
          "workload still unhealthy"
        );
      }
    );


    test(
      "successful reset produces AVAILABLE environment with refreshed baseline",
      async () => {
        const repository = {
          getLabEnvironment:
            jest.fn(
              async () => ({
                id:
                  "lab-uuid",

                publicId:
                  "lab_primary",

                kind:
                  "KIND",

                status:
                  "RESETTING",

                safetyClass:
                  "LAB_ONLY",

                production:
                  false,

                executionAuthorized:
                  false,
              })
            ),

          updateLabEnvironmentState:
            jest.fn(
              async (
                input
              ) => ({
                status:
                  input.status,

                baseline:
                  input.baseline,

                lastResetAt:
                  input.lastResetAt,

                executionAuthorized:
                  false,
              })
            ),
        };


        const service =
          new LabEnvironmentLifecycleService({
            repository,

            now:
              () =>
                new Date(
                  "2026-08-30T14:00:00.000Z"
                ),
          });


        const result =
          await service
            .completeReset(
              {
                organizationId:
                  "aira-dev-org",

                environmentId:
                  "env_aira_development",

                labEnvironmentId:
                  "lab_primary",
              },

              {
                healthy:
                  true,

                servicesReady:
                  5,
              }
            );


        expect(
          result.status
        ).toBe(
          "AVAILABLE"
        );


        expect(
          result.baseline
            .healthy
        ).toBe(
          true
        );


        expect(
          result.executionAuthorized
        ).toBe(
          false
        );
      }
    );
  }
);