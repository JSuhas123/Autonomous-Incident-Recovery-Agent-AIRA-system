"use strict";

const {
  lintCatalogue,
} =
  require(
    "../catalogueLinterService"
  );

const {
  scanCatalogue,
} =
  require(
    "../catalogueScanner"
  );

const {
  getActionHandlerRegistry,
} =
  require(
    "../../runbooks/actions/actionHandlerRegistry"
  );


describe(
  "Phase 13.5 + 13.6 — catalogue linting and capability enforcement",
  () => {
    let report;

    beforeAll(
      () => {
        report =
          lintCatalogue();
      }
    );


    test(
      "lints the complete physical catalogue",
      () => {
       const scan =
  scanCatalogue();

expect(
  report
    .catalogue
    .playbooks
).toBe(
  scan.playbooks.length
);

expect(
  report
    .catalogue
    .runbooks
).toBe(
  scan.runbooks.length
);
      }
    );


    test(
      "action registry is available to catalogue validation",
      () => {
        const registry =
          getActionHandlerRegistry();

        expect(
          report
            .actionRegistry
            .registeredHandlerCount
        ).toBe(
          registry
            .keys()
            .length
        );

        expect(
          report
            .actionRegistry
            .registeredHandlerCount
        ).toBeGreaterThan(
          0
        );
      }
    );


    test(
      "catalogue has zero missing physical runbook references",
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
      "draft memory adjustment runbook is blocked by missing deterministic handler",
      () => {
        const blocker =
          report
            .integrity
            .draftPromotionBlockers
            .find(
              (
                item
              ) =>
                item
                  .runbookId ===
                "RB-K8S-ADJUST-MEMORY"
            );

        expect(
          blocker
        ).toBeDefined();

        expect(
          blocker
            .missingHandlers
            .some(
              (
                handler
              ) =>
                handler.key ===
                "kubernetes/patch_deployment_memory"
            )
        ).toBe(
          true
        );
      }
    );


    test(
      "draft memory rollback runbook is blocked by missing deterministic handler",
      () => {
        const blocker =
          report
            .integrity
            .draftPromotionBlockers
            .find(
              (
                item
              ) =>
                item
                  .runbookId ===
                "RB-K8S-ROLLBACK-RESOURCE-CONFIG"
            );

        expect(
          blocker
        ).toBeDefined();

        expect(
          blocker
            .missingHandlers
            .some(
              (
                handler
              ) =>
                handler.key ===
                "kubernetes/restore_deployment_memory"
            )
        ).toBe(
          true
        );
      }
    );


    test(
      "missing memory handlers are not accidentally registered",
      () => {
        const registry =
          getActionHandlerRegistry();

        expect(
          registry.has(
            "kubernetes",
            "patch_deployment_memory"
          )
        ).toBe(
          false
        );

        expect(
          registry.has(
            "kubernetes",
            "restore_deployment_memory"
          )
        ).toBe(
          false
        );
      }
    );


    test(
      "no ACTIVE runbook is allowed to reference an unknown deterministic action",
      () => {
        expect(
          report
            .integrity
            .activeRunbookHandlerFailures
        ).toEqual(
          []
        );
      }
    );


    test(
      "catalogue remains unhealthy only because active playbook depends on draft memory runbooks",
      () => {
        expect(
          report
            .integrity
            .healthy
        ).toBe(
          false
        );

        const mismatchIds =
          report
            .integrity
            .lifecycleMismatches
            .map(
              (
                item
              ) =>
                item
                  .runbookId
            );

        expect(
          mismatchIds
        ).toEqual(
          expect.arrayContaining([
            "RB-K8S-ADJUST-MEMORY",
            "RB-K8S-ROLLBACK-RESOURCE-CONFIG",
          ])
        );
      }
    );
  }
);