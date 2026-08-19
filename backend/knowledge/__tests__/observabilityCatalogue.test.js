"use strict";

/**
 * Phase 13 — Observability Catalogue Validation
 *
 * Validates the physical Observability knowledge catalogue.
 *
 * Goals:
 * - Observability Playbooks are physically discoverable
 * - Observability Runbooks are physically discoverable
 * - every Playbook → Runbook dependency resolves
 * - no ACTIVE Playbook depends on non-ACTIVE required Runbooks
 * - Observability Runbook actions exist in authoritative registry
 * - Observability handlers remain read-only
 * - no accidental Kubernetes restart dependency remains
 * - catalogue relationship graph remains structurally healthy
 */

const {
  scanCatalogue,
} = require(
  "../catalogueScanner"
);

const {
  buildCatalogueRelationshipGraph,
} = require(
  "../catalogueRelationshipService"
);

const {
  getActionHandlerRegistry,
  resetActionHandlerRegistry,
} = require(
  "../../runbooks/actions/actionHandlerRegistry"
);


describe(
  "Phase 13 — Observability physical catalogue",
  () => {

    let scan;
    let graph;
    let registry;

    beforeAll(
      () => {
        resetActionHandlerRegistry();

        registry =
          getActionHandlerRegistry();

        scan =
          scanCatalogue();

        graph =
          buildCatalogueRelationshipGraph();
      }
    );


    test(
      "discovers Observability Playbooks",
      () => {
        const playbooks =
          scan.playbooks.filter(
            playbook =>
              String(
                playbook.playbookId ||
                ""
              ).startsWith(
                "PB-OBS-"
              )
          );

        expect(
          playbooks.length
        ).toBeGreaterThanOrEqual(
          10
        );
      }
    );


    test(
      "discovers Observability Runbooks",
      () => {
        const runbooks =
          scan.runbooks.filter(
            runbook =>
              String(
                runbook.runbookId ||
                ""
              ).startsWith(
                "RB-OBS-"
              )
          );

        expect(
          runbooks.length
        ).toBeGreaterThanOrEqual(
          12
        );
      }
    );


    test(
      "all Observability Playbook Runbook references physically resolve",
      () => {
        const missing =
          graph.integrity
            .missingReferences
            .filter(
              reference =>
                String(
                  reference.playbookId ||
                  ""
                ).startsWith(
                  "PB-OBS-"
                )
            );

        if (
          missing.length >
          0
        ) {
          console.error(
            "\nOBSERVABILITY MISSING RUNBOOK REFERENCES"
          );

          console.error(
            JSON.stringify(
              missing,
              null,
              2
            )
          );
        }

        expect(
          missing
        ).toEqual(
          []
        );
      }
    );


    test(
      "Observability Playbooks have no lifecycle dependency violations",
      () => {
        const mismatches =
          graph.integrity
            .lifecycleMismatches
            .filter(
              mismatch =>
                String(
                  mismatch.playbookId ||
                  ""
                ).startsWith(
                  "PB-OBS-"
                )
            );

        if (
          mismatches.length >
          0
        ) {
          console.error(
            "\nOBSERVABILITY LIFECYCLE MISMATCHES"
          );

          console.error(
            JSON.stringify(
              mismatches,
              null,
              2
            )
          );
        }

        expect(
          mismatches
        ).toEqual(
          []
        );
      }
    );


    test(
      "Observability catalogue no longer abuses Kubernetes pod restart",
      () => {
        const badEdges =
          graph.edges.filter(
            edge =>
              String(
                edge.from ||
                ""
              ).startsWith(
                "PB-OBS-"
              ) &&
              edge.to ===
                "RB-K8S-POD-RESTART"
          );

        if (
          badEdges.length >
          0
        ) {
          console.error(
            "\nINVALID OBSERVABILITY → KUBERNETES DEPENDENCIES"
          );

          console.error(
            JSON.stringify(
              badEdges,
              null,
              2
            )
          );
        }

        expect(
          badEdges
        ).toEqual(
          []
        );
      }
    );


    test(
      "authoritative registry contains Observability actions",
      () => {
        const keys =
          registry
            .keys()
            .filter(
              key =>
                key.startsWith(
                  "observability/"
                )
            );

        expect(
          keys.length
        ).toBeGreaterThanOrEqual(
          12
        );
      }
    );


    test(
      "Observability handlers are non-destructive",
      () => {
        const rows =
          registry
            .report()
            .filter(
              row =>
                row.type ===
                "observability"
            );

        expect(
          rows.length
        ).toBeGreaterThanOrEqual(
          12
        );

        for (
          const row
          of rows
        ) {
          expect(
            row.destructive
          ).toBe(
            false
          );

          expect(
            row.automationSafe
          ).toBe(
            true
          );
        }
      }
    );


    test(
      "Observability handlers have zero blast radius",
      () => {
        const rows =
          registry
            .report()
            .filter(
              row =>
                row.type ===
                "observability"
            );

        for (
          const row
          of rows
        ) {
          expect(
            row.blastRadius
          ).toBe(
            "none"
          );
        }
      }
    );


    test(
      "all Observability Runbook actions exist in authoritative registry",
      () => {
        const runbooks =
          scan.runbooks.filter(
            runbook =>
              String(
                runbook.runbookId ||
                ""
              ).startsWith(
                "RB-OBS-"
              )
          );

        const registryKeys =
          new Set(
            registry.keys()
          );

        const missingActions =
          [];

        for (
          const runbook
          of runbooks
        ) {
          const steps =
            runbook.steps ||
            [];

          for (
            const step
            of steps
          ) {
            const action =
              step.action;

            if (
              !action
            ) {
              continue;
            }

            /*
             * Action may already be represented as:
             *
             * observability/check_target_health
             *
             * or through separate type/action fields.
             */

            let key;

            if (
              String(
                action
              ).includes(
                "/"
              )
            ) {
              key =
                String(
                  action
                );
            } else {
              key =
                `${
                  step.type ||
                  "observability"
                }/${action}`;
            }

            if (
              !registryKeys.has(
                key
              )
            ) {
              missingActions.push({
                runbookId:
                  runbook.runbookId,

                stepId:
                  step.id ||
                  step.stepId ||
                  null,

                action:
                  key,
              });
            }
          }
        }

        if (
          missingActions.length >
          0
        ) {
          console.error(
            "\nOBSERVABILITY MISSING ACTION HANDLERS"
          );

          console.error(
            JSON.stringify(
              missingActions,
              null,
              2
            )
          );
        }

        expect(
          missingActions
        ).toEqual(
          []
        );
      }
    );


    test(
  "Observability Playbooks contain investigation or verification relationships",
  () => {
    const playbooks =
      scan.playbooks.filter(
        playbook =>
          String(
            playbook.playbookId ||
            ""
          ).startsWith(
            "PB-OBS-"
          )
      );

    const invalid =
      [];

    for (
      const playbook
      of playbooks
    ) {
      const references =
        playbook.runbookRefs ||
        [];

      const usefulRelationships =
        references.filter(
          reference => {
            const stageType =
              String(
                reference.stageType ||
                ""
              ).toUpperCase();

            return (
              stageType ===
                "INVESTIGATION" ||
              stageType ===
                "VERIFICATION"
            );
          }
        );

      if (
        usefulRelationships.length ===
        0
      ) {
        invalid.push(
          playbook.playbookId
        );
      }
    }

    expect(
      invalid
    ).toEqual(
      []
    );
  }
);


    test(
      "Observability domain has no required physically missing dependencies",
      () => {
        const missing =
          graph.integrity
            .missingReferences
            .filter(
              reference =>
                String(
                  reference.playbookId ||
                  ""
                ).startsWith(
                  "PB-OBS-"
                ) &&
                reference.required !==
                  false
            );

        expect(
          missing
        ).toEqual(
          []
        );
      }
    );
  }
);