'use strict';

/**
 * Phase 13.9
 *
 * Collision-aware catalogue import planning tests.
 *
 * These tests DO NOT modify the physical catalogue.
 */

const fs =
  require(
    'fs'
  );

const os =
  require(
    'os'
  );

const path =
  require(
    'path'
  );

const yaml =
  require(
    'js-yaml'
  );


const {
  IMPORT_CLASSIFICATION,

  documentsEqual,

  buildCatalogueImportPlan,
} =
  require(
    '../catalogueImportPlanner'
  );


// ============================================================================
// HELPERS
// ============================================================================

function writeYaml(
  filePath,
  document
) {
  fs.mkdirSync(
    path.dirname(
      filePath
    ),
    {
      recursive:
        true,
    }
  );

  fs.writeFileSync(
    filePath,

    yaml.dump(
      document,
      {
        noRefs:
          true,

        lineWidth:
          -1,

        sortKeys:
          false,
      }
    ),

    'utf8'
  );
}


function createRoots() {
  const root =
    fs.mkdtempSync(
      path.join(
        os.tmpdir(),
        'aira-catalogue-import-'
      )
    );

  return {
    root,

    generatedRoot:
      path.join(
        root,
        'generated'
      ),

    playbookRoot:
      path.join(
        root,
        'playbooks'
      ),

    runbookRoot:
      path.join(
        root,
        'runbooks'
      ),
  };
}


// ============================================================================
// TESTS
// ============================================================================

describe(
  'Phase 13.9 — catalogue import planner',
  () => {
    test(
      'semantic comparison ignores object key ordering',
      () => {
        const left = {
          runbookId:
            'RB-TEST-001',

          name:
            'Test',

          risk: {
            level:
              'LOW',

            reversible:
              true,
          },
        };

        const right = {
          risk: {
            reversible:
              true,

            level:
              'LOW',
          },

          name:
            'Test',

          runbookId:
            'RB-TEST-001',
        };

        expect(
          documentsEqual(
            left,
            right
          )
        ).toBe(
          true
        );
      }
    );


    test(
      'classifies completely new knowledge as NEW',
      () => {
        const roots =
          createRoots();

        try {
          writeYaml(
            path.join(
              roots.generatedRoot,
              'runbooks',
              'kubernetes',
              'rb-test-new.yaml'
            ),
            {
              runbookId:
                'RB-TEST-NEW',

              name:
                'New Runbook',
            }
          );

          const plan =
            buildCatalogueImportPlan({
              generatedRoot:
                roots.generatedRoot,

              playbookRoot:
                roots.playbookRoot,

              runbookRoot:
                roots.runbookRoot,
            });

          expect(
            plan.counts.new
          ).toBe(
            1
          );

          expect(
            plan.items[
              0
            ].classification
          ).toBe(
            IMPORT_CLASSIFICATION
              .NEW
          );

          expect(
            plan.safeToImport
          ).toBe(
            true
          );
        } finally {
          fs.rmSync(
            roots.root,
            {
              recursive:
                true,

              force:
                true,
            }
          );
        }
      }
    );


    test(
      'classifies identical existing knowledge as EXISTING_IDENTICAL',
      () => {
        const roots =
          createRoots();

        const definition = {
          runbookId:
            'RB-TEST-IDENTICAL',

          name:
            'Identical Runbook',

          lifecycle:
            'ACTIVE',
        };

        try {
          writeYaml(
            path.join(
              roots.generatedRoot,
              'runbooks',
              'kubernetes',
              'rb-identical.yaml'
            ),
            definition
          );

          writeYaml(
            path.join(
              roots.runbookRoot,
              'kubernetes',
              'rb-existing.yaml'
            ),
            definition
          );

          const plan =
            buildCatalogueImportPlan({
              generatedRoot:
                roots.generatedRoot,

              playbookRoot:
                roots.playbookRoot,

              runbookRoot:
                roots.runbookRoot,
            });

          expect(
            plan.counts
              .existingIdentical
          ).toBe(
            1
          );

          expect(
            plan.items[
              0
            ].classification
          ).toBe(
            IMPORT_CLASSIFICATION
              .EXISTING_IDENTICAL
          );

          expect(
            plan.safeToImport
          ).toBe(
            true
          );
        } finally {
          fs.rmSync(
            roots.root,
            {
              recursive:
                true,

              force:
                true,
            }
          );
        }
      }
    );


    test(
      'detects same ID with different content as ID_CONFLICT',
      () => {
        const roots =
          createRoots();

        try {
          writeYaml(
            path.join(
              roots.generatedRoot,
              'runbooks',
              'kubernetes',
              'rb-conflict.yaml'
            ),
            {
              runbookId:
                'RB-TEST-CONFLICT',

              name:
                'Generated Definition',
            }
          );

          writeYaml(
            path.join(
              roots.runbookRoot,
              'kubernetes',
              'rb-existing.yaml'
            ),
            {
              runbookId:
                'RB-TEST-CONFLICT',

              name:
                'Existing Definition',
            }
          );

          const plan =
            buildCatalogueImportPlan({
              generatedRoot:
                roots.generatedRoot,

              playbookRoot:
                roots.playbookRoot,

              runbookRoot:
                roots.runbookRoot,
            });

          expect(
            plan.counts
              .idConflicts
          ).toBe(
            1
          );

          expect(
            plan.items[
              0
            ].classification
          ).toBe(
            IMPORT_CLASSIFICATION
              .ID_CONFLICT
          );

          expect(
            plan.safeToImport
          ).toBe(
            false
          );
        } finally {
          fs.rmSync(
            roots.root,
            {
              recursive:
                true,

              force:
                true,
            }
          );
        }
      }
    );


    test(
      'detects occupied destination containing different knowledge as FILE_CONFLICT',
      () => {
        const roots =
          createRoots();

        try {
          writeYaml(
            path.join(
              roots.generatedRoot,
              'playbooks',
              'kubernetes',
              'pb-target.yaml'
            ),
            {
              playbookId:
                'PB-GENERATED-001',

              name:
                'Generated Playbook',
            }
          );

          writeYaml(
            path.join(
              roots.playbookRoot,
              'kubernetes',
              'pb-target.yaml'
            ),
            {
              playbookId:
                'PB-EXISTING-001',

              name:
                'Existing Playbook',
            }
          );

          const plan =
            buildCatalogueImportPlan({
              generatedRoot:
                roots.generatedRoot,

              playbookRoot:
                roots.playbookRoot,

              runbookRoot:
                roots.runbookRoot,
            });

          expect(
            plan.counts
              .fileConflicts
          ).toBe(
            1
          );

          expect(
            plan.items[
              0
            ].classification
          ).toBe(
            IMPORT_CLASSIFICATION
              .FILE_CONFLICT
          );

          expect(
            plan.safeToImport
          ).toBe(
            false
          );
        } finally {
          fs.rmSync(
            roots.root,
            {
              recursive:
                true,

              force:
                true,
            }
          );
        }
      }
    );


    test(
      'real generated Kubernetes pack contains exactly 17 definitions',
      () => {
        const plan =
          buildCatalogueImportPlan();

        expect(
          plan.generatedCounts
        ).toEqual({
          playbooks:
            6,

          runbooks:
            11,

          total:
            17,
        });

        expect(
          plan.items
        ).toHaveLength(
          17
        );
      }
    );


    test(
      'real catalogue plan contains no unclassified definitions',
      () => {
        const plan =
          buildCatalogueImportPlan();

        const valid =
          new Set(
            Object.values(
              IMPORT_CLASSIFICATION
            )
          );

        for (
          const item
          of plan.items
        ) {
          expect(
            valid.has(
              item.classification
            )
          ).toBe(
            true
          );
        }
      }
    );


    test(
      'real catalogue must not be imported when conflicts exist',
      () => {
        const plan =
          buildCatalogueImportPlan();

        const conflicts =
          plan.counts
            .idConflicts +
          plan.counts
            .fileConflicts;

        expect(
          plan.safeToImport
        ).toBe(
          conflicts ===
          0
        );
      }
    );
  }
);