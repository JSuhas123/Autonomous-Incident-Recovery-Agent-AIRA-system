'use strict';

const fs = require('fs');

const {
  buildDatabaseImportPlan,
} = require(
  '../databaseCatalogueImporter'
);


describe(
  'Phase 13.11I — Database catalogue import gate',
  () => {

    test(
      'sees exactly 30 generated definitions',
      () => {
        const plan =
          buildDatabaseImportPlan();

        expect(
          plan.generatedCounts
        ).toEqual({
          playbooks:
            9,

          runbooks:
            21,

          total:
            30,
        });
      }
    );


    test(
      'generated database pack has no conflicts before first import',
      () => {
        const plan =
          buildDatabaseImportPlan();

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
      'every NEW definition has a real staging source',
      () => {
        const plan =
          buildDatabaseImportPlan();

        for (
          const entry
          of plan.entries
        ) {
          if (
            entry.classification !==
            'NEW'
          ) {
            continue;
          }

          expect(
            fs.existsSync(
              entry.source
            )
          ).toBe(
            true
          );

          expect(
            fs.existsSync(
              entry.destination
            )
          ).toBe(
            false
          );
        }
      }
    );


   test(
  "database pack is idempotent after physical import",
  () => {
    const plan =
      buildDatabaseImportPlan();

    expect(
      plan.counts.NEW
    ).toBe(
      0
    );

    expect(
      plan.counts
        .EXISTING_IDENTICAL
    ).toBe(
      30
    );

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
  }
);