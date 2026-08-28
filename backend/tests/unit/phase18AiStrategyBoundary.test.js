"use strict";

const {
  AiRecoveryStrategyBoundary,
  DeterministicPlaybookComposer,
  ProductionKnowledgeSafetyLinter,
  PRODUCTION_DOMAIN_PACKS,
  validateProductionDomainPack,
} = require(
  "../../knowledge/strategy"
);


describe(
  "Phase 18.19 AI strategy boundary",
  () => {
    test(
      "AI may select an eligible approved candidate",
      () => {
        const boundary =
          new AiRecoveryStrategyBoundary();

        const result =
          boundary.select({
            intelligenceResult: {
              hypotheses: {
                bestHypothesis: {
                  hypothesisId:
                    "hypothesis:FM-1",

                  failureModeId:
                    "FM-1",
                },
              },

              ranking: {
                candidates: [
                  {
                    playbookId:
                      "PB-1",

                    score:
                      0.92,

                    eligible:
                      true,
                  },
                ],

                bestCandidate: {
                  playbookId:
                    "PB-1",

                  score:
                    0.92,

                  eligible:
                    true,
                },
              },
            },

            aiProposal: {
              playbookId:
                "PB-1",

              confidence:
                0.9,

              rationale:
                "Best supported recovery strategy",
            },
          });

        expect(
          result.selected
        ).toBe(true);

        expect(
          result.strategy
            .playbookId
        ).toBe(
          "PB-1"
        );

        expect(
          result.executionAuthorized
        ).toBe(false);
      }
    );


    test(
      "AI cannot select an ineligible Playbook",
      () => {
        const boundary =
          new AiRecoveryStrategyBoundary();

        const result =
          boundary.select({
            intelligenceResult: {
              ranking: {
                candidates: [
                  {
                    playbookId:
                      "PB-DANGEROUS",

                    eligible:
                      false,
                  },
                ],
              },
            },

            aiProposal: {
              playbookId:
                "PB-DANGEROUS",
            },
          });

        expect(
          result.selected
        ).toBe(false);

        expect(
          result.reason
        ).toBe(
          "NO_ELIGIBLE_PLAYBOOK"
        );

        expect(
          result.executionAuthorized
        ).toBe(false);
      }
    );


    test(
      "AI cannot provide shell commands",
      () => {
        const boundary =
          new AiRecoveryStrategyBoundary();

        expect(
          () =>
            boundary.select({
              intelligenceResult: {
                ranking: {
                  candidates: [
                    {
                      playbookId:
                        "PB-1",

                      eligible:
                        true,
                    },
                  ],
                },
              },

              aiProposal: {
                playbookId:
                  "PB-1",

                shell:
                  "kubectl delete pod production-api",
              },
            })
        ).toThrow(
          expect.objectContaining({
            code:
              "AI_OPERATIONAL_COMPOSITION_FORBIDDEN",
          })
        );
      }
    );


    test(
      "AI cannot invent Runbook steps",
      () => {
        const boundary =
          new AiRecoveryStrategyBoundary();

        expect(
          () =>
            boundary.select({
              intelligenceResult: {
                ranking: {
                  candidates: [
                    {
                      playbookId:
                        "PB-1",

                      eligible:
                        true,
                    },
                  ],
                },
              },

              aiProposal: {
                playbookId:
                  "PB-1",

                steps: [
                  {
                    command:
                      "anything",
                  },
                ],
              },
            })
        ).toThrow(
          expect.objectContaining({
            code:
              "AI_OPERATIONAL_COMPOSITION_FORBIDDEN",
          })
        );
      }
    );


    test(
      "deterministic composer resolves exact stored Runbook",
      () => {
        const composer =
          new DeterministicPlaybookComposer();

        const result =
          composer.compose({
            playbook: {
              playbookId:
                "PB-1",

              version:
                "1.0.0",

              lifecycle:
                "ACTIVE",

              stages: [
                {
                  stageId:
                    "recover",

                  type:
                    "RECOVERY",

                  runbookId:
                    "RB-1",

                  runbookVersion:
                    "2.1.0",
                },
              ],
            },

            runbooks: [
              {
                runbookId:
                  "RB-1",

                version:
                  "2.1.0",

                lifecycle:
                  "ACTIVE",

                checksum:
                  "checksum-rb-1",
              },
            ],
          });

        expect(
          result.stages[0]
            .runbookId
        ).toBe(
          "RB-1"
        );

        expect(
          result.stages[0]
            .runbookVersion
        ).toBe(
          "2.1.0"
        );

        expect(
          result.deterministic
        ).toBe(true);

        expect(
          result.executionAuthorized
        ).toBe(false);
      }
    );


    test(
      "ambiguous Runbook versions are rejected",
      () => {
        const composer =
          new DeterministicPlaybookComposer();

        expect(
          () =>
            composer.compose({
              playbook: {
                playbookId:
                  "PB-1",

                stages: [
                  {
                    runbookId:
                      "RB-1",
                  },
                ],
              },

              runbooks: [
                {
                  runbookId:
                    "RB-1",

                  version:
                    "1.0.0",
                },

                {
                  runbookId:
                    "RB-1",

                  version:
                    "2.0.0",
                },
              ],
            })
        ).toThrow(
          expect.objectContaining({
            code:
              "AMBIGUOUS_RUNBOOK_VERSION",
          })
        );
      }
    );


    test(
      "Playbook cannot directly execute infrastructure",
      () => {
        const composer =
          new DeterministicPlaybookComposer();

        expect(
          () =>
            composer.compose({
              playbook: {
                playbookId:
                  "PB-BAD",

                stages: [
                  {
                    runbookId:
                      "RB-1",

                    command:
                      "kubectl delete pod x",
                  },
                ],
              },

              runbooks: [
                {
                  runbookId:
                    "RB-1",

                  version:
                    "1.0.0",
                },
              ],
            })
        ).toThrow(
          expect.objectContaining({
            code:
              "PLAYBOOK_DIRECT_EXECUTION_FORBIDDEN",
          })
        );
      }
    );


    test(
      "production linter rejects active shell Runbook",
      () => {
        const linter =
          new ProductionKnowledgeSafetyLinter();

        const result =
          linter.lintRunbook({
            runbookId:
              "RB-SHELL",

            lifecycle:
              "ACTIVE",

            steps: [
              {
                type:
                  "SHELL",
              },
            ],

            rollback: {
              available:
                false,
            },
          });

        expect(
          result.valid
        ).toBe(false);

        expect(
          result.errors
            .map(
              (item) =>
                item.code
            )
        ).toContain(
          "EXECUTABLE_SHELL_FORBIDDEN"
        );
      }
    );


    test(
      "production linter rejects direct Playbook command",
      () => {
        const linter =
          new ProductionKnowledgeSafetyLinter();

        const result =
          linter.lintPlaybook({
            playbookId:
              "PB-BAD",

            stages: [
              {
                runbookId:
                  "RB-1",

                command:
                  "restart something",
              },
            ],
          });

        expect(
          result.valid
        ).toBe(false);

        expect(
          result.errors
            .map(
              (item) =>
                item.code
            )
        ).toContain(
          "PLAYBOOK_DIRECT_EXECUTION_FORBIDDEN"
        );
      }
    );


    test(
      "customer MongoDB domain remains production knowledge",
      () => {
        expect(
          PRODUCTION_DOMAIN_PACKS
            .MONGODB_CUSTOMER_INFRASTRUCTURE
            .domain
        ).toBe(
          "database.mongodb"
        );

        expect(
          PRODUCTION_DOMAIN_PACKS
            .MONGODB_CUSTOMER_INFRASTRUCTURE
            .required
        ).toBe(true);
      }
    );


    test(
      "production domain pack requires failure modes Playbooks and Runbooks",
      () => {
        const invalid =
          validateProductionDomainPack({
            packId:
              "kubernetes",
            domain:
              "kubernetes",
          });

        expect(
          invalid.valid
        ).toBe(false);

        const valid =
          validateProductionDomainPack({
            packId:
              "kubernetes",

            domain:
              "kubernetes",

            failureModes: [
              "FM-1",
            ],

            playbooks: [
              "PB-1",
            ],

            runbooks: [
              "RB-1",
            ],
          });

        expect(
          valid.valid
        ).toBe(true);

        expect(
          valid.executionAuthorized
        ).toBe(false);
      }
    );


    test(
      "entire strategy layer remains non-authorizing",
      () => {
        const boundary =
          new AiRecoveryStrategyBoundary();

        const result =
          boundary.select({
            intelligenceResult: {
              ranking: {
                candidates: [
                  {
                    playbookId:
                      "PB-1",

                    eligible:
                      true,

                    score:
                      1,
                  },
                ],

                bestCandidate: {
                  playbookId:
                    "PB-1",

                  eligible:
                    true,

                  score:
                    1,
                },
              },
            },
          });

        expect(
          result.executionAuthorized
        ).toBe(false);

        expect(
          result.requiresPolicyEvaluation
        ).toBe(true);

        expect(
          result.requiresAuthorization
        ).toBe(true);
      }
    );
  }
);