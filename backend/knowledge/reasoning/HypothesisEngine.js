"use strict";

class HypothesisEngine {
  generate({
    failureModes = [],
    evidenceAssessments = [],
    resourceContext = null,
    memoryEvidence = [],
    knownGoodComparison = null,
  } = {}) {
    const assessmentByFailureMode =
      new Map(
        evidenceAssessments.map(
          (assessment) => [
            assessment.failureModeId,
            assessment,
          ]
        )
      );

    const hypotheses =
      failureModes.map(
        (failureMode) => {
          const failureModeId =
            failureMode.failureModeId ||
            failureMode.id;

          const assessment =
            assessmentByFailureMode.get(
              failureModeId
            ) || null;

          const evidenceConfidence =
            assessment?.confidence ?? 0;

          const priorConfidence =
            normalizeConfidence(
              failureMode.confidence ??
              failureMode.priorConfidence ??
              0.5
            );

          const graphSupport =
            calculateGraphSupport(
              failureMode,
              resourceContext
            );

          const memorySupport =
            calculateMemorySupport(
              failureMode,
              memoryEvidence
            );

          const knownGoodSupport =
            calculateKnownGoodSupport(
              failureMode,
              knownGoodComparison
            );

          const confidence =
            clamp(
              priorConfidence * 0.20 +
              evidenceConfidence * 0.50 +
              graphSupport * 0.10 +
              memorySupport * 0.10 +
              knownGoodSupport * 0.10
            );

          return {
            hypothesisId:
              `hypothesis:${failureModeId}`,

            failureModeId,

            title:
              failureMode.name ||
              failureMode.title ||
              failureModeId,

            confidence,

            evidenceConfidence,

            graphSupport,

            memorySupport,

            knownGoodSupport,

            evidenceComplete:
              assessment?.complete ??
              false,

            missingRequiredEvidence:
              assessment
                ?.missingRequiredEvidence ||
              [],

            recommendedPlaybooks:
              normalizePlaybookReferences(
                failureMode
              ),

            executionAuthorized:
              false,
          };
        }
      );

    hypotheses.sort(
      (a, b) =>
        b.confidence -
        a.confidence ||
        String(a.failureModeId)
          .localeCompare(
            String(b.failureModeId)
          )
    );

    return {
      hypotheses,

      bestHypothesis:
        hypotheses[0] || null,

      executionAuthorized:
        false,
    };
  }
}

function normalizePlaybookReferences(
  failureMode
) {
  const refs =
    failureMode.playbooks ||
    failureMode.playbookRefs ||
    failureMode.recommendedPlaybooks ||
    [];

  return Array.isArray(refs)
    ? refs
    : [];
}

function calculateGraphSupport(
  failureMode,
  context
) {
  if (!context) {
    return 0;
  }

  const expectedTypes =
    failureMode.resourceTypes ||
    failureMode.applicableResourceTypes ||
    [];

  if (!expectedTypes.length) {
    return 0.5;
  }

  const actualType =
    context.resourceType ||
    context.resource?.resourceType ||
    context.resource?.type;

  return expectedTypes.includes(
    actualType
  )
    ? 1
    : 0;
}

function calculateMemorySupport(
  failureMode,
  memories
) {
  if (
    !Array.isArray(memories) ||
    memories.length === 0
  ) {
    return 0;
  }

  const id =
    failureMode.failureModeId ||
    failureMode.id;

  const matching =
    memories.filter(
      (memory) =>
        memory.failureModeId === id ||
        memory.metadata
          ?.failureModeId === id
    );

  if (!matching.length) {
    return 0;
  }

  return clamp(
    matching.reduce(
      (total, memory) =>
        total +
        normalizeConfidence(
          memory.confidence ?? 0.5
        ),
      0
    ) / matching.length
  );
}

function calculateKnownGoodSupport(
  failureMode,
  comparison
) {
  if (!comparison) {
    return 0;
  }

  const expectedSignals =
    failureMode.knownGoodSignals ||
    failureMode.changeSignals ||
    [];

  if (!expectedSignals.length) {
    return comparison.hasChanges
      ? 0.5
      : 0;
  }

  const changes =
    comparison.changes ||
    comparison.differences ||
    [];

  const matched =
    expectedSignals.filter(
      (signal) =>
        changes.some(
          (change) =>
            change.key === signal ||
            change.field === signal ||
            change.path === signal
        )
    );

  return expectedSignals.length
    ? matched.length /
        expectedSignals.length
    : 0;
}

function normalizeConfidence(
  value
) {
  const number =
    Number(value);

  return Number.isFinite(number)
    ? clamp(number)
    : 0;
}

function clamp(value) {
  return Math.max(
    0,
    Math.min(1, value)
  );
}

module.exports =
  HypothesisEngine;