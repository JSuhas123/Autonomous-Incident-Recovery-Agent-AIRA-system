"use strict";

const crypto =
  require(
    "node:crypto"
  );

const {
  signalRepository,

  correlationTopologyRepository,
} =
  require(
    "../../persistence/repositories"
  );

class SignalCorrelationService {
  constructor() {
    this.defaultWindowMs =
      Number(
        process.env
          .SIGNAL_CORRELATION_WINDOW_MS
      ) ||
      5 * 60 * 1000;

    this.defaultMinimumScore =
      Number(
        process.env
          .SIGNAL_CORRELATION_MIN_SCORE
      ) ||
      0.55;

    this.maxCandidates =
      Number(
        process.env
          .SIGNAL_CORRELATION_MAX_CANDIDATES
      ) ||
      100;
  }

  // ==========================================================================
  // SCOPE
  // ==========================================================================

  _scope(
    signal
  ) {
    if (
      !signal ||
      !signal.organizationId ||
      !signal.environmentId
    ) {
      throw Object.assign(
        new Error(
          "Signal correlation requires organization and environment context"
        ),
        {
          code:
            "SIGNAL_CORRELATION_CONTEXT_REQUIRED",
        }
      );
    }

    return {
      organizationId:
        signal.organizationId,

      environmentId:
        signal.environmentId,
    };
  }

  // ==========================================================================
  // MAIN
  // ==========================================================================

  async correlate(
    signal,
    {
      windowMs =
        this.defaultWindowMs,

      minimumScore =
        this.defaultMinimumScore,
    } = {}
  ) {
    const scope =
      this._scope(
        signal
      );

    const observedAt =
      signal.observedAt
        ? new Date(
            signal.observedAt
          )
        : new Date();

    const windowStart =
      new Date(
        observedAt.getTime() -
        windowMs
      );

    const windowEnd =
      new Date(
        observedAt.getTime() +
        windowMs
      );

    const candidates =
      await signalRepository
        .list(
          {
            ...scope,

            _id: {
              $ne:
                signal._id,
            },

            observedAt: {
              $gte:
                windowStart,

              $lte:
                windowEnd,
            },

            processingStatus: {
              $nin: [
                "failed",
                "ignored",
              ],
            },
          },
          {
            sort: {
              observedAt:
                -1,
            },

            limit:
              this.maxCandidates,
          }
        );

    if (
      candidates.length ===
      0
    ) {
      return {
        correlated:
          false,

        correlationGroupId:
          null,

        score:
          0,

        matches:
          [],
      };
    }

    const scored = [];

    for (
      const candidate
      of candidates
    ) {
      const result =
        await this
          .scoreCorrelation(
            signal,
            candidate
          );

      if (
        result.score >=
        minimumScore
      ) {
        scored.push({
          signal:
            candidate,

          ...result,
        });
      }
    }

    if (
      scored.length ===
      0
    ) {
      return {
        correlated:
          false,

        correlationGroupId:
          null,

        score:
          0,

        matches:
          [],
      };
    }

    scored.sort(
      (a, b) =>
        b.score -
        a.score
    );

    const best =
      scored[0];

    const existingGroupIds =
      scored
        .map(
          (entry) =>
            entry.signal
              .correlationGroupId
        )
        .filter(
          Boolean
        );

    const correlationGroupId =
      signal
        .correlationGroupId ||
      existingGroupIds[0] ||
      this.createCorrelationGroupId(
        signal,
        best.signal
      );

    const correlatedIds =
      scored
        .map(
          (entry) =>
            entry.signal
              .signalId
        )
        .filter(
          Boolean
        );

    const now =
      new Date();

    if (
      signal._id
    ) {
      await signalRepository
        .updateOne(
          {
            _id:
              signal._id,

            ...scope,
          },
          {
            $set: {
              correlationGroupId,

              correlationScore:
                best.score,

              correlatedAt:
                now,

              processingStatus:
                "correlated",
            },

            $addToSet: {
              correlatedSignalIds: {
                $each:
                  correlatedIds,
              },
            },
          }
        );
    }

    const candidateMongoIds =
      scored
        .map(
          (entry) =>
            entry.signal._id
        )
        .filter(
          Boolean
        );

    if (
      candidateMongoIds.length >
      0
    ) {
      await signalRepository
        .updateMany(
          {
            ...scope,

            _id: {
              $in:
                candidateMongoIds,
            },
          },
          {
            $set: {
              correlationGroupId,

              correlatedAt:
                now,
            },
          }
        );
    }

    return {
      correlated:
        true,

      correlationGroupId,

      score:
        best.score,

      matches:
        scored.map(
          (entry) => ({
            signalId:
              entry.signal
                .signalId,

            score:
              entry.score,

            reasons:
              entry.reasons,
          })
        ),
    };
  }

  // ==========================================================================
  // SCORE
  // ==========================================================================

  async scoreCorrelation(
    first,
    second
  ) {
    let score =
      0;

    const reasons =
      [];

    if (
      first.serviceId &&
      second.serviceId &&
      String(
        first.serviceId
      ) ===
      String(
        second.serviceId
      )
    ) {
      score +=
        0.4;

      reasons.push(
        "same_service"
      );
    }

    const firstServiceName =
      first.resource
        ?.serviceName;

    const secondServiceName =
      second.resource
        ?.serviceName;

    if (
      firstServiceName &&
      secondServiceName &&
      this.normalizeString(
        firstServiceName
      ) ===
      this.normalizeString(
        secondServiceName
      )
    ) {
      score +=
        0.25;

      reasons.push(
        "same_service_name"
      );
    }

    const firstResourceId =
      first.resource
        ?.resourceId;

    const secondResourceId =
      second.resource
        ?.resourceId;

    if (
      firstResourceId &&
      secondResourceId &&
      String(
        firstResourceId
      ) ===
      String(
        secondResourceId
      )
    ) {
      score +=
        0.35;

      reasons.push(
        "same_resource"
      );
    }

    if (
      first.resource
        ?.namespace &&
      second.resource
        ?.namespace &&
      first.resource
        .namespace ===
      second.resource
        .namespace
    ) {
      score +=
        0.08;

      reasons.push(
        "same_namespace"
      );
    }

    if (
      first.resource
        ?.cluster &&
      second.resource
        ?.cluster &&
      first.resource
        .cluster ===
      second.resource
        .cluster
    ) {
      score +=
        0.07;

      reasons.push(
        "same_cluster"
      );
    }

    if (
      first.errorCode &&
      second.errorCode &&
      this.normalizeString(
        first.errorCode
      ) ===
      this.normalizeString(
        second.errorCode
      )
    ) {
      score +=
        0.2;

      reasons.push(
        "same_error_code"
      );
    }

    if (
      first.provider &&
      second.provider &&
      first.provider !==
      second.provider
    ) {
      score +=
        0.08;

      reasons.push(
        "cross_provider_confirmation"
      );
    }

    const firstTime =
      new Date(
        first.observedAt ||
        first.createdAt ||
        0
      ).getTime();

    const secondTime =
      new Date(
        second.observedAt ||
        second.createdAt ||
        0
      ).getTime();

    const difference =
      Math.abs(
        firstTime -
        secondTime
      );

    if (
      difference <=
      30 * 1000
    ) {
      score +=
        0.2;

      reasons.push(
        "within_30_seconds"
      );
    } else if (
      difference <=
      60 * 1000
    ) {
      score +=
        0.15;

      reasons.push(
        "within_1_minute"
      );
    } else if (
      difference <=
      5 * 60 * 1000
    ) {
      score +=
        0.08;

      reasons.push(
        "within_5_minutes"
      );
    }

    const topology =
      await this
        .checkTopologyRelationship(
          first,
          second
        );

    if (
      topology.related
    ) {
      score +=
        topology.score;

      reasons.push(
        topology.reason
      );
    }

    score =
      Math.min(
        1,
        Number(
          score.toFixed(
            4
          )
        )
      );

    return {
      score,

      reasons,
    };
  }

  // ==========================================================================
  // TOPOLOGY
  // ==========================================================================

  async checkTopologyRelationship(
    first,
    second
  ) {
    const scope = {
      organizationId:
        first.organizationId,

      environmentId:
        first.environmentId,
    };

    if (
      first.serviceId &&
      second.serviceId
    ) {
      const dependency =
        await correlationTopologyRepository
          .hasServiceDependency(
            scope,
            first.serviceId,
            second.serviceId
          );

      if (
        dependency
      ) {
        return {
          related:
            true,

          score:
            0.2,

          reason:
            "service_dependency",
        };
      }
    }

    const firstNode =
      this.extractTopologyNode(
        first
      );

    const secondNode =
      this.extractTopologyNode(
        second
      );

    if (
      !firstNode ||
      !secondNode
    ) {
      return {
        related:
          false,

        score:
          0,
      };
    }

    if (
      String(
        firstNode.id
      ) ===
        String(
          secondNode.id
        ) &&
      firstNode.type ===
        secondNode.type
    ) {
      return {
        related:
          true,

        score:
          0.25,

        reason:
          "same_topology_node",
      };
    }

    const relationship =
      await correlationTopologyRepository
        .hasResourceRelationship(
          scope,
          firstNode,
          secondNode
        );

    if (
      relationship
    ) {
      return {
        related:
          true,

        score:
          0.2,

        reason:
          "topology_relationship",
      };
    }

    return {
      related:
        false,

      score:
        0,
    };
  }

  extractTopologyNode(
    signal
  ) {
    if (
      signal.attributes
        ?.airaInfrastructureResource
        ?.id
    ) {
      return {
        type:
          "resource",

        id:
          signal.attributes
            .airaInfrastructureResource
            .id,
      };
    }

    if (
      signal.serviceId
    ) {
      return {
        type:
          "service",

        id:
          signal.serviceId,
      };
    }

    return null;
  }

  // ==========================================================================
  // GROUP ID
  // ==========================================================================

  createCorrelationGroupId(
    first,
    second
  ) {
    const ids =
      [
        first.signalId ||
          String(
            first._id ||
            ""
          ),

        second.signalId ||
          String(
            second._id ||
            ""
          ),
      ]
        .sort()
        .join(
          "::"
        );

    return (
      "corr_" +
      crypto
        .createHash(
          "sha256"
        )
        .update(
          [
            String(
              first.organizationId
            ),

            String(
              first.environmentId
            ),

            ids,
          ].join(
            "::"
          )
        )
        .digest(
          "hex"
        )
        .slice(
          0,
          32
        )
    );
  }

  // ==========================================================================
  // FETCH GROUP
  // ==========================================================================

  async getCorrelationGroup(
    signal
  ) {
    const scope =
      this._scope(
        signal
      );

    if (
      !signal
        .correlationGroupId
    ) {
      return [];
    }

    return signalRepository
      .list(
        {
          ...scope,

          correlationGroupId:
            signal
              .correlationGroupId,
        },
        {
          sort: {
            observedAt:
              1,
          },

          limit:
            this.maxCandidates,
        }
      );
  }

  normalizeString(
    value
  ) {
    return String(
      value ||
      ""
    )
      .trim()
      .toLowerCase();
  }
}

module.exports =
  new SignalCorrelationService();

module.exports
  .SignalCorrelationService =
  SignalCorrelationService;