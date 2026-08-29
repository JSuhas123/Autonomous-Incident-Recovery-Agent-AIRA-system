"use strict";

const fs =
  require("fs");

const path =
  require("path");


const RollbackReadinessService =
  require(
    "../../coverage/RollbackReadinessService"
  );


const VerificationReadinessService =
  require(
    "../../coverage/VerificationReadinessService"
  );


const EscalationCoverageService =
  require(
    "../../coverage/EscalationCoverageService"
  );


const PostgresRecoveryExecutionHistoryRepository =
  require(
    "../../persistence/postgres/PostgresRecoveryExecutionHistoryRepository"
  );


const HistoricalValidationCoverageService =
  require(
    "../../coverage/HistoricalValidationCoverageService"
  );


const ROOT =
  path.resolve(
    __dirname,
    "../.."
  );


describe(
  "Phase 19.10-19.12 Recovery Validation Coverage",
  () => {
    /*
     * ========================================================================
     * 19.10 ROLLBACK
     * ========================================================================
     */


    test(
      "required rollback missing creates ROLLBACK_MISSING gap",
      () => {
        const service =
          new RollbackReadinessService();


        const result =
          service.evaluate({
            rollbackRequired:
              true,

            playbook: {
              rollback: {
                available:
                  false,

                strategy:
                  "NONE",
              },
            },

            runbooks: [],
          });


        expect(
          result.rollbackRequired
        ).toBe(true);


        expect(
          result.complete
        ).toBe(false);


        expect(
          result.reasonCodes
        ).toContain(
          "ROLLBACK_MISSING"
        );


        expect(
          result.executionAuthorized
        ).toBe(false);
      }
    );


    test(
      "missing rollback is not a deficiency when rollback is explicitly not required",
      () => {
        const service =
          new RollbackReadinessService();


        const result =
          service.evaluate({
            rollbackRequired:
              false,

            playbook: {
              rollback: null,
            },

            runbooks: [],
          });


        expect(
          result.complete
        ).toBe(true);


        expect(
          result.reasonCodes
        ).toEqual([]);
      }
    );


    test(
      "explicit rollback knowledge satisfies required rollback readiness",
      () => {
        const service =
          new RollbackReadinessService();


        const result =
          service.evaluate({
            rollbackRequired:
              true,

            playbook: {
              rollback: {
                strategy:
                  "RESTORE_PREVIOUS_STATE",

                steps: [
                  "restore",
                ],
              },
            },

            runbooks: [],
          });


        expect(
          result.rollbackAvailable
        ).toBe(true);


        expect(
          result.complete
        ).toBe(true);
      }
    );


    /*
     * ========================================================================
     * VERIFICATION
     * ========================================================================
     */


    test(
      "missing verification creates VERIFICATION_MISSING",
      () => {
        const service =
          new VerificationReadinessService();


        const result =
          service.evaluate({
            playbook: {},

            runbooks: [],
          });


        expect(
          result.verificationRequired
        ).toBe(true);


        expect(
          result.verificationDefined
        ).toBe(false);


        expect(
          result.complete
        ).toBe(false);


        expect(
          result.reasonCodes
        ).toContain(
          "VERIFICATION_MISSING"
        );


        expect(
          result.commandSuccessIsVerification
        ).toBe(false);
      }
    );


    test(
      "explicit verification satisfies verification readiness",
      () => {
        const service =
          new VerificationReadinessService();


        const result =
          service.evaluate({
            playbook: {
              verification: {
                strategy:
                  "ALL",

                checks: [
                  {
                    type:
                      "HEALTH_CHECK",
                  },
                ],
              },
            },

            runbooks: [],
          });


        expect(
          result.verificationDefined
        ).toBe(true);


        expect(
          result.complete
        ).toBe(true);


        expect(
          result.executionAuthorized
        ).toBe(false);
      }
    );


    /*
     * ========================================================================
     * 19.11 ESCALATION
     * ========================================================================
     */


    test(
      "human escalation remains available for incomplete recovery",
      () => {
        const service =
          new EscalationCoverageService();


        const result =
          service.evaluate({
            failureMode: {
              escalation: {
                destinations: [
                  "DATABASE_ON_CALL",
                ],

                triggers: [
                  "CAPABILITY_MISSING",
                ],
              },
            },

            context: {
              missingCapability:
                true,

              reason:
                "CAPABILITY_MISSING",
            },
          });


        expect(
          result.escalationDefined
        ).toBe(true);


        expect(
          result.escalationTriggered
        ).toBe(true);


        expect(
          result.destinations
        ).toContain(
          "DATABASE_ON_CALL"
        );


        expect(
          result.humanEscalationAvailable
        ).toBe(true);


        expect(
          result.satisfiesRecoveryCoverage
        ).toBe(false);


        expect(
          result.executionAuthorized
        ).toBe(false);
      }
    );


    /*
     * ========================================================================
     * 19.12 HISTORY REPOSITORY
     * ========================================================================
     */


    test(
      "historical execution repository reads canonical Phase 18 tables only",
      () => {
        const source =
          fs.readFileSync(
            path.join(
              ROOT,
              "persistence/postgres/PostgresRecoveryExecutionHistoryRepository.js"
            ),
            "utf8"
          );


        expect(
          source
        ).toMatch(
          /execution\.playbook_executions/
        );


        expect(
          source
        ).toMatch(
          /execution\.runbook_executions/
        );


        expect(
          source
        ).not.toMatch(
          /INSERT\s+INTO\s+execution\./i
        );


        expect(
          source
        ).not.toMatch(
          /UPDATE\s+execution\./i
        );


        expect(
          source
        ).not.toMatch(
          /DELETE\s+FROM\s+execution\./i
        );
      }
    );


    test(
      "playbook history is tenant and environment scoped",
      async () => {
        const query =
          jest.fn()
            .mockResolvedValue({
              rows: [],
            });


        const tenantScope = {
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
                  }
                );
              }
            ),
        };


        const repository =
          new PostgresRecoveryExecutionHistoryRepository({
            tenantScope,
          });


        await repository
          .listPlaybookExecutions({
            organizationId:
              "org-public",

            environmentId:
              "env-public",

            playbookId:
              "PB-POSTGRES",
          });


        expect(
          query
        ).toHaveBeenCalledTimes(
          1
        );


        expect(
          query.mock.calls[0][1][0]
        ).toBe(
          "org-uuid"
        );


        expect(
          query.mock.calls[0][1][1]
        ).toBe(
          "env-uuid"
        );


        expect(
          query.mock.calls[0][1][2]
        ).toBe(
          "PB-POSTGRES"
        );
      }
    );


    /*
     * ========================================================================
     * HISTORICAL EFFECTIVENESS
     * ========================================================================
     */


    test(
      "completely untested recovery produces UNTESTED_RECOVERY",
      async () => {
        const historyRepository = {
          listPlaybookExecutions:
            jest.fn()
              .mockResolvedValue(
                []
              ),

          listRunbookExecutions:
            jest.fn()
              .mockResolvedValue(
                []
              ),
        };


        const service =
          new HistoricalValidationCoverageService({
            historyRepository,
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
                  "PB-DR",

                version:
                  "1.0.0",
              },
            ],

            runbooks: [
              {
                runbookId:
                  "RB-DR",

                version:
                  "1.0.0",
              },
            ],
          });


        expect(
          result.tested
        ).toBe(false);


        expect(
          result.allTested
        ).toBe(false);


        expect(
          result.proven
        ).toBe(false);


        expect(
          result.reasonCodes
        ).toContain(
          "UNTESTED_RECOVERY"
        );


        expect(
          result.executionAuthorized
        ).toBe(false);
      }
    );


    test(
      "insufficient execution history produces LOW_HISTORICAL_CONFIDENCE",
      async () => {
        const execution = {
          playbookId:
            "PB-DB",

          status:
            "SUCCEEDED",

          verificationResult: {
            passed:
              true,
          },

          durationMs:
            100,
        };


        const historyRepository = {
          listPlaybookExecutions:
            jest.fn()
              .mockResolvedValue([
                execution,
              ]),

          listRunbookExecutions:
            jest.fn(),
        };


        const service =
          new HistoricalValidationCoverageService({
            historyRepository,
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
                  "PB-DB",
              },
            ],

            minimumSampleSize:
              3,
          });


        expect(
          result.tested
        ).toBe(true);


        expect(
          result
            .sufficientlyValidated
        ).toBe(false);


        expect(
          result.reasonCodes
        ).toContain(
          "LOW_HISTORICAL_CONFIDENCE"
        );
      }
    );


    test(
      "verified successful recovery with sufficient history can be proven",
      async () => {
        const executions =
          Array.from(
            {
              length:
                3,
            },
            () => ({
              playbookId:
                "PB-POSTGRES",

              status:
                "SUCCEEDED",

              verificationResult: {
                passed:
                  true,
              },

              durationMs:
                150,
            })
          );


        const historyRepository = {
          listPlaybookExecutions:
            jest.fn()
              .mockResolvedValue(
                executions
              ),

          listRunbookExecutions:
            jest.fn(),
        };


        const service =
          new HistoricalValidationCoverageService({
            historyRepository,
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
                  "PB-POSTGRES",
              },
            ],

            minimumSampleSize:
              3,
          });


        expect(
          result.tested
        ).toBe(true);


        expect(
          result
            .sufficientlyValidated
        ).toBe(true);


        expect(
          result.proven
        ).toBe(true);


        expect(
          result
            .playbookResults[0]
            .effectiveness
            .verifiedRecoveryRate
        ).toBe(1);


        expect(
          result.reasonCodes
        ).toEqual([]);
      }
    );


    test(
      "raw command success without verification is not proven recovery",
      async () => {
        const executions =
          Array.from(
            {
              length:
                3,
            },
            () => ({
              runbookId:
                "RB-RESTART",

              status:
                "SUCCEEDED",

              verificationResult:
                {},

              durationMs:
                50,
            })
          );


        const historyRepository = {
          listPlaybookExecutions:
            jest.fn(),

          listRunbookExecutions:
            jest.fn()
              .mockResolvedValue(
                executions
              ),
        };


        const service =
          new HistoricalValidationCoverageService({
            historyRepository,
          });


        const result =
          await service.evaluate({
            organizationId:
              "org",

            environmentId:
              "env",

            runbooks: [
              {
                runbookId:
                  "RB-RESTART",
              },
            ],
          });


        expect(
          result
            .runbookResults[0]
            .effectiveness
            .successRate
        ).toBe(1);


        expect(
          result
            .runbookResults[0]
            .effectiveness
            .verifiedRecoveryRate
        ).toBe(0);


        expect(
          result.proven
        ).toBe(false);
      }
    );


    /*
     * ========================================================================
     * ARCHITECTURAL SAFETY
     * ========================================================================
     */


    test(
      "Phase 19 validation services reuse certified Phase 18 reasoning engines",
      () => {
        const expected = [
          [
            "coverage/RollbackReadinessService.js",
            "RollbackDefinitionEngine",
          ],

          [
            "coverage/VerificationReadinessService.js",
            "VerificationDefinitionEngine",
          ],

          [
            "coverage/EscalationCoverageService.js",
            "EscalationDefinitionEngine",
          ],

          [
            "coverage/HistoricalValidationCoverageService.js",
            "HistoricalEffectivenessEngine",
          ],
        ];


        for (
          const [
            relativePath,
            expectedEngine,
          ]
          of expected
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
          ).toContain(
            expectedEngine
          );
        }
      }
    );


    test(
      "historical success never grants authorization",
      () => {
        const files = [
          "coverage/RollbackReadinessService.js",

          "coverage/VerificationReadinessService.js",

          "coverage/EscalationCoverageService.js",

          "coverage/HistoricalValidationCoverageService.js",

          "persistence/postgres/PostgresRecoveryExecutionHistoryRepository.js",
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