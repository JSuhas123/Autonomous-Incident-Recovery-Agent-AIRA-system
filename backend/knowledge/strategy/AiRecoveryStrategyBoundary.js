"use strict";

/**
 * Phase 18.19
 *
 * AI is allowed to choose among approved knowledge candidates.
 *
 * AI is NOT allowed to:
 * - invent infrastructure commands
 * - invent Runbook steps
 * - bypass Playbook eligibility
 * - bypass capability requirements
 * - bypass policy
 * - bypass approval
 * - authorize execution
 *
 * The output of this boundary is a STRATEGY RECOMMENDATION only.
 */
class AiRecoveryStrategyBoundary {
  select({
    intelligenceResult,
    aiProposal = null,
  } = {}) {
    if (!intelligenceResult) {
      throw createError(
        "INTELLIGENCE_RESULT_REQUIRED",
        "intelligenceResult is required"
      );
    }

    const ranking =
      intelligenceResult.ranking || {};

    const candidates =
      Array.isArray(ranking.candidates)
        ? ranking.candidates
        : [];

    const eligibleCandidates =
      candidates.filter(
        (candidate) =>
          candidate.eligible === true
      );

    if (!eligibleCandidates.length) {
      return {
        selected:
          false,

        strategy:
          null,

        reason:
          "NO_ELIGIBLE_PLAYBOOK",

        requiresHumanReview:
          true,

        executionAuthorized:
          false,
      };
    }

    /**
     * If AI did not provide a proposal,
     * use deterministic ranking result.
     */
    if (!aiProposal) {
      const best =
        ranking.bestCandidate ||
        eligibleCandidates[0];

      return this._buildSelection({
        candidate:
          best,

        source:
          "DETERMINISTIC_RANKING",

        hypothesis:
          intelligenceResult
            .hypotheses
            ?.bestHypothesis ||
          null,
      });
    }

    this._assertProposalShape(
      aiProposal
    );

    const requestedPlaybookId =
      aiProposal.playbookId;

    const candidate =
      eligibleCandidates.find(
        (item) =>
          item.playbookId ===
          requestedPlaybookId
      );

    if (!candidate) {
      return {
        selected:
          false,

        strategy:
          null,

        requestedPlaybookId,

        reason:
          "AI_SELECTED_INELIGIBLE_OR_UNKNOWN_PLAYBOOK",

        requiresHumanReview:
          true,

        executionAuthorized:
          false,
      };
    }

    return this._buildSelection({
      candidate,

      source:
        "AI_FROM_APPROVED_CANDIDATES",

      hypothesis:
        intelligenceResult
          .hypotheses
          ?.bestHypothesis ||
        null,

      aiProposal,
    });
  }


  _assertProposalShape(
    proposal
  ) {
    if (
      !proposal ||
      typeof proposal !==
        "object" ||
      Array.isArray(proposal)
    ) {
      throw createError(
        "INVALID_AI_PROPOSAL",
        "AI proposal must be an object"
      );
    }

    if (
      !proposal.playbookId ||
      typeof proposal.playbookId !==
        "string"
    ) {
      throw createError(
        "PLAYBOOK_ID_REQUIRED",
        "AI proposal must select an approved playbookId"
      );
    }

    /**
     * These fields represent direct operational composition.
     * AI may not supply them.
     */
    const forbiddenFields = [
      "command",
      "commands",
      "shell",
      "script",
      "scripts",
      "steps",
      "actions",
      "action",
      "runbook",
      "runbooks",
      "runbookSteps",
      "executionPlan",
      "kubectl",
      "sql",
    ];

    for (
      const field
      of forbiddenFields
    ) {
      if (
        Object.prototype
          .hasOwnProperty
          .call(
            proposal,
            field
          )
      ) {
        throw createError(
          "AI_OPERATIONAL_COMPOSITION_FORBIDDEN",
          `AI proposal may not provide operational field: ${field}`
        );
      }
    }
  }


  _buildSelection({
    candidate,
    source,
    hypothesis,
    aiProposal = null,
  }) {
    return {
      selected:
        true,

      strategy: {
        playbookId:
          candidate.playbookId,

        candidateScore:
          candidate.score,

        hypothesisId:
          hypothesis
            ?.hypothesisId ||
          null,

        failureModeId:
          hypothesis
            ?.failureModeId ||
          null,

        rationale:
          aiProposal
            ?.rationale ||
          null,

        aiConfidence:
          normalizeConfidence(
            aiProposal
              ?.confidence
          ),

        source,
      },

      /**
       * Strategy choice != authorization.
       */
      requiresPolicyEvaluation:
        true,

      requiresAuthorization:
        true,

      executionAuthorized:
        false,
    };
  }
}


function normalizeConfidence(
  value
) {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  const number =
    Number(value);

  if (
    !Number.isFinite(
      number
    )
  ) {
    return null;
  }

  return Math.max(
    0,
    Math.min(
      1,
      number
    )
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
      executionAuthorized:
        false,
    }
  );
}


module.exports =
  AiRecoveryStrategyBoundary;