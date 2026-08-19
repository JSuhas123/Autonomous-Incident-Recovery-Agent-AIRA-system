"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const yaml = require("js-yaml");

const {
  KUBERNETES_RUNBOOKS,
  KUBERNETES_PLAYBOOKS,
} = require("../cataloguePackDefinitions");

const {
  SAFE_ACTIONS,
  buildRunbook,
  buildPlaybook,
  validateDefinitionSet,
  generateKubernetesPack,
} = require("../cataloguePackGenerator");

describe(
  "Phase 13.7 — Kubernetes Catalogue Expansion Pack",
  () => {
    let tempRoot;

    beforeEach(() => {
      tempRoot =
        fs.mkdtempSync(
          path.join(
            os.tmpdir(),
            "aira-k8s-pack-"
          )
        );
    });

    afterEach(() => {
      if (
        tempRoot &&
        fs.existsSync(
          tempRoot
        )
      ) {
        fs.rmSync(
          tempRoot,
          {
            recursive: true,
            force: true,
          }
        );
      }
    });

    test(
      "pack definitions have unique IDs and safe actions",
      () => {
        const result =
          validateDefinitionSet();

        expect(
          result.valid
        ).toBe(
          true
        );

        expect(
          result.errors
        ).toEqual(
          []
        );
      }
    );

    test(
      "contains the expected initial Kubernetes expansion",
      () => {
        expect(
          KUBERNETES_RUNBOOKS.length
        ).toBe(
          11
        );

        expect(
          KUBERNETES_PLAYBOOKS.length
        ).toBe(
          6
        );
      }
    );

    test(
      "every generated runbook preserves canonical AIRA depth",
      () => {
        for (
          const definition
          of KUBERNETES_RUNBOOKS
        ) {
          const runbook =
            buildRunbook(
              definition
            );

          expect(
            runbook.apiVersion
          ).toBe(
            "aira.io/v1"
          );

          expect(
            runbook.kind
          ).toBe(
            "Runbook"
          );

          expect(
            runbook.runbookId
          ).toBeTruthy();

          expect(
            runbook.semver
          ).toBeTruthy();

          expect(
            runbook.lifecycle
          ).toBeTruthy();

          expect(
            runbook.owner
          ).toEqual(
            expect.objectContaining({
              ownerType: "system",
            })
          );

          expect(
            runbook.scope
          ).toEqual(
            expect.objectContaining({
              environments:
                expect.any(
                  Array
                ),

              providers:
                expect.any(
                  Array
                ),
            })
          );

          expect(
            runbook.risk
          ).toEqual(
            expect.objectContaining({
              level:
                expect.any(
                  String
                ),

              blastRadius:
                expect.any(
                  String
                ),

              reversible:
                expect.any(
                  Boolean
                ),
            })
          );

          expect(
            Array.isArray(
              runbook.parameters
            )
          ).toBe(
            true
          );

          expect(
            Array.isArray(
              runbook.steps
            )
          ).toBe(
            true
          );

          expect(
            runbook.steps.length
          ).toBeGreaterThan(
            0
          );

          expect(
            runbook.rollbackConfig
          ).toBeTruthy();

          expect(
            runbook.verification
          ).toBeTruthy();

          expect(
            runbook.auditConfig
          ).toBeTruthy();
        }
      }
    );

    test(
      "every generated step uses an explicitly allowlisted deterministic action",
      () => {
        for (
          const definition
          of KUBERNETES_RUNBOOKS
        ) {
          for (
            const step
            of definition.steps
        ) {
            const actionKey =
              `${step.type}/${step.action}`;

            expect(
              SAFE_ACTIONS.has(
                actionKey
              )
            ).toBe(
              true
            );
          }
        }
      }
    );

    test(
  "sample expansion does not duplicate existing mutation runbooks",
  () => {
    const generatedIds =
      KUBERNETES_RUNBOOKS
        .map(
          (
            definition
          ) =>
            definition
              .runbookId
        );

    expect(
      generatedIds
    ).not.toContain(
      "RB-K8S-RESTART-DEPLOYMENT"
    );

    expect(
      generatedIds
    ).not.toContain(
      "RB-K8S-SCALE-DEPLOYMENT"
    );
  }
);

    test(
      "generated playbooks preserve canonical safety sections",
      () => {
        for (
          const definition
          of KUBERNETES_PLAYBOOKS
        ) {
          const playbook =
            buildPlaybook(
              definition
            );

          expect(
            playbook.apiVersion
          ).toBe(
            "aira.io/v1"
          );

          expect(
            playbook.kind
          ).toBe(
            "Playbook"
          );

          expect(
            playbook.playbookId
          ).toBeTruthy();

          expect(
  playbook.owner
).toEqual(
  expect.objectContaining({
    ownerType:
      expect.any(
        String
      ),

    ownerId:
      expect.any(
        String
      ),

    name:
      expect.any(
        String
      ),

    team:
      expect.any(
        String
      ),
  })
);

expect(
  playbook
    .owner
    .name
    .trim()
    .length
).toBeGreaterThan(
  0
);

          expect(
  playbook.scope
).toEqual(
  expect.objectContaining({
    environments:
      expect.any(
        Array
      ),

    providers:
      expect.any(
        Array
      ),

    resourceTypes:
      expect.any(
        Array
      ),

    namespaces:
      expect.any(
        Array
      ),
  })
);

expect(
  playbook
    .scope
    .environments
    .length
).toBeGreaterThan(
  0
);

expect(
  playbook
    .scope
    .providers
    .length
).toBeGreaterThan(
  0
);
          expect(
            playbook.incident
          ).toBeTruthy();

          expect(
            playbook.requiredEvidence
          ).toEqual(
            expect.any(
              Array
            )
          );

          expect(
            playbook
              .conditions
              .minimumConfidence
          ).toBeGreaterThan(
            0
          );

          expect(
            playbook.risk
          ).toBeTruthy();

          expect(
            playbook
              .policy
              .required
          ).toBe(
            true
          );

          expect(
            playbook
              .approval
              .mode
          ).toBeTruthy();

          expect(
            playbook
              .stages
              .length
          ).toBeGreaterThan(
            0
          );

          expect(
            playbook.rollback
          ).toBeTruthy();

          expect(
            playbook.escalation
          ).toBeTruthy();

          expect(
            playbook
              .outcome
              .captureLearning
          ).toBe(
            true
          );
        }
      }
    );

    test(
      "generation writes only inside staging output root",
      () => {
        const result =
          generateKubernetesPack({
            outputRoot:
              tempRoot,

            clean:
              true,
          });

        expect(
          result.counts
        ).toEqual({
          playbooks: 6,
          runbooks: 11,
          total: 17,
        });

        const entries = [
          ...result.playbooks,
          ...result.runbooks,
        ];

        for (
          const entry
          of entries
        ) {
          const resolved =
            path.resolve(
              entry.file
            );

          const resolvedRoot =
            path.resolve(
              tempRoot
            );

          expect(
            resolved.startsWith(
              resolvedRoot
            )
          ).toBe(
            true
          );

          expect(
            fs.existsSync(
              resolved
            )
          ).toBe(
            true
          );
        }
      }
    );

    test(
      "generated files are valid YAML",
      () => {
        const result =
          generateKubernetesPack({
            outputRoot:
              tempRoot,

            clean:
              true,
          });

        const entries = [
          ...result.playbooks,
          ...result.runbooks,
        ];

        for (
          const entry
          of entries
        ) {
          const raw =
            fs.readFileSync(
              entry.file,
              "utf8"
            );

          const parsed =
            yaml.load(
              raw
            );

          expect(
            parsed
          ).toBeTruthy();

          expect(
            parsed.apiVersion
          ).toBe(
            "aira.io/v1"
          );
        }
      }
    );

    test(
      "generator refuses overwrite unless explicitly allowed",
      () => {
        generateKubernetesPack({
          outputRoot:
            tempRoot,

          clean:
            true,
        });

        expect(
          () =>
            generateKubernetesPack({
              outputRoot:
                tempRoot,

              clean:
                false,
            })
        ).toThrow(
          /Refusing to overwrite/
        );
      }
    );

    test(
      "playbooks reference only known generated or existing Kubernetes runbooks",
      () => {
        const generatedIds =
          new Set(
            KUBERNETES_RUNBOOKS
              .map(
                (
                  runbook
                ) =>
                  runbook
                    .runbookId
              )
          );

        const knownExisting =
  new Set([
    "RB-K8S-INVESTIGATE-NODE",
    "RB-K8S-RESTART-DEPLOYMENT",
    "RB-K8S-VERIFY-DEPLOYMENT",

  ]);

        for (
          const playbook
          of KUBERNETES_PLAYBOOKS
        ) {
          for (
            const stage
            of playbook.stages
          ) {
            for (
              const reference
              of stage.runbooks
            ) {
              const known =
                generatedIds.has(
                  reference
                    .runbookId
                ) ||
                knownExisting.has(
                  reference
                    .runbookId
                );

              expect(
                known
              ).toBe(
                true
              );
            }
          }
        }
      }
    );
  }
);