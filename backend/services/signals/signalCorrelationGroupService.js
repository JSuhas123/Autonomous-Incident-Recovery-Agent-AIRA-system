"use strict";

const {
  signalRepository,

  signalCorrelationRepository,
} =
  require(
    "../../persistence/repositories"
  );

class SignalCorrelationGroupService {
  constructor() {
    this.minCrossProviderSignals =
      Number(
        process.env
          .SIGNAL_INCIDENT_MIN_CROSS_PROVIDER_SIGNALS
      ) ||
      2;

    this.minSignalCount =
      Number(
        process.env
          .SIGNAL_INCIDENT_MIN_SIGNAL_COUNT
      ) ||
      2;

    this.minConfidence =
      Number(
        process.env
          .SIGNAL_INCIDENT_MIN_CORRELATION_SCORE
      ) ||
      0.6;
  }

  async updateGroup(
    signal,
    correlationResult
  ) {
    if (
      !signal
        ?.organizationId ||
      !signal
        ?.environmentId ||
      !signal
        ?.tenantId
    ) {
      throw Object.assign(
        new Error(
          "Complete signal context is required"
        ),
        {
          code:
            "SIGNAL_GROUP_CONTEXT_REQUIRED",
        }
      );
    }

    /*
     * No correlation yet:
     *
     * create a one-signal forming group only if the signal itself
     * is already incident-worthy.
     */
    const correlationGroupId =
      correlationResult
        ?.correlationGroupId ||
      signal
        .correlationGroupId ||
      `single_${signal.signalId}`;

    const relatedSignals =
      correlationResult
        ?.correlated
        ? await signalRepository
            .list(
              {
                organizationId:
                  signal.organizationId,

                environmentId:
                  signal.environmentId,

                $or: [
                  {
                    correlationGroupId,
                  },

                  {
                    signalId:
                      signal.signalId,
                  },
                ],
              },
              {
                sort: {
                  observedAt:
                    1,
                },

                limit:
                  500,
              }
            )
        : [
            this.toPlain(
              signal
            ),
          ];

    const uniqueSignals =
      this.uniqueSignals(
        relatedSignals
      );

    const providers =
      [
        ...new Set(
          uniqueSignals
            .map(
              (entry) =>
                entry.provider
            )
            .filter(
              Boolean
            )
        ),
      ];

    const signalTypes =
      [
        ...new Set(
          uniqueSignals
            .map(
              (entry) =>
                entry.signalType
            )
            .filter(
              Boolean
            )
        ),
      ];

    const highestSeverity =
      this.highestSeverity(
        uniqueSignals.map(
          (entry) =>
            entry.severity
        )
      );

    const confidenceScore =
      Math.max(
        correlationResult
          ?.score ||
        0,

        ...(
          correlationResult
            ?.matches ||
          []
        ).map(
          (match) =>
            match.score ||
            0
        )
      );

    const decision =
      this.evaluateIncidentCandidate({
        signal,

        signalCount:
          uniqueSignals.length,

        providerCount:
          providers.length,

        highestSeverity,

        confidenceScore,
      });

    const firstObservedAt =
      new Date(
        Math.min(
          ...uniqueSignals.map(
            (entry) =>
              new Date(
                entry.observedAt ||
                entry.createdAt ||
                Date.now()
              )
                .getTime()
          )
        )
      );

    const lastObservedAt =
      new Date(
        Math.max(
          ...uniqueSignals.map(
            (entry) =>
              new Date(
                entry.observedAt ||
                entry.createdAt ||
                Date.now()
              )
                .getTime()
          )
        )
      );

    const evidence =
      this.buildEvidence(
        uniqueSignals,
        correlationResult
      );

    const group =
      await signalCorrelationRepository
        .upsertGroup(
          {
            organizationId:
              signal.organizationId,

            environmentId:
              signal.environmentId,
          },
          correlationGroupId,
          {
            set: {
              tenantId:
                signal.tenantId,

              status:
                decision
                  .incidentCandidate
                  ? "incident_candidate"
                  : correlationResult
                      ?.correlated
                    ? "active"
                    : "forming",

              primarySignalId:
                signal.signalId,

              serviceId:
                signal.serviceId ||
                null,

              providers,

              signalTypes,

              highestSeverity,

              confidenceScore,

              incidentCandidate:
                decision
                  .incidentCandidate,

              incidentCandidateReason:
                decision.reason,

              firstObservedAt,

              lastObservedAt,

              signalCount:
                uniqueSignals.length,

              providerCount:
                providers.length,

              evidence,
            },

            addSignalIds:
              uniqueSignals
                .map(
                  (entry) =>
                    entry.signalId
                )
                .filter(
                  Boolean
                ),
          }
        );

    /*
     * Ensure all related signals point at the same group.
     */
    await signalRepository
      .updateMany(
        {
          organizationId:
            signal.organizationId,

          environmentId:
            signal.environmentId,

          signalId: {
            $in:
              group.signalIds,
          },
        },
        {
          $set: {
            correlationGroupId:
              group
                .correlationGroupId,

            correlatedAt:
              new Date(),

            incidentCandidate:
              group
                .incidentCandidate,

            correlationScore:
              group
                .confidenceScore,

            processingStatus:
              "correlated",
          },
        }
      );

    return group;
  }

  evaluateIncidentCandidate({
    signal,
    signalCount,
    providerCount,
    highestSeverity,
    confidenceScore,
  }) {
    /*
     * Critical native evidence can qualify immediately.
     */
    if (
      signal
        .incidentCandidate &&
      highestSeverity ===
        "critical"
    ) {
      return {
        incidentCandidate:
          true,

        reason:
          "Critical operational signal requires incident evaluation.",
      };
    }

    /*
     * Independent providers confirming the same failure.
     */
    if (
      providerCount >=
        this
          .minCrossProviderSignals &&
      confidenceScore >=
        this
          .minConfidence
    ) {
      return {
        incidentCandidate:
          true,

        reason:
          `${providerCount} independent providers correlated with confidence ${confidenceScore.toFixed(
            2
          )}.`,
      };
    }

    /*
     * Multiple strong signals from the same provider.
     */
    if (
      signalCount >=
        this
          .minSignalCount &&
      highestSeverity ===
        "critical" &&
      confidenceScore >=
        this
          .minConfidence
    ) {
      return {
        incidentCandidate:
          true,

        reason:
          `${signalCount} correlated critical signals reached confidence ${confidenceScore.toFixed(
            2
          )}.`,
      };
    }

    return {
      incidentCandidate:
        false,

      reason:
        "Correlation evidence has not reached incident threshold.",
    };
  }

  buildEvidence(
    signals,
    correlationResult
  ) {
    const matchMap =
      new Map(
        (
          correlationResult
            ?.matches ||
          []
        ).map(
          (match) => [
            match.signalId,
            match,
          ]
        )
      );

    return signals
      .slice(
        -100
      )
      .map(
        (signal) => {
          const match =
            matchMap.get(
              signal.signalId
            );

          return {
            signalId:
              signal.signalId,

            provider:
              signal.provider,

            signalType:
              signal.signalType,

            severity:
              signal.severity,

            score:
              match
                ?.score ||
              (
                signal
                  .signalId ===
                correlationResult
                  ?.signalId
                  ? correlationResult
                      .score
                  : 0
              ),

            reasons:
              match
                ?.reasons ||
              [],

            observedAt:
              signal.observedAt ||
              signal.createdAt ||
              new Date(),
          };
        }
      );
  }

  highestSeverity(
    values
  ) {
    const order = {
      unknown:
        0,

      info:
        1,

      warning:
        2,

      critical:
        3,
    };

    let highest =
      "unknown";

    for (
      const value
      of values
    ) {
      if (
        (
          order[value] ||
          0
        ) >
        (
          order[highest] ||
          0
        )
      ) {
        highest =
          value;
      }
    }

    return highest;
  }

  uniqueSignals(
    signals
  ) {
    const map =
      new Map();

    for (
      const signal
      of signals
    ) {
      if (
        !signal
          ?.signalId
      ) {
        continue;
      }

      map.set(
        signal.signalId,
        signal
      );
    }

    return [
      ...map.values(),
    ];
  }

  toPlain(
    value
  ) {
    if (
      value &&
      typeof value.toObject ===
        "function"
    ) {
      return value
        .toObject();
    }

    return value;
  }

  async getGroup(
    context,
    correlationGroupId
  ) {
    if (
      !context
        ?.organizationId ||
      !context
        ?.environmentId
    ) {
      throw Object.assign(
        new Error(
          "Complete correlation-group context is required"
        ),
        {
          code:
            "SIGNAL_GROUP_QUERY_CONTEXT_REQUIRED",
        }
      );
    }

    if (
      !correlationGroupId
    ) {
      return null;
    }

    return signalCorrelationRepository
      .findGroup(
        {
          organizationId:
            context.organizationId,

          environmentId:
            context.environmentId,
        },
        correlationGroupId
      );
  }
}

module.exports =
  new SignalCorrelationGroupService();

module.exports
  .SignalCorrelationGroupService =
  SignalCorrelationGroupService;