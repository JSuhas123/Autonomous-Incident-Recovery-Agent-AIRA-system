"use strict";

const {
  EVIDENCE_RESULT,
} = require("../../constants/knowledge");

class EvidenceRequirementEngine {
  evaluate({
    failureMode,
    evidence = [],
  } = {}) {
    if (!failureMode) {
      throw createError(
        "FAILURE_MODE_REQUIRED",
        "failureMode is required"
      );
    }

    const requirements =
      Array.isArray(failureMode.evidenceRequirements)
        ? failureMode.evidenceRequirements
        : Array.isArray(failureMode.requiredEvidence)
          ? failureMode.requiredEvidence
          : [];

    const normalizedEvidence =
      Array.isArray(evidence)
        ? evidence
        : [];

    const evaluations =
      requirements.map((requirement) =>
        this._evaluateRequirement(
          requirement,
          normalizedEvidence
        )
      );

    const required =
      evaluations.filter(
        (item) => item.required
      );

    const satisfied =
      required.filter(
        (item) => item.satisfied
      );

    const missing =
      required.filter(
        (item) => !item.satisfied
      );

    const optionalSatisfied =
      evaluations.filter(
        (item) =>
          !item.required &&
          item.satisfied
      );

    const denominator =
      required.length || 1;

    const requiredScore =
      required.length === 0
        ? 1
        : satisfied.length / denominator;

    const optionalBonus =
      evaluations.length === 0
        ? 0
        : Math.min(
            0.1,
            optionalSatisfied.length * 0.02
          );

    const confidence =
      clamp(
        requiredScore + optionalBonus
      );

    return {
      failureModeId:
        failureMode.failureModeId ||
        failureMode.id ||
        null,

      requirements:
        evaluations,

      requiredCount:
        required.length,

      satisfiedRequiredCount:
        satisfied.length,

      missingRequiredCount:
        missing.length,

      missingRequiredEvidence:
        missing.map(
          (item) => ({
            requirementId:
              item.requirementId,

            type:
              item.type,

            source:
              item.source,
          })
        ),

      complete:
        missing.length === 0,

      confidence,

      result:
        missing.length === 0
          ? resultValue(
              "SATISFIED",
              "satisfied"
            )
          : resultValue(
              "MISSING",
              "missing"
            ),

      executionAuthorized:
        false,
    };
  }

  _evaluateRequirement(
    requirement = {},
    evidence
  ) {
    const requirementId =
      requirement.requirementId ||
      requirement.id ||
      null;

    const type =
      requirement.type ||
      requirement.evidenceType ||
      null;

    const source =
      requirement.source ||
      null;

    const required =
      requirement.required !== false;

    const matches =
      evidence.filter((candidate) => {
        if (
          type &&
          candidate.type !== type &&
          candidate.evidenceType !== type
        ) {
          return false;
        }

        if (
          source &&
          candidate.source !== source
        ) {
          return false;
        }

        if (
          requirement.resourceId &&
          candidate.resourceId !==
            requirement.resourceId
        ) {
          return false;
        }

        return true;
      });

    const usable =
      matches.filter(
        (candidate) =>
          candidate.available !== false &&
          candidate.valid !== false
      );

    return {
      requirementId,
      type,
      source,
      required,

      satisfied:
        usable.length > 0,

      evidenceCount:
        usable.length,

      evidenceIds:
        usable
          .map(
            (item) =>
              item.evidenceId ||
              item.id
          )
          .filter(Boolean),

      result:
        usable.length > 0
          ? resultValue(
              "SATISFIED",
              "satisfied"
            )
          : resultValue(
              "MISSING",
              "missing"
            ),

      executionAuthorized:
        false,
    };
  }
}

function resultValue(
  preferred,
  fallback
) {
  if (
    EVIDENCE_RESULT &&
    EVIDENCE_RESULT[preferred]
  ) {
    return EVIDENCE_RESULT[preferred];
  }

  return fallback;
}

function clamp(value) {
  return Math.max(
    0,
    Math.min(1, value)
  );
}

function createError(
  code,
  message
) {
  return Object.assign(
    new Error(message),
    {
      code,
      executionAuthorized: false,
    }
  );
}

module.exports =
  EvidenceRequirementEngine;