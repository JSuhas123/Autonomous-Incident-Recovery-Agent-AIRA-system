"use strict";

const TemporalTopologyQueryService =
  require(
    "./TemporalTopologyQueryService"
  );

const IncidentTopologyReconstructionService =
  require(
    "./IncidentTopologyReconstructionService"
  );

const KnownGoodComparisonService =
  require(
    "./KnownGoodComparisonService"
  );

const ChangeCorrelationService =
  require(
    "./ChangeCorrelationService"
  );


/*
 * ============================================================================
 * AGENT RESOURCE CONTEXT SERVICE
 * ============================================================================
 *
 * Phase 17.13
 *
 * Purpose:
 *
 * Assemble Resource Graph evidence into one stable read-only context object
 * that can later be consumed by AIRA agents.
 *
 * Context contains:
 *
 *   - current Resource identity
 *   - current ResourceState
 *   - incident-time ResourceState
 *   - evidence-backed Known-Good ResourceState
 *   - state differences
 *   - current topology
 *   - incident-time topology
 *   - pre/post incident topology
 *   - recent topology changes
 *   - dependency context
 *   - ranked change-correlation candidates
 *
 * IMPORTANT:
 *
 * This service provides evidence only.
 *
 * It does NOT:
 *
 *   - authorize execution
 *   - bypass policy
 *   - choose a recovery action
 *   - execute infrastructure operations
 *   - promote Known-Good state
 *   - assert root cause
 * ============================================================================
 */

class AgentResourceContextService {
  constructor(
    options = {}
  ) {
    this.temporalTopology =
      options.temporalTopology ||
      new TemporalTopologyQueryService(
        options
      );


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


    this.changeCorrelation =
      options.changeCorrelation ||
      new ChangeCorrelationService(
        options
      );
  }


  /*
   * ==========================================================================
   * BUILD FULL INCIDENT RESOURCE CONTEXT
   * ==========================================================================
   */

  async buildIncidentContext(
    input = {},
    transaction = null
  ) {
    requireScope(
      input
    );

    requireIncidentId(
      input.incidentId
    );

    requireResourceId(
      input.resourceId
    );


    const asOf =
      normalizeTimestamp(
        input.asOf ||
        new Date()
      );


    const depth =
      normalizeDepth(
        input.depth
      );


    /*
     * ------------------------------------------------------------------------
     * INCIDENT HISTORICAL RECONSTRUCTION
     * ------------------------------------------------------------------------
     */

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

            depth,

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


    /*
     * ------------------------------------------------------------------------
     * CURRENT TOPOLOGY
     * ------------------------------------------------------------------------
     *
     * "Current" means current relative to context generation time/asOf.
     *
     * This keeps historical agent replay deterministic when caller supplies
     * an explicit asOf timestamp.
     */

    const currentTopology =
      await this.temporalTopology
        .getTopologyAtTime(
          {
            organizationId:
              input.organizationId,

            environmentId:
              input.environmentId,

            resourceId:
              input.resourceId,

            at:
              asOf,

            depth,

            direction:
              input.direction ||
              "BOTH",

            relationshipTypes:
              input.relationshipTypes ||
              [],
          },

          transaction
        );


    /*
     * ------------------------------------------------------------------------
     * KNOWN-GOOD COMPARISON AT INCIDENT TIME
     * ------------------------------------------------------------------------
     */

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


    /*
     * ------------------------------------------------------------------------
     * CHANGE CORRELATION
     * ------------------------------------------------------------------------
     */

    const correlation =
      await this.changeCorrelation
        .correlateIncident(
          {
            organizationId:
              input.organizationId,

            environmentId:
              input.environmentId,

            incidentId:
              input.incidentId,

            resourceId:
              input.resourceId,

            depth,

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

            correlationWindowMs:
              input.correlationWindowMs,

            changeLimit:
              input.changeLimit ||
              1000,
          },

          transaction
        );


    const currentState =
      findResourceState(
        currentTopology,
        input.resourceId
      );


    const incidentState =
      findResourceState(
        reconstruction
          .snapshots
          .atIncident,

        input.resourceId
      );


    const preIncidentState =
      findResourceState(
        reconstruction
          .snapshots
          .preIncident,

        input.resourceId
      );


    const postIncidentState =
      findResourceState(
        reconstruction
          .snapshots
          .postIncident,

        input.resourceId
      );


    const resource =
      findResource(
        currentTopology,
        input.resourceId
      ) ||
      findResource(
        reconstruction
          .snapshots
          .atIncident,

        input.resourceId
      );


    const currentDependencies =
      buildDependencyContext(
        currentTopology,
        input.resourceId
      );


    const incidentDependencies =
      buildDependencyContext(
        reconstruction
          .snapshots
          .atIncident,

        input.resourceId
      );


    const preIncidentDependencies =
      buildDependencyContext(
        reconstruction
          .snapshots
          .preIncident,

        input.resourceId
      );


    /*
     * ------------------------------------------------------------------------
     * AGENT-SAFE EVIDENCE PACKAGE
     * ------------------------------------------------------------------------
     */

    return {
      contextVersion:
        "phase17.13.v1",

      generatedAt:
        new Date(),

      asOf,

      organizationId:
        input.organizationId,

      environmentId:
        input.environmentId,

      incidentId:
        input.incidentId,

      rootResourceId:
        input.resourceId,

      resource,

      incident:
        reconstruction.incident,

      timeline:
        reconstruction.timeline,


      /*
       * ======================================================================
       * RESOURCE STATE
       * ======================================================================
       */

      state: {
        current:
          currentState,

        preIncident:
          preIncidentState,

        incident:
          incidentState,

        postIncident:
          postIncidentState,

        knownGood:
          comparison
            .knownGoodState,

        knownGoodDesignation:
          comparison
            .knownGood,
      },


      /*
       * ======================================================================
       * STATE DELTA
       * ======================================================================
       */

      stateDelta: {
        comparable:
          comparison.comparable,

        comparisonStatus:
          comparison
            .comparisonStatus,

        identical:
          comparison.identical,

        differences:
          comparison.differences ||
          [],

        materialDifferences:
          comparison
            .materialDifferences ||
          [],

        summary:
          comparison.summary ||
          {},
      },


      /*
       * ======================================================================
       * TOPOLOGY
       * ======================================================================
       */

      topology: {
        current:
          currentTopology,

        preIncident:
          reconstruction
            .snapshots
            .preIncident,

        incident:
          reconstruction
            .snapshots
            .atIncident,

        postIncident:
          reconstruction
            .snapshots
            .postIncident,
      },


      /*
       * ======================================================================
       * DEPENDENCY CONTEXT
       * ======================================================================
       */

      dependencies: {
        current:
          currentDependencies,

        preIncident:
          preIncidentDependencies,

        incident:
          incidentDependencies,

        topologyChanged:
          dependencyContextChanged(
            preIncidentDependencies,
            incidentDependencies
          ),
      },


      /*
       * ======================================================================
       * TEMPORAL GRAPH CHANGES
       * ======================================================================
       */

      recentChanges:
        reconstruction.changes ||
        [],


      /*
       * ======================================================================
       * CORRELATION EVIDENCE
       * ======================================================================
       */

      correlation: {
        candidates:
          correlation.candidates ||
          [],

        strongestCandidate:
          correlation
            .strongestCandidate ||
          null,

        summary:
          correlation.summary ||
          {},

        causalityEstablished:
          false,
      },


      /*
       * ======================================================================
       * AGENT SUMMARY
       * ======================================================================
       */

      summary:
  buildContextSummary({
    currentState,

    incidentState,

    comparison,

    reconstruction,

    correlation,

    currentDependencies,

    preIncidentDependencies,

    incidentDependencies,
  }),


      /*
       * ======================================================================
       * SAFETY BOUNDARY
       * ======================================================================
       */

      evidenceOnly:
        true,

      causalityEstablished:
        false,

      executionAuthorized:
        false,
    };
  }


  /*
   * ==========================================================================
   * BUILD RESOURCE CONTEXT WITHOUT INCIDENT
   * ==========================================================================
   *
   * Useful later for proactive agents / inventory inspection.
   * ==========================================================================
   */

  async buildCurrentContext(
    input = {},
    transaction = null
  ) {
    requireScope(
      input
    );

    requireResourceId(
      input.resourceId
    );


    const asOf =
      normalizeTimestamp(
        input.asOf ||
        new Date()
      );


    const topology =
      await this.temporalTopology
        .getTopologyAtTime(
          {
            organizationId:
              input.organizationId,

            environmentId:
              input.environmentId,

            resourceId:
              input.resourceId,

            at:
              asOf,

            depth:
              normalizeDepth(
                input.depth
              ),

            direction:
              input.direction ||
              "BOTH",

            relationshipTypes:
              input.relationshipTypes ||
              [],
          },

          transaction
        );


    return {
      contextVersion:
        "phase17.13.v1",

      generatedAt:
        new Date(),

      asOf,

      organizationId:
        input.organizationId,

      environmentId:
        input.environmentId,

      rootResourceId:
        input.resourceId,

      resource:
        findResource(
          topology,
          input.resourceId
        ),

      state:
        findResourceState(
          topology,
          input.resourceId
        ),

      topology,

      dependencies:
        buildDependencyContext(
          topology,
          input.resourceId
        ),

      evidenceOnly:
        true,

      causalityEstablished:
        false,

      executionAuthorized:
        false,
    };
  }
}


/*
 * ============================================================================
 * RESOURCE / STATE LOOKUP
 * ============================================================================
 */

function findResource(
  topology,
  resourceId
) {
  return (
    topology
      ?.resources
      ?.find(
        (resource) =>
          resource.id ===
          resourceId
      ) ||
    null
  );
}


function findResourceState(
  topology,
  resourceId
) {
  return (
    topology
      ?.states
      ?.find(
        (state) =>
          state.resourceId ===
          resourceId
      ) ||
    null
  );
}


/*
 * ============================================================================
 * DEPENDENCY CONTEXT
 * ============================================================================
 */

function buildDependencyContext(
  topology,
  rootResourceId
) {
  const outgoing = [];

  const incoming = [];


  const resources =
    new Map(
      (
        topology
          ?.resources ||
        []
      ).map(
        (resource) => [
          resource.id,
          resource,
        ]
      )
    );


  for (
    const relationship
    of (
      topology
        ?.relationships ||
      []
    )
  ) {
    if (
      relationship
        .sourceResourceId ===
      rootResourceId
    ) {
      outgoing.push({
        relationshipId:
          relationship.id,

        relationshipType:
          relationship
            .relationshipType,

        resourceId:
          relationship
            .targetResourceId,

        resource:
          resources.get(
            relationship
              .targetResourceId
          ) ||
          null,

        relationship,
      });
    }


    if (
      relationship
        .targetResourceId ===
      rootResourceId
    ) {
      incoming.push({
        relationshipId:
          relationship.id,

        relationshipType:
          relationship
            .relationshipType,

        resourceId:
          relationship
            .sourceResourceId,

        resource:
          resources.get(
            relationship
              .sourceResourceId
          ) ||
          null,

        relationship,
      });
    }
  }


  return {
    outgoing,
    incoming,

    counts: {
      outgoing:
        outgoing.length,

      incoming:
        incoming.length,

      total:
        outgoing.length +
        incoming.length,
    },
  };
}


function dependencyContextChanged(
  before,
  after
) {
  const beforeIds =
    dependencyIdentitySet(
      before
    );


  const afterIds =
    dependencyIdentitySet(
      after
    );


  if (
    beforeIds.size !==
    afterIds.size
  ) {
    return true;
  }


  for (
    const identity
    of beforeIds
  ) {
    if (
      !afterIds.has(
        identity
      )
    ) {
      return true;
    }
  }


  return false;
}


function dependencyIdentitySet(
  context
) {
  const values =
    new Set();


  for (
    const dependency
    of (
      context?.outgoing ||
      []
    )
  ) {
    values.add(
      [
        "OUT",
        dependency.relationshipType,
        dependency.resourceId,
      ].join(
        ":"
      )
    );
  }


  for (
    const dependency
    of (
      context?.incoming ||
      []
    )
  ) {
    values.add(
      [
        "IN",
        dependency.relationshipType,
        dependency.resourceId,
      ].join(
        ":"
      )
    );
  }


  return values;
}


/*
 * ============================================================================
 * AGENT SUMMARY
 * ============================================================================
 */

function buildContextSummary({
  currentState,
  incidentState,
  comparison,
  reconstruction,
  correlation,
  currentDependencies,
  preIncidentDependencies,
  incidentDependencies,
}) {
  return {
    currentHealth:
      currentState
        ?.health ||
      null,

    incidentHealth:
      incidentState
        ?.health ||
      null,

    knownGoodAvailable:
      Boolean(
        comparison
          ?.comparable
      ),

    knownGoodDifferent:
      Boolean(
        comparison
          ?.comparable &&
        (
          comparison
            .materialDifferences ||
          []
        ).length >
          0
      ),

    materialStateDifferenceCount:
      (
        comparison
          ?.materialDifferences ||
        []
      ).length,

    graphChangeCount:
      (
        reconstruction
          ?.changes ||
        []
      ).length,

    correlationCandidateCount:
      (
        correlation
          ?.candidates ||
        []
      ).length,

    strongestCorrelation:
      correlation
        ?.strongestCandidate
        ?.correlationStrength ||
      null,

    currentDependencyCount:
      currentDependencies
        ?.counts
        ?.total ||
      0,

    incidentDependencyCount:
      incidentDependencies
        ?.counts
        ?.total ||
      0,

    dependencyTopologyChanged:
      dependencyContextChanged(
        preIncidentDependencies,
        incidentDependencies
      ),
  };
}




/*
 * ============================================================================
 * VALIDATION
 * ============================================================================
 */

function requireScope(
  input = {}
) {
  if (
    !input.organizationId ||
    !input.environmentId
  ) {
    throw contextError(
      "Agent Resource Context requires organizationId and environmentId",
      "AGENT_RESOURCE_CONTEXT_SCOPE_REQUIRED"
    );
  }
}


function requireIncidentId(
  value
) {
  if (
    !value
  ) {
    throw contextError(
      "Incident Agent Resource Context requires incidentId",
      "AGENT_RESOURCE_CONTEXT_INCIDENT_ID_REQUIRED"
    );
  }
}


function requireResourceId(
  value
) {
  if (
    !value
  ) {
    throw contextError(
      "Agent Resource Context requires resourceId",
      "AGENT_RESOURCE_CONTEXT_RESOURCE_ID_REQUIRED"
    );
  }
}


function normalizeTimestamp(
  value
) {
  const timestamp =
    value instanceof Date
      ? value
      : new Date(
          value
        );


  if (
    Number.isNaN(
      timestamp.getTime()
    )
  ) {
    throw contextError(
      "Agent Resource Context timestamp is invalid",
      "AGENT_RESOURCE_CONTEXT_TIMESTAMP_INVALID"
    );
  }


  return timestamp;
}


function normalizeDepth(
  value
) {
  if (
    value ===
      undefined ||
    value ===
      null
  ) {
    return 2;
  }


  const parsed =
    Number.parseInt(
      value,
      10
    );


  if (
    !Number.isFinite(
      parsed
    ) ||
    parsed <
      0
  ) {
    throw contextError(
      "Agent Resource Context depth must be a non-negative integer",
      "AGENT_RESOURCE_CONTEXT_DEPTH_INVALID"
    );
  }


  return Math.min(
    parsed,
    5
  );
}


function contextError(
  message,
  code
) {
  return Object.assign(
    new Error(
      message
    ),
    {
      code,

      evidenceOnly:
        true,

      causalityEstablished:
        false,

      executionAuthorized:
        false,
    }
  );
}


module.exports =
  AgentResourceContextService;