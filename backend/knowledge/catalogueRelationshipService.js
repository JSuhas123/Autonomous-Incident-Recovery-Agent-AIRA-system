"use strict";

/**
 * AIRA Catalogue Relationship Service
 *
 * Phase 13.3 + 13.4
 *
 * Builds the authoritative physical relationship graph:
 *
 *   Playbook
 *      ↓
 *   Stage / Rollback reference
 *      ↓
 *   Runbook
 *
 * Responsibilities:
 *
 * - identify missing physical Runbooks
 * - identify Playbooks referencing non-ACTIVE Runbooks
 * - identify unused/orphan Runbooks
 * - preserve relationship type (stage vs rollback)
 * - expose dependency graph for future indexing/search/UI
 *
 * SAFETY:
 *
 * Physical existence does NOT imply execution eligibility.
 * ACTIVE Playbooks referencing DRAFT Runbooks are considered unhealthy.
 */

const {
  scanCatalogue,
} =
  require(
    "./catalogueScanner"
  );
const {
  canPlaybookDependOnRunbook,
} =
  require(
    "./catalogueLifecyclePolicy"
  );

function _normalizeLifecycle(
  value
) {
  return String(
    value ||
    "UNKNOWN"
  )
    .trim()
    .toUpperCase();
}


function buildCatalogueRelationshipGraph(
  options = {}
) {
  const scan =
    scanCatalogue(
      options
    );

  const runbookIndex =
    new Map(
      scan
        .runbooks
        .filter(
          (
            runbook
          ) =>
            runbook
              .runbookId
        )
        .map(
          (
            runbook
          ) => [
            runbook
              .runbookId,

            runbook,
          ]
        )
    );

  const nodes = {
    playbooks:
      scan
        .playbooks
        .map(
          (
            playbook
          ) => ({
            id:
              playbook
                .playbookId,

            type:
              "PLAYBOOK",

            name:
              playbook
                .name,

            lifecycle:
              _normalizeLifecycle(
                playbook
                  .lifecycle
              ),

            semver:
              playbook
                .semver,

            domain:
              playbook
                .naming
                ?.domain ||
              null,

            file:
              playbook
                .file,
          })
        ),

    runbooks:
      scan
        .runbooks
        .map(
          (
            runbook
          ) => ({
            id:
              runbook
                .runbookId,

            type:
              "RUNBOOK",

            name:
              runbook
                .name,

            lifecycle:
              _normalizeLifecycle(
                runbook
                  .lifecycle
              ),

            semver:
              runbook
                .semver,

            domain:
              runbook
                .naming
                ?.domain ||
              null,

            file:
              runbook
                .file,
          })
        ),
  };

  const edges =
    [];

  const missingReferences =
    [];

  const lifecycleMismatches =
    [];

  for (
    const playbook
    of scan.playbooks
  ) {
    const playbookLifecycle =
      _normalizeLifecycle(
        playbook
          .lifecycle
      );

    for (
      const reference
      of playbook
        .runbookRefs
    ) {
      const runbook =
        runbookIndex
          .get(
            reference
              .runbookId
          ) ||
        null;

      const edge = {
        from:
          playbook
            .playbookId,

        to:
          reference
            .runbookId,

        relationType:
          reference
            .relationType ||
          "STAGE",

        stageId:
          reference
            .stageId,

        stageName:
          reference
            .stageName,

        stageType:
          reference
            .stageType,

        required:
          reference
            .required !==
          false,

        versionConstraint:
          reference
            .versionConstraint ||
          null,

        parameterMappings:
          reference
            .parameterMappings ||
          {},

        targetExists:
          Boolean(
            runbook
          ),

        targetLifecycle:
          runbook
            ? _normalizeLifecycle(
                runbook
                  .lifecycle
              )
            : null,
      };

      edges.push(
        edge
      );

      if (
        !runbook
      ) {
        missingReferences.push({
          playbookId:
            playbook
              .playbookId,

          runbookId:
            reference
              .runbookId,

          relationType:
            reference
              .relationType ||
            "STAGE",

          stageId:
            reference
              .stageId,

          required:
            reference
              .required !==
            false,

          file:
            playbook
              .file,
        });

        continue;
      }

      /*
       * An ACTIVE Playbook cannot safely depend on a non-ACTIVE required
       * Runbook, because execution lookup accepts ACTIVE definitions only.
       */
      const lifecycleDecision =
  canPlaybookDependOnRunbook({
    playbookLifecycle,

    runbookLifecycle:
      runbook
        .lifecycle,

    required:
      reference
        .required !==
      false,
  });

if (
  !lifecycleDecision
    .allowed
)  {
        lifecycleMismatches.push({
          playbookId:
            playbook
              .playbookId,

          playbookLifecycle,

          runbookId:
            runbook
              .runbookId,
            
          runbookLifecycle:
            _normalizeLifecycle(
              runbook
                .lifecycle
            ),

          relationType:
            reference
              .relationType ||
            "STAGE",

          stageId:
            reference
              .stageId,
          
                reason:
  lifecycleDecision
    .reason,
    
          file:
            playbook
              .file,
        });
      }
    }
  }

  const referenced =
    new Set(
      edges
        .filter(
          (
            edge
          ) =>
            edge.targetExists
        )
        .map(
          (
            edge
          ) =>
            edge.to
        )
    );

  const orphanRunbooks =
    scan
      .runbooks
      .filter(
        (
          runbook
        ) =>
          runbook
            .runbookId &&
          !referenced
            .has(
              runbook
                .runbookId
            )
      )
      .map(
        (
          runbook
        ) => ({
          runbookId:
            runbook
              .runbookId,

          lifecycle:
            _normalizeLifecycle(
              runbook
                .lifecycle
            ),

          file:
            runbook
              .file,
        })
      );

  const blockingIssues =
    missingReferences
      .filter(
        (
          reference
        ) =>
          reference
            .required
      )
      .length +
    lifecycleMismatches
      .length;

  return {
    schemaVersion:
      "13.4-v1",

    generatedAt:
      new Date()
        .toISOString(),

    nodes,

    edges,

    stats: {
      playbooks:
        nodes
          .playbooks
          .length,

      runbooks:
        nodes
          .runbooks
          .length,

      relationships:
        edges
          .length,

      stageRelationships:
        edges
          .filter(
            (
              edge
            ) =>
              edge
                .relationType ===
              "STAGE"
          )
          .length,

      rollbackRelationships:
        edges
          .filter(
            (
              edge
            ) =>
              edge
                .relationType ===
              "ROLLBACK"
          )
          .length,
    },

    integrity: {
      healthy:
        blockingIssues ===
        0,

      blockingIssueCount:
        blockingIssues,

      missingReferences,

      lifecycleMismatches,

      orphanRunbooks,
    },
  };
}


module.exports = {
  buildCatalogueRelationshipGraph,
};