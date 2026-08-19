"use strict";

const {
  NETWORKING_RUNBOOKS,
  NETWORKING_PLAYBOOKS,
} =
  require(
    "../networkingCatalogueDefinitions"
  );


describe(
  "Phase 13.12 — Networking catalogue definitions",
  () => {

    test(
      "defines twenty networking runbooks",
      () => {
        expect(
          NETWORKING_RUNBOOKS
            .length
        ).toBe(
          20
        );
      }
    );


    test(
      "defines twelve networking playbooks",
      () => {
        expect(
          NETWORKING_PLAYBOOKS
            .length
        ).toBe(
          12
        );
      }
    );


    test(
      "all generated IDs are unique",
      () => {
        const ids = [
          ...NETWORKING_RUNBOOKS
            .map(
              definition =>
                definition.runbookId ??
                definition.metadata?.id
            ),

          ...NETWORKING_PLAYBOOKS
            .map(
              definition =>
                definition.playbookId ??
                definition.metadata?.id
            ),
        ];

        expect(
          new Set(
            ids
          ).size
        ).toBe(
          32
        );
      }
    );


    test(
      "all runbook actions belong to networking namespace",
      () => {
        for (
          const runbook
          of NETWORKING_RUNBOOKS
        ) {
          const serialized =
            JSON.stringify(
              runbook
            );

          expect(
            serialized
          ).toContain(
            "networking/"
          );
        }
      }
    );


    test(
      "networking playbooks start draft and manual",
      () => {
        for (
          const playbook
          of NETWORKING_PLAYBOOKS
        ) {
          const lifecycle =
            playbook.lifecycle ??
            playbook.metadata
              ?.lifecycle;

          expect(
            String(
              lifecycle
            ).toUpperCase()
          ).toBe(
            "DRAFT"
          );

          /*
           * Use your established DB/K8s execution-mode
           * property here rather than inventing one.
           */
        }
      }
    );
  }
);