"use strict";

const {
  buildCatalogueRelationshipGraph,
} =
  require(
    "../catalogueRelationshipService"
  );


const {
  scanCatalogue,
} =
  require(
    "../catalogueScanner"
  );

describe(
  "Phase 13.3 + 13.4 — Playbook/Runbook relationships",
  () => {
    let graph;

    beforeAll(
      () => {
        graph =
          buildCatalogueRelationshipGraph();
      }
    );


   test(
  "builds relationship graph for complete physical catalogue",
  () => {
    const graph =
      buildCatalogueRelationshipGraph();

    const scan =
      scanCatalogue();

    expect(
      graph
        .stats
        .playbooks
    ).toBe(
      scan.playbooks.length
    );

    expect(
      graph
        .stats
        .runbooks
    ).toBe(
      scan.runbooks.length
    );

    expect(
      graph
        .stats
        .playbooks
    ).toBeGreaterThan(
      0
    );

    expect(
      graph
        .stats
        .runbooks
    ).toBeGreaterThan(
      0
    );
  }
);


    test(
      "includes top-level rollback runbook relationships",
      () => {
        const rollbackEdge =
          graph
            .edges
            .find(
              (
                edge
              ) =>
                edge.from ===
                  "PB-K8S-OOM-001" &&
                edge.to ===
                  "RB-K8S-ROLLBACK-RESOURCE-CONFIG" &&
                edge.relationType ===
                  "ROLLBACK"
            );

        expect(
          rollbackEdge
        ).toBeDefined();
      }
    );


    test(
      "has zero physically missing required runbooks",
      () => {
        expect(
          graph
            .integrity
            .missingReferences
        ).toEqual(
          []
        );
      }
    );


    test(
      "detects ACTIVE playbook dependencies on DRAFT memory mutation runbooks",
      () => {
        const mismatches =
          graph
            .integrity
            .lifecycleMismatches;

        const ids =
          mismatches
            .map(
              (
                item
              ) =>
                item
                  .runbookId
            );

        expect(
          ids
        ).toEqual(
          expect.arrayContaining([
            "RB-K8S-ADJUST-MEMORY",
            "RB-K8S-ROLLBACK-RESOURCE-CONFIG",
          ])
        );
      }
    );


    test(
      "does not falsely mark missing read-only Kubernetes runbooks",
      () => {
        const missing =
          graph
            .integrity
            .missingReferences
            .map(
              (
                item
              ) =>
                item
                  .runbookId
            );

        expect(
          missing
        ).not.toContain(
          "RB-K8S-INVESTIGATE-ROLLOUT"
        );

        expect(
          missing
        ).not.toContain(
          "RB-K8S-RESOLVE-ROLLBACK-TARGET"
        );

        expect(
          missing
        ).not.toContain(
          "RB-K8S-VALIDATE-MEMORY-CHANGE"
        );
      }
    );


    test(
      "catalogue remains execution-unhealthy while active playbook depends on draft runbooks",
      () => {
        expect(
          graph
            .integrity
            .healthy
        ).toBe(
          false
        );

        expect(
          graph
            .integrity
            .blockingIssueCount
        ).toBeGreaterThanOrEqual(
          2
        );
      }
    );
  }
);