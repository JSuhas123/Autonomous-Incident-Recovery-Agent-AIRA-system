"use strict";

/**
 * AIRA Diagnosis Safety Gate
 *
 * Phase 6.17
 *
 * Final safety boundary between diagnosis and any downstream
 * recovery/playbook evaluation layer.
 *
 * This service answers:
 *
 * "Is this diagnosis safe enough to be considered by the recovery
 * decision layer?"
 *
 * It does NOT execute remediation.
 */

const GATE_DECISION =
  Object.freeze({
    ALLOW_EVALUATION:
      "ALLOW_EVALUATION",

    HOLD_FOR_MORE_EVIDENCE:
      "HOLD_FOR_MORE_EVIDENCE",

    MANUAL_REVIEW:
      "MANUAL_REVIEW",

    REJECT_DIAGNOSIS:
      "REJECT_DIAGNOSIS",

    MONITOR_ONLY:
      "MONITOR_ONLY",
  });

const GATE_REASON =
  Object.freeze({
    TRUSTED_DIAGNOSIS:
      "TRUSTED_DIAGNOSIS",

    PROVISIONAL_DIAGNOSIS:
      "PROVISIONAL_DIAGNOSIS",

    INSUFFICIENT_EVIDENCE:
      "INSUFFICIENT_EVIDENCE",

    FALSE_POSITIVE_SUSPECTED:
      "FALSE_POSITIVE_SUSPECTED",

    CRITIC_REJECTED:
      "CRITIC_REJECTED",

    COMPETING_HYPOTHESES:
      "COMPETING_HYPOTHESES",

    LOW_CONFIDENCE:
      "LOW_CONFIDENCE",

    AGENT_FAILURES:
      "AGENT_FAILURES",

    PROVIDER_DEGRADED:
      "PROVIDER_DEGRADED",

    CONTRADICTORY_EVIDENCE:
      "CONTRADICTORY_EVIDENCE",

    HEALTHY_STATE_RECOVERY:
      "HEALTHY_STATE_RECOVERY",

    NO_ROOT_CAUSE:
      "NO_ROOT_CAUSE",
  });

class DiagnosisSafetyGate {
  evaluate(
    input = {}
  ) {
    const diagnosis =
      input.diagnosis ||
      {};

    const confidence =
      input.confidence ||
      {};

    const verification =
      input.verification ||
      {};

    const agentTrace =
      Array.isArray(
        input.agentTrace
      )
        ? input.agentTrace
        : [];

    const reasons =
      [];

    const warnings =
      [];

    // ------------------------------------------------------------------------
    // 1. CRITIC REJECTION
    // ------------------------------------------------------------------------

    if (
      verification
        .verificationStatus ===
      "REJECTED"
    ) {
      reasons.push(
        GATE_REASON
          .CRITIC_REJECTED
      );

      return this.result(
        GATE_DECISION
          .REJECT_DIAGNOSIS,
        reasons,
        warnings
      );
    }

    // ------------------------------------------------------------------------
    // 2. FALSE POSITIVE
    // ------------------------------------------------------------------------

    if (
      diagnosis
        .falsePositiveSuspected ===
      true
    ) {
      reasons.push(
        GATE_REASON
          .FALSE_POSITIVE_SUSPECTED
      );

      return this.result(
        GATE_DECISION
          .MANUAL_REVIEW,
        reasons,
        warnings
      );
    }

    // ------------------------------------------------------------------------
    // 3. EXPLICIT INSUFFICIENT EVIDENCE
    // ------------------------------------------------------------------------

    if (
      diagnosis.outcome ===
        "INSUFFICIENT_EVIDENCE" ||
      confidence.decision ===
        "COLLECT_MORE_EVIDENCE"
    ) {
      reasons.push(
        GATE_REASON
          .INSUFFICIENT_EVIDENCE
      );

      return this.result(
        GATE_DECISION
          .HOLD_FOR_MORE_EVIDENCE,
        reasons,
        warnings
      );
    }

    // ------------------------------------------------------------------------
    // 4. CONTRADICTORY EVIDENCE
    // ------------------------------------------------------------------------

    const contradictions =
      Array.isArray(
        diagnosis
          .contradictions
      )
        ? diagnosis
            .contradictions
        : [];

    if (
      diagnosis.outcome ===
        "CONTRADICTORY_EVIDENCE" ||
      contradictions.length >
        0 &&
      verification
        .verificationStatus ===
        "DOWNGRADED"
    ) {
      reasons.push(
        GATE_REASON
          .CONTRADICTORY_EVIDENCE
      );

      return this.result(
        GATE_DECISION
          .MANUAL_REVIEW,
        reasons,
        warnings
      );
    }

    // ------------------------------------------------------------------------
    // 5. ROOT CAUSE ABSENT
    // ------------------------------------------------------------------------

    const hypotheses =
      Array.isArray(
        diagnosis.hypotheses
      )
        ? diagnosis.hypotheses
        : [];

    const primary =
      diagnosis
        .primaryHypothesis ||
      null;

    if (
      hypotheses.length ===
        0 ||
      !primary
    ) {
      reasons.push(
        GATE_REASON
          .NO_ROOT_CAUSE
      );

      return this.result(
        GATE_DECISION
          .HOLD_FOR_MORE_EVIDENCE,
        reasons,
        warnings
      );
    }

    // ------------------------------------------------------------------------
    // 6. COMPETING HYPOTHESES
    // ------------------------------------------------------------------------

    if (
      confidence
        .diagnostics
        ?.competingHypotheses ===
      true
    ) {
      reasons.push(
        GATE_REASON
          .COMPETING_HYPOTHESES
      );

      return this.result(
        GATE_DECISION
          .MANUAL_REVIEW,
        reasons,
        warnings
      );
    }

    // ------------------------------------------------------------------------
    // 7. LOW CONFIDENCE
    // ------------------------------------------------------------------------

    const overallConfidence =
      Number(
        confidence
          .confidence ||
        diagnosis
          .diagnosisConfidence ||
        0
      );

    if (
      overallConfidence <
      0.5
    ) {
      reasons.push(
        GATE_REASON
          .LOW_CONFIDENCE
      );

      return this.result(
        GATE_DECISION
          .HOLD_FOR_MORE_EVIDENCE,
        reasons,
        warnings
      );
    }

    // ------------------------------------------------------------------------
    // 8. AGENT FAILURES
    // ------------------------------------------------------------------------

    const failedAgents =
      agentTrace.filter(
        (
          record
        ) =>
          String(
            record.status ||
            ""
          )
            .toUpperCase() ===
          "FAILED"
      );

    if (
      failedAgents.length >
      0
    ) {
      reasons.push(
        GATE_REASON
          .AGENT_FAILURES
      );

      warnings.push(
        `${failedAgents.length} diagnosis agent(s) failed.`
      );

      return this.result(
        GATE_DECISION
          .MANUAL_REVIEW,
        reasons,
        warnings
      );
    }

    // ------------------------------------------------------------------------
    // 9. PROVIDER / FALLBACK DEGRADATION
    // ------------------------------------------------------------------------

    const fallbackCount =
      agentTrace.filter(
        (
          record
        ) =>
          record
            .fallbackUsed ===
          true
      )
        .length;

    if (
      fallbackCount >=
      3
    ) {
      reasons.push(
        GATE_REASON
          .PROVIDER_DEGRADED
      );

      warnings.push(
        `${fallbackCount} diagnosis agents used fallback reasoning.`
      );

      return this.result(
        GATE_DECISION
          .MANUAL_REVIEW,
        reasons,
        warnings
      );
    }

    // ------------------------------------------------------------------------
    // 10. HEALTHY / RECOVERY MISREAD
    // ------------------------------------------------------------------------

    if (
      this.looksRecovered(
        input
      )
    ) {
      reasons.push(
        GATE_REASON
          .HEALTHY_STATE_RECOVERY
      );

      return this.result(
        GATE_DECISION
          .MONITOR_ONLY,
        reasons,
        warnings
      );
    }

    // ------------------------------------------------------------------------
    // 11. TRUSTED
    // ------------------------------------------------------------------------

    if (
      confidence.decision ===
        "TRUSTED" &&
      verification
        .verificationStatus ===
        "VERIFIED"
    ) {
      reasons.push(
        GATE_REASON
          .TRUSTED_DIAGNOSIS
      );

      return this.result(
        GATE_DECISION
          .ALLOW_EVALUATION,
        reasons,
        warnings
      );
    }

    // ------------------------------------------------------------------------
    // 12. PROVISIONAL
    // ------------------------------------------------------------------------

    if (
      confidence.decision ===
        "PROVISIONAL" &&
      verification
        .verificationStatus !==
        "REJECTED"
    ) {
      reasons.push(
        GATE_REASON
          .PROVISIONAL_DIAGNOSIS
      );

      return this.result(
        GATE_DECISION
          .MANUAL_REVIEW,
        reasons,
        warnings
      );
    }

    return this.result(
      GATE_DECISION
        .HOLD_FOR_MORE_EVIDENCE,

      [
        GATE_REASON
          .LOW_CONFIDENCE,
      ],

      warnings
    );
  }

  // ==========================================================================
  // RECOVERY / HEALTHY STATE DETECTION
  // ==========================================================================

  looksRecovered(
    input
  ) {
    const incident =
      input.incident ||
      input.context
        ?.incident ||
      {};

    const symptoms =
      input.diagnosis
        ?.symptoms ||
      input.context
        ?.symptoms ||
      [];

    const signals =
      input.context
        ?.signals ||
      [];

    if (
      [
        "resolved",
        "closed",
      ].includes(
        String(
          incident.status ||
          ""
        )
          .toLowerCase()
      )
    ) {
      return true;
    }

    if (
      signals.length >
      0
    ) {
      const recent =
        [
          ...signals,
        ]
          .sort(
            (
              first,
              second
            ) =>
              new Date(
                second.observedAt ||
                second.createdAt ||
                0
              ) -
              new Date(
                first.observedAt ||
                first.createdAt ||
                0
              )
          )
          .slice(
            0,
            5
          );

      const healthyCount =
        recent.filter(
          (
            signal
          ) => {
            const severity =
              String(
                signal.severity ||
                ""
              )
                .toLowerCase();

            const eventType =
              String(
                signal.eventType ||
                ""
              )
                .toLowerCase();

            return (
              [
                "info",
                "unknown",
              ].includes(
                severity
              ) &&
              (
                eventType.includes(
                  "recover"
                ) ||
                eventType.includes(
                  "resolved"
                ) ||
                eventType.includes(
                  "healthy"
                )
              )
            );
          }
        )
          .length;

      if (
        healthyCount >=
        Math.ceil(
          recent.length /
          2
        )
      ) {
        return true;
      }
    }

    const activeSevereSymptoms =
      symptoms.filter(
        (
          symptom
        ) =>
          [
            "critical",
            "warning",
          ].includes(
            String(
              symptom.severity ||
              ""
            )
              .toLowerCase()
          )
      );

    return (
      symptoms.length >
        0 &&
      activeSevereSymptoms.length ===
        0 &&
      incident.status ===
        "recovering"
    );
  }

  // ==========================================================================
  // RESULT
  // ==========================================================================

  result(
    decision,
    reasons,
    warnings
  ) {
    return {
      decision,

      reasons:
        Array.from(
          new Set(
            reasons
          )
        ),

      warnings:
        Array.from(
          new Set(
            warnings
          )
        ),

      canEvaluatePlaybook:
        decision ===
        GATE_DECISION
          .ALLOW_EVALUATION,

      requiresHuman:
        decision ===
          GATE_DECISION
            .MANUAL_REVIEW ||
        decision ===
          GATE_DECISION
            .REJECT_DIAGNOSIS,

      shouldCollectMoreEvidence:
        decision ===
        GATE_DECISION
          .HOLD_FOR_MORE_EVIDENCE,

      executionAuthorized:
        false,
    };
  }
}

module.exports =
  new DiagnosisSafetyGate();

module.exports
  .DiagnosisSafetyGate =
  DiagnosisSafetyGate;

module.exports
  .GATE_DECISION =
  GATE_DECISION;

module.exports
  .GATE_REASON =
  GATE_REASON;