"use strict";

const fs =
  require("fs");

const path =
  require("path");


const PostgresFailureModeRepository =
  require(
    "../../persistence/postgres/PostgresFailureModeRepository"
  );


const FailureModePlaybookCoverageResolver =
  require(
    "../../coverage/FailureModePlaybookCoverageResolver"
  );


const PlaybookRunbookCompletenessService =
  require(
    "../../coverage/PlaybookRunbookCompletenessService"
  );


const ROOT =
  path.resolve(
    __dirname,
    "../.."
  );


describe(
  "Phase 19.4-19.6 Knowledge Coverage Resolution",
  () => {
    test(
      "Failure Mode repository queries canonical PostgreSQL knowledge",
      () => {
        const source =
          fs.readFileSync(
            path.join(
              ROOT,
              "persistence/postgres/PostgresFailureModeRepository.js"
            ),
            "utf8"
          );


        expect(
          source
        ).toMatch(
          /knowledge\.failure_mode_versions/
        );


        expect(
          source
        ).toMatch(
          /knowledge\.failure_mode_definitions/
        );


        expect(
          source
        ).toMatch(
          /PostgresTenantScope/
        );


        expect(
          source
        ).not.toMatch(
          /mongoose/i
        );
      }
    );


    test(
      "Failure Mode repository resolves resource-type applicability",
      async () => {
        const query =
          jest.fn()
            .mockResolvedValue({
              rows: [
                {
                  id:
                    "fm-version-uuid",

                  public_id:
                    "fmv-1",

                  failure_mode_definition_id:
                    "fm-def-uuid",

                  failure_mode_key:
                    "FM-POSTGRES-CORRUPTION",

                  domain_key:
                    "database.postgres",

                  definition_name:
                    "PostgreSQL corruption",

                  definition_description:
                    "Database corruption",

                  definition_status:
                    "ACTIVE",

                  scope_type:
                    "GLOBAL",

                  organization_id:
                    null,

                  environment_id:
                    null,

                  semver:
                    "1.0.0",

                  severity:
                    "CRITICAL",

                  lifecycle:
                    "ACTIVE",

                  resource_types: [
                    "postgres.database",
                  ],

                  triggers:
                    [],

                  symptoms:
                    [],

                  evidence_requirement_ids:
                    [],

                  investigation_step_ids:
                    [],

                  hypothesis_ids:
                    [],

                  playbooks: [
                    "PB-POSTGRES-RECOVERY",
                  ],

                  required_capabilities:
                    [],

                  risk:
                    {},

                  policy_requirements:
                    [],

                  rollback:
                    {},

                  verification:
                    {},

                  escalation:
                    {},

                  provenance:
                    {},

                  safety: {
                    executionAuthorized:
                      false,
                  },

                  source_document:
                    {},

                  metadata:
                    {},
                },
              ],
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
                )
            ),
        };


        const repository =
          new PostgresFailureModeRepository({
            scope,
          });


        const result =
          await repository
            .listApplicableVersions({
              organizationId:
                "org-public",

              environmentId:
                "env-public",

              resourceType:
                "postgres.database",
            });


        expect(
          result
        ).toHaveLength(
          1
        );


        expect(
          result[0]
            .failureModeKey
        ).toBe(
          "FM-POSTGRES-CORRUPTION"
        );


        expect(
          result[0]
            .executionAuthorized
        ).toBe(false);


        expect(
          query.mock
            .calls[0][1][0]
        ).toBe(
          "postgres.database"
        );
      }
    );


    test(
      "Failure Mode resolver reports no Playbook",
      async () => {
        const resolver =
          new FailureModePlaybookCoverageResolver({
            playbookRepository: {
              listVisibleVersions:
                jest.fn(),
            },
          });


        const result =
          await resolver.resolve({
            organizationId:
              "org-1",

            environmentId:
              "env-1",

            failureMode: {
              failureModeKey:
                "FM-POSTGRES-CORRUPTION",

              playbooks:
                [],
            },
          });


        expect(
          result.hasPlaybookKnowledge
        ).toBe(false);


        expect(
          result.reasonCodes
        ).toContain(
          "NO_PLAYBOOK"
        );


        expect(
          result.executionAuthorized
        ).toBe(false);
      }
    );


    test(
      "Failure Mode resolver finds approved Playbook",
      async () => {
        const resolver =
          new FailureModePlaybookCoverageResolver({
            playbookRepository: {
              listVisibleVersions:
                jest.fn()
                  .mockResolvedValue([
                    {
                      id:
                        "pb-version-uuid",

                      publicId:
                        "pbv-1",

                      playbookId:
                        "PB-POSTGRES-RECOVERY",

                      semver:
                        "1.0.0",

                      lifecycle:
                        "APPROVED",

                      checksum:
                        "abc",

                      definition: {
                        stages: [
                          {
                            stageId:
                              "stage-1",

                            runbookId:
                              "RB-POSTGRES-RECOVERY",

                            runbookVersion:
                              "1.0.0",
                          },
                        ],
                      },
                    },
                  ]),
            },
          });


        const result =
          await resolver.resolve({
            organizationId:
              "org-1",

            environmentId:
              "env-1",

            failureMode: {
              failureModeKey:
                "FM-POSTGRES-CORRUPTION",

              playbooks: [
                {
                  playbookId:
                    "PB-POSTGRES-RECOVERY",

                  version:
                    "1.0.0",
                },
              ],
            },
          });


        expect(
          result.hasPlaybookKnowledge
        ).toBe(true);


        expect(
          result.hasApprovedRecovery
        ).toBe(true);


        expect(
          result.resolvedPlaybooks[0]
            .version
        ).toBe(
          "1.0.0"
        );


        expect(
          result.executionAuthorized
        ).toBe(false);
      }
    );


    test(
      "validated-only Playbook is knowledge but not approved recovery",
      async () => {
        const resolver =
          new FailureModePlaybookCoverageResolver({
            playbookRepository: {
              listVisibleVersions:
                jest.fn()
                  .mockResolvedValue([
                    {
                      id:
                        "pb-version-uuid",

                      playbookId:
                        "PB-DR",

                      semver:
                        "1.0.0",

                      lifecycle:
                        "VALIDATED",

                      definition: {
                        stages: [],
                      },
                    },
                  ]),
            },
          });


        const result =
          await resolver.resolve({
            organizationId:
              "org",

            environmentId:
              "env",

            failureMode: {
              failureModeKey:
                "FM-AWS-REGION-OUTAGE",

              playbooks: [
                "PB-DR",
              ],
            },
          });


        expect(
          result.hasPlaybookKnowledge
        ).toBe(true);


        expect(
          result.hasApprovedRecovery
        ).toBe(false);


        expect(
          result.reasonCodes
        ).toContain(
          "NO_APPROVED_PLAYBOOK"
        );
      }
    );


    test(
      "procedural completeness resolves exact Runbook",
      async () => {
        const service =
          new PlaybookRunbookCompletenessService({
            runbookRepository: {
              listVisibleVersions:
                jest.fn()
                  .mockResolvedValue([
                    {
                      id:
                        "rb-version-uuid",

                      publicId:
                        "rbv-1",

                      runbookId:
                        "RB-POSTGRES-RECOVERY",

                      semver:
                        "1.0.0",

                      lifecycle:
                        "APPROVED",

                      checksum:
                        "runbook-checksum",

                      definition: {
                        name:
                          "Postgres Recovery",
                      },
                    },
                  ]),
            },
          });


        const result =
          await service.evaluate({
            organizationId:
              "org",

            environmentId:
              "env",

            playbooks: [
              {
                playbookId:
                  "PB-POSTGRES-RECOVERY",

                version:
                  "1.0.0",

                lifecycle:
                  "APPROVED",

                checksum:
                  "pb-checksum",

                stages: [
                  {
                    stageId:
                      "stage-1",

                    runbookId:
                      "RB-POSTGRES-RECOVERY",

                    runbookVersion:
                      "1.0.0",
                  },
                ],
              },
            ],
          });


        expect(
          result
            .hasCompleteRecoveryProcedure
        ).toBe(true);


        expect(
          result.complete
        ).toBe(true);


        expect(
          result.completePlaybooks
        ).toHaveLength(
          1
        );


        expect(
          result.executionAuthorized
        ).toBe(false);
      }
    );


    test(
      "missing Runbook creates procedural coverage gap",
      async () => {
        const service =
          new PlaybookRunbookCompletenessService({
            runbookRepository: {
              listVisibleVersions:
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

            playbooks: [
              {
                playbookId:
                  "PB-KAFKA-SPLIT-BRAIN",

                version:
                  "1.0.0",

                lifecycle:
                  "APPROVED",

                stages: [
                  {
                    stageId:
                      "stage-1",

                    runbookId:
                      "RB-KAFKA-RECOVER",

                    runbookVersion:
                      "1.0.0",
                  },
                ],
              },
            ],
          });


        expect(
          result
            .hasCompleteRecoveryProcedure
        ).toBe(false);


        expect(
          result.reasonCodes
        ).toContain(
          "RUNBOOK_MISSING"
        );
      }
    );


    test(
      "ambiguous unversioned Runbook is not considered deterministic coverage",
      async () => {
        const service =
          new PlaybookRunbookCompletenessService({
            runbookRepository: {
              listVisibleVersions:
                jest.fn()
                  .mockResolvedValue([
                    {
                      id:
                        "rb-v1",

                      runbookId:
                        "RB-DB-RECOVER",

                      semver:
                        "1.0.0",

                      lifecycle:
                        "APPROVED",

                      definition:
                        {},
                    },

                    {
                      id:
                        "rb-v2",

                      runbookId:
                        "RB-DB-RECOVER",

                      semver:
                        "2.0.0",

                      lifecycle:
                        "ACTIVE",

                      definition:
                        {},
                    },
                  ]),
            },
          });


        const result =
          await service.evaluate({
            organizationId:
              "org",

            environmentId:
              "env",

            playbooks: [
              {
                playbookId:
                  "PB-DB-RECOVER",

                version:
                  "1.0.0",

                lifecycle:
                  "APPROVED",

                stages: [
                  {
                    runbookId:
                      "RB-DB-RECOVER",
                  },
                ],
              },
            ],
          });


        expect(
          result.complete
        ).toBe(false);


        expect(
          result.reasonCodes
        ).toContain(
          "RUNBOOK_VERSION_UNRESOLVED"
        );
      }
    );


    test(
      "Phase 19 reuses Phase 18 deterministic composer",
      () => {
        const source =
          fs.readFileSync(
            path.join(
              ROOT,
              "coverage/PlaybookRunbookCompletenessService.js"
            ),
            "utf8"
          );


        expect(
          source
        ).toMatch(
          /DeterministicPlaybookComposer/
        );


        expect(
          source
        ).not.toMatch(
          /child_process/
        );


        expect(
          source
        ).not.toMatch(
          /execSync\s*\(/
        );
      }
    );


    test(
      "knowledge coverage resolution never authorizes execution",
      () => {
        const files = [
          "persistence/postgres/PostgresFailureModeRepository.js",

          "coverage/FailureModePlaybookCoverageResolver.js",

          "coverage/PlaybookRunbookCompletenessService.js",
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
        }
      }
    );
  }
);