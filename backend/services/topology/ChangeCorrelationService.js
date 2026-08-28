"use strict";

const IncidentTopologyReconstructionService =
  require(
    "./IncidentTopologyReconstructionService"
  );

const KnownGoodComparisonService =
  require(
    "./KnownGoodComparisonService"
  );


const DEFAULT_CORRELATION_WINDOW_MS =
  30 *
  60 *
  1000;


/*
 * ============================================================================
 * CHANGE CORRELATION SERVICE
 * ============================================================================
 *
 * Phase 17.12
 *
 * Combines:
 *
 *   Phase 17.10
 *   incident-time topology reconstruction
 *
 * with:
 *
 *   Phase 17.11
 *   known-good state differences
 *
 * Produces ranked diagnostic candidates.
 *
 * IMPORTANT:
 *
 *   correlation != causation
 *
 * No candidate returned here is permitted to authorize execution.
 * ============================================================================
 */

class ChangeCorrelationService {
  constructor(
    options = {}
  ) {
    this.incidentTopology =
      options.incidentTopology ||
      new IncidentTopologyReconstructionService(
        options
      );


    this.knownGoodComparison =
      options.knownGoodComparison ||
      new KnownGoodComparisonService(
        options
      );
  }


  async correlateIncident(
    input = {},
    transaction = null
  ) {
    requireInput(
      input
    );


    const reconstruction =
      await this.incidentTopology
        .reconstruct(
          {
            organizationId:
              input.organizationId,

            environmentId:
              input.environmentId,

            incidentId:
              input.incidentId,

            resourceId:
              input.resourceId,

            depth:
              input.depth ??
              2,

            direction:
              input.direction ||
              "BOTH",

            relationshipTypes:
              input.relationshipTypes ||
              [],

            preWindowMs:
              input.preWindowMs,

            postWindowMs:
              input.postWindowMs,

            changeLimit:
              input.changeLimit ||
              1000,
          },

          transaction
        );


    const comparison =
      await this.knownGoodComparison
        .compareAtTime(
          {
            organizationId:
              input.organizationId,

            environmentId:
              input.environmentId,

            resourceId:
              input.resourceId,

            at:
              reconstruction
                .timeline
                .incidentAt,
          },

          transaction
        );


    const correlationWindowMs =
      normalizeCorrelationWindow(
        input.correlationWindowMs
      );


    const directRelationshipIds =
      findDirectRelationshipIds(
        reconstruction,
        input.resourceId
      );


    const candidates = [];


    /*
     * ========================================================================
     * TEMPORAL GRAPH CHANGE CANDIDATES
     * ========================================================================
     */

    for (
      const change
      of (
        reconstruction.changes ||
        []
      )
    ) {
      candidates.push(
        buildGraphChangeCandidate({
          change,

          rootResourceId:
            input.resourceId,

          incidentAt:
            reconstruction
              .timeline
              .incidentAt,

          correlationWindowMs,

          directRelationshipIds,
        })
      );
    }


    /*
     * ========================================================================
     * KNOWN-GOOD STATE DIVERGENCE CANDIDATES
     * ========================================================================
     */

    if (
      comparison.comparable
    ) {
      const grouped =
        groupDifferencesByCategory(
          comparison.materialDifferences
        );


      for (
        const [
          category,
          differences,
        ]
        of grouped
      ) {
        candidates.push(
          buildStateDifferenceCandidate({
            category,

            differences,

            comparison,
          })
        );
      }
    }


    candidates.sort(
      compareCandidates
    );


    const rankedCandidates =
      candidates.map(
        (
          candidate,
          index
        ) => ({
          rank:
            index +
            1,

          ...candidate,
        })
      );


    return {
      incident:
        reconstruction.incident,

      rootResourceId:
        input.resourceId,

      incidentAt:
        reconstruction
          .timeline
          .incidentAt,

      correlationWindowMs,

      knownGoodComparison:
        comparison,

      reconstruction: {
        timeline:
          reconstruction.timeline,

        summary:
          reconstruction.summary,

        graphChangeCount:
          (
            reconstruction.changes ||
            []
          ).length,
      },

      candidates:
        rankedCandidates,

      strongestCandidate:
        rankedCandidates[0] ||
        null,

      summary:
        summarizeCandidates(
          rankedCandidates,
          comparison
        ),

      causalityEstablished:
        false,

      executionAuthorized:
        false,
    };
  }
}


/*
 * ============================================================================
 * GRAPH CHANGE CANDIDATE
 * ============================================================================
 */

function buildGraphChangeCandidate({
  change,
  incidentAt,
  correlationWindowMs,
  directRelationshipIds,
}) {
  const changedAt =
    validDate(
      change.changedAt
    );


  const incidentTimestamp =
    validDate(
      incidentAt
    );


  const deltaMs =
    changedAt.getTime() -
    incidentTimestamp.getTime();


  const absoluteDeltaMs =
    Math.abs(
      deltaMs
    );


  const proximity =
    Math.max(
      0,

      1 -
      absoluteDeltaMs /
        correlationWindowMs
    );


  const precededIncident =
    deltaMs <=
    0;


  const directlyTouchesRoot =
    Boolean(
      change.relationshipId &&
      directRelationshipIds.has(
        change.relationshipId
      )
    );


  const hasEvidence =
    isNonEmptyObject(
      change.evidence
    );


  let score =
    proximity *
    0.35;


  /*
   * A change before the incident is more relevant as a causal candidate
   * than a change that happened only after failure began.
   *
   * Still: this is correlation evidence only.
   */
  if (
    precededIncident
  ) {
    score +=
      0.20;
  }


  if (
    directlyTouchesRoot
  ) {
    score +=
      0.20;
  }


  if (
    hasEvidence
  ) {
    score +=
      0.10;
  }


  if (
    change.source
  ) {
    score +=
      0.05;
  }


  score =
    Math.min(
      score,
      0.90
    );


  return {
    candidateType:
      "GRAPH_CHANGE",

    changeId:
      change.id,

    relationshipId:
      change.relationshipId ||
      null,

    resourceId:
      change.resourceId ||
      null,

    changeType:
      change.changeType,

    changedAt,

    deltaFromIncidentMs:
      deltaMs,

    occurredBeforeOrAtIncident:
      precededIncident,

    directlyTouchesRoot,

    temporalProximity:
      round(
        proximity
      ),

    score:
      round(
        score
      ),

    correlationStrength:
      classifyScore(
        score
      ),

    beforeState:
      change.beforeState ||
      {},

    afterState:
      change.afterState ||
      {},

    source:
      change.source ||
      null,

    evidence:
      change.evidence ||
      {},

    rationale:
      buildGraphRationale({
        precededIncident,

        directlyTouchesRoot,

        proximity,

        hasEvidence,
      }),

    causalityEstablished:
      false,

    executionAuthorized:
      false,
  };
}


/*
 * ============================================================================
 * KNOWN-GOOD STATE DIFFERENCE CANDIDATE
 * ============================================================================
 */

function buildStateDifferenceCandidate({
  category,
  differences,
  comparison,
}) {
  const baseScores = {
    configuration:
      0.70,

    version:
      0.70,

    health:
      0.65,

    lifecycle:
      0.60,

    runtime:
      0.55,

    metrics:
      0.50,

    attributes:
      0.40,
  };


  let score =
    baseScores[
      category
    ] ??
    0.35;


  /*
   * More independent deltas inside one category provide somewhat stronger
   * divergence evidence, but do not allow this to become certainty.
   */
  score +=
    Math.min(
      differences.length *
        0.025,

      0.10
    );


  const knownGoodConfidence =
    Number(
      comparison
        .knownGood
        ?.confidence
    );


  if (
    Number.isFinite(
      knownGoodConfidence
    )
  ) {
    score +=
      Math.min(
        knownGoodConfidence *
          0.05,

        0.05
      );
  }


  score =
    Math.min(
      score,
      0.85
    );


  return {
    candidateType:
      "KNOWN_GOOD_DIVERGENCE",

    category,

    differenceCount:
      differences.length,

    differences,

    score:
      round(
        score
      ),

    correlationStrength:
      classifyScore(
        score
      ),

    knownGoodStateId:
      comparison
        .knownGoodState
        ?.id ||
      null,

    observedStateId:
      comparison
        .observedState
        ?.id ||
      null,

    knownGoodConfidence:
      Number.isFinite(
        knownGoodConfidence
      )
        ? knownGoodConfidence
        : null,

    rationale:
      `${category} differs from the evidence-backed known-good ResourceState at incident time`,

    causalityEstablished:
      false,

    executionAuthorized:
      false,
  };
}


/*
 * ============================================================================
 * DIRECT ROOT RELATIONSHIPS
 * ============================================================================
 */

function findDirectRelationshipIds(
  reconstruction,
  rootResourceId
) {
  const result =
    new Set();


  const snapshots = [
    reconstruction
      ?.snapshots
      ?.preIncident,

    reconstruction
      ?.snapshots
      ?.atIncident,

    reconstruction
      ?.snapshots
      ?.postIncident,
  ];


  for (
    const snapshot
    of snapshots
  ) {
    for (
      const relationship
      of (
        snapshot
          ?.relationships ||
        []
      )
    ) {
      if (
        relationship
          .sourceResourceId ===
          rootResourceId ||
        relationship
          .targetResourceId ===
          rootResourceId
      ) {
        result.add(
          relationship.id
        );
      }
    }
  }


  return result;
}


/*
 * ============================================================================
 * GROUPING / RANKING
 * ============================================================================
 */

function groupDifferencesByCategory(
  differences
) {
  const groups =
    new Map();


  for (
    const difference
    of differences
  ) {
    if (
      !groups.has(
        difference.category
      )
    ) {
      groups.set(
        difference.category,
        []
      );
    }


    groups
      .get(
        difference.category
      )
      .push(
        difference
      );
  }


  return groups;
}


function compareCandidates(
  left,
  right
) {
  if (
    right.score !==
    left.score
  ) {
    return (
      right.score -
      left.score
    );
  }


  return String(
    left.candidateType
  ).localeCompare(
    String(
      right.candidateType
    )
  );
}


function classifyScore(
  score
) {
  if (
    score >=
    0.75
  ) {
    return "STRONG";
  }


  if (
    score >=
    0.50
  ) {
    return "MODERATE";
  }


  if (
    score >=
    0.25
  ) {
    return "WEAK";
  }


  return "CONTEXTUAL";
}


function summarizeCandidates(
  candidates,
  comparison
) {
  return {
    totalCandidates:
      candidates.length,

    strong:
      candidates.filter(
        (candidate) =>
          candidate.correlationStrength ===
          "STRONG"
      ).length,

    moderate:
      candidates.filter(
        (candidate) =>
          candidate.correlationStrength ===
          "MODERATE"
      ).length,

    weak:
      candidates.filter(
        (candidate) =>
          candidate.correlationStrength ===
          "WEAK"
      ).length,

    contextual:
      candidates.filter(
        (candidate) =>
          candidate.correlationStrength ===
          "CONTEXTUAL"
      ).length,

    knownGoodBaselineAvailable:
      comparison.comparable,

    rootStateDifferentFromKnownGood:
      comparison.comparable &&
      comparison
        .materialDifferences
        .length >
        0,
  };
}


/*
 * ============================================================================
 * RATIONALE
 * ============================================================================
 */

function buildGraphRationale({
  precededIncident,
  directlyTouchesRoot,
  proximity,
  hasEvidence,
}) {
  const reasons = [];


  if (
    precededIncident
  ) {
    reasons.push(
      "change occurred before or at incident onset"
    );
  }
  else {
    reasons.push(
      "change occurred after incident onset"
    );
  }


  if (
    directlyTouchesRoot
  ) {
    reasons.push(
      "relationship directly involves the root Resource"
    );
  }


  if (
    proximity >=
    0.75
  ) {
    reasons.push(
      "change is temporally close to incident onset"
    );
  }


  if (
    hasEvidence
  ) {
    reasons.push(
      "change includes recorded provenance/evidence"
    );
  }


  return reasons.join(
    "; "
  );
}


/*
 * ============================================================================
 * VALIDATION
 * ============================================================================
 */

function requireInput(
  input = {}
) {
  if (
    !input.organizationId ||
    !input.environmentId
  ) {
    throw correlationError(
      "Change correlation requires organizationId and environmentId",
      "CHANGE_CORRELATION_SCOPE_REQUIRED"
    );
  }


  if (
    !input.incidentId
  ) {
    throw correlationError(
      "Change correlation requires incidentId",
      "CHANGE_CORRELATION_INCIDENT_ID_REQUIRED"
    );
  }


  if (
    !input.resourceId
  ) {
    throw correlationError(
      "Change correlation requires root resourceId",
      "CHANGE_CORRELATION_RESOURCE_ID_REQUIRED"
    );
  }
}


function normalizeCorrelationWindow(
  value
) {
  if (
    value === undefined ||
    value === null
  ) {
    return DEFAULT_CORRELATION_WINDOW_MS;
  }


  const parsed =
    Number(
      value
    );


  if (
    !Number.isFinite(
      parsed
    ) ||
    parsed <=
      0
  ) {
    throw correlationError(
      "correlationWindowMs must be greater than zero",
      "CHANGE_CORRELATION_WINDOW_INVALID"
    );
  }


  return Math.min(
    parsed,

    24 *
      60 *
      60 *
      1000
  );
}


function validDate(
  value
) {
  const date =
    value instanceof Date
      ? value
      : new Date(
          value
        );


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    throw correlationError(
      "Change correlation encountered invalid timestamp",
      "CHANGE_CORRELATION_TIMESTAMP_INVALID"
    );
  }


  return date;
}


function isNonEmptyObject(
  value
) {
  return (
    value &&
    typeof value ===
      "object" &&
    !Array.isArray(
      value
    ) &&
    Object.keys(
      value
    ).length >
      0
  );
}


function round(
  value
) {
  return Number(
    Number(
      value
    ).toFixed(
      4
    )
  );
}


function correlationError(
  message,
  code
) {
  return Object.assign(
    new Error(
      message
    ),
    {
      code,

      causalityEstablished:
        false,

      executionAuthorized:
        false,
    }
  );
}


module.exports =
  ChangeCorrelationService;