"use strict";

/**
 * AIRA Action Risk Analysis Service
 *
 * Phase 7.5
 *
 * Deterministically estimates the operational risk of applying
 * a recovery candidate.
 *
 * Risk dimensions:
 *
 * - blast radius
 * - production criticality
 * - mutation scope
 * - destructive potential
 * - data risk
 * - security impact
 * - service criticality
 * - rollback uncertainty
 * - historical failure rate
 *
 * IMPORTANT:
 *
 * This analyzes risk only.
 *
 * It does NOT:
 *
 * - approve execution
 * - execute playbooks
 * - bypass policy
 * - select the final recovery
 */

const {
  createRecoveryCandidate,
  CANDIDATE_STATUS,
  ACTION_RISK,
} =
  require(
    "./recoveryDecisionContracts"
  );

const RISK_BLOCK_THRESHOLD =
  0.85;

class ActionRiskAnalysisService {
  constructor(
    options = {}
  ) {
    this.blockThreshold =
      clamp01(
        options.blockThreshold ??
        RISK_BLOCK_THRESHOLD
      );
  }

  // ==========================================================================
  // MAIN ENTRY
  // ==========================================================================

  async analyzeCandidates(
    input = {},
    dependencies = {}
  ) {
    this.assertInput(
      input
    );

    const candidates =
      input.candidates;

    const analyzed =
      [];

    for (
      const candidate
      of candidates
    ) {
      analyzed.push(
        await this.analyzeCandidate({
          candidate,
          context:
            input.context ||
            {},
          diagnosis:
            input.diagnosis ||
            {},
          dependencies,
        })
      );
    }

    const blocked =
      analyzed.filter(
        (
          candidate
        ) =>
          candidate.status ===
          CANDIDATE_STATUS
            .RISK_BLOCKED
      );

    const allowed =
      analyzed.filter(
        (
          candidate
        ) =>
          candidate.status !==
          CANDIDATE_STATUS
            .RISK_BLOCKED
      );

    return {
      candidates:
        analyzed,

      allowedCandidates:
        allowed,

      blockedCandidates:
        blocked,

      allowedCount:
        allowed.length,

      blockedCount:
        blocked.length,

      analysisVersion:
        "phase7.5-v1",

      executionAuthorized:
        false,
    };
  }

  // ==========================================================================
  // SINGLE CANDIDATE
  // ==========================================================================

  async analyzeCandidate({
    candidate,
    context,
    diagnosis,
    dependencies,
  }) {
    const reasons =
      [];

    const dimensions =
      [];

    this.pushRiskDimension(
      dimensions,
      "blastRadius",
      this.calculateBlastRadiusRisk(
        candidate,
        context
      ),
      0.2
    );

    this.pushRiskDimension(
      dimensions,
      "criticality",
      this.calculateCriticalityRisk(
        context,
        diagnosis
      ),
      0.15
    );

    this.pushRiskDimension(
      dimensions,
      "mutationScope",
      this.calculateMutationScopeRisk(
        candidate
      ),
      0.15
    );

    this.pushRiskDimension(
      dimensions,
      "destructivePotential",
      this.calculateDestructiveRisk(
        candidate
      ),
      0.15
    );

    this.pushRiskDimension(
      dimensions,
      "dataRisk",
      this.calculateDataRisk(
        candidate
      ),
      0.1
    );

    this.pushRiskDimension(
      dimensions,
      "securityRisk",
      this.calculateSecurityRisk(
        candidate
      ),
      0.08
    );

    this.pushRiskDimension(
      dimensions,
      "rollbackUncertainty",
      this.calculateRollbackRisk(
        candidate
      ),
      0.1
    );

    this.pushRiskDimension(
      dimensions,
      "historicalFailureRisk",
      this.calculateHistoricalFailureRisk(
        candidate
      ),
      0.07
    );

    const totalWeight =
      dimensions.reduce(
        (
          total,
          dimension
        ) =>
          total +
          dimension.weight,
        0
      );

    const weightedTotal =
      dimensions.reduce(
        (
          total,
          dimension
        ) =>
          total +
          dimension.value *
            dimension.weight,
        0
      );

    let riskScore =
      totalWeight >
        0
        ? weightedTotal /
          totalWeight
        : 0.5;

    // ------------------------------------------------------------------------
    // OPTIONAL EXTERNAL RISK SIGNALS
    // ------------------------------------------------------------------------

    if (
      typeof dependencies
        .riskSignalProvider ===
      "function"
    ) {
      const external =
        await dependencies
          .riskSignalProvider({
            candidate,
            context,
            diagnosis,
          });

      const externalRisk =
        clamp01OrNull(
          external?.riskScore
        );

      if (
        externalRisk !==
        null
      ) {
        /*
         * External signal can influence but never fully determine risk.
         */
        riskScore =
          riskScore *
            0.8 +
          externalRisk *
            0.2;

        reasons.push(
          "External operational risk signal incorporated."
        );
      }
    }

    riskScore =
      roundScore(
        clamp01(
          riskScore
        )
      );

    const riskLevel =
      riskToLevel(
        riskScore
      );

    for (
      const dimension
      of dimensions
    ) {
      if (
        dimension.value >=
        0.7
      ) {
        reasons.push(
          `${dimension.name} contributes elevated action risk.`
        );
      }
    }

    const blocked =
      riskScore >=
      this.blockThreshold;

    if (
      blocked
    ) {
      reasons.push(
        `Action risk score ${riskScore} exceeds block threshold ${this.blockThreshold}.`
      );
    }

    return createRecoveryCandidate({
      ...candidate,

      status:
        blocked
          ? CANDIDATE_STATUS
              .RISK_BLOCKED
          : candidate.status,

      actionRisk: {
        level:
          riskLevel,

        score:
          riskScore,

        reasons:
          uniqueStrings(
            reasons
          ),

        dimensions,
      },

      metadata: {
        ...(
          candidate.metadata ||
          {}
        ),

        actionRiskVersion:
          "phase7.5-v1",
      },

      executionAuthorized:
        false,
    });
  }

  // ==========================================================================
  // BLAST RADIUS
  // ==========================================================================

  calculateBlastRadiusRisk(
    candidate,
    context
  ) {
    const explicit =
      clamp01OrNull(
        candidate
          ?.metadata
          ?.blastRadiusScore
      );

    if (
      explicit !==
      null
    ) {
      return explicit;
    }

    const affectedServices =
      normalizeArray(
        context
          .topologyAnalysis
          ?.affectedServices
      )
        .length;

    const affectedResources =
      normalizeArray(
        context
          .topologyAnalysis
          ?.affectedResources
      )
        .length;

    const total =
      affectedServices +
      affectedResources;

    if (
      total <=
      1
    ) {
      return 0.2;
    }

    if (
      total <=
      3
    ) {
      return 0.4;
    }

    if (
      total <=
      7
    ) {
      return 0.65;
    }

    return 0.9;
  }

  // ==========================================================================
  // CRITICALITY
  // ==========================================================================

  calculateCriticalityRisk(
    context,
    diagnosis
  ) {
    const criticality =
      normalizeText(
        context
          .service
          ?.criticality ||
        diagnosis
          ?.risk
          ?.criticality
      );

    switch (
      criticality
    ) {
      case "critical":
        return 0.9;

      case "high":
        return 0.75;

      case "medium":
        return 0.5;

      case "low":
        return 0.25;

      default:
        return 0.5;
    }
  }

  // ==========================================================================
  // MUTATION SCOPE
  // ==========================================================================

  calculateMutationScopeRisk(
    candidate
  ) {
    const scope =
      normalizeText(
        candidate
          ?.metadata
          ?.mutationScope ||
        candidate
          ?.metadata
          ?.scope
      );

    switch (
      scope
    ) {
      case "single_container":
      case "single_pod":
      case "single_process":
        return 0.2;

      case "deployment":
      case "service":
        return 0.4;

      case "namespace":
      case "cluster_service":
        return 0.65;

      case "cluster":
      case "database_cluster":
        return 0.85;

      case "multi_cluster":
      case "global":
        return 1;

      default:
        return 0.5;
    }
  }

  // ==========================================================================
  // DESTRUCTIVE POTENTIAL
  // ==========================================================================

  calculateDestructiveRisk(
    candidate
  ) {
    const destructive =
      candidate
        ?.metadata
        ?.destructive ===
      true;

    if (
      destructive
    ) {
      return 1;
    }

    const action =
      normalizeText(
        candidate
          ?.metadata
          ?.actionType ||
        candidate.category
      );

    if (
      !action
    ) {
      return 0.4;
    }

    if (
      includesAny(
        action,
        [
          "delete",
          "drop",
          "destroy",
          "terminate",
          "wipe",
          "purge",
          "recreate",
        ]
      )
    ) {
      return 0.95;
    }

    if (
      includesAny(
        action,
        [
          "failover",
          "rollback",
          "drain",
          "scale",
          "restart",
        ]
      )
    ) {
      return 0.45;
    }

    if (
      includesAny(
        action,
        [
          "notify",
          "inspect",
          "collect",
          "verify",
        ]
      )
    ) {
      return 0.1;
    }

    return 0.4;
  }

  // ==========================================================================
  // DATA RISK
  // ==========================================================================

  calculateDataRisk(
    candidate
  ) {
    if (
      candidate
        ?.metadata
        ?.dataMutation ===
      true
    ) {
      return 0.9;
    }

    const category =
      normalizeText(
        candidate.category
      );

    if (
      includesAny(
        category,
        [
          "database",
          "storage",
          "replication",
          "filesystem",
        ]
      )
    ) {
      return 0.65;
    }

    return 0.2;
  }

  // ==========================================================================
  // SECURITY RISK
  // ==========================================================================

  calculateSecurityRisk(
    candidate
  ) {
    if (
      candidate
        ?.metadata
        ?.securitySensitive ===
      true
    ) {
      return 0.9;
    }

    const category =
      normalizeText(
        candidate.category
      );

    if (
      includesAny(
        category,
        [
          "credential",
          "certificate",
          "security",
          "iam",
          "rbac",
          "secret",
        ]
      )
    ) {
      return 0.75;
    }

    return 0.15;
  }

  // ==========================================================================
  // ROLLBACK UNCERTAINTY
  // ==========================================================================

  calculateRollbackRisk(
    candidate
  ) {
    const rollback =
      candidate
        ?.rollback ||
      {};

    if (
      rollback.available ===
      true
    ) {
      return 0.2;
    }

    if (
      rollback.available ===
      false &&
      rollback.reversibility ===
      "NONE"
    ) {
      return 1;
    }

    if (
      rollback.reversibility ===
      "PARTIAL"
    ) {
      return 0.6;
    }

    return 0.5;
  }

  // ==========================================================================
  // HISTORICAL FAILURE RISK
  // ==========================================================================

  calculateHistoricalFailureRisk(
    candidate
  ) {
    const successes =
      Number(
        candidate
          ?.historicalEffectiveness
          ?.successfulExecutions ||
        0
      );

    const failures =
      Number(
        candidate
          ?.historicalEffectiveness
          ?.failedExecutions ||
        0
      );

    const total =
      successes +
      failures;

    if (
      total <=
      0
    ) {
      return 0.5;
    }

    /*
     * Smoothed failure probability.
     */

    return clamp01(
      (
        failures +
        1
      ) /
      (
        total +
        2
      )
    );
  }

  // ==========================================================================
  // DIMENSION
  // ==========================================================================

  pushRiskDimension(
    target,
    name,
    value,
    weight
  ) {
    if (
      value ===
        null ||
      value ===
        undefined
    ) {
      return;
    }

    target.push({
      name,

      value:
        clamp01(
          value
        ),

      weight,
    });
  }

  // ==========================================================================
  // INPUT
  // ==========================================================================

  assertInput(
    input
  ) {
    if (
      !input ||
      typeof input !==
        "object"
    ) {
      throw Object.assign(
        new Error(
          "Action risk input is required"
        ),
        {
          code:
            "ACTION_RISK_INPUT_REQUIRED",
        }
      );
    }

    if (
      !Array.isArray(
        input.candidates
      )
    ) {
      throw Object.assign(
        new Error(
          "Action risk analysis requires candidates"
        ),
        {
          code:
            "ACTION_RISK_CANDIDATES_REQUIRED",
        }
      );
    }

    if (
      input.executionAuthorized ===
      true
    ) {
      throw Object.assign(
        new Error(
          "Action risk analysis cannot receive execution authorization"
        ),
        {
          code:
            "ACTION_RISK_UNSAFE_INPUT",
        }
      );
    }
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

function normalizeText(
  value
) {
  if (
    value ===
      null ||
    value ===
      undefined
  ) {
    return null;
  }

  const result =
    String(
      value
    )
      .trim()
      .toLowerCase();

  return result ||
    null;
}

function includesAny(
  value,
  needles
) {
  if (
    !value
  ) {
    return false;
  }

  return needles.some(
    (
      needle
    ) =>
      value.includes(
        needle
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

function roundScore(
  value
) {
  return Math.round(
    Number(
      value
    ) *
    10000
  ) /
    10000;
}

function uniqueStrings(
  values
) {
  return [
    ...new Set(
      normalizeArray(
        values
      )
        .filter(
          Boolean
        )
        .map(
          String
        )
    ),
  ];
}

function riskToLevel(
  score
) {
  if (
    score >=
    0.85
  ) {
    return ACTION_RISK
      .CRITICAL;
  }

  if (
    score >=
    0.65
  ) {
    return ACTION_RISK
      .HIGH;
  }

  if (
    score >=
    0.35
  ) {
    return ACTION_RISK
      .MEDIUM;
  }

  return ACTION_RISK
    .LOW;
}

// ============================================================================
// EXPORT
// ============================================================================

module.exports =
  new ActionRiskAnalysisService();

module.exports
  .ActionRiskAnalysisService =
  ActionRiskAnalysisService;

module.exports
  .RISK_BLOCK_THRESHOLD =
  RISK_BLOCK_THRESHOLD;