'use strict';

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
  buildCatalogueImportPlan,
} =
  require(
    '../catalogueImportPlanner'
  );

const {
  dryRunCatalogueImport,
  importCatalogue,
} =
  require(
    '../catalogueImporter'
  );


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
      }
    ),
    'utf8'
  );
}


function createFixture() {
  const root =
    fs.mkdtempSync(
      path.join(
        os.tmpdir(),
        'aira-importer-'
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


describe(
  'Phase 13.9 — safe catalogue importer',
  () => {
    test(
      'dry run does not modify physical catalogue',
      () => {
        const fixture =
          createFixture();

        try {
          writeYaml(
            path.join(
              fixture.generatedRoot,
              'runbooks',
              'kubernetes',
              'rb-new.yaml'
            ),
            {
              runbookId:
                'RB-NEW',

              name:
                'New Runbook',
            }
          );

          const result =
            dryRunCatalogueImport({
              generatedRoot:
                fixture.generatedRoot,

              playbookRoot:
                fixture.playbookRoot,

              runbookRoot:
                fixture.runbookRoot,
            });

          expect(
            result.dryRun
          ).toBe(
            true
          );

          expect(
            result.counts.new
          ).toBe(
            1
          );

          expect(
            fs.existsSync(
              path.join(
                fixture.runbookRoot,
                'kubernetes',
                'rb-new.yaml'
              )
            )
          ).toBe(
            false
          );
        } finally {
          fs.rmSync(
            fixture.root,
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
      'imports NEW definition using create-only semantics',
      () => {
        const fixture =
          createFixture();

        try {
          writeYaml(
            path.join(
              fixture.generatedRoot,
              'runbooks',
              'kubernetes',
              'rb-new.yaml'
            ),
            {
              runbookId:
                'RB-NEW',

              name:
                'New Runbook',
            }
          );

          const result =
            importCatalogue({
              generatedRoot:
                fixture.generatedRoot,

              playbookRoot:
                fixture.playbookRoot,

              runbookRoot:
                fixture.runbookRoot,
            });

          expect(
            result.applied
          ).toBe(
            true
          );

          expect(
            result.counts.created
          ).toBe(
            1
          );

          expect(
            fs.existsSync(
              path.join(
                fixture.runbookRoot,
                'kubernetes',
                'rb-new.yaml'
              )
            )
          ).toBe(
            true
          );
        } finally {
          fs.rmSync(
            fixture.root,
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
      'skips semantically identical existing knowledge',
      () => {
        const fixture =
          createFixture();

        const definition = {
          runbookId:
            'RB-IDENTICAL',

          name:
            'Identical',
        };

        try {
          writeYaml(
            path.join(
              fixture.generatedRoot,
              'runbooks',
              'kubernetes',
              'rb-identical.yaml'
            ),
            definition
          );

          writeYaml(
            path.join(
              fixture.runbookRoot,
              'kubernetes',
              'existing-name.yaml'
            ),
            definition
          );

          const result =
            importCatalogue({
              generatedRoot:
                fixture.generatedRoot,

              playbookRoot:
                fixture.playbookRoot,

              runbookRoot:
                fixture.runbookRoot,
            });

          expect(
            result.counts.created
          ).toBe(
            0
          );

          expect(
            result.counts
              .skippedIdentical
          ).toBe(
            1
          );
        } finally {
          fs.rmSync(
            fixture.root,
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
      'fails closed when an ID conflict exists',
      () => {
        const fixture =
          createFixture();

        try {
          writeYaml(
            path.join(
              fixture.generatedRoot,
              'runbooks',
              'kubernetes',
              'rb-conflict.yaml'
            ),
            {
              runbookId:
                'RB-CONFLICT',

              name:
                'Generated',
            }
          );

          writeYaml(
            path.join(
              fixture.runbookRoot,
              'kubernetes',
              'existing.yaml'
            ),
            {
              runbookId:
                'RB-CONFLICT',

              name:
                'Existing',
            }
          );

          const plan =
            buildCatalogueImportPlan({
              generatedRoot:
                fixture.generatedRoot,

              playbookRoot:
                fixture.playbookRoot,

              runbookRoot:
                fixture.runbookRoot,
            });

          expect(
            plan.safeToImport
          ).toBe(
            false
          );

          expect(
            () =>
              importCatalogue({
                plan,
              })
          ).toThrow(
            /contains conflicts/
          );
        } finally {
          fs.rmSync(
            fixture.root,
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
  "real Kubernetes pack is idempotent after import",
  () => {
    const plan =
      buildCatalogueImportPlan();

    expect(
      plan.safeToImport
    ).toBe(
      true
    );

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
  }
);
  }
);