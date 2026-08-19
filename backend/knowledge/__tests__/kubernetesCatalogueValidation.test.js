"use strict";

const {
  KUBERNETES_RUNBOOKS,
  KUBERNETES_PLAYBOOKS,
} =
  require(
    "../cataloguePackDefinitions"
  );

const {
  validateKubernetesKnowledgePack,
} =
  require(
    "../cataloguePackValidationService"
  );

const {
  getActionHandlerRegistry,
} =
  require(
    "../../runbooks/actions/actionHandlerRegistry"
  );


describe(
  "Phase 13.7 — generated Kubernetes pack validation",
  () => {
    let report;

    beforeAll(
      () => {
        report =
          validateKubernetesKnowledgePack({
            runbooks:
              KUBERNETES_RUNBOOKS,

            playbooks:
              KUBERNETES_PLAYBOOKS,
          });
      }
    );


    test(
      "validates the expected staging pack size",
      () => {
        expect(
          report.counts
        ).toEqual({
          runbooks:11,
          playbooks: 6,
          total: 17,
        });
        expect(
  KUBERNETES_RUNBOOKS
    .map(
      definition =>
        definition.runbookId
    )
).toEqual(
  expect.arrayContaining([
    "RB-K8S-INVESTIGATE-PVC",
    "RB-K8S-VERIFY-PVC",

    "RB-K8S-INVESTIGATE-DNS",

    "RB-K8S-INVESTIGATE-SERVICE",
    "RB-K8S-VERIFY-SERVICE-ENDPOINTS",

    "RB-K8S-INVESTIGATE-INGRESS",
    "RB-K8S-VERIFY-INGRESS",
  ])
);

expect(
  KUBERNETES_PLAYBOOKS
    .map(
      definition =>
        definition.playbookId
    )
).toEqual(
  expect.arrayContaining([
    "PB-K8S-PVC-PENDING-001",
    "PB-K8S-DNS-FAILURE-001",
    "PB-K8S-SERVICE-ENDPOINT-FAILURE-001",
    "PB-K8S-INGRESS-FAILURE-001",
  ])
);
      }
    );


    test(
  "imported Kubernetes pack is identical to physical catalogue",
  () => {
    const {
      buildCatalogueImportPlan,
    } =
      require(
        "../catalogueImportPlanner"
      );

    const plan =
      buildCatalogueImportPlan();

    expect(
      plan.counts.new
    ).toBe(
      0
    );

    expect(
      plan.counts.existingIdentical
    ).toBe(
      17
    );

    expect(
      plan.counts.idConflicts
    ).toBe(
      0
    );

    expect(
      plan.counts.fileConflicts
    ).toBe(
      0
    );

    expect(
      plan.safeToImport
    ).toBe(
      true
    );
  }
);


    test(
      "all generated Runbook actions exist in authoritative registry",
      () => {
        const registry =
          getActionHandlerRegistry();

        for (
          const result
          of report.runbooks
        ) {
          expect(
            result
              .missingHandlers
          ).toEqual(
            []
          );

          for (
            const action
            of result.actions
          ) {
            expect(
              registry.has(
                action.type,
                action.action
              )
            ).toBe(
              true
            );
          }
        }
      }
    );


    test(
      "all generated Runbooks pass Phase-13 quality requirements",
      () => {
        for (
          const result
          of report.runbooks
        ) {
          expect(
            result
              .quality
              .valid
          ).toBe(
            true
          );
        }
      }
    );


    test(
      "all generated Runbooks pass authoritative AIRA authoring validation",
      () => {
        for (
          const result
          of report.runbooks
        ) {
          if (
            result
              .pipeline
              .valid !==
            true
          ) {
            console.error(
              result
                .runbookId,

              result
                .pipeline
                .diagnostics
            );
          }

          expect(
            result
              .pipeline
              .valid
          ).toBe(
            true
          );

          expect(
            result
              .pipelineErrors
          ).toEqual(
            []
          );
        }
      }
    );


    test(
  "all generated Playbooks pass Phase-13 depth requirements",
  () => {
    for (
      const result
      of report.playbooks
    ) {
      if (
        result
          .quality
          .valid !==
        true
      ) {
        console.error(
          "\n========================================"
        );

        console.error(
          "PLAYBOOK QUALITY FAILURE"
        );

        console.error(
          "Playbook:",
          result.playbookId
        );

        console.error(
          JSON.stringify(
            result.quality,
            null,
            2
          )
        );

        console.error(
          "========================================\n"
        );
      }

      expect(
        result
          .quality
          .valid
      ).toBe(
        true
      );
    }
  }
);


    test(
      "every Playbook Runbook reference resolves to existing or generated knowledge",
      () => {
        expect(
          report
            .integrity
            .missingRunbookReferences
        ).toEqual(
          []
        );
      }
    );


    test(
  "imported staging pack remains structurally valid",
  () => {
    /*
     * The Kubernetes staging pack has already been
     * imported into the physical catalogue.
     *
     * Therefore duplicate physical IDs are expected.
     * Semantic identity/idempotency is verified by
     * the catalogue import planner.
     */

    expect(
      report
        .integrity
        .invalidRunbooks
    ).toEqual(
      []
    );

    expect(
      report
        .integrity
        .invalidPlaybooks
    ).toEqual(
      []
    );

    expect(
      report
        .integrity
        .missingRunbookReferences
    ).toEqual(
      []
    );

    expect(
      report
        .integrity
        .duplicateRunbookIds
        .length
    ).toBe(
      KUBERNETES_RUNBOOKS
        .length
    );

    expect(
      report
        .integrity
        .duplicatePlaybookIds
        .length
    ).toBe(
      KUBERNETES_PLAYBOOKS
        .length
    );

    expect(
      report
        .integrity
        .duplicateRunbookIds
        .length +
      report
        .integrity
        .duplicatePlaybookIds
        .length
    ).toBe(
      17
    );
  }
);
  }
);