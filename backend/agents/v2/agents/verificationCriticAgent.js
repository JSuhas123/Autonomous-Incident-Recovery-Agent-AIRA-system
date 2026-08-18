"use strict";

/**
 * AIRA Verification / Critic Agent
 *
 * Phase 6.10
 *
 * Adversarially verifies diagnostic conclusions before they are
 * accepted by the diagnosis coordinator.
 *
 * Responsibilities:
 *
 * - verify evidence references actually exist
 * - challenge root-cause hypotheses
 * - detect unsupported claims
 * - detect contradictory evidence
 * - detect weak causal reasoning
 * - detect excessive confidence
 * - compare competing hypotheses
 * - calculate verification confidence
 * - recommend VERIFIED / DOWNGRADED / REJECTED / INCONCLUSIVE
 *
 * Safety invariants:
 *
 * - never execute infrastructure changes
 * - never authorize execution
 * - never select remediation
 * - never select playbooks/runbooks
 * - never invent evidence
 */

const {
  BaseAgent,
} =
  require(
    "../runtime/baseAgent"
  );

const {
  createAgentFinding,
  verifyEvidenceIntegrity,
  EVIDENCE_INTEGRITY_STATUS,
} =
  require(
    "../contracts/agentContracts"
  );

const {
  getReasoningProvider,
} =
  require(
    "../runtime/reasoningProvider"
  );

const AGENT_NAME =
  "VerificationCriticAgent";

const AGENT_VERSION =
  "1.0.0";

const VERIFICATION_STATUS =
  Object.freeze({
    VERIFIED:
      "VERIFIED",

    DOWNGRADED:
      "DOWNGRADED",

    REJECTED:
      "REJECTED",

    INCONCLUSIVE:
      "INCONCLUSIVE",
  });

const CRITIC_SEVERITY =
  Object.freeze({
    INFO:
      "INFO",

    WARNING:
      "WARNING",

    CRITICAL:
      "CRITICAL",
  });

class VerificationCriticAgent
  extends BaseAgent {

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
      config
        .reasoningProvider ||
      null;

    this.minimumVerificationConfidence =
      clamp01(
        config
          .minimumVerificationConfidence ??
        process.env
          .DIAGNOSIS_MIN_VERIFICATION_CONFIDENCE ??
        0.65
      );
  }

  // ==========================================================================
  // EXECUTE
  // ==========================================================================

  async execute(
    context
  ) {
    const startedAt =
      new Date();

    try {
      this.assertContext(
        context
      );

      const hypotheses =
        this.getHypotheses(
          context
        );

      const evidenceIndex =
        this.buildEvidenceIndex(
          context
        );

      // ======================================================================
      // 1. VERIFY EACH HYPOTHESIS
      // ======================================================================

      const hypothesisReviews =
        hypotheses.map(
          (
            hypothesis
          ) =>
            this.reviewHypothesis(
              hypothesis,
              evidenceIndex,
              context
            )
        );

      // ======================================================================
      // 2. GLOBAL CRITIC CHECKS
      // ======================================================================

      const globalIssues = [
  ...this.detectMissingEvidence(
    context
  ),

  ...this.detectEvidenceIntegrityProblems(
    context
  ),

  ...this.detectEvidenceConflicts(
    context
  ),

        ...this.detectConfidenceProblems(
          context,
          hypothesisReviews
        ),

        ...this.detectCompetingHypothesisProblems(
          hypothesisReviews
        ),

        ...this.detectRiskDiagnosisConfusion(
          context
        ),
      ];

      // ======================================================================
      // 3. AI ADVERSARIAL REVIEW
      // ======================================================================

      const provider =
        this._reasoning ||
        getReasoningProvider();

      const reasoning =
        await provider
          .reason({
            task:
              "diagnosis_verification",

            systemInstructions:
              VERIFICATION_SYSTEM_PROMPT,

            structuredInput: {
              incident:
                context.incident,

              symptoms:
                context.symptoms ||
                [],

              hypotheses:
                hypotheses.map(
                  (
                    hypothesis
                  ) => ({
                    id:
                      hypothesis.id,

                    rootCause:
                      hypothesis.rootCause,

                    title:
                      hypothesis.title,

                    confidence:
                      hypothesis.confidence,

                    status:
                      hypothesis.status,

                    evidenceSupporting:
                      hypothesis
                        .evidenceSupporting ||
                      [],

                    evidenceAgainst:
                      hypothesis
                        .evidenceAgainst ||
                      [],

                    explanation:
                      hypothesis.explanation,

                    causalChain:
                      hypothesis
                        .causalChain ||
                      [],

                    assumptions:
                      hypothesis
                        .assumptions ||
                      [],

                    unknowns:
                      hypothesis
                        .unknowns ||
                      [],
                  })
                ),

              deterministicReviews:
                hypothesisReviews,

              deterministicIssues:
                globalIssues,

              evidenceSummary: {
                completeness:
                  context
                    .evidence
                    ?.completeness ||
                  0,

                evidenceCount:
                  evidenceIndex.size,

                missingEvidence:
                  context
                    .evidence
                    ?.missingEvidence ||
                  [],

                conflicts:
                  context
                    .evidence
                    ?.conflicts ||
                  [],
              },

              riskAnalysis:
                context
                  .riskAnalysis ||
                null,

              rootCauseAnalysis:
                context
                  .rootCauseAnalysis ||
                null,
            },

            outputSchema: {
              required: [
                "criticObservations",
              ],

              properties: {
                criticObservations: {
                  type:
                    "array",
                },

                unsupportedClaims: {
                  type:
                    "array",
                },

                contradictions: {
                  type:
                    "array",
                },

                missingEvidence: {
                  type:
                    "array",
                },

                alternativeExplanations: {
                  type:
                    "array",
                },

                confidenceConcerns: {
                  type:
                    "array",
                },

                unknowns: {
                  type:
                    "array",
                },

                verificationConfidence: {
                  type:
                    "number",
                },
              },
            },

            metadata: {
              incidentId:
                context.incidentId,

              correlationId:
                context.correlationId,

              organizationId:
                context.organizationId,

              environmentId:
                context.environmentId,
            },
          });

      const aiOutput =
        reasoning.output ||
        {};

      // ======================================================================
      // 4. MERGE CRITIC ISSUES
      // ======================================================================

      const aiIssues =
        this.normalizeAiIssues(
          aiOutput
        );

      const allIssues =
        deduplicateIssues([
          ...globalIssues,
          ...aiIssues,
        ]);

      // ======================================================================
      // 5. FINAL STATUS
      // ======================================================================

      const verificationStatus =
        this.determineVerificationStatus(
          context,
          hypothesisReviews,
          allIssues
        );

      // ======================================================================
      // 6. CONFIDENCE
      // ======================================================================

      const deterministicConfidence =
        this.calculateVerificationConfidence(
          context,
          hypothesisReviews,
          allIssues
        );

      const aiConfidence =
        clamp01OrNull(
          aiOutput
            .verificationConfidence
        );

      let verificationConfidence;

      if (
        aiConfidence ===
        null
      ) {
        verificationConfidence =
          deterministicConfidence;
      } else if (
        !context.organizationId ||
        !context.environmentId
      ) {
        verificationConfidence =
          aiConfidence;
      } else {
        verificationConfidence =
          Number(
            (
              deterministicConfidence *
                0.85 +
              aiConfidence *
                0.15
            )
              .toFixed(
                4
              )
          );
      }

      // ======================================================================
      // 7. PRIMARY HYPOTHESIS VERDICT
      // ======================================================================

      const primaryReview =
        hypothesisReviews[0] ||
        null;

      const acceptedHypothesisId =
        verificationStatus ===
          VERIFICATION_STATUS.VERIFIED ||
        verificationStatus ===
          VERIFICATION_STATUS.DOWNGRADED
          ? primaryReview
              ?.hypothesisId ||
            null
          : null;

      // ======================================================================
      // 8. FINDINGS
      // ======================================================================

      const findings =
        this.buildFindings(
          context,
          verificationStatus,
          verificationConfidence,
          hypothesisReviews,
          allIssues
        );

      // ======================================================================
      // 9. RETURN
      // ======================================================================

      return this._success(
        startedAt,

        {
          verificationStatus,

          verificationConfidence,

          acceptedHypothesisId,

          hypothesisReviews,

          issues:
            allIssues,

          criticObservations:
            normalizeArray(
              aiOutput
                .criticObservations
            ),

          unsupportedClaims:
            normalizeArray(
              aiOutput
                .unsupportedClaims
            ),

          contradictions:
            normalizeArray(
              aiOutput
                .contradictions
            ),

          missingEvidence:
            mergeUnique(
              context
                .evidence
                ?.missingEvidence ||
                [],

              aiOutput
                .missingEvidence ||
                []
            ),

          alternativeExplanations:
            normalizeArray(
              aiOutput
                .alternativeExplanations
            ),

          confidenceConcerns:
            normalizeArray(
              aiOutput
                .confidenceConcerns
            ),

          unknowns:
            normalizeArray(
              aiOutput
                .unknowns
            ),

          findings,

          executionAuthorized:
            false,
        },

        {
  confidence:
    verificationConfidence,

  evidenceUsed:
    Array.from(
      evidenceIndex.keys()
    ),

  evidenceMissing:
    mergeUnique(
      context
        .evidence
        ?.missingEvidence ||
      [],

      aiOutput
        .missingEvidence ||
      []
    ),

  assumptions:
    Array.from(
      new Set(
        hypotheses
          .flatMap(
            (
              hypothesis
            ) =>
              hypothesis
                .assumptions ||
              []
          )
      )
    ),

  nextRecommendedStage:
    verificationStatus ===
      VERIFICATION_STATUS
        .VERIFIED ||
    verificationStatus ===
      VERIFICATION_STATUS
        .DOWNGRADED
      ? "RISK_ANALYSIS"
      : "COLLECT_MORE_EVIDENCE",

  modelMetadata:
    reasoning
      .modelMetadata ||
    null,

  model:
    reasoning
      .modelMetadata
      ?.model,

  provider:
    reasoning
      .modelMetadata
      ?.provider,

  fallbackUsed:
    Boolean(
      reasoning
        .fallbackUsed
    ),

  warnings:
    reasoning
      .warnings ||
    [],
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

  // ==========================================================================
  // CONTEXT
  // ==========================================================================

  assertContext(
    context
  ) {
    if (
      !context
        ?.incidentId
    ) {
      throw Object.assign(
        new Error(
          "Verification requires incidentId"
        ),
        {
          code:
            "VERIFICATION_CONTEXT_INCIDENT_REQUIRED",
        }
      );
    }

    if (
      !context
        ?.incident
    ) {
      throw Object.assign(
        new Error(
          "Verification requires incident context"
        ),
        {
          code:
            "VERIFICATION_CONTEXT_INCIDENT_DATA_REQUIRED",
        }
      );
    }
  }

  getHypotheses(
    context
  ) {
    return normalizeArray(
      context
        .rootCauseAnalysis
        ?.hypotheses ||
      context.hypotheses
    );
  }

  // ==========================================================================
  // EVIDENCE INDEX
  // ==========================================================================

 buildEvidenceIndex(
  context
) {
  const map =
    new Map();

  for (
    const evidence
    of normalizeArray(
      context
        .evidence
        ?.items
    )
  ) {
    if (
      !evidence
        ?.id
    ) {
      continue;
    }

    const integrity =
      verifyEvidenceIntegrity(
        evidence
      );

    /*
     * Corrupted canonical evidence is never valid support for a hypothesis.
     *
     * Legacy/unverified evidence remains available during migration.
     */
    if (
      integrity.status ===
      EVIDENCE_INTEGRITY_STATUS
        .INVALID
    ) {
      continue;
    }

    map.set(
      String(
        evidence.id
      ),
      evidence
    );
  }

  return map;
}

// ==========================================================================
// EVIDENCE INTEGRITY / PROVENANCE
// ==========================================================================

detectEvidenceIntegrityProblems(
  context
) {
  const issues =
    [];

  const seenIds =
    new Set();

  for (
    const evidence
    of normalizeArray(
      context
        .evidence
        ?.items
    )
  ) {
    if (
      !evidence
        ?.id
    ) {
      issues.push({
        code:
          "EVIDENCE_ID_MISSING",

        severity:
          CRITIC_SEVERITY
            .CRITICAL,

        description:
          "Evidence item has no canonical identifier.",

        evidenceIds:
          [],
      });

      continue;
    }

    const evidenceId =
      String(
        evidence.id
      );

    if (
      seenIds.has(
        evidenceId
      )
    ) {
      issues.push({
        code:
          "DUPLICATE_EVIDENCE_ID",

        severity:
          CRITIC_SEVERITY
            .WARNING,

        description:
          `Duplicate evidence identifier detected: ${evidenceId}`,

        evidenceIds: [
          evidenceId,
        ],
      });
    }

    seenIds.add(
      evidenceId
    );

    const integrity =
      verifyEvidenceIntegrity(
        evidence
      );

    if (
      integrity.status ===
      EVIDENCE_INTEGRITY_STATUS
        .INVALID
    ) {
      issues.push({
        code:
          "EVIDENCE_INTEGRITY_INVALID",

        severity:
          CRITIC_SEVERITY
            .CRITICAL,

        description:
          `Canonical evidence "${evidenceId}" changed after its integrity fingerprint was created.`,

        evidenceIds: [
          evidenceId,
        ],
      });

      continue;
    }

    /*
     * Missing fingerprints are tolerated only for migration compatibility.
     */
    if (
      integrity.status ===
      EVIDENCE_INTEGRITY_STATUS
        .UNVERIFIED
    ) {
      issues.push({
        code:
          "EVIDENCE_INTEGRITY_UNVERIFIED",

        severity:
          CRITIC_SEVERITY
            .INFO,

        description:
          `Evidence "${evidenceId}" does not contain a Phase 12.4 integrity fingerprint.`,

        evidenceIds: [
          evidenceId,
        ],
      });
    }

    if (
      !evidence
        ?.provenance
        ?.collector ||
      !evidence
        ?.provenance
        ?.sourceRef
    ) {
      issues.push({
        code:
          "EVIDENCE_PROVENANCE_INCOMPLETE",

        severity:
          CRITIC_SEVERITY
            .INFO,

        description:
          `Evidence "${evidenceId}" has incomplete provenance metadata.`,

        evidenceIds: [
          evidenceId,
        ],
      });
    }
  }

  return issues;
}

  // ==========================================================================
  // HYPOTHESIS REVIEW
  // ==========================================================================

  reviewHypothesis(
    hypothesis,
    evidenceIndex,
    context
  ) {
    const supporting =
      uniqueStrings(
        hypothesis
          .evidenceSupporting ||
        []
      );

    const against =
      uniqueStrings(
        hypothesis
          .evidenceAgainst ||
        []
      );

    const validSupporting =
      supporting.filter(
        (
          id
        ) =>
          evidenceIndex.has(
            id
          )
      );

    const invalidSupporting =
      supporting.filter(
        (
          id
        ) =>
          !evidenceIndex.has(
            id
          )
      );

    const validAgainst =
      against.filter(
        (
          id
        ) =>
          evidenceIndex.has(
            id
          )
      );

    const invalidAgainst =
      against.filter(
        (
          id
        ) =>
          !evidenceIndex.has(
            id
          )
      );

    const issues =
      [];

    // ------------------------------------------------------------------------
    // Hallucinated/missing evidence references
    // ------------------------------------------------------------------------

    if (
      invalidSupporting.length >
      0
    ) {
      issues.push({
        code:
          "INVALID_SUPPORTING_EVIDENCE",

        severity:
          CRITIC_SEVERITY
            .CRITICAL,

        description:
          `${invalidSupporting.length} supporting evidence reference(s) do not exist.`,

        evidenceIds:
          invalidSupporting,
      });
    }

    if (
      invalidAgainst.length >
      0
    ) {
      issues.push({
        code:
          "INVALID_CONTRADICTING_EVIDENCE",

        severity:
          CRITIC_SEVERITY
            .WARNING,

        description:
          `${invalidAgainst.length} contradicting evidence reference(s) do not exist.`,

        evidenceIds:
          invalidAgainst,
      });
    }

    // ------------------------------------------------------------------------
    // Unsupported hypothesis
    // ------------------------------------------------------------------------

    if (
      validSupporting.length ===
      0
    ) {
      issues.push({
        code:
          "NO_SUPPORTING_EVIDENCE",

        severity:
          CRITIC_SEVERITY
            .CRITICAL,

        description:
          "Hypothesis has no valid supporting evidence.",

        evidenceIds:
          [],
      });
    }

    // ------------------------------------------------------------------------
    // Contradiction dominance
    // ------------------------------------------------------------------------

    if (
      validAgainst.length >
      validSupporting.length
    ) {
      issues.push({
        code:
          "CONTRADICTION_DOMINATES_SUPPORT",

        severity:
          CRITIC_SEVERITY
            .CRITICAL,

        description:
          "Contradicting evidence exceeds supporting evidence.",

        evidenceIds:
          validAgainst,
      });
    }

    // ------------------------------------------------------------------------
    // Confidence inflation
    // ------------------------------------------------------------------------

    const declaredConfidence =
      clamp01(
        hypothesis
          .confidence ||
        0
      );

    const evidenceSupportRatio =
      supporting.length ===
        0
        ? 0
        : validSupporting.length /
          supporting.length;

    const evidenceCompleteness =
      clamp01(
        context
          .evidence
          ?.completeness ||
        0
      );

    const supportStrength =
      Math.min(
        1,
        validSupporting.length /
          3
      );

    const contradictionPenalty =
      Math.min(
        0.6,
        validAgainst.length *
          0.15
      );

    const defensibleConfidence =
      clamp01(
        supportStrength *
          0.45 +
        evidenceCompleteness *
          0.35 +
        evidenceSupportRatio *
          0.2 -
        contradictionPenalty
      );

    if (
      declaredConfidence >
      defensibleConfidence +
        0.2
    ) {
      issues.push({
        code:
          "CONFIDENCE_INFLATED",

        severity:
          CRITIC_SEVERITY
            .WARNING,

        description:
          `Declared confidence ${declaredConfidence} exceeds evidence-supported confidence ${Number(defensibleConfidence.toFixed(4))}.`,

        evidenceIds:
          validSupporting,
      });
    }

    let verdict =
      VERIFICATION_STATUS
        .INCONCLUSIVE;

    if (
      issues.some(
        (
          issue
        ) =>
          issue.severity ===
          CRITIC_SEVERITY
            .CRITICAL
      )
    ) {
      verdict =
        VERIFICATION_STATUS
          .REJECTED;
    } else if (
      issues.some(
        (
          issue
        ) =>
          issue.severity ===
          CRITIC_SEVERITY
            .WARNING
      )
    ) {
      verdict =
        VERIFICATION_STATUS
          .DOWNGRADED;
    } else if (
      validSupporting.length >
        0 &&
      defensibleConfidence >=
        this
          .minimumVerificationConfidence
    ) {
      verdict =
        VERIFICATION_STATUS
          .VERIFIED;
    }

    return {
      hypothesisId:
        hypothesis.id ||
        null,

      rootCause:
        hypothesis.rootCause ||
        hypothesis.title ||
        null,

      declaredConfidence,

      defensibleConfidence:
        Number(
          defensibleConfidence
            .toFixed(
              4
            )
        ),

      validSupportingEvidence:
        validSupporting,

      invalidSupportingEvidence:
        invalidSupporting,

      validContradictingEvidence:
        validAgainst,

      invalidContradictingEvidence:
        invalidAgainst,

      issues,

      verdict,
    };
  }

  // ==========================================================================
  // MISSING EVIDENCE
  // ==========================================================================

  detectMissingEvidence(
    context
  ) {
    const missing =
      normalizeArray(
        context
          .evidence
          ?.missingEvidence
      );

    if (
      missing.length ===
      0
    ) {
      return [];
    }

    return [
      {
        code:
          "MISSING_DIAGNOSTIC_EVIDENCE",

        severity:
          missing.length >=
          3
            ? CRITIC_SEVERITY
                .WARNING
            : CRITIC_SEVERITY
                .INFO,

        description:
          `${missing.length} expected evidence source(s) are unavailable.`,

        details:
          missing,
      },
    ];
  }

  // ==========================================================================
  // EVIDENCE CONFLICTS
  // ==========================================================================

  detectEvidenceConflicts(
    context
  ) {
    const conflicts =
      normalizeArray(
        context
          .evidence
          ?.conflicts
      );

    if (
      conflicts.length ===
      0
    ) {
      return [];
    }

    return [
      {
        code:
          "EVIDENCE_CONFLICT",

        severity:
          CRITIC_SEVERITY
            .WARNING,

        description:
          `${conflicts.length} evidence conflict(s) were detected.`,

        details:
          conflicts,
      },
    ];
  }

  // ==========================================================================
  // CONFIDENCE CHECKS
  // ==========================================================================

  detectConfidenceProblems(
    context,
    reviews
  ) {
    const issues =
      [];

    const diagnosisConfidence =
      clamp01OrNull(
        context
          .rootCauseAnalysis
          ?.diagnosisConfidence
      );

    if (
      diagnosisConfidence ===
      null
    ) {
      return issues;
    }

    if (
      reviews.length ===
      0 &&
      diagnosisConfidence >
      0.5
    ) {
      issues.push({
        code:
          "CONFIDENCE_WITHOUT_HYPOTHESES",

        severity:
          CRITIC_SEVERITY
            .CRITICAL,

        description:
          "Diagnosis confidence is non-trivial despite there being no root-cause hypotheses.",
      });

      return issues;
    }

    const best =
      reviews[0];

    if (
      best &&
      diagnosisConfidence >
      best.defensibleConfidence +
        0.2
    ) {
      issues.push({
        code:
          "GLOBAL_DIAGNOSIS_CONFIDENCE_INFLATED",

        severity:
          CRITIC_SEVERITY
            .WARNING,

        description:
          `Diagnosis confidence ${diagnosisConfidence} exceeds the critic's defensible confidence ${best.defensibleConfidence}.`,
      });
    }

    return issues;
  }

  // ==========================================================================
  // COMPETING HYPOTHESES
  // ==========================================================================

  detectCompetingHypothesisProblems(
    reviews
  ) {
    if (
      reviews.length <
      2
    ) {
      return [];
    }

    const first =
      reviews[0];

    const second =
      reviews[1];

    const difference =
      Math.abs(
        first
          .defensibleConfidence -
        second
          .defensibleConfidence
      );

    if (
      difference <
      0.1 &&
      second
        .defensibleConfidence >
      0.4
    ) {
      return [
        {
          code:
            "COMPETING_HYPOTHESES_TOO_CLOSE",

          severity:
            CRITIC_SEVERITY
              .WARNING,

          description:
            "The leading hypotheses have similar evidence-supported confidence. Selecting a single root cause may be premature.",

          details: {
            firstHypothesisId:
              first
                .hypothesisId,

            secondHypothesisId:
              second
                .hypothesisId,

            confidenceDifference:
              Number(
                difference
                  .toFixed(
                    4
                  )
              ),
          },
        },
      ];
    }

    return [];
  }

  // ==========================================================================
  // RISK != DIAGNOSIS CONFIDENCE
  // ==========================================================================

  detectRiskDiagnosisConfusion(
    context
  ) {
    const risk =
      context
        .riskAnalysis;

    const diagnosis =
      context
        .rootCauseAnalysis;

    if (
      !risk ||
      !diagnosis
    ) {
      return [];
    }

    const riskScore =
      clamp01OrNull(
        risk.riskScore
      );

    const diagnosisConfidence =
      clamp01OrNull(
        diagnosis
          .diagnosisConfidence
      );

    if (
      riskScore ===
        null ||
      diagnosisConfidence ===
        null
    ) {
      return [];
    }

    /*
     * We do NOT treat a difference as an error.
     *
     * In fact, a large difference is perfectly valid.
     *
     * This check only surfaces a warning when the structures appear to
     * have been mechanically copied.
     */

    if (
      riskScore >
        0 &&
      diagnosisConfidence >
        0 &&
      riskScore ===
        diagnosisConfidence
    ) {
      return [
        {
          code:
            "POSSIBLE_RISK_CONFIDENCE_COUPLING",

          severity:
            CRITIC_SEVERITY
              .INFO,

          description:
            "Risk score and diagnosis confidence are identical. Verify that operational risk was not incorrectly reused as diagnostic confidence.",
        },
      ];
    }

    return [];
  }

  // ==========================================================================
  // AI ISSUES
  // ==========================================================================

  normalizeAiIssues(
    output
  ) {
    const issues =
      [];

    const mappings = [
      {
        key:
          "unsupportedClaims",

        code:
          "AI_UNSUPPORTED_CLAIM",

        severity:
          CRITIC_SEVERITY
            .WARNING,
      },

      {
        key:
          "contradictions",

        code:
          "AI_CONTRADICTION",

        severity:
          CRITIC_SEVERITY
            .WARNING,
      },

      {
        key:
          "confidenceConcerns",

        code:
          "AI_CONFIDENCE_CONCERN",

        severity:
          CRITIC_SEVERITY
            .WARNING,
      },
    ];

    for (
      const mapping
      of mappings
    ) {
      for (
        const item
        of normalizeArray(
          output[
            mapping.key
          ]
        )
      ) {
        const description =
          typeof item ===
            "string"
            ? item
            : (
                item
                  ?.description ||
                item
                  ?.summary ||
                JSON.stringify(
                  item
                )
              );

        if (
          !description
        ) {
          continue;
        }

        issues.push({
          code:
            mapping.code,

          severity:
            mapping
              .severity,

          description,
        });
      }
    }

    return issues;
  }

  // ==========================================================================
  // FINAL VERIFICATION STATUS
  // ==========================================================================

  determineVerificationStatus(
    context,
    reviews,
    issues
  ) {
    if (
      reviews.length ===
      0
    ) {
      return VERIFICATION_STATUS
        .INCONCLUSIVE;
    }

    const primary =
      reviews[0];

    if (
      primary.verdict ===
      VERIFICATION_STATUS
        .REJECTED
    ) {
      return VERIFICATION_STATUS
        .REJECTED;
    }

    const criticalGlobalIssue =
      issues.some(
        (
          issue
        ) =>
          issue.severity ===
          CRITIC_SEVERITY
            .CRITICAL
      );

    if (
      criticalGlobalIssue
    ) {
      return VERIFICATION_STATUS
        .REJECTED;
    }

    const completeness =
      clamp01(
        context
          .evidence
          ?.completeness ||
        0
      );

    if (
      completeness <
      0.2
    ) {
      return VERIFICATION_STATUS
        .INCONCLUSIVE;
    }

    const warnings =
      issues.filter(
        (
          issue
        ) =>
          issue.severity ===
          CRITIC_SEVERITY
            .WARNING
      );

    if (
      primary.verdict ===
        VERIFICATION_STATUS
          .DOWNGRADED ||
      warnings.length >
        0
    ) {
      return VERIFICATION_STATUS
        .DOWNGRADED;
    }

    if (
      primary.verdict ===
        VERIFICATION_STATUS
          .VERIFIED
    ) {
      return VERIFICATION_STATUS
        .VERIFIED;
    }

    return VERIFICATION_STATUS
      .INCONCLUSIVE;
  }

  // ==========================================================================
  // VERIFICATION CONFIDENCE
  // ==========================================================================

  calculateVerificationConfidence(
    context,
    reviews,
    issues
  ) {
    if (
      reviews.length ===
      0
    ) {
      return 0;
    }

    const primary =
      reviews[0];

    const completeness =
      clamp01(
        context
          .evidence
          ?.completeness ||
        0
      );

    const criticalIssues =
      issues.filter(
        (
          issue
        ) =>
          issue.severity ===
          CRITIC_SEVERITY
            .CRITICAL
      )
        .length;

    const warnings =
      issues.filter(
        (
          issue
        ) =>
          issue.severity ===
          CRITIC_SEVERITY
            .WARNING
      )
        .length;

    let confidence =
      primary
        .defensibleConfidence *
        0.6 +
      completeness *
        0.4;

    confidence -=
      Math.min(
        0.6,
        criticalIssues *
          0.25
      );

    confidence -=
      Math.min(
        0.3,
        warnings *
          0.08
      );

    return Number(
      clamp01(
        confidence
      )
        .toFixed(
          4
        )
    );
  }

  // ==========================================================================
  // FINDINGS
  // ==========================================================================

  buildFindings(
    context,
    status,
    confidence,
    reviews,
    issues
  ) {
    const findings = [
      createAgentFinding({
        id:
          `finding:verification:${context.incidentId}`,

        agent:
          AGENT_NAME,

        findingType:
          "diagnosis_verification",

        title:
          `Diagnosis verification: ${status}`,

        summary:
          `Verification confidence=${confidence}; reviewed ${reviews.length} hypothesis/hypotheses; identified ${issues.length} critic issue(s).`,

        confidence,

        evidenceIds:
          this.collectEvidenceIds(
            context
          ),

        metadata: {
          verificationStatus:
            status,

          reviewedHypotheses:
            reviews.length,

          issueCount:
            issues.length,
        },
      }),
    ];

    const invalidEvidence =
      reviews
        .flatMap(
          (
            review
          ) =>
            review
              .invalidSupportingEvidence ||
            []
        );

    if (
      invalidEvidence.length >
      0
    ) {
      findings.push(
        createAgentFinding({
          id:
            `finding:invalid-evidence:${context.incidentId}`,

          agent:
            AGENT_NAME,

          findingType:
            "invalid_evidence_reference",

          title:
            "Diagnosis contains invalid evidence references",

          summary:
            `${invalidEvidence.length} supporting evidence reference(s) could not be found in the canonical evidence package.`,

          confidence:
            1,

          evidenceIds:
            [],
        })
      );
    }

    const primary =
      reviews[0];

    if (
      primary &&
      primary.verdict ===
        VERIFICATION_STATUS
          .REJECTED
    ) {
      findings.push(
        createAgentFinding({
          id:
            `finding:rejected-hypothesis:${context.incidentId}`,

          agent:
            AGENT_NAME,

          findingType:
            "rejected_root_cause",

          title:
            "Primary root-cause hypothesis failed verification",

          summary:
            primary
              .issues
              .map(
                (
                  issue
                ) =>
                  issue.description
              )
              .join(
                " "
              ),

          confidence:
            1,

          evidenceIds:
            primary
              .validSupportingEvidence,
        })
      );
    }

    return findings;
  }

  // ==========================================================================
  // EVIDENCE
  // ==========================================================================

  collectEvidenceIds(
    context
  ) {
    return uniqueStrings(
      normalizeArray(
        context
          .evidence
          ?.items
      )
        .map(
          (
            evidence
          ) =>
            evidence.id
        )
        .filter(
          Boolean
        )
    );
  }

  // ==========================================================================
  // OUTPUT VALIDATION
  // ==========================================================================

  validateOutput(
    record
  ) {
    const base =
      super
        .validateOutput(
          record
        );

    if (
      !base.valid
    ) {
      return base;
    }

    if (
      record
        .result
        ?.executionAuthorized ===
        true
    ) {
      return {
        valid:
          false,

        errors: [
          "VerificationCriticAgent cannot authorize execution",
        ],
      };
    }

    if (
      !Object.values(
        VERIFICATION_STATUS
      )
        .includes(
          record
            .result
            ?.verificationStatus
        )
    ) {
      return {
        valid:
          false,

        errors: [
          "Invalid verificationStatus",
        ],
      };
    }

    if (
      !Array.isArray(
        record
          .result
          ?.hypothesisReviews
      )
    ) {
      return {
        valid:
          false,

        errors: [
          "VerificationCriticAgent must return hypothesisReviews",
        ],
      };
    }

    return {
      valid:
        true,

      errors:
        [],
    };
  }

  // ==========================================================================
  // CAPABILITIES
  // ==========================================================================

  getCapabilities() {
    return {
      ...super
        .getCapabilities(),

      reads: [
        "context.incident",
        "context.symptoms",
        "context.evidence",
        "context.hypotheses",
        "context.rootCauseAnalysis",
        "context.riskAnalysis",
      ],

      writes: [
        "context.verification",
        "context.findings",
      ],

      requiresLLM:
        true,

      infrastructureMutation:
        false,

      executionAuthorization:
        false,
    };
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function normalizeArray(
  value
) {
  return Array.isArray(
    value
  )
    ? value
    : [];
}

function uniqueStrings(
  values
) {
  return Array.from(
    new Set(
      normalizeArray(
        values
      )
        .filter(
          Boolean
        )
        .map(
          String
        )
    )
  );
}

function clamp01(
  value
) {
  const number =
    Number(
      value
    );

  if (
    !Number.isFinite(
      number
    )
  ) {
    return 0;
  }

  return Math.max(
    0,
    Math.min(
      1,
      number
    )
  );
}

function clamp01OrNull(
  value
) {
  if (
    value ===
      null ||
    value ===
      undefined ||
    value ===
      ""
  ) {
    return null;
  }

  const number =
    Number(
      value
    );

  if (
    !Number.isFinite(
      number
    )
  ) {
    return null;
  }

  return clamp01(
    number
  );
}

function mergeUnique(
  first,
  second
) {
  const result =
    [];

  const seen =
    new Set();

  for (
    const item
    of [
      ...normalizeArray(
        first
      ),

      ...normalizeArray(
        second
      ),
    ]
  ) {
    let key;

    try {
      key =
        typeof item ===
        "string"
          ? item
          : JSON.stringify(
              item
            );
    } catch {
      continue;
    }

    if (
      seen.has(
        key
      )
    ) {
      continue;
    }

    seen.add(
      key
    );

    result.push(
      item
    );
  }

  return result;
}

function deduplicateIssues(
  issues
) {
  const map =
    new Map();

  for (
    const issue
    of issues
  ) {
    if (
      !issue
    ) {
      continue;
    }

    const key =
      [
        issue.code,
        issue.description,
      ]
        .filter(
          Boolean
        )
        .join(
          "::"
        );

    if (
      !key
    ) {
      continue;
    }

    map.set(
      key,
      issue
    );
  }

  return [
    ...map.values(),
  ];
}

// ============================================================================
// PROMPT
// ============================================================================

const VERIFICATION_SYSTEM_PROMPT =
  `
You are the AIRA Verification and Critic Agent.

You are an adversarial reviewer.

Your job is NOT to agree with the other agents.

Your job is to determine whether the proposed diagnosis is actually
supported by the available evidence.

Review the diagnosis as if a wrong diagnosis could cause a production
outage.

Check:

1. Does every supporting evidence ID actually exist?
2. Does the cited evidence logically support the claimed root cause?
3. Is correlation being mistaken for causation?
4. Are recent deployments being blamed only because they are recent?
5. Are historical incidents being treated as proof?
6. Are downstream failures being mistaken for root causes?
7. Is contradictory evidence being ignored?
8. Are alternative explanations still plausible?
9. Is diagnosis confidence higher than the evidence supports?
10. Is evidence completeness too low for the claimed certainty?
11. Are assumptions presented as facts?
12. Are unknowns being hidden?
13. Are risk severity and diagnosis confidence being confused?
14. Does the causal chain actually explain the observed symptoms?

Rules:

- Never invent evidence.
- Never invent contradictions.
- Never fabricate an alternative explanation as fact.
- Challenge unsupported conclusions.
- Prefer INCONCLUSIVE over false certainty.
- A critical incident does not imply a known root cause.
- Historical success does not prove the same remediation will work.
- Never select remediation.
- Never select a playbook.
- Never execute infrastructure changes.
- Never authorize execution.
- Return ONLY valid JSON.

Return:
{
  "criticObservations": [],
  "unsupportedClaims": [],
  "contradictions": [],
  "missingEvidence": [],
  "alternativeExplanations": [],
  "confidenceConcerns": [],
  "unknowns": [],
  "verificationConfidence": 0.0
}
`.trim();

// ============================================================================
// EXPORT
// ============================================================================

module.exports = {
  VerificationCriticAgent,
  VERIFICATION_STATUS,
  CRITIC_SEVERITY,
};