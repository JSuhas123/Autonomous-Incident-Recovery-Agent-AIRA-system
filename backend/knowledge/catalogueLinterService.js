"use strict";

/**
 * AIRA Catalogue Linter Service
 *
 * Phase 13.5 + 13.6
 *
 * Runs production-grade linting across the physical knowledge catalogue.
 *
 * Checks:
 *
 * - YAML parse integrity
 * - canonical naming
 * - duplicate IDs
 * - missing Playbook -> Runbook references
 * - ACTIVE Playbook -> non-ACTIVE Runbook dependencies
 * - Runbook structural/semantic/security validation
 * - action-handler existence
 * - DRAFT Runbooks that cannot be promoted
 * - ACTIVE Runbooks with unavailable deterministic handlers
 *
 * SAFETY:
 *
 * Physical existence != executable.
 * DRAFT != ACTIVE.
 * Registered action handler != execution authorization.
 */

const fs =
  require(
    "fs"
  );

const path =
  require(
    "path"
  );

const yaml =
  require(
    "js-yaml"
  );

const {
  scanCatalogue,
} =
  require(
    "./catalogueScanner"
  );

const {
  buildCatalogueRelationshipGraph,
} =
  require(
    "./catalogueRelationshipService"
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


// ============================================================================
// HELPERS
// ============================================================================

function _loadDefinition(
  backendRoot,
  relativeFile
) {
  const absolute =
    path.resolve(
      backendRoot,
      relativeFile
    );

  const raw =
    fs.readFileSync(
      absolute,
      "utf8"
    );

  return yaml.load(
    raw
  );
}


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


function _diagnosticSummary(
  diagnostics
) {
  const summary = {
    errors:
      0,

    warnings:
      0,

    infos:
      0,

    codes:
      [],
  };

  for (
    const diagnostic
    of diagnostics ||
    []
  ) {
    const severity =
      String(
        diagnostic
          ?.severity ||
        ""
      )
        .toUpperCase();

    if (
      severity ===
      "ERROR"
    ) {
      summary.errors +=
        1;
    } else if (
      severity ===
      "WARNING"
    ) {
      summary.warnings +=
        1;
    } else if (
      severity ===
      "INFO"
    ) {
      summary.infos +=
        1;
    }

    if (
      diagnostic
        ?.code
    ) {
      summary.codes.push(
        diagnostic.code
      );
    }
  }

  summary.codes =
    Array.from(
      new Set(
        summary.codes
      )
    );

  return summary;
}


function _extractActions(
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
        step &&
        step.type &&
        step.action
    )
    .map(
      (
        step
      ) => ({
        stepId:
          step.id ||
          null,

        type:
          String(
            step.type
          ),

        action:
          String(
            step.action
          ),

        key:
          `${step.type}/${step.action}`,
      })
    );
}


// ============================================================================
// RUNBOOK LINT
// ============================================================================

function _lintRunbook(
  record,
  backendRoot,
  actionRegistry
) {
  const definition =
    _loadDefinition(
      backendRoot,
      record.file
    );

  const lifecycle =
    _normalizeLifecycle(
      definition
        ?.lifecycle
    );

  const purpose =
    lifecycle ===
      "ACTIVE"
      ? VALIDATION_PURPOSE
          .ACTIVATION

      : lifecycle ===
          "APPROVED"
        ? VALIDATION_PURPOSE
            .APPROVAL

        : VALIDATION_PURPOSE
            .AUTHORING;

  const validation =
    validateRunbook(
      definition,
      {
        purpose,

        actionRegistry,
      }
    );

  const actions =
    _extractActions(
      definition
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

  const resolvedHandlers =
    actions
      .filter(
        (
          action
        ) =>
          actionRegistry
            .has(
              action.type,
              action.action
            )
      )
      .map(
        (
          action
        ) => ({
        ...action,

        metadata:
          actionRegistry
            .resolve(
              action.type,
              action.action
            ),
      }));

  const diagnostics =
    validation
      .diagnostics ||
    [];

  const diagnosticSummary =
    _diagnosticSummary(
      diagnostics
    );

  /*
   * An ACTIVE runbook must pass activation validation and have all handlers.
   */
  const executableDefinitionHealthy =
    lifecycle ===
      "ACTIVE"
      ? (
          validation.valid &&
          missingHandlers.length ===
            0
        )
      : null;

  /*
   * A DRAFT may be structurally valid while intentionally not promotable.
   */
  const promotionBlocked =
    lifecycle !==
      "ACTIVE" &&
    (
      missingHandlers.length >
        0 ||
      diagnosticSummary.errors >
        0
    );

  return {
    runbookId:
      record
        .runbookId,

    file:
      record
        .file,

    lifecycle,

    validationPurpose:
      purpose,

    valid:
      validation
        .valid,

    diagnostics,

    diagnosticSummary,

    actions,

    missingHandlers,

    resolvedHandlers,

    executableDefinitionHealthy,

    promotionBlocked,
  };
}


// ============================================================================
// CATALOGUE LINT
// ============================================================================

function lintCatalogue(
  options = {}
) {
  const scan =
    scanCatalogue(
      options
    );

  const relationships =
    buildCatalogueRelationshipGraph(
      options
    );

  const actionRegistry =
    options
      .actionRegistry ||
    getActionHandlerRegistry();

  const runbookResults =
    scan
      .runbooks
      .map(
        (
          record
        ) =>
          _lintRunbook(
            record,
            scan.backendRoot,
            actionRegistry
          )
      );

  // ==========================================================================
  // ACTIVE RUNBOOK HANDLER FAILURES
  // ==========================================================================

  const activeRunbookHandlerFailures =
    runbookResults
      .filter(
        (
          result
        ) =>
          result.lifecycle ===
            "ACTIVE" &&
          result
            .missingHandlers
            .length >
            0
      )
      .map(
        (
          result
        ) => ({
          runbookId:
            result
              .runbookId,

          file:
            result
              .file,

          missingHandlers:
            result
              .missingHandlers,
        })
      );

  // ==========================================================================
  // DRAFT PROMOTION BLOCKERS
  // ==========================================================================

  const draftPromotionBlockers =
    runbookResults
      .filter(
        (
          result
        ) =>
          result.lifecycle ===
            "DRAFT" &&
          result
            .promotionBlocked
      )
      .map(
        (
          result
        ) => ({
          runbookId:
            result
              .runbookId,

          file:
            result
              .file,

          missingHandlers:
            result
              .missingHandlers,

          diagnostics:
            result
              .diagnostics,
        })
      );

  // ==========================================================================
  // INVALID ACTIVE RUNBOOKS
  // ==========================================================================

  const invalidActiveRunbooks =
    runbookResults
      .filter(
        (
          result
        ) =>
          result.lifecycle ===
            "ACTIVE" &&
          result.valid !==
            true
      )
      .map(
        (
          result
        ) => ({
          runbookId:
            result
              .runbookId,

          file:
            result
              .file,

          diagnosticSummary:
            result
              .diagnosticSummary,

          diagnostics:
            result
              .diagnostics,
        })
      );

  // ==========================================================================
  // BLOCKING ISSUE COUNT
  // ==========================================================================

  const blockingIssueCount =
    scan
      .integrity
      .parseErrors
      .length +

    scan
      .integrity
      .duplicatePlaybookIds
      .length +

    scan
      .integrity
      .duplicateRunbookIds
      .length +

    scan
      .integrity
      .invalidNames
      .length +

    relationships
      .integrity
      .missingReferences
      .filter(
        (
          reference
        ) =>
          reference
            .required
      )
      .length +

    relationships
      .integrity
      .lifecycleMismatches
      .length +

    activeRunbookHandlerFailures
      .length +

    invalidActiveRunbooks
      .length;

  return {
    schemaVersion:
      "13.6-v1",

    generatedAt:
      new Date()
        .toISOString(),

    catalogue: {
      playbooks:
        scan
          .playbooks
          .length,

      runbooks:
        scan
          .runbooks
          .length,

      totalDefinitions:
        scan
          .playbooks
          .length +
        scan
          .runbooks
          .length,
    },

    actionRegistry: {
      registeredHandlerCount:
        actionRegistry
          .keys()
          .length,

      handlers:
        actionRegistry
          .report(),
    },

    runbooks:
      runbookResults,

    integrity: {
      healthy:
        blockingIssueCount ===
        0,

      blockingIssueCount,

      parseErrors:
        scan
          .integrity
          .parseErrors,

      duplicatePlaybookIds:
        scan
          .integrity
          .duplicatePlaybookIds,

      duplicateRunbookIds:
        scan
          .integrity
          .duplicateRunbookIds,

      invalidNames:
        scan
          .integrity
          .invalidNames,

      legacyNames:
        scan
          .integrity
          .legacyNames,

      filenameIssues:
        scan
          .integrity
          .filenameIssues,

      missingRunbookReferences:
        relationships
          .integrity
          .missingReferences,

      lifecycleMismatches:
        relationships
          .integrity
          .lifecycleMismatches,

      orphanRunbooks:
        relationships
          .integrity
          .orphanRunbooks,

      activeRunbookHandlerFailures,

      invalidActiveRunbooks,

      draftPromotionBlockers,
    },
  };
}


module.exports = {
  lintCatalogue,
};