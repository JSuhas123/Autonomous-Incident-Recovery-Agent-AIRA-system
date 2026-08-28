"use strict";

/**
 * Phase 18.18
 *
 * Converts Phase 17 Resource Graph / Known-Good / temporal context into
 * reasoning evidence.
 *
 * Resource Graph = structural/temporal truth.
 * It does NOT prove causation.
 * It does NOT authorize execution.
 */
class ResourceGraphEvidenceAdapter {
  adapt({
    resourceContext = null,
    topology = null,
    knownGoodComparison = null,
    correlatedChanges = [],
  } = {}) {
    const resource =
      resourceContext
        ?.resource ||
      resourceContext ||
      null;

    const relationships =
      topology?.relationships ||
      resourceContext
        ?.relationships ||
      [];

    const changes =
      Array.isArray(
        correlatedChanges
      )
        ? correlatedChanges
        : [];

    const knownGoodChanges =
      knownGoodComparison
        ?.changes ||
      knownGoodComparison
        ?.differences ||
      [];

    const evidence = [];

    if (resource) {
      evidence.push({
        evidenceType:
          "RESOURCE_CONTEXT",

        resourceId:
          resource.resourceId ||
          resource.id ||
          null,

        resourceType:
          resource.resourceType ||
          resource.type ||
          null,

        source:
          "PHASE_17_RESOURCE_GRAPH",

        executionAuthorized:
          false,
      });
    }

    if (
      Array.isArray(
        relationships
      ) &&
      relationships.length
    ) {
      evidence.push({
        evidenceType:
          "TOPOLOGY",

        relationshipCount:
          relationships.length,

        relationships,

        source:
          "PHASE_17_RESOURCE_GRAPH",

        executionAuthorized:
          false,
      });
    }

    if (
      Array.isArray(
        knownGoodChanges
      ) &&
      knownGoodChanges.length
    ) {
      evidence.push({
        evidenceType:
          "KNOWN_GOOD_DIFF",

        changeCount:
          knownGoodChanges.length,

        changes:
          knownGoodChanges,

        source:
          "PHASE_17_KNOWN_GOOD",

        executionAuthorized:
          false,
      });
    }

    if (changes.length) {
      evidence.push({
        evidenceType:
          "CORRELATED_CHANGE",

        changeCount:
          changes.length,

        changes,

        /**
         * Critical invariant:
         * correlation is evidence, not proof of cause.
         */
        provesCausation:
          false,

        source:
          "PHASE_17_CHANGE_CORRELATION",

        executionAuthorized:
          false,
      });
    }

    return {
      resource,

      relationships,

      knownGoodChanges,

      correlatedChanges:
        changes,

      evidence,

      graphEvidenceAvailable:
        evidence.length > 0,

      structuralConfidence:
        calculateStructuralConfidence({
          resource,
          relationships,
          knownGoodChanges,
        }),

      correlationIsCausation:
        false,

      executionAuthorized:
        false,
    };
  }
}

function calculateStructuralConfidence({
  resource,
  relationships,
  knownGoodChanges,
}) {
  let score = 0;

  if (resource) {
    score += 0.4;
  }

  if (
    Array.isArray(
      relationships
    ) &&
    relationships.length
  ) {
    score += 0.3;
  }

  if (
    Array.isArray(
      knownGoodChanges
    ) &&
    knownGoodChanges.length
  ) {
    score += 0.3;
  }

  return Math.min(
    1,
    score
  );
}

module.exports =
  ResourceGraphEvidenceAdapter;