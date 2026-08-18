"use strict";

/**
 * Playbook Selection Agent
 *
 * Reasons over deterministic PlaybookMatcher output to rank candidates.
 *
 * Phase 3:
 * - deterministic PlaybookMatcher remains authoritative
 * - Kubernetes diagnosis mapping provides a preferred candidate
 * - mapped Playbook MUST still exist in deterministic eligible set
 * - AI may rank only eligible candidates
 *
 * SAFETY INVARIANTS:
 * - MUST call deterministic PlaybookMatcher first
 * - CANNOT invent Playbook IDs
 * - CANNOT select DRAFT/non-ACTIVE Playbooks as executable
 * - CANNOT override Registry disqualifications
 * - CANNOT override Policy
 * - Kubernetes mapping NEVER bypasses matcher eligibility
 * - If deterministic matcher says NO_SAFE_PLAYBOOK:
 *   explain/escalate ONLY
 */

const {
  BaseAgent,
} = require("../runtime/baseAgent");

const {
  AGENT_STATUS,
  AGENT_MANUAL_REASON,
  PLAYBOOK_RECOMMENDATION,
  PLAYBOOK_SELECTION_SOURCE,
  createPlaybookRecommendation,
} = require("../contracts/agentContracts");

const {
  getReasoningProvider,
} = require("../runtime/reasoningProvider");

const {
  EXECUTION_OUTCOME,
  MANUAL_REASON,
} = require(
  "../../../constants/executionOutcomes"
);

const {
  kubernetesPlaybookMappingService,
} = require(
  "../../../services/playbooks/kubernetesPlaybookMappingService"
);

const AGENT_NAME =
  "PlaybookSelectionAgent";

const AGENT_VERSION =
  "2.0.0";

// ─────────────────────────────────────────────────────────────────────────────
// LLM output schema
// ─────────────────────────────────────────────────────────────────────────────

const OUTPUT_SCHEMA = {
  required: [
    "recommendedPlaybookId",
    "recommendation",
    "reasoningConfidence",
  ],

  properties: {
    recommendedPlaybookId: {
      type: "string",
    },

    version: {
      type: "string",
    },

    candidateRankings: {
      type: "array",
    },

    reasoningConfidence: {
      type: "number",
    },

    evidenceIds: {
      type: "array",
    },

    reasons: {
      type: "array",
    },

    disqualifications: {
      type: "array",
    },

    requiredAdditionalEvidence: {
      type: "array",
    },

    recommendation: {
      type: "string",
    },
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Agent
// ─────────────────────────────────────────────────────────────────────────────

class PlaybookSelectionAgent extends BaseAgent {
  constructor(
    config = {}
  ) {
    super(
      AGENT_NAME,
      AGENT_VERSION
    );

    this._config =
      config;

    this._reasoning =
      config.reasoningProvider ||
      null;
  }

  validateInput(
    context
  ) {
    const base =
      super.validateInput(
        context
      );

    if (!base.valid) {
      return base;
    }

    const errors = [];

    if (
      !context.diagnosis
    ) {
      errors.push(
        "context.diagnosis is required for playbook selection"
      );
    }

    return {
      valid:
        errors.length ===
        0,

      errors,
    };
  }

  async execute(
    context,
    dependencies = {}
  ) {
    const startedAt =
      new Date();

    const provider =
      this._reasoning ||
      getReasoningProvider();

    try {
      const {
        incidentId,
        correlationId,
        tenantId,
        incident,
        diagnosis,
        evidence,
      } = context;

      const evidenceIds =
        (
          evidence?.items ||
          []
        ).map(
          (item) =>
            item.id
        );

      const incidentPlaybookService =
        dependencies
          .incidentPlaybookService ||
        null;

      // ───────────────────────────────────────────────────────────────────────
      // Step 1 — Deterministic PlaybookMatcher
      //
      // This is the authoritative safety boundary.
      // ───────────────────────────────────────────────────────────────────────

      if (
        !incidentPlaybookService ||
        typeof incidentPlaybookService
          .analyseIncident !==
          "function"
      ) {
        return this._manual(
          startedAt,

          AGENT_MANUAL_REASON
            .DEPENDENCY_UNAVAILABLE ||
            AGENT_MANUAL_REASON
              .REASONING_FAILED,

          {
            evidenceUsed:
              evidenceIds,

            warnings: [
              "Deterministic incidentPlaybookService is unavailable",
            ],
          }
        );
      }

      let matcherAnalysis;

      try {
        matcherAnalysis =
          await incidentPlaybookService
            .analyseIncident(
              incident,

              {
                tenantId,
              }
            );
      } catch (
        error
      ) {
        return this._manual(
          startedAt,

          AGENT_MANUAL_REASON
            .REASONING_FAILED,

          {
            evidenceUsed:
              evidenceIds,

            warnings: [
              `Deterministic PlaybookMatcher failed: ${error.message}`,
            ],
          }
        );
      }

      // ───────────────────────────────────────────────────────────────────────
      // Matcher explicitly found no safe playbook
      // ───────────────────────────────────────────────────────────────────────

      if (
        matcherAnalysis
          ?.outcome ===
        EXECUTION_OUTCOME
          .MANUAL_REQUIRED
      ) {
        return this._success(
          startedAt,

          createPlaybookRecommendation({
            recommendedPlaybookId:
              null,

            candidateRankings:
              matcherAnalysis
                .candidates ||
              [],

            matcherScore:
              0,

            reasoningConfidence:
              0,

            evidenceIds,

            reasons: [
              matcherAnalysis
                .outcomeReason ||
                MANUAL_REASON
                  .NO_SAFE_PLAYBOOK,
            ],

            disqualifications:
              matcherAnalysis
                .disqualifications ||
              [],

            requiredAdditionalEvidence:
              matcherAnalysis
                .missingEvidence ||
              [],

            recommendation:
              PLAYBOOK_RECOMMENDATION
                .MANUAL_REQUIRED,

                selectedCandidate:
  preferredCandidate,

eligiblePlaybookIds:
  allowedCandidates
    .map(
      (candidate) =>
        candidate.playbookId
    ),

selectionSource:
  PLAYBOOK_SELECTION_SOURCE
    .DETERMINISTIC_MAPPING,

matcherAuthoritative:
  true,

approvalRequired:
  _candidateRequiresApproval(
    preferredCandidate
  ) ||
  Boolean(
    deterministicMapping
      ?.requiresApproval
  ) ||
  Boolean(
    diagnosis
      ?.risk
      ?.approvalRequired
  ),
          }),

          {
            confidence:
              0,

            evidenceUsed:
              evidenceIds,

            warnings: [
              "Deterministic matcher found no safe playbook; autonomous selection blocked",
            ],
          }
        );
      }

      // ───────────────────────────────────────────────────────────────────────
      // Build matcher-authorized candidate set
      // ───────────────────────────────────────────────────────────────────────

      const rawAllowedCandidates =
        Array.isArray(
          matcherAnalysis
            ?.eligible
        ) &&
        matcherAnalysis
          .eligible.length >
          0
          ? matcherAnalysis
              .eligible
          : (
              matcherAnalysis
                ?.candidates ||
              []
            );

      /**
       * Protect against malformed matcher output.
       */
      const allowedCandidates =
        rawAllowedCandidates
          .filter(
            (candidate) =>
              candidate &&
              typeof candidate
                .playbookId ===
                "string" &&
              candidate
                .playbookId
                .length >
                0
          );

      const eligibleIds =
        new Set(
          allowedCandidates.map(
            (candidate) =>
              candidate
                .playbookId
          )
        );

      // No matcher-approved candidates = fail closed.
      if (
        allowedCandidates.length ===
        0
      ) {
        return this._success(
          startedAt,

          createPlaybookRecommendation({
            recommendedPlaybookId:
              null,

            candidateRankings:
              [],

            matcherScore:
              0,

            reasoningConfidence:
              0,

            evidenceIds,

            reasons: [
              MANUAL_REASON
                .NO_SAFE_PLAYBOOK ||
                "NO_SAFE_PLAYBOOK",
            ],

            disqualifications:
              matcherAnalysis
                ?.disqualifications ||
              [],

            requiredAdditionalEvidence:
              matcherAnalysis
                ?.missingEvidence ||
              [],

            recommendation:
              PLAYBOOK_RECOMMENDATION
                .MANUAL_REQUIRED,
          }),

          {
            confidence:
              0,

            evidenceUsed:
              evidenceIds,

            warnings: [
              "PlaybookMatcher returned no eligible playbooks",
            ],
          }
        );
      }

      // ───────────────────────────────────────────────────────────────────────
      // Step 2 — Kubernetes deterministic preferred mapping
      //
      // IMPORTANT:
      // Mapping does NOT add anything to eligibleIds.
      //
      // It may only prefer something already authorized by matcher.
      // ───────────────────────────────────────────────────────────────────────

      const kubernetesDiagnosisCode =
        _resolveKubernetesDiagnosisCode(
          context
        );

      const deterministicMapping =
        kubernetesPlaybookMappingService
          .getMapping(
            kubernetesDiagnosisCode
          );

      let preferredCandidate =
        null;

      let mappingWarning =
        null;

      if (
        deterministicMapping
      ) {
        if (
          eligibleIds.has(
            deterministicMapping
              .playbookId
          )
        ) {
          preferredCandidate =
            allowedCandidates.find(
              (candidate) =>
                candidate
                  .playbookId ===
                deterministicMapping
                  .playbookId
            ) ||
            null;
        } else {
          /**
           * This is deliberately NOT inserted into allowedCandidates.
           *
           * Example:
           * diagnosis says OOMKilled
           * mapping says k8s-oomkilled-recovery
           * matcher rejects that playbook because policy/environment
           * disqualifies it
           *
           * Matcher wins.
           */
          mappingWarning =
            `Mapped Kubernetes playbook "${deterministicMapping.playbookId}" ` +
            `was not present in the deterministic eligible set`;
        }
      }

      // Prefer mapped candidate in presentation order,
      // but do not modify matcher authorization.
      const rankedInputCandidates =
        _preferCandidate(
          allowedCandidates,
          preferredCandidate
            ?.playbookId
        );

      // ───────────────────────────────────────────────────────────────────────
      // Step 3 — AI reasoning over ONLY eligible candidates
      // ───────────────────────────────────────────────────────────────────────

      const reasoning =
        await provider.reason({
          task:
            "playbookSelection",

          systemInstructions:
            PLAYBOOK_SELECTION_SYSTEM_PROMPT,

          structuredInput: {
            incident,

            diagnosis,

            kubernetesDiagnosisCode,

            deterministicPreferredPlaybook:
              preferredCandidate
                ? {
                    playbookId:
                      preferredCandidate
                        .playbookId,

                    mapping:
                      deterministicMapping,
                  }
                : null,

            eligibleCandidates:
              rankedInputCandidates.map(
                (candidate) => ({
                  playbookId:
                    candidate
                      .playbookId,

                  semver:
                    candidate
                      .semver,

                  name:
                    candidate
                      .name,

                  score:
                    candidate
                      .score,

                  approvalMode:
                    candidate
                      .approvalMode,

                  riskLevel:
                    candidate
                      .riskLevel,

                  matchReasons:
                    candidate
                      .matchReasons,
                })
              ),

            evidenceSummary:
              (
                evidence?.items ||
                []
              ).map(
                (item) => ({
                  id:
                    item.id,

                  type:
                    item.type,

                  summary:
                    item.summary,

                  confidence:
                    item.confidence,
                })
              ),
          },

          outputSchema:
            OUTPUT_SCHEMA,

          metadata: {
            incidentId,
            correlationId,
            tenantId,
          },
        });

      // ───────────────────────────────────────────────────────────────────────
      // Step 4 — LLM unavailable
      //
      // If deterministic matcher AND deterministic Kubernetes mapping agree,
      // we can still produce a safe candidate recommendation without relying
      // on LLM ranking.
      //
      // This does NOT execute it.
      // ───────────────────────────────────────────────────────────────────────

      if (
        reasoning.manualRequired
      ) {
        if (
          preferredCandidate
        ) {
          const recommendation =
            createPlaybookRecommendation({
              recommendedPlaybookId:
                preferredCandidate
                  .playbookId,

              version:
                preferredCandidate
                  .semver ||
                null,

              candidateRankings:
                rankedInputCandidates,

              matcherScore:
                preferredCandidate
                  .score ||
                0,

              reasoningConfidence:
                _deterministicSelectionConfidence(
                  preferredCandidate,
                  deterministicMapping
                ),

              evidenceIds,

              reasons: [
                `Deterministic Kubernetes mapping matched ${kubernetesDiagnosisCode}`,
                "Mapped playbook was independently approved by deterministic PlaybookMatcher",
              ],

              disqualifications:
                matcherAnalysis
                  ?.disqualifications ||
                [],

              requiredAdditionalEvidence:
                matcherAnalysis
                  ?.missingEvidence ||
                [],

              recommendation:
                _recommendationForCandidate(
                  preferredCandidate,
                  deterministicMapping
                ),
            });

          return this._success(
            startedAt,

            recommendation,

            {
              confidence:
                recommendation
                  .reasoningConfidence,

              evidenceUsed:
                evidenceIds,

              provider:
                "deterministic-playbook-selection",

              fallbackUsed:
                true,

              warnings: [
                "LLM ranking unavailable; deterministic matcher + Kubernetes mapping used",
              ],
            }
          );
        }

        return this._manual(
          startedAt,

          reasoning
            .manualReason ||
            AGENT_MANUAL_REASON
              .REASONING_FAILED,

          {
            evidenceUsed:
              evidenceIds,

            warnings:
              mappingWarning
                ? [
                    mappingWarning,
                  ]
                : [],
          }
        );
      }

      const output =
        reasoning.output ||
        {};

      // ───────────────────────────────────────────────────────────────────────
      // Step 5 — Hallucination guard
      // ───────────────────────────────────────────────────────────────────────

      const proposedId =
        output
          .recommendedPlaybookId;

      if (
        proposedId &&
        !eligibleIds.has(
          proposedId
        )
      ) {
        return this._manual(
          startedAt,

          AGENT_MANUAL_REASON
            .AGENT_OUTPUT_INVALID,

          {
            warnings: [
              `Agent proposed non-eligible playbookId "${proposedId}" — rejected`,
            ],

            evidenceUsed:
              evidenceIds,
          }
        );
      }

      // ───────────────────────────────────────────────────────────────────────
      // Step 6 — Sanitize AI candidate rankings
      //
      // Only matcher-approved IDs survive.
      // ───────────────────────────────────────────────────────────────────────

      /*
 * AI controls ordering only.
 *
 * Candidate metadata itself always comes from deterministic matcher output.
 * This prevents model output from fabricating riskLevel, approvalMode,
 * versions or parameter definitions.
 */
const aiRankingIds =
  (
    Array.isArray(
      output.candidateRankings
    )
      ? output.candidateRankings
      : []
  )
    .map(
      (candidate) =>
        typeof candidate ===
          "string"
          ? candidate
          : candidate
              ?.playbookId
    )
    .filter(
      (playbookId) =>
        playbookId &&
        eligibleIds.has(
          playbookId
        )
    );

const rankingOrder =
  new Map(
    aiRankingIds.map(
      (
        id,
        index
      ) => [
        id,
        index,
      ]
    )
  );

const candidateRankings =
  [
    ...allowedCandidates,
  ]
    .sort(
      (
        first,
        second
      ) => {
        const firstRank =
          rankingOrder.has(
            first.playbookId
          )
            ? rankingOrder.get(
                first.playbookId
              )
            : Number.MAX_SAFE_INTEGER;

        const secondRank =
          rankingOrder.has(
            second.playbookId
          )
            ? rankingOrder.get(
                second.playbookId
              )
            : Number.MAX_SAFE_INTEGER;

        if (
          firstRank !==
          secondRank
        ) {
          return (
            firstRank -
            secondRank
          );
        }

        return (
          Number(
            second.score ||
            0
          ) -
          Number(
            first.score ||
            0
          )
        );
      }
    );

      // ───────────────────────────────────────────────────────────────────────
      // Step 7 — Resolve final candidate
      //
      // Priority:
      //
      // 1. valid LLM recommendation inside eligible set
      // 2. deterministic Kubernetes preferred candidate
      // 3. first deterministic matcher candidate
      //
      // Every possible result is matcher-approved.
      // ───────────────────────────────────────────────────────────────────────

      const bestCandidate =
        allowedCandidates.find(
          (candidate) =>
            candidate
              .playbookId ===
            proposedId
        ) ||
        preferredCandidate ||
        rankedInputCandidates[0] ||
        null;

      if (
        !bestCandidate
      ) {
        return this._success(
          startedAt,

          createPlaybookRecommendation({
            recommendedPlaybookId:
              null,

            candidateRankings:
              [],

            matcherScore:
              0,

            reasoningConfidence:
              0,

            evidenceIds,

            reasons: [
              "No safe playbook candidate remained after validation",
            ],

            disqualifications:
              matcherAnalysis
                ?.disqualifications ||
              [],

            requiredAdditionalEvidence:
              matcherAnalysis
                ?.missingEvidence ||
              [],

            recommendation:
              PLAYBOOK_RECOMMENDATION
                .MANUAL_REQUIRED,
          }),

          {
            confidence:
              0,

            evidenceUsed:
              evidenceIds,
          }
        );
      }

      // ───────────────────────────────────────────────────────────────────────
      // Step 8 — Recommendation normalization + approval handling
      // ───────────────────────────────────────────────────────────────────────

      const mappedToBest =
        deterministicMapping &&
        deterministicMapping
          .playbookId ===
          bestCandidate
            .playbookId;

      let recommendation =
        _normaliseRecommendation(
          output
            .recommendation,

          bestCandidate
        );

      /**
       * Mapping safety metadata cannot reduce existing matcher safety.
       *
       * If mapping requires approval, force approval semantics.
       */
      if (
        mappedToBest &&
        deterministicMapping
          .requiresApproval
      ) {
        recommendation =
          _approvalRecommendation(
            recommendation
          );
      }

      const reasoningConfidence =
        typeof output
          .reasoningConfidence ===
        "number"
          ? _clamp01(
              output
                .reasoningConfidence
            )
          : (
              preferredCandidate &&
              preferredCandidate
                .playbookId ===
                bestCandidate
                  .playbookId
                ? 0.9
                : 0.5
            );

      const reasons =
        Array.isArray(
          output.reasons
        )
          ? [
              ...output.reasons,
            ]
          : [];

      if (
        mappedToBest
      ) {
        reasons.unshift(
          `Kubernetes diagnosis "${kubernetesDiagnosisCode}" maps to approved candidate "${bestCandidate.playbookId}"`
        );
      }

      if (
        mappingWarning
      ) {
        reasons.push(
          mappingWarning
        );
      }

      const riskRequiresApproval =
  Boolean(
    diagnosis
      ?.risk
      ?.approvalRequired
  );

const candidateRequiresApproval =
  _candidateRequiresApproval(
    bestCandidate
  );

const mappingRequiresApproval =
  Boolean(
    mappedToBest &&
    deterministicMapping
      ?.requiresApproval
  );

const approvalRequired =
  riskRequiresApproval ||
  candidateRequiresApproval ||
  mappingRequiresApproval;

if (
  approvalRequired
) {
  recommendation =
    PLAYBOOK_RECOMMENDATION
      .REQUIRE_APPROVAL;
}

const selectionSource =
  mappedToBest
    ? (
        proposedId ===
          bestCandidate.playbookId
          ? PLAYBOOK_SELECTION_SOURCE
              .HYBRID
          : PLAYBOOK_SELECTION_SOURCE
              .DETERMINISTIC_MAPPING
      )
    : (
        proposedId ===
          bestCandidate.playbookId
          ? PLAYBOOK_SELECTION_SOURCE
              .AI_RANKED
          : PLAYBOOK_SELECTION_SOURCE
              .DETERMINISTIC_MATCHER
      );

const recommendationRecord =
  createPlaybookRecommendation({
    recommendedPlaybookId:
      bestCandidate
        .playbookId,

    version:
      bestCandidate
        .semver ||
      null,

    /*
     * This snapshot comes only from deterministic matcher output.
     */
    selectedCandidate:
      bestCandidate,

    candidateRankings,

    eligiblePlaybookIds:
      allowedCandidates
        .map(
          (candidate) =>
            candidate.playbookId
        ),

    matcherScore:
      bestCandidate
        .score ||
      0,

    reasoningConfidence,

    evidenceIds,

    reasons,

    disqualifications:
      matcherAnalysis
        ?.disqualifications ||
      [],

    requiredAdditionalEvidence:
      Array.isArray(
        output
          .requiredAdditionalEvidence
      )
        ? output
            .requiredAdditionalEvidence
        : (
            matcherAnalysis
              ?.missingEvidence ||
            []
          ),

    selectionSource,

    matcherAuthoritative:
      true,

    approvalRequired,

    recommendation,
  });

      return this._success(
        startedAt,

        recommendationRecord,

        {
          confidence:
            recommendationRecord
              .reasoningConfidence,

          evidenceUsed:
            evidenceIds,

          model:
            reasoning
              .modelMetadata
              ?.model,

          provider:
            reasoning
              .modelMetadata
              ?.provider,

          fallbackUsed:
            reasoning
              .fallbackUsed,

          warnings: [
            ...(
              reasoning
                .warnings ||
              []
            ),

            ...(
              mappingWarning
                ? [
                    mappingWarning,
                  ]
                : []
            ),
          ],
        }
      );
    } catch (
      error
    ) {
      return this._fail(
        startedAt,
        error
      );
    }
  }

  validateOutput(
    record
  ) {
    const base =
      super.validateOutput(
        record
      );

    if (!base.valid) {
      return base;
    }

    if (
      record.status ===
      AGENT_STATUS.SUCCESS
    ) {
      if (
        !record.result
          ?.recommendation
      ) {
        return {
          valid:
            false,

          errors: [
            "recommendation missing from output",
          ],
        };
      }
    }

    return {
      valid:
        true,

      errors:
        [],
    };
  }

  getCapabilities() {
    return {
      ...super.getCapabilities(),

      reads: [
        "context.diagnosis",
        "context.evidence",
        "playbookMatcher",
        "kubernetes.playbookMapping",
      ],

      writes: [
        "context.selectedPlaybook",
        "context.playbookCandidates",
      ],

      requiresLLM:
        true,

      infrastructureMutation:
        false,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Kubernetes diagnosis resolution
// ─────────────────────────────────────────────────────────────────────────────

function _resolveKubernetesDiagnosisCode(
  context
) {
  /**
   * DiagnosisAgent Phase 3 sets recommendedIncidentType to the
   * deterministic Kubernetes diagnosis code when one exists.
   *
   * We still support several shapes to remain compatible with
   * orchestrator/context evolution.
   */
  const candidates = [
    context
      ?.deterministicDiagnosis
      ?.primary
      ?.code,

    context
      ?.diagnosis
      ?.deterministicDiagnosis
      ?.primary
      ?.code,

    context
      ?.diagnosis
      ?.recommendedIncidentType,

    context
      ?.diagnosisResult
      ?.recommendedIncidentType,

    context
      ?.incident
      ?.diagnosisCode,
  ];

  for (
    const value
    of candidates
  ) {
    if (
      typeof value ===
        "string" &&
      value.startsWith(
        "K8S_"
      )
    ) {
      return value;
    }
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Candidate ordering
// ─────────────────────────────────────────────────────────────────────────────

function _preferCandidate(
  candidates,
  preferredPlaybookId
) {
  if (
    !preferredPlaybookId
  ) {
    return [
      ...candidates,
    ];
  }

  return [
    ...candidates,
  ].sort(
    (a, b) => {
      if (
        a.playbookId ===
        preferredPlaybookId
      ) {
        return -1;
      }

      if (
        b.playbookId ===
        preferredPlaybookId
      ) {
        return 1;
      }

      return (
        (
          b.score ||
          0
        ) -
        (
          a.score ||
          0
        )
      );
    }
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Approval semantics
// ─────────────────────────────────────────────────────────────────────────────

function _recommendationForCandidate(
  candidate,
  deterministicMapping
) {
  if (
    deterministicMapping
      ?.requiresApproval
  ) {
    return _approvalRecommendation(
      PLAYBOOK_RECOMMENDATION
        .EXECUTE_CANDIDATE
    );
  }

  if (
    _candidateRequiresApproval(
      candidate
    )
  ) {
    return _approvalRecommendation(
      PLAYBOOK_RECOMMENDATION
        .EXECUTE_CANDIDATE
    );
  }

  return PLAYBOOK_RECOMMENDATION
    .EXECUTE_CANDIDATE;
}

function _candidateRequiresApproval(
  candidate
) {
  if (!candidate) {
    return false;
  }

  const mode =
    String(
      candidate
        .approvalMode ||
      ""
    )
      .toUpperCase();

  return [
    "REQUIRED",
    "MANUAL",
    "HUMAN",
    "ALWAYS",
  ].includes(
    mode
  );
}

/**
 * Use an existing approval recommendation enum if your contract exposes one.
 *
 * Otherwise MANUAL_REQUIRED is safer than silently treating an approval-
 * required playbook as autonomous.
 */
function _approvalRecommendation(
  current
) {
  if (
    PLAYBOOK_RECOMMENDATION
      .REQUIRE_APPROVAL
  ) {
    return PLAYBOOK_RECOMMENDATION
      .REQUIRE_APPROVAL;
  }

  if (
    PLAYBOOK_RECOMMENDATION
      .APPROVAL_REQUIRED
  ) {
    return PLAYBOOK_RECOMMENDATION
      .APPROVAL_REQUIRED;
  }

  return PLAYBOOK_RECOMMENDATION
    .MANUAL_REQUIRED;
}

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic fallback confidence
// ─────────────────────────────────────────────────────────────────────────────

function _deterministicSelectionConfidence(
  candidate,
  mapping
) {
  const matcherScore =
    Number(
      candidate
        ?.score
    );

  let matcherConfidence =
    Number.isFinite(
      matcherScore
    )
      ? matcherScore
      : 0.8;

  /**
   * Some matchers use percentages instead of normalized scores.
   */
  if (
    matcherConfidence >
    1
  ) {
    matcherConfidence =
      matcherConfidence /
      100;
  }

  matcherConfidence =
    _clamp01(
      matcherConfidence
    );

  /**
   * Code mapping agreement strengthens candidate selection,
   * but never creates perfect certainty.
   */
  if (
    mapping
  ) {
    return Math.min(
      0.98,
      Math.max(
        0.85,
        matcherConfidence
      )
    );
  }

  return matcherConfidence;
}

// ─────────────────────────────────────────────────────────────────────────────
// Recommendation normalization
// ─────────────────────────────────────────────────────────────────────────────

function _normaliseRecommendation(
  value,
  bestCandidate
) {
  if (!value) {
    return bestCandidate
      ? PLAYBOOK_RECOMMENDATION
          .EXECUTE_CANDIDATE
      : PLAYBOOK_RECOMMENDATION
          .MANUAL_REQUIRED;
  }

  const upper =
    String(value)
      .toUpperCase()
      .trim()
      .replace(
        /[\s-]+/g,
        "_"
      );

  return (
    PLAYBOOK_RECOMMENDATION[
      upper
    ] ||
    PLAYBOOK_RECOMMENDATION
      .MANUAL_REQUIRED
  );
}

function _clamp01(
  value
) {
  const number =
    Number(value);

  if (
    !Number.isFinite(
      number
    )
  ) {
    return 0;
  }

  return Math.min(
    1,
    Math.max(
      0,
      number
    )
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Prompt
// ─────────────────────────────────────────────────────────────────────────────

const PLAYBOOK_SELECTION_SYSTEM_PROMPT =
  `
You are the AIRA Playbook Selection Agent.

Your responsibility is to rank playbooks that have ALREADY passed the
deterministic PlaybookMatcher.

You may also receive a deterministicPreferredPlaybook derived from a
Kubernetes diagnosis.

This preference is advisory only. The candidate is present because the
deterministic matcher independently allowed it.

Rules:

1. You may ONLY recommend playbook IDs from eligibleCandidates.
2. Never invent a Playbook ID.
3. Never create a Runbook, Playbook, action, shell command, or kubectl command.
4. Never override matcher disqualifications.
5. Never override Policy.
6. Never add candidates to eligibleCandidates.
7. Prefer the deterministic Kubernetes mapping when evidence strongly supports
   the diagnosis and the mapped playbook is eligible.
8. If evidence conflicts with the deterministic preference, explain the conflict.
9. If no candidate is safe, recommend MANUAL_REQUIRED.
10. If more evidence is needed, recommend COLLECT_MORE_EVIDENCE.
11. Playbook selection confidence is separate from diagnosis confidence.
12. Return ONLY valid JSON.
`.trim();

module.exports = {
  PlaybookSelectionAgent,
};