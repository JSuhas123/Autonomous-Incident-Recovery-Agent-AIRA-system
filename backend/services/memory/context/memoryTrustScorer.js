"use strict";


const DEFAULT_TRUST_WEIGHTS =
  Object.freeze({
    scope:
      0.20,

    trust:
      0.20,

    confidence:
      0.15,

    evidence:
      0.10,

    provenance:
      0.10,

    freshness:
      0.10,

    outcome:
      0.10,

    status:
      0.05,
  });


const MEMORY_STATUS_SCORE =
  Object.freeze({
    ACTIVE:
      1,

    SUPERSEDED:
      0.35,

    STALE:
      0.20,

    ARCHIVED:
      0.05,

    REVOKED:
      0,
  });


const MEMORY_TYPE_OUTCOME_SCORE =
  Object.freeze({
    OUTCOME:
      1,

    PROCEDURAL:
      0.9,

    EPISODIC:
      0.8,

    HUMAN:
      0.75,

    SEMANTIC:
      0.7,

    BEHAVIOURAL:
      0.7,
  });


class MemoryTrustScorer {

  constructor(
    options = {}
  ) {
    this.weights = {
      ...DEFAULT_TRUST_WEIGHTS,
      ...(
        options.weights ||
        {}
      ),
    };


    this.freshnessHalfLifeDays =
      Number.isFinite(
        Number(
          options.freshnessHalfLifeDays
        )
      )
        ? Number(
            options.freshnessHalfLifeDays
          )
        : 30;
  }


  clamp(
    value,
    minimum =
      0,
    maximum =
      1
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
      return minimum;
    }


    return Math.min(
      maximum,
      Math.max(
        minimum,
        number
      )
    );
  }


  normalizeScopeScore(
    scopeScore
  ) {
    return this.clamp(
      Number(
        scopeScore
      ) /
      600
    );
  }


  normalizeEvidenceCount(
    evidenceCount
  ) {
    const count =
      Math.max(
        0,
        Number(
          evidenceCount
        ) ||
        0
      );


    /**
     * Saturating evidence function.
     *
     * 0  -> 0
     * 1  -> 0.20
     * 3  -> 0.60
     * 5+ -> 1
     */
    return this.clamp(
      count /
      5
    );
  }


  normalizeSourceCount(
    sourceCount
  ) {
    const count =
      Math.max(
        0,
        Number(
          sourceCount
        ) ||
        0
      );


    /**
     * Multiple independent provenance
     * sources increase trust.
     *
     * Saturates at 4 sources.
     */
    return this.clamp(
      count /
      4
    );
  }


  calculateFreshness(
    memory,
    now =
      new Date()
  ) {
    const timestamp =
      memory.observedAt ||
      memory.observed_at ||
      memory.updatedAt ||
      memory.updated_at ||
      memory.createdAt ||
      memory.created_at ||
      null;


    if (
      !timestamp
    ) {
      return 0.5;
    }


    const observedAt =
      new Date(
        timestamp
      );


    if (
      Number.isNaN(
        observedAt.getTime()
      )
    ) {
      return 0.5;
    }


    const ageMilliseconds =
      Math.max(
        0,
        now.getTime() -
        observedAt.getTime()
      );


    const ageDays =
      ageMilliseconds /
      (
        1000 *
        60 *
        60 *
        24
      );


    if (
      this.freshnessHalfLifeDays <=
        0
    ) {
      return 0;
    }


    /**
     * Exponential decay.
     *
     * At half-life:
     * freshness = 0.5
     */
    const freshness =
      Math.pow(
        0.5,
        ageDays /
        this.freshnessHalfLifeDays
      );


    return this.clamp(
      freshness
    );
  }


  calculateOutcomeQuality(
    memory
  ) {
    const metadata =
      memory.metadata ||
      {};


    const content =
      memory.content ||
      {};


    const explicit =
      metadata.outcomeQuality ??
      metadata.outcome_quality ??
      content.outcomeQuality ??
      content.outcome_quality ??
      null;


    if (
      explicit !==
        null &&
      explicit !==
        undefined
    ) {
      return this.clamp(
        explicit
      );
    }


    const recoveryConfirmed =
      metadata.recoveryConfirmed ??
      metadata.recovery_confirmed ??
      content.recoveryConfirmed ??
      content.recovery_confirmed ??
      null;


    if (
      recoveryConfirmed ===
        true
    ) {
      return 1;
    }


    if (
      recoveryConfirmed ===
        false
    ) {
      return 0.25;
    }


    const memoryType =
      String(
        memory.memoryType ||
        memory.memory_type ||
        ""
      ).toUpperCase();


    return (
      MEMORY_TYPE_OUTCOME_SCORE[
        memoryType
      ] ??
      0.5
    );
  }


  calculateStatusScore(
    memory
  ) {
    const status =
      String(
        memory.status ||
        "ACTIVE"
      ).toUpperCase();


    return (
      MEMORY_STATUS_SCORE[
        status
      ] ??
      0
    );
  }


  score({
    memory,
    scopeScore =
      0,
    now =
      new Date(),
  }) {
    if (
      !memory ||
      typeof memory !==
        "object"
    ) {
      const error =
        new Error(
          "Memory is required for trust scoring"
        );

      error.code =
        "MEMORY_TRUST_MEMORY_REQUIRED";

      error.status =
        422;

      throw error;
    }


    const components = {
      scope:
        this.normalizeScopeScore(
          scopeScore
        ),

      trust:
        this.clamp(
          memory.trustScore ??
          memory.trust_score ??
          0
        ),

      confidence:
        this.clamp(
          memory.confidence ??
          0
        ),

      evidence:
        this.normalizeEvidenceCount(
          memory.evidenceCount ??
          memory.evidence_count ??
          0
        ),

      provenance:
        this.normalizeSourceCount(
          memory.sourceCount ??
          memory.source_count ??
          0
        ),

      freshness:
        this.calculateFreshness(
          memory,
          now
        ),

      outcome:
        this.calculateOutcomeQuality(
          memory
        ),

      status:
        this.calculateStatusScore(
          memory
        ),
    };


    let weightedScore =
      0;


    let totalWeight =
      0;


    for (
      const [
        component,
        weight,
      ]
      of Object.entries(
        this.weights
      )
    ) {
      const normalizedWeight =
        Number(
          weight
        );


      if (
        !Number.isFinite(
          normalizedWeight
        ) ||
        normalizedWeight <=
          0
      ) {
        continue;
      }


      weightedScore +=
        (
          components[
            component
          ] ??
          0
        ) *
        normalizedWeight;


      totalWeight +=
        normalizedWeight;
    }


    const finalScore =
      totalWeight >
        0
        ? weightedScore /
          totalWeight
        : 0;


    return {
      score:
        Number(
          this
            .clamp(
              finalScore
            )
            .toFixed(
              6
            )
        ),

      components,

      weights: {
        ...this.weights,
      },

      safety: {
        executionAuthorized:
          false,

        grantsExecutionPermission:
          false,

        bypassesPolicy:
          false,

        suppressesAlerts:
          false,
      },
    };
  }


  scoreMany({
    resolvedMemories =
      [],
    now =
      new Date(),
  }) {
    if (
      !Array.isArray(
        resolvedMemories
      )
    ) {
      const error =
        new Error(
          "Resolved memories must be an array"
        );

      error.code =
        "MEMORY_TRUST_ITEMS_INVALID";

      error.status =
        422;

      throw error;
    }


    const scored =
      resolvedMemories.map(
        (
          item
        ) => {
          const result =
            this.score({
              memory:
                item.memory,

              scopeScore:
                item
                  .resolution
                  ?.scopeScore ??
                0,

              now,
            });


          return {
            ...item,

            trust:
              result,
          };
        }
      );


    scored.sort(
      (
        left,
        right
      ) => {
        const scoreDifference =
          right
            .trust
            .score -
          left
            .trust
            .score;


        if (
          scoreDifference !==
            0
        ) {
          return scoreDifference;
        }


        /**
         * Deterministic tie-break:
         * prefer more local scope.
         */
        return (
          (
            right
              .resolution
              ?.scopeScore ??
            0
          ) -
          (
            left
              .resolution
              ?.scopeScore ??
            0
          )
        );
      }
    );


    return scored;
  }
}


const memoryTrustScorer =
  new MemoryTrustScorer();


module.exports = {
  DEFAULT_TRUST_WEIGHTS,

  MEMORY_STATUS_SCORE,

  MEMORY_TYPE_OUTCOME_SCORE,

  MemoryTrustScorer,

  memoryTrustScorer,
};