"use strict";

const mongoose =
  require(
    "mongoose"
  );

const {
  Signal,
} =
  require(
    "../../models/Signal"
  );

const {
  SignalCorrelation,
} =
  require(
    "../../models/SignalCorrelation"
  );

const {
  Incident,
  ACTIVE_INCIDENT_STATUSES,
} =
  require(
    "../../models/Incident"
  );

class IncidentDetectionService {
  constructor() {
    this.minimumCorrelationConfidence =
      Number(
        process.env
          .INCIDENT_MIN_CORRELATION_CONFIDENCE
      ) ||
      0.6;

    this.minimumSignalCount =
      Number(
        process.env
          .INCIDENT_MIN_SIGNAL_COUNT
      ) ||
      2;

    this.minimumProviderCount =
      Number(
        process.env
          .INCIDENT_MIN_PROVIDER_COUNT
      ) ||
      2;
  }

  // ==========================================================================
  // MAIN ENTRY
  // ==========================================================================

  async evaluateSignal(
    signal
  ) {
    if (
      !signal
    ) {
      throw Object.assign(
        new Error(
          "Signal is required"
        ),
        {
          code:
            "INCIDENT_SIGNAL_REQUIRED",
        }
      );
    }

    this.assertSignalContext(
      signal
    );

    /*
     * Recovery / healthy signals should not open incidents.
     * They are handled later by the recovery path.
     */
    if (
      this.isRecoverySignal(
        signal
      )
    ) {
      return {
        shouldOpenIncident:
          false,

        action:
          "recovery",

        reason:
          "Signal represents recovery or healthy state.",

        signal,
      };
    }

    /*
     * Signal already classified by Phase 4 as non-candidate.
     */
    if (
      !signal
        .incidentCandidate
    ) {
      return {
        shouldOpenIncident:
          false,

        action:
          "ignore",

        reason:
          "Signal did not qualify as an incident candidate.",

        signal,
      };
    }

    const correlationGroup =
      await this
        .resolveCorrelationGroup(
          signal
        );

    /*
     * Critical single-source failures may still qualify.
     */
    if (
      signal.severity ===
      "critical"
    ) {
      return {
        shouldOpenIncident:
          true,

        action:
          "open_or_update",

        reason:
          "Critical signal qualifies for incident creation.",

        signal,

        correlationGroup,
      };
    }

    /*
     * Strong multi-provider correlation.
     */
    if (
      correlationGroup &&
      correlationGroup
        .providerCount >=
        this
          .minimumProviderCount &&
      correlationGroup
        .confidenceScore >=
        this
          .minimumCorrelationConfidence
    ) {
      return {
        shouldOpenIncident:
          true,

        action:
          "open_or_update",

        reason:
          `Cross-provider correlation reached confidence ${correlationGroup.confidenceScore.toFixed(
            2
          )}.`,

        signal,

        correlationGroup,
      };
    }

    /*
     * Multiple correlated signals can also qualify.
     */
    if (
      correlationGroup &&
      correlationGroup
        .signalCount >=
        this
          .minimumSignalCount &&
      correlationGroup
        .highestSeverity ===
        "critical"
    ) {
      return {
        shouldOpenIncident:
          true,

        action:
          "open_or_update",

        reason:
          `${correlationGroup.signalCount} correlated signals include critical evidence.`,

        signal,

        correlationGroup,
      };
    }

    return {
      shouldOpenIncident:
        false,

      action:
        "observe",

      reason:
        "Signal evidence has not crossed incident threshold.",

      signal,

      correlationGroup,
    };
  }

  // ==========================================================================
  // CORRELATION
  // ==========================================================================

  async resolveCorrelationGroup(
    signal
  ) {
    if (
      !signal
        .correlationGroupId
    ) {
      return null;
    }

    return SignalCorrelation
      .findOne({
        organizationId:
          signal
            .organizationId,

        environmentId:
          signal
            .environmentId,

        correlationGroupId:
          signal
            .correlationGroupId,
      })
      .lean();
  }

  // ==========================================================================
  // ACTIVE INCIDENT LOOKUP
  // ==========================================================================

  async findActiveIncident(
    signal
  ) {
    this.assertSignalContext(
      signal
    );

    if (
      !signal.serviceId
    ) {
      return null;
    }

    /*
     * Prefer correlation-group match.
     */
    if (
      signal
        .correlationGroupId
    ) {
      const byGroup =
        await Incident
          .findOne({
            organizationId:
              signal
                .organizationId,

            environmentId:
              signal
                .environmentId,

            correlationGroupId:
              signal
                .correlationGroupId,

            status: {
              $in:
                ACTIVE_INCIDENT_STATUSES,
            },
          });

      if (byGroup) {
        return byGroup;
      }
    }

    /*
     * Fallback to signal fingerprint.
     */
    return Incident
      .findOne({
        organizationId:
          signal
            .organizationId,

        environmentId:
          signal
            .environmentId,

        serviceId:
          signal
            .serviceId,

        signalFingerprint:
          signal
            .fingerprint,

        status: {
          $in:
            ACTIVE_INCIDENT_STATUSES,
        },
      });
  }

  // ==========================================================================
  // RECOVERY SIGNAL
  // ==========================================================================

  isRecoverySignal(
    signal
  ) {
    const eventType =
      String(
        signal
          .eventType ||
        ""
      )
        .trim()
        .toLowerCase();

    if (
      eventType.includes(
        "resolved"
      ) ||
      eventType.includes(
        "recovered"
      ) ||
      eventType.includes(
        "healthy"
      )
    ) {
      return true;
    }

    const severity =
      String(
        signal
          .severity ||
        ""
      )
        .trim()
        .toLowerCase();

    return (
      severity ===
        "info" &&
      signal.source ===
        "monitor" &&
      eventType ===
        "monitor.recovered"
    );
  }

  // ==========================================================================
  // INCIDENT SEVERITY
  // ==========================================================================

  deriveIncidentSeverity(
    signal,
    correlationGroup = null,
    existingIncident = null
  ) {
    const levels = {
      info:
        1,

      warning:
        2,

      critical:
        3,
    };

    let severity =
      signal.severity ||
      "warning";

    if (
      correlationGroup
        ?.highestSeverity &&
      (
        levels[
          correlationGroup
            .highestSeverity
        ] ||
        0
      ) >
      (
        levels[
          severity
        ] ||
        0
      )
    ) {
      severity =
        correlationGroup
          .highestSeverity;
    }

    if (
      existingIncident
        ?.severity &&
      (
        levels[
          existingIncident
            .severity
        ] ||
        0
      ) >
      (
        levels[
          severity
        ] ||
        0
      )
    ) {
      severity =
        existingIncident
          .severity;
    }

    return severity;
  }

  // ==========================================================================
  // TITLE
  // ==========================================================================

  buildIncidentTitle(
    signal,
    correlationGroup = null
  ) {
    if (
      signal.title
    ) {
      return String(
        signal.title
      )
        .slice(
          0,
          256
        );
    }

    const providerText =
      signal.provider
        ? `[${signal.provider}] `
        : "";

    const serviceText =
      signal.resource
        ?.serviceName ||
      "Service";

    const suffix =
      correlationGroup
        ?.providerCount > 1
        ? ` (${correlationGroup.providerCount} providers)`
        : "";

    return (
      `${providerText}${serviceText} operational incident${suffix}`
        .slice(
          0,
          256
        )
    );
  }

  // ==========================================================================
  // DESCRIPTION
  // ==========================================================================

  buildIncidentDescription(
    signal,
    correlationGroup = null
  ) {
    const parts = [];

    if (
      signal.description
    ) {
      parts.push(
        signal.description
      );
    }

    if (
      signal.errorMessage
    ) {
      parts.push(
        signal.errorMessage
      );
    }

    if (
      correlationGroup
        ?.incidentCandidateReason
    ) {
      parts.push(
        correlationGroup
          .incidentCandidateReason
      );
    }

    if (
      correlationGroup
        ?.providerCount > 1
    ) {
      parts.push(
        `Correlated evidence received from ${correlationGroup.providerCount} providers.`
      );
    }

    return (
      parts
        .filter(
          Boolean
        )
        .join(
          " "
        )
        .slice(
          0,
          2048
        ) ||
      "Operational failure detected by AIRA."
    );
  }

  // ==========================================================================
  // SOURCE
  // ==========================================================================

  deriveIncidentSource(
    signal
  ) {
    if (
      signal.source ===
      "monitor"
    ) {
      return "monitor";
    }

    if (
      signal.source ===
        "manual"
    ) {
      return "manual";
    }

    if (
      signal.signalType ===
        "alert"
    ) {
      return "alert";
    }

    return "integration";
  }

  // ==========================================================================
  // CONTEXT
  // ==========================================================================

  assertSignalContext(
    signal
  ) {
    if (
      !signal.organizationId ||
      !signal.environmentId ||
      !signal.tenantId
    ) {
      throw Object.assign(
        new Error(
          "Signal incident context is incomplete"
        ),
        {
          code:
            "INCIDENT_SIGNAL_CONTEXT_REQUIRED",
        }
      );
    }

    if (
      !mongoose.Types.ObjectId
        .isValid(
          signal
            .organizationId
        ) ||
      !mongoose.Types.ObjectId
        .isValid(
          signal
            .environmentId
        )
    ) {
      throw Object.assign(
        new Error(
          "Invalid signal ownership context"
        ),
        {
          code:
            "INCIDENT_SIGNAL_CONTEXT_INVALID",
        }
      );
    }
  }

  // ==========================================================================
  // GET SIGNAL
  // ==========================================================================

  async getSignal(
    context,
    signalId
  ) {
    return Signal
      .findOne({
        organizationId:
          context
            .organizationId,

        environmentId:
          context
            .environmentId,

        signalId,
      });
  }
}

module.exports =
  new IncidentDetectionService();

module.exports
  .IncidentDetectionService =
  IncidentDetectionService;