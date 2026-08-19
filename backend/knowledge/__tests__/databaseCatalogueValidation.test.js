'use strict';

/**
 * Phase 13.11H — Database Catalogue Pre-Import Validation
 *
 * Validates the generated database staging pack before physical import.
 *
 * Gates:
 * - expected staging size
 * - generated YAML exists and parses
 * - unique IDs
 * - no collision with physical catalogue
 * - all Runbook actions exist in authoritative registry
 * - no dangerous/mutating database actions
 * - all Playbook -> Runbook references resolve
 * - all generated definitions preserve lifecycle/safety metadata
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const {
  DATABASE_RUNBOOKS,
  DATABASE_PLAYBOOKS,
} = require('../databaseCataloguePackDefinitions');

const {
  DATABASE_CAPABILITIES,
} = require('../databaseCapabilityMatrix');

const GENERATED_ROOT = path.resolve(
  __dirname,
  '..',
  '.generated',
  'phase-13-database-pack'
);

const BACKEND_ROOT = path.resolve(
  __dirname,
  '..',
  '..'
);

const PLAYBOOK_ROOT = path.join(
  BACKEND_ROOT,
  'playbooks',
  'catalogue'
);

const RUNBOOK_ROOT = path.join(
  BACKEND_ROOT,
  'runbooks',
  'definitions'
);


// ============================================================================
// HELPERS
// ============================================================================

function walkYamlFiles(root) {
  if (!fs.existsSync(root)) {
    return [];
  }

  const result = [];

  function walk(current) {
    for (const entry of fs.readdirSync(current)) {
      const absolute = path.join(
        current,
        entry
      );

      const stat = fs.statSync(
        absolute
      );

      if (stat.isDirectory()) {
        walk(absolute);
        continue;
      }

      if (/\.ya?ml$/i.test(entry)) {
        result.push(
          absolute
        );
      }
    }
  }

  walk(root);

  return result.sort();
}


function readYaml(file) {
  return yaml.load(
    fs.readFileSync(
      file,
      'utf8'
    )
  );
}


function readCatalogueDefinitions(root) {
  return walkYamlFiles(root)
    .map(file => ({
      file,
      document: readYaml(file),
    }));
}


function getDefinitionId(document) {
  return (
    document?.runbookId ||
    document?.playbookId ||
    document?.id ||
    null
  );
}


function getRunbookReferences(playbook) {
  const references = [];

  for (const stage of playbook?.stages || []) {
    for (const ref of stage?.runbooks || []) {
      if (typeof ref === 'string') {
        references.push(ref);
        continue;
      }

      if (ref?.runbookId) {
        references.push(
          ref.runbookId
        );
      }
    }

    /*
     * Support older catalogue shape where a stage directly contains
     * runbookId rather than runbooks[].
     */
    if (stage?.runbookId) {
      references.push(
        stage.runbookId
      );
    }
  }

  /*
   * Support top-level rollback relationship if present.
   */
  if (playbook?.rollback?.runbookId) {
    references.push(
      playbook.rollback.runbookId
    );
  }

  return references;
}


function getStepHandlerKey(step) {
  if (!step) {
    return null;
  }

  /*
   * Generated DB definitions currently use:
   *
   * type: database
   * action: get_health
   *
   * Authoritative key:
   *
   * database/get_health
   */

  if (
    typeof step.type === 'string' &&
    typeof step.action === 'string'
  ) {
    return `${step.type}/${step.action}`;
  }

  /*
   * Also tolerate canonical handlerKey/actionKey if the generator
   * evolves later.
   */

  if (typeof step.handlerKey === 'string') {
    return step.handlerKey;
  }

  if (typeof step.actionKey === 'string') {
    return step.actionKey;
  }

  return null;
}


// ============================================================================
// LOAD GENERATED PACK
// ============================================================================

const generatedRunbookRoot = path.join(
  GENERATED_ROOT,
  'runbooks'
);

const generatedPlaybookRoot = path.join(
  GENERATED_ROOT,
  'playbooks'
);

const generatedRunbookFiles =
  walkYamlFiles(
    generatedRunbookRoot
  );

const generatedPlaybookFiles =
  walkYamlFiles(
    generatedPlaybookRoot
  );

const generatedRunbooks =
  generatedRunbookFiles.map(
    file => ({
      file,
      document: readYaml(file),
    })
  );

const generatedPlaybooks =
  generatedPlaybookFiles.map(
    file => ({
      file,
      document: readYaml(file),
    })
  );


// ============================================================================
// TESTS
// ============================================================================

describe(
  'Phase 13.11H — generated database pack validation',
  () => {

    test(
      'generated staging pack contains exactly 30 YAML definitions',
      () => {
        expect(
          generatedRunbookFiles
        ).toHaveLength(
          21
        );

        expect(
          generatedPlaybookFiles
        ).toHaveLength(
          9
        );

        expect(
          generatedRunbookFiles.length +
          generatedPlaybookFiles.length
        ).toBe(
          30
        );
      }
    );


    test(
      'all generated YAML definitions parse successfully',
      () => {
        for (
          const entry
          of [
            ...generatedRunbooks,
            ...generatedPlaybooks,
          ]
        ) {
          expect(
            entry.document
          ).toBeTruthy();

          expect(
            typeof entry.document
          ).toBe(
            'object'
          );

          expect(
            getDefinitionId(
              entry.document
            )
          ).toBeTruthy();
        }
      }
    );


    test(
      'generated definition IDs are unique',
      () => {
        const ids = [
          ...generatedRunbooks,
          ...generatedPlaybooks,
        ].map(
          entry =>
            getDefinitionId(
              entry.document
            )
        );

        expect(
          new Set(ids).size
        ).toBe(
          ids.length
        );
      }
    );


    test(
      'generated definitions match source definition IDs',
      () => {
        const expectedRunbooks =
          DATABASE_RUNBOOKS
            .map(
              item =>
                item.runbookId
            )
            .sort();

        const actualRunbooks =
          generatedRunbooks
            .map(
              entry =>
                entry.document.runbookId
            )
            .sort();

        expect(
          actualRunbooks
        ).toEqual(
          expectedRunbooks
        );


        const expectedPlaybooks =
          DATABASE_PLAYBOOKS
            .map(
              item =>
                item.playbookId
            )
            .sort();

        const actualPlaybooks =
          generatedPlaybooks
            .map(
              entry =>
                entry.document.playbookId
            )
            .sort();

        expect(
          actualPlaybooks
        ).toEqual(
          expectedPlaybooks
        );
      }
    );


    test(
  "generated database pack matches the imported physical catalogue",
  () => {
    const {
      buildDatabaseImportPlan,
    } =
      require(
        "../databaseCatalogueImporter"
      );

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


    test(
      'all generated Runbook actions exist in database capability surface',
      () => {
        const allowed =
          new Set(
            DATABASE_CAPABILITIES.map(
              capability =>
                capability.handlerKey
            )
          );

        const unknown = [];

        for (
          const entry
          of generatedRunbooks
        ) {
          for (
            const step
            of entry.document.steps || []
          ) {
            const key =
              getStepHandlerKey(
                step
              );

            if (
              !key ||
              !allowed.has(key)
            ) {
              unknown.push({
                runbookId:
                  entry.document.runbookId,

                stepId:
                  step?.id || null,

                handlerKey:
                  key,
              });
            }
          }
        }

        expect(
          unknown
        ).toEqual(
          []
        );
      }
    );


    test(
      'database pack contains no mutation or arbitrary execution actions',
      () => {
        const dangerous =
          /(^|\/)(drop|delete|update|alter|truncate|kill|terminate|promote|failover|flush|restart|reconfigure|execute|execute_sql|shell|bash|command)(_|$|\/)/i;

        const unsafe = [];

        for (
          const entry
          of generatedRunbooks
        ) {
          for (
            const step
            of entry.document.steps || []
          ) {
            const key =
              getStepHandlerKey(
                step
              );

            if (
              key &&
              dangerous.test(key)
            ) {
              unsafe.push({
                runbookId:
                  entry.document.runbookId,

                handlerKey:
                  key,
              });
            }
          }
        }

        expect(
          unsafe
        ).toEqual(
          []
        );
      }
    );


    test(
      'all Playbook Runbook references resolve',
      () => {
        const physicalRunbooks =
          readCatalogueDefinitions(
            RUNBOOK_ROOT
          );

        const availableRunbookIds =
          new Set([
            ...physicalRunbooks
              .map(
                entry =>
                  getDefinitionId(
                    entry.document
                  )
              )
              .filter(Boolean),

            ...generatedRunbooks
              .map(
                entry =>
                  entry.document.runbookId
              ),
          ]);

        const missing = [];

        for (
          const entry
          of generatedPlaybooks
        ) {
          const references =
            getRunbookReferences(
              entry.document
            );

          for (
            const runbookId
            of references
          ) {
            if (
              !availableRunbookIds.has(
                runbookId
              )
            ) {
              missing.push({
                playbookId:
                  entry.document.playbookId,

                runbookId,
              });
            }
          }
        }

        expect(
          missing
        ).toEqual(
          []
        );
      }
    );


    test(
      'generated Runbooks preserve safe production metadata',
      () => {
        for (
          const entry
          of generatedRunbooks
        ) {
          const runbook =
            entry.document;

          expect(
            runbook.apiVersion
          ).toBe(
            'aira.io/v1'
          );

          expect(
            runbook.kind
          ).toBe(
            'Runbook'
          );

          expect(
            runbook.owner?.name
          ).toBeTruthy();

          expect(
            Array.isArray(
              runbook.scope?.environments
            )
          ).toBe(
            true
          );

          expect(
            runbook.scope
              .environments
              .length
          ).toBeGreaterThan(
            0
          );

          expect(
            runbook.risk?.level
          ).toBe(
            'LOW'
          );

          expect(
            runbook.risk?.reversible
          ).toBe(
            true
          );

          expect(
            runbook.auditConfig
              ?.redactSensitiveValues
          ).toBe(
            true
          );
        }
      }
    );


    test(
      'generated Playbooks remain DRAFT and MANUAL before import',
      () => {
        for (
          const entry
          of generatedPlaybooks
        ) {
          const playbook =
            entry.document;

          expect(
            playbook.lifecycle
          ).toBe(
            'DRAFT'
          );

          expect(
            playbook.approval?.mode
          ).toBe(
            'MANUAL'
          );

          expect(
            playbook.policy?.required
          ).toBe(
            true
          );

          expect(
            playbook.conditions
              ?.minimumConfidence
          ).toBeGreaterThanOrEqual(
            0.7
          );

          expect(
            playbook.stages
              ?.length
          ).toBeGreaterThan(
            0
          );
        }
      }
    );


    test(
      'generated database pack contains no embedded connection secrets',
      () => {
        for (
          const entry
          of [
            ...generatedRunbooks,
            ...generatedPlaybooks,
          ]
        ) {
          const serialized =
            JSON.stringify(
              entry.document
            );

          expect(
            serialized
          ).not.toMatch(
            /mongodb:\/\/|mongodb\+srv:\/\/|postgres(?:ql)?:\/\/|mysql:\/\/|redis:\/\/|password\s*[:=]|connectionString\s*[:=]/i
          );
        }
      }
    );
  }
);