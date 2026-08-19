"use strict";

/**
 * AIRA Knowledge Catalogue Lifecycle Policy
 *
 * Phase 13.6
 *
 * Central catalogue-level lifecycle rules.
 *
 * Existing Runbook/Playbook registries remain authoritative for individual
 * lifecycle transitions. This module governs cross-definition catalogue
 * readiness.
 */

const CATALOGUE_LIFECYCLE =
  Object.freeze({
    DRAFT:
      "DRAFT",

    VALIDATED:
      "VALIDATED",

    APPROVED:
      "APPROVED",

    ACTIVE:
      "ACTIVE",

    DISABLED:
      "DISABLED",

    DEPRECATED:
      "DEPRECATED",
  });


function normalizeLifecycle(
  value
) {
  return String(
    value ||
    "UNKNOWN"
  )
    .trim()
    .toUpperCase();
}


function isProductionLifecycle(
  value
) {
  const lifecycle =
    normalizeLifecycle(
      value
    );

  return (
    lifecycle ===
      CATALOGUE_LIFECYCLE
        .APPROVED ||
    lifecycle ===
      CATALOGUE_LIFECYCLE
        .ACTIVE
  );
}


function canPlaybookDependOnRunbook({
  playbookLifecycle,
  runbookLifecycle,
  required = true,
} = {}) {
  const playbook =
    normalizeLifecycle(
      playbookLifecycle
    );

  const runbook =
    normalizeLifecycle(
      runbookLifecycle
    );

  /*
   * Optional dependencies may exist without blocking catalogue activation.
   */
  if (
    required ===
    false
  ) {
    return {
      allowed:
        true,

      reason:
        "OPTIONAL_DEPENDENCY",
    };
  }

  /*
   * ACTIVE playbook requires ACTIVE runbook.
   */
  if (
    playbook ===
      CATALOGUE_LIFECYCLE
        .ACTIVE
  ) {
    return {
      allowed:
        runbook ===
        CATALOGUE_LIFECYCLE
          .ACTIVE,

      reason:
        runbook ===
          CATALOGUE_LIFECYCLE
            .ACTIVE
          ? "ACTIVE_DEPENDENCY_OK"
          : "ACTIVE_PLAYBOOK_REQUIRES_ACTIVE_RUNBOOK",
    };
  }

  /*
   * APPROVED playbook requires APPROVED or ACTIVE runbook.
   */
  if (
    playbook ===
      CATALOGUE_LIFECYCLE
        .APPROVED
  ) {
    const allowed =
      runbook ===
        CATALOGUE_LIFECYCLE
          .APPROVED ||
      runbook ===
        CATALOGUE_LIFECYCLE
          .ACTIVE;

    return {
      allowed,

      reason:
        allowed
          ? "APPROVED_DEPENDENCY_OK"
          : "APPROVED_PLAYBOOK_REQUIRES_APPROVED_RUNBOOK",
    };
  }

  /*
   * Authoring lifecycles may reference lower-lifecycle definitions.
   */
  return {
    allowed:
      true,

    reason:
      "AUTHORING_DEPENDENCY_ALLOWED",
  };
}


function canPromoteRunbook({
  lifecycle,
  validationValid,
  missingHandlers = [],
} = {}) {
  const normalized =
    normalizeLifecycle(
      lifecycle
    );

  if (
    normalized ===
      CATALOGUE_LIFECYCLE
        .ACTIVE
  ) {
    return {
      allowed:
        validationValid ===
          true &&
        (
          missingHandlers ||
          []
        )
          .length ===
          0,

      reason:
        validationValid !==
          true
          ? "RUNBOOK_VALIDATION_FAILED"
          : (
              (
                missingHandlers ||
                []
              )
                .length >
                0
                ? "RUNBOOK_HANDLER_MISSING"
                : "RUNBOOK_ACTIVE_READY"
            ),
    };
  }

  return {
    allowed:
      validationValid ===
      true,

    reason:
      validationValid ===
        true
        ? "RUNBOOK_PROMOTION_VALID"
        : "RUNBOOK_VALIDATION_FAILED",
  };
}


module.exports = {
  CATALOGUE_LIFECYCLE,
  normalizeLifecycle,
  isProductionLifecycle,
  canPlaybookDependOnRunbook,
  canPromoteRunbook,
};