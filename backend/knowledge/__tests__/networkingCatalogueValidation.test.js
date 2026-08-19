'use strict';

const fs =
  require(
    'fs'
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
  NETWORKING_RUNBOOKS,
  NETWORKING_PLAYBOOKS,
} =
  require(
    '../networkingCataloguePackDefinitions'
  );

const {
  NETWORKING_CAPABILITIES,
} =
  require(
    '../networkingCapabilityMatrix'
  );

const {
  getActionHandlerRegistry,
  resetActionHandlerRegistry,
} =
  require(
    '../../runbooks/actions/actionHandlerRegistry'
  );


const GENERATED_ROOT =
  path.resolve(
    __dirname,
    '..',
    '.generated',
    'phase-13-networking-pack'
  );


const BACKEND_ROOT =
  path.resolve(
    __dirname,
    '..',
    '..'
  );


const RUNBOOK_ROOT =
  path.join(
    BACKEND_ROOT,
    'runbooks',
    'definitions'
  );


function walkYamlFiles(
  root
) {
  if (
    !fs.existsSync(
      root
    )
  ) {
    return [];
  }

  const result =
    [];

  function walk(
    current
  ) {
    for (
      const name
      of fs.readdirSync(
        current
      )
    ) {
      const absolute =
        path.join(
          current,
          name
        );

      const stat =
        fs.statSync(
          absolute
        );

      if (
        stat.isDirectory()
      ) {
        walk(
          absolute
        );

        continue;
      }

      if (
        /\.ya?ml$/i.test(
          name
        )
      ) {
        result.push(
          absolute
        );
      }
    }
  }

  walk(
    root
  );

  return result.sort();
}


function readYaml(
  file
) {
  return yaml.load(
    fs.readFileSync(
      file,
      'utf8'
    )
  );
}


function definitionId(
  document
) {
  return (
    document?.runbookId ||
    document?.playbookId ||
    document?.id ||
    null
  );
}


function getRunbookReferences(
  playbook
) {
  const references =
    [];

  for (
    const stage
    of playbook?.stages ||
    []
  ) {
    for (
      const ref
      of stage?.runbooks ||
      []
    ) {
      if (
        typeof ref ===
        'string'
      ) {
        references.push(
          ref
        );

        continue;
      }

      if (
        ref?.runbookId
      ) {
        references.push(
          ref.runbookId
        );
      }
    }

    if (
      stage?.runbookId
    ) {
      references.push(
        stage.runbookId
      );
    }
  }

  if (
    playbook?.rollback?.runbookId
  ) {
    references.push(
      playbook
        .rollback
        .runbookId
    );
  }

  return references;
}


function getStepHandlerKey(
  currentStep
) {
  if (
    typeof currentStep?.type ===
      'string' &&
    typeof currentStep?.action ===
      'string'
  ) {
    return `${currentStep.type}/${currentStep.action}`;
  }

  return (
    currentStep?.handlerKey ||
    currentStep?.actionKey ||
    null
  );
}


describe(
  'Phase 13.12 — generated Networking pack validation',
  () => {

    const generatedRunbookFiles =
      walkYamlFiles(
        path.join(
          GENERATED_ROOT,
          'runbooks'
        )
      );

    const generatedPlaybookFiles =
      walkYamlFiles(
        path.join(
          GENERATED_ROOT,
          'playbooks'
        )
      );

    const generatedRunbooks =
      generatedRunbookFiles.map(
        file => ({
          file,

          document:
            readYaml(
              file
            ),
        })
      );

    const generatedPlaybooks =
      generatedPlaybookFiles.map(
        file => ({
          file,

          document:
            readYaml(
              file
            ),
        })
      );


    test(
      'staging pack contains exactly thirty-two YAML definitions',
      () => {
        expect(
          generatedRunbookFiles
        ).toHaveLength(
          20
        );

        expect(
          generatedPlaybookFiles
        ).toHaveLength(
          12
        );
      }
    );


    test(
      'generated IDs exactly match source definitions',
      () => {
        expect(
          generatedRunbooks
            .map(
              entry =>
                entry.document.runbookId
            )
            .sort()
        ).toEqual(
          NETWORKING_RUNBOOKS
            .map(
              item =>
                item.runbookId
            )
            .sort()
        );

        expect(
          generatedPlaybooks
            .map(
              entry =>
                entry.document.playbookId
            )
            .sort()
        ).toEqual(
          NETWORKING_PLAYBOOKS
            .map(
              item =>
                item.playbookId
            )
            .sort()
        );
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
            definitionId(
              entry.document
            )
        );

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
      'all Runbook actions belong to networking capability surface',
      () => {
        const allowed =
          new Set(
            NETWORKING_CAPABILITIES.map(
              capability =>
                capability.handlerKey
            )
          );

        const unknown =
          [];

        for (
          const entry
          of generatedRunbooks
        ) {
          for (
            const currentStep
            of entry.document.steps ||
            []
          ) {
            const key =
              getStepHandlerKey(
                currentStep
              );

            if (
              !allowed.has(
                key
              )
            ) {
              unknown.push({
                runbookId:
                  entry.document.runbookId,

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
      'all Networking actions exist in authoritative registry',
      () => {
        resetActionHandlerRegistry();

        const registry =
          getActionHandlerRegistry();

        for (
          const capability
          of NETWORKING_CAPABILITIES
        ) {
          expect(
            registry
              .keys()
          ).toContain(
            capability.handlerKey
          );
        }
      }
    );


    test(
      'pack contains no dangerous mutation actions',
      () => {
        const dangerous =
          /delete|update|route_add|route_delete|firewall|iptables|replace|reload|restart|shell|bash|exec|command/i;

        for (
          const entry
          of generatedRunbooks
        ) {
          for (
            const currentStep
            of entry.document.steps ||
            []
          ) {
            expect(
              getStepHandlerKey(
                currentStep
              )
            ).not.toMatch(
              dangerous
            );
          }
        }
      }
    );


    test(
      'all Playbook references resolve',
      () => {
        const physicalRunbooks =
          walkYamlFiles(
            RUNBOOK_ROOT
          )
            .map(
              file =>
                readYaml(
                  file
                )
            );

        const available =
          new Set([
            ...physicalRunbooks
              .map(
                definitionId
              )
              .filter(
                Boolean
              ),

            ...generatedRunbooks
              .map(
                entry =>
                  entry.document.runbookId
              ),
          ]);

        const missing =
          [];

        for (
          const entry
          of generatedPlaybooks
        ) {
          for (
            const runbookId
            of getRunbookReferences(
              entry.document
            )
          ) {
            if (
              !available.has(
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
      'Runbooks preserve safe production metadata',
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
            runbook.lifecycle
          ).toBe(
            'ACTIVE'
          );

          expect(
            runbook.owner?.name
          ).toBeTruthy();

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
      'Playbooks remain DRAFT and MANUAL',
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
        }
      }
    );


    test(
      'generated pack contains no embedded credentials',
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
            /password\s*[:=]|token\s*[:=]|privateKey\s*[:=]|authorization\s*[:=]/i
          );
        }
      }
    );
  }
);