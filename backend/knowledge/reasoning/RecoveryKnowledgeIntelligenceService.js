"use strict";

const EvidenceRequirementEngine =
  require(
    "./EvidenceRequirementEngine"
  );

const HypothesisEngine =
  require(
    "./HypothesisEngine"
  );

const CapabilityRequirementEngine =
  require(
    "./CapabilityRequirementEngine"
  );

const HistoricalEffectivenessEngine =
  require(
    "./HistoricalEffectivenessEngine"
  );

const KnowledgeRetrievalRankingEngine =
  require(
    "./KnowledgeRetrievalRankingEngine"
  );

const MemoryEvidenceAdapter =
  require(
    "./MemoryEvidenceAdapter"
  );

const ResourceGraphEvidenceAdapter =
  require(
    "./ResourceGraphEvidenceAdapter"
  );


class RecoveryKnowledgeIntelligenceService {
  constructor(
    options = {}
  ) {
    this._evidenceEngine =
      options.evidenceEngine ||
      new EvidenceRequirementEngine();

    this._hypothesisEngine =
      options.hypothesisEngine ||
      new HypothesisEngine();

    this._capabilityEngine =
      options.capabilityEngine ||
      new CapabilityRequirementEngine();

    this._historyEngine =
      options.historyEngine ||
      new HistoricalEffectivenessEngine();

    this._rankingEngine =
      options.rankingEngine ||
      new KnowledgeRetrievalRankingEngine();

    this._memoryAdapter =
      options.memoryAdapter ||
      new MemoryEvidenceAdapter();

    this._graphAdapter =
      options.graphAdapter ||
      new ResourceGraphEvidenceAdapter();
  }

  analyze({
    failureModes = [],
    playbooks = [],
    evidence = [],
    memories = [],
    resourceContext = null,
    topology = null,
    knownGoodComparison = null,
    correlatedChanges = [],
    historicalExecutions = [],
    availableCapabilities = [],
  } = {}) {
    const memory =
      this._memoryAdapter
        .adapt({
          memories,
        });

    const graph =
      this._graphAdapter
        .adapt({
          resourceContext,
          topology,
          knownGoodComparison,
          correlatedChanges,
        });

    const evidenceAssessments =
      failureModes.map(
        (failureMode) =>
          this._evidenceEngine
            .evaluate({
              failureMode,

              evidence: [
                ...evidence,
                ...memory.evidence,
                ...graph.evidence,
              ],
            })
      );

    const hypotheses =
      this._hypothesisEngine
        .generate({
          failureModes,
          evidenceAssessments,
          resourceContext:
            graph.resource,

          memoryEvidence:
            memory.evidence,

          knownGoodComparison,
        });

    const historicalEffectiveness =
      {};

    for (
      const playbook
      of playbooks
    ) {
      const playbookId =
        playbook.playbookId ||
        playbook.id ||
        playbook.playbookKey;

      historicalEffectiveness[
        playbookId
      ] =
        this._historyEngine
          .evaluate({
            playbookId,
            executions:
              historicalExecutions,
          });
    }

    const ranking =
      this._rankingEngine
        .rank({
          candidates:
            playbooks,

          hypothesis:
            hypotheses
              .bestHypothesis,

          evidenceAssessment:
            hypotheses
              .bestHypothesis
              ? evidenceAssessments.find(
                  (assessment) =>
                    assessment
                      .failureModeId ===
                    hypotheses
                      .bestHypothesis
                      .failureModeId
                )
              : null,

          availableCapabilities,

          historicalEffectiveness,

          resourceContext:
            graph.resource,
        });

    return {
      memory,

      resourceGraph:
        graph,

      evidenceAssessments,

      hypotheses,

      historicalEffectiveness,

      ranking,

      recommendedPlaybook:
        ranking.bestCandidate,

      /**
       * Strategy recommendation is evidence.
       *
       * Policy + authorization still happen later.
       */
      executionAuthorized:
        false,
    };
  }
}

module.exports =
  RecoveryKnowledgeIntelligenceService;