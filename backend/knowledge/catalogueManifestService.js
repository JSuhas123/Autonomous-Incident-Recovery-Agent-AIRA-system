"use strict";

/**
 * AIRA Knowledge Catalogue Manifest Service
 *
 * Phase 13.2
 *
 * Generates an authoritative, read-only inventory of the physical
 * Playbook + Runbook catalogue.
 *
 * Counts are derived from files — never manually maintained.
 */

const {
  scanCatalogue,
} =
  require(
    "./catalogueScanner"
  );


const PHASE_13_TARGETS =
  Object.freeze({
    playbooks:
      100,

    runbooks:
      150,

    totalDefinitions:
      250,
  });


function increment(
  object,
  key
) {
  const normalized =
    String(
      key ||
      "UNKNOWN"
    )
      .trim()
      .toUpperCase();

  object[
    normalized
  ] =
    (
      object[
        normalized
      ] ||
      0
    ) +
    1;
}


function summarize(
  records,
  idField
) {
  const byDomain =
    {};

  const byLifecycle =
    {};

  const byNamingClassification =
    {};

  for (
    const record
    of records
  ) {
    increment(
      byDomain,
      record
        .naming
        ?.domain ||
      record
        .naming
        ?.domainCode ||
      "UNKNOWN"
    );

    increment(
      byLifecycle,
      record
        .lifecycle ||
      "UNKNOWN"
    );

    increment(
      byNamingClassification,
      record
        .naming
        ?.classification ||
      "UNKNOWN"
    );
  }

  return {
    total:
      records.length,

    uniqueIds:
      new Set(
        records
          .map(
            (
              record
            ) =>
              record[
                idField
              ]
          )
          .filter(
            Boolean
          )
      )
        .size,

    byDomain,

    byLifecycle,

    byNamingClassification,
  };
}


function buildCatalogueManifest(
  options = {}
) {
  const scan =
    scanCatalogue(
      options
    );

  const playbookSummary =
    summarize(
      scan.playbooks,
      "playbookId"
    );

  const runbookSummary =
    summarize(
      scan.runbooks,
      "runbookId"
    );

  const integrity =
    scan.integrity;

  const blockingIssues =
    integrity
      .parseErrors
      .length +

    integrity
      .duplicatePlaybookIds
      .length +

    integrity
      .duplicateRunbookIds
      .length +

    integrity
      .invalidNames
      .length +

    integrity
      .missingRunbookReferences
      .filter(
        (
          reference
        ) =>
          reference
            .required !==
          false
      )
      .length;

  return {
    schemaVersion:
      "13.2-v1",

    generatedAt:
      new Date()
        .toISOString(),

    catalogue: {
      totalDefinitions:
        playbookSummary
          .total +
        runbookSummary
          .total,

      playbooks:
        playbookSummary,

      runbooks:
        runbookSummary,
    },

    integrity: {
      healthy:
        blockingIssues ===
        0,

      blockingIssueCount:
        blockingIssues,

      parseErrors:
        integrity
          .parseErrors,

      duplicatePlaybookIds:
        integrity
          .duplicatePlaybookIds,

      duplicateRunbookIds:
        integrity
          .duplicateRunbookIds,

      invalidNames:
        integrity
          .invalidNames,

      legacyNames:
        integrity
          .legacyNames,

      filenameIssues:
        integrity
          .filenameIssues,

      missingRunbookReferences:
        integrity
          .missingRunbookReferences,

      orphanRunbooks:
        integrity
          .orphanRunbooks,
    },

    targets: {
      ...PHASE_13_TARGETS,

      remaining: {
        playbooks:
          Math.max(
            0,
            PHASE_13_TARGETS
              .playbooks -
            playbookSummary
              .total
          ),

        runbooks:
          Math.max(
            0,
            PHASE_13_TARGETS
              .runbooks -
            runbookSummary
              .total
          ),

        totalDefinitions:
          Math.max(
            0,
            PHASE_13_TARGETS
              .totalDefinitions -
            (
              playbookSummary
                .total +
              runbookSummary
                .total
            )
          ),
      },
    },

    definitions: {
      playbooks:
        scan
          .playbooks,

      runbooks:
        scan
          .runbooks,
    },
  };
}


module.exports = {
  PHASE_13_TARGETS,
  buildCatalogueManifest,
};