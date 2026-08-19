'use strict';

const fs =
  require(
    'fs'
  );

const {
  buildNetworkingImportPlan,
} =
  require(
    '../networkingCatalogueImporter'
  );


describe(
  'Phase 13.12 — Networking catalogue import gate',
  () => {

    test(
      'sees exactly thirty-two generated definitions',
      () => {
        const plan =
          buildNetworkingImportPlan();

        expect(
          plan.generatedCounts
        ).toEqual({
          playbooks:
            12,

          runbooks:
            20,

          total:
            32,
        });
      }
    );


    test(
      'contains no ID or file conflicts',
      () => {
        const plan =
          buildNetworkingImportPlan();

        expect(
          plan.counts
            .ID_CONFLICT
        ).toBe(
          0
        );

        expect(
          plan.counts
            .FILE_CONFLICT
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
      'every generated definition is either NEW or EXISTING_IDENTICAL',
      () => {
        const plan =
          buildNetworkingImportPlan();

        expect(
          plan.counts.NEW +
          plan.counts.EXISTING_IDENTICAL
        ).toBe(
          32
        );
      }
    );


    test(
      'all generated sources physically exist',
      () => {
        const plan =
          buildNetworkingImportPlan();

        for (
          const entry
          of plan.entries
        ) {
          expect(
            fs.existsSync(
              entry.source
            )
          ).toBe(
            true
          );
        }
      }
    );


    test(
      'post-import state is idempotent when definitions already exist',
      () => {
        const plan =
          buildNetworkingImportPlan();

        if (
          plan.counts.NEW ===
          0
        ) {
          expect(
            plan.counts
              .EXISTING_IDENTICAL
          ).toBe(
            32
          );
        }
      }
    );
  }
);