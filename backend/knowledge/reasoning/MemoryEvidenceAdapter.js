"use strict";

/**
 * Phase 18.17
 *
 * Converts Phase 16 operational memories into bounded reasoning evidence.
 *
 * PostgreSQL remains canonical Memory storage.
 * Qdrant remains retrieval acceleration only.
 *
 * Memory NEVER becomes knowledge truth or execution authority.
 */
class MemoryEvidenceAdapter {
  adapt({
    memories = [],
    failureModeId = null,
    incidentId = null,
  } = {}) {
    const evidence =
      (Array.isArray(memories)
        ? memories
        : []
      )
        .filter(
          (memory) =>
            this._relevant({
              memory,
              failureModeId,
              incidentId,
            })
        )
        .map(
          (memory) =>
            this._toEvidence(
              memory
            )
        );

    const successful =
      evidence.filter(
        (item) =>
          item.outcome ===
          "SUCCEEDED"
      );

    const failed =
      evidence.filter(
        (item) =>
          item.outcome ===
          "FAILED"
      );

    return {
      evidence,

      evidenceCount:
        evidence.length,

      successfulHistoricalCases:
        successful.length,

      failedHistoricalCases:
        failed.length,

      confidence:
        aggregateConfidence(
          evidence
        ),

      source:
        "PHASE_16_MEMORY",

      historicalEvidenceOnly:
        true,

      executionAuthorized:
        false,
    };
  }

  _relevant({
    memory,
    failureModeId,
    incidentId,
  }) {
    if (!memory) {
      return false;
    }

    if (
      failureModeId &&
      memory.failureModeId &&
      memory.failureModeId !==
        failureModeId &&
      memory.metadata
        ?.failureModeId !==
        failureModeId
    ) {
      return false;
    }

    /**
     * We do not require the same incident.
     * Episodic Memory is useful specifically because related historical
     * incidents may provide evidence.
     */
    if (
      incidentId &&
      memory.incidentId ===
        incidentId
    ) {
      return true;
    }

    return true;
  }

  _toEvidence(
    memory
  ) {
    return {
      evidenceId:
        memory.memoryId ||
        memory.id ||
        null,

      memoryType:
        memory.memoryType ||
        memory.type ||
        null,

      failureModeId:
        memory.failureModeId ||
        memory.metadata
          ?.failureModeId ||
        null,

      incidentId:
        memory.incidentId ||
        memory.metadata
          ?.incidentId ||
        null,

      playbookId:
        memory.playbookId ||
        memory.metadata
          ?.playbookId ||
        null,

      runbookId:
        memory.runbookId ||
        memory.metadata
          ?.runbookId ||
        null,

      outcome:
        normalizeOutcome(
          memory.outcome ||
          memory.metadata
            ?.outcome
        ),

      confidence:
        clamp(
          memory.confidence ??
          memory.metadata
            ?.confidence ??
          0.5
        ),

      provenance:
        memory.provenance ||
        memory.metadata
          ?.provenance ||
        null,

      source:
        "PHASE_16_MEMORY",

      canonicalSource:
        "POSTGRESQL",

      executionAuthorized:
        false,
    };
  }
}

function aggregateConfidence(
  evidence
) {
  if (!evidence.length) {
    return 0;
  }

  return clamp(
    evidence.reduce(
      (total, item) =>
        total +
        item.confidence,
      0
    ) /
    evidence.length
  );
}

function normalizeOutcome(
  value
) {
  const normalized =
    String(
      value || ""
    ).toUpperCase();

  if (
    [
      "SUCCEEDED",
      "SUCCESS",
      "RESOLVED",
    ].includes(normalized)
  ) {
    return "SUCCEEDED";
  }

  if (
    [
      "FAILED",
      "FAILURE",
      "UNRESOLVED",
    ].includes(normalized)
  ) {
    return "FAILED";
  }

  return normalized ||
    "UNKNOWN";
}

function clamp(
  value
) {
  return Math.max(
    0,
    Math.min(
      1,
      Number(value) || 0
    )
  );
}

module.exports =
  MemoryEvidenceAdapter;