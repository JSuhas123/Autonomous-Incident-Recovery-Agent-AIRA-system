"use strict";

/**
 * AIRA Knowledge Pack Validation Service
 *
 * Phase 13.7
 *
 * Validates generated knowledge definitions against:
 *
 * 1. Phase-13 quality/depth requirements
 * 2. AIRA's authoritative Runbook validator
 * 3. The live deterministic ActionHandlerRegistry
 * 4. Duplicate identities already present in the production catalogue
 *
 * SAFETY:
 *
 * This service is read-only.
 * It does not write catalogue files.
 * It does not register handlers.
 * It does not promote lifecycle states.
 */

const {
  scanCatalogue,
} =
  require(
    "./catalogueScanner"
  );

const {
  validateRunbookQuality,
  validatePlaybookQuality,
} =
  require(
    "./catalogueQualityPolicy"
  );

const {
  validateRunbook,
  VALIDATION_PURPOSE,
} =
  require(
    "../runbooks/validators/runbookValidator"
  );

const {
  getActionHandlerRegistry,
} =
  require(
    "../runbooks/actions/actionHandlerRegistry"
  );

const {
  buildRunbook,
  buildPlaybook,
} =
  require(
    "./cataloguePackGenerator"
  );


// ============================================================================
// HELPERS
// ============================================================================

function _errors(
  diagnostics = []
) {
  return diagnostics
    .filter(
      (
        diagnostic
      ) =>
        String(
          diagnostic
            ?.severity ||
          ""
        )
          .toUpperCase() ===
        "ERROR"
    );
}


function _stepActions(
  runbook
) {
  return (
    Array.isArray(
      runbook
        ?.steps
    )
      ? runbook.steps
      : []
  )
    .filter(
      (
        step
      ) =>
        step
          ?.type &&
        step
          ?.action
    )
    .map(
      (
        step
      ) => ({
        stepId:
          step.id ||
          null,

        type:
          step.type,

        action:
          step.action,

        key:
          `${step.type}/${step.action}`,
      })
    );
}


// ============================================================================
// RUNBOOK VALIDATION
// ============================================================================

function validateGeneratedRunbook(
  definition,
  options = {}
) {
  const document =
    buildRunbook(
      definition
    );

  const actionRegistry =
    options
      .actionRegistry ||
    getActionHandlerRegistry();

  const quality =
    validateRunbookQuality(
      document
    );

  /*
   * Generated definitions are first validated as AUTHORING definitions.
   *
   * Lifecycle activation remains a separate operation and must never happen
   * merely because generation succeeded.
   */
  const pipeline =
    validateRunbook(
      document,
      {
        purpose:
          VALIDATION_PURPOSE
            .AUTHORING,

        actionRegistry,
      }
    );

  const actions =
    _stepActions(
      document
    );

  const missingHandlers =
    actions
      .filter(
        (
          action
        ) =>
          !actionRegistry
            .has(
              action.type,
              action.action
            )
      );

  return {
    runbookId:
      document
        .runbookId,

    document,

    quality,

    pipeline,

    pipelineErrors:
      _errors(
        pipeline
          .diagnostics
      ),

    actions,

    missingHandlers,

    valid:
      quality.valid ===
        true &&
      pipeline.valid ===
        true &&
      missingHandlers
        .length ===
        0,
  };
}


// ============================================================================
// PLAYBOOK VALIDATION
// ============================================================================

function validateGeneratedPlaybook(
  definition
) {
  const document =
    buildPlaybook(
      definition
    );

  const quality =
    validatePlaybookQuality(
      document
    );

  return {
    playbookId:
      document
        .playbookId,

    document,

    quality,

    valid:
      quality.valid ===
      true,
  };
}


// ============================================================================
// PACK VALIDATION
// ============================================================================

function validateKubernetesKnowledgePack({
  runbooks = [],
  playbooks = [],
  existingCatalogue = null,
  actionRegistry = null,
} = {}) {
  const registry =
    actionRegistry ||
    getActionHandlerRegistry();

  const catalogue =
    existingCatalogue ||
    scanCatalogue();

  const existingRunbookIds =
    new Set(
      catalogue
        .runbooks
        .map(
          (
            item
          ) =>
            item
              .runbookId
        )
        .filter(
          Boolean
        )
    );

  const existingPlaybookIds =
    new Set(
      catalogue
        .playbooks
        .map(
          (
            item
          ) =>
            item
              .playbookId
        )
        .filter(
          Boolean
        )
    );

  const runbookResults =
    runbooks
      .map(
        (
          definition
        ) =>
          validateGeneratedRunbook(
            definition,
            {
              actionRegistry:
                registry,
            }
          )
      );

  const playbookResults =
    playbooks
      .map(
        (
          definition
        ) =>
          validateGeneratedPlaybook(
            definition
          )
      );

  // ==========================================================================
  // DUPLICATE IDENTITIES
  // ==========================================================================

  const duplicateRunbookIds =
    runbookResults
      .filter(
        (
          result
        ) =>
          existingRunbookIds
            .has(
              result
                .runbookId
            )
      )
      .map(
        (
          result
        ) =>
          result
            .runbookId
      );

  const duplicatePlaybookIds =
    playbookResults
      .filter(
        (
          result
        ) =>
          existingPlaybookIds
            .has(
              result
                .playbookId
            )
      )
      .map(
        (
          result
        ) =>
          result
            .playbookId
      );

  // ==========================================================================
  // REFERENCES
  // ==========================================================================

  const availableRunbookIds =
    new Set([
      ...existingRunbookIds,

      ...runbookResults
        .map(
          (
            result
          ) =>
            result
              .runbookId
        ),
    ]);

  const missingRunbookReferences =
    [];

  for (
    const result
    of playbookResults
  ) {
    for (
      const stage
      of result
        .document
        .stages ||
      []
    ) {
      for (
        const reference
        of stage
          .runbooks ||
        []
      ) {
        if (
          !availableRunbookIds
            .has(
              reference
                .runbookId
            )
        ) {
          missingRunbookReferences
            .push({
              playbookId:
                result
                  .playbookId,

              stageId:
                stage
                  .id ||
                stage
                  .stageId ||
                null,

              runbookId:
                reference
                  .runbookId,
            });
        }
      }
    }
  }

  // ==========================================================================
  // FINAL
  // ==========================================================================

  const invalidRunbooks =
    runbookResults
      .filter(
        (
          result
        ) =>
          result.valid !==
          true
      );

  const invalidPlaybooks =
    playbookResults
      .filter(
        (
          result
        ) =>
          result.valid !==
          true
      );

  const blockingIssueCount =
    invalidRunbooks
      .length +
    invalidPlaybooks
      .length +
    duplicateRunbookIds
      .length +
    duplicatePlaybookIds
      .length +
    missingRunbookReferences
      .length;

  return {
    schemaVersion:
      "13.7-pack-validation-v1",

    generatedAt:
      new Date()
        .toISOString(),

    counts: {
      runbooks:
        runbookResults
          .length,

      playbooks:
        playbookResults
          .length,

      total:
        runbookResults
          .length +
        playbookResults
          .length,
    },

    valid:
      blockingIssueCount ===
      0,

    blockingIssueCount,

    runbooks:
      runbookResults,

    playbooks:
      playbookResults,

    integrity: {
      invalidRunbooks:
        invalidRunbooks
          .map(
            (
              result
            ) =>
              result
                .runbookId
          ),

      invalidPlaybooks:
        invalidPlaybooks
          .map(
            (
              result
            ) =>
              result
                .playbookId
          ),

      duplicateRunbookIds,

      duplicatePlaybookIds,

      missingRunbookReferences,
    },
  };
}


module.exports = {
  validateGeneratedRunbook,
  validateGeneratedPlaybook,
  validateKubernetesKnowledgePack,
};