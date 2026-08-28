"use strict";

const crypto =
  require(
    "node:crypto"
  );

const AgentResourceContextService =
  require(
    "../../topology/AgentResourceContextService"
  );

const {
  stableStringify,
} =
  require(
    "../../topology/normalization/CanonicalFingerprint"
  );


/*
 * ============================================================================
 * RESOURCE GRAPH -> SYSTEM DNA CONTRIBUTOR
 * ============================================================================
 *
 * Phase 17.14
 *
 * Resource Graph remains canonical topology truth.
 *
 * System DNA receives only a DERIVED evidence projection.
 *
 * This contributor:
 *
 *   - never writes Resource Graph data
 *   - never changes known-good state
 *   - never authorizes execution
 *   - never changes policy
 *   - never converts correlation into causation
 *
 * Currently the integration is intentionally RESOURCE scoped.
 *
 * Future environment/service DNA may aggregate multiple Resource projections,
 * but that must not be guessed here.
 * ============================================================================
 */

class ResourceGraphSystemDnaContributor {
  constructor(
    options = {}
  ) {
    this.resourceContext =
      options.resourceContext ||
      new AgentResourceContextService(
        options
      );
  }


  async contribute({
    input = {},
    built = null,
  } = {}) {
    const scopeType =
      String(
        built
          ?.dna
          ?.scopeType ||
        input.scopeType ||
        ""
      )
        .trim()
        .toUpperCase();


    /*
     * Phase 17.14 integrates concrete Resource identity.
     *
     * TENANT / ENVIRONMENT / SERVICE DNA remains purely Phase 16 for now.
     */
    if (
      scopeType !==
      "RESOURCE"
    ) {
      return null;
    }


    const organizationId =
      input.organizationId;


    const environmentId =
      input.environmentId;


    const resourceId =
      input.resourceId;


    if (
      !organizationId ||
      !environmentId ||
      !resourceId
    ) {
      return null;
    }


    const asOf =
      normalizeDate(
        input.asOf ||
        new Date()
      );


    let context;


    /*
     * If an incident is supplied, include the richer incident-aware
     * Resource Context.
     *
     * Otherwise build deterministic current topology/state context.
     */
    if (
      input.incidentId
    ) {
      context =
        await this.resourceContext
          .buildIncidentContext({
            organizationId,

            environmentId,

            incidentId:
              input.incidentId,

            resourceId,

            asOf,

            depth:
              input.resourceGraphDepth ??
              2,

            direction:
              input.resourceGraphDirection ||
              "BOTH",

            relationshipTypes:
              input.resourceGraphRelationshipTypes ||
              [],

            preWindowMs:
              input.preWindowMs,

            postWindowMs:
              input.postWindowMs,

            correlationWindowMs:
              input.correlationWindowMs,
          });
    }
    else {
      context =
        await this.resourceContext
          .buildCurrentContext({
            organizationId,

            environmentId,

            resourceId,

            asOf,

            depth:
              input.resourceGraphDepth ??
              2,

            direction:
              input.resourceGraphDirection ||
              "BOTH",

            relationshipTypes:
              input.resourceGraphRelationshipTypes ||
              [],
          });
    }


    const projection =
      input.incidentId
        ? buildIncidentProjection(
            context
          )
        : buildCurrentProjection(
            context
          );


    const fingerprint =
      createFingerprint(
        projection
      );


    return {
      contributor:
        "RESOURCE_GRAPH",

      version:
        "17.14.v1",

      fingerprint,

      evidence: {
        authority:
          "RESOURCE_GRAPH",

        authorityType:
          "STRUCTURAL_TEMPORAL_INFRASTRUCTURE",

        canonicalStore:
          "postgresql",

        scopeType:
          "RESOURCE",

        resourceId,

        environmentId,

        incidentId:
          input.incidentId ||
          null,

        asOf,

        projection,
      },

      traits:
        buildTraits(
          context,
          Boolean(
            input.incidentId
          )
        ),

      metadata: {
        resourceGraphEvidence:
          true,

        resourceGraphFingerprint:
          fingerprint,

        resourceGraphVersion:
          "17.14.v1",

        incidentAware:
          Boolean(
            input.incidentId
          ),

        executionAuthorized:
          false,

        causalityEstablished:
          false,
      },

      safety: {
        evidenceOnly:
          true,

        executionAuthorized:
          false,

        grantsExecutionPermission:
          false,

        bypassesPolicy:
          false,
      },
    };
  }
}


/*
 * ============================================================================
 * CURRENT RESOURCE PROJECTION
 * ============================================================================
 */

function buildCurrentProjection(
  context
) {
  return {
    resource:
      projectResource(
        context.resource
      ),

    state:
      projectState(
        context.state
      ),

    dependencies:
      projectDependencies(
        context.dependencies
      ),

    topology:
      projectTopology(
        context.topology
      ),
  };
}


/*
 * ============================================================================
 * INCIDENT-AWARE RESOURCE PROJECTION
 * ============================================================================
 */

function buildIncidentProjection(
  context
) {
  return {
    resource:
      projectResource(
        context.resource
      ),

    incident: {
      id:
        context
          ?.incident
          ?.id ||
        null,

      publicId:
        context
          ?.incident
          ?.publicId ||
        null,

      severity:
        context
          ?.incident
          ?.severity ||
        null,

      status:
        context
          ?.incident
          ?.status ||
        null,
    },

    state: {
      current:
        projectState(
          context
            ?.state
            ?.current
        ),

      preIncident:
        projectState(
          context
            ?.state
            ?.preIncident
        ),

      incident:
        projectState(
          context
            ?.state
            ?.incident
        ),

      postIncident:
        projectState(
          context
            ?.state
            ?.postIncident
        ),

      knownGood:
        projectState(
          context
            ?.state
            ?.knownGood
        ),
    },

    stateDelta:
      projectStateDelta(
        context.stateDelta
      ),

    dependencies: {
      current:
        projectDependencies(
          context
            ?.dependencies
            ?.current
        ),

      preIncident:
        projectDependencies(
          context
            ?.dependencies
            ?.preIncident
        ),

      incident:
        projectDependencies(
          context
            ?.dependencies
            ?.incident
        ),

      topologyChanged:
        Boolean(
          context
            ?.dependencies
            ?.topologyChanged
        ),
    },

    changes:
      projectChanges(
        context.recentChanges
      ),

    correlation:
      projectCorrelation(
        context.correlation
      ),
  };
}


/*
 * ============================================================================
 * RESOURCE
 * ============================================================================
 */

function projectResource(
  resource
) {
  if (
    !resource
  ) {
    return null;
  }


  return {
    id:
      resource.id,

    publicId:
      resource.publicId ||
      null,

    provider:
      resource.provider ||
      null,

    resourceType:
      resource.resourceType ||
      null,

    externalId:
      resource.externalId ||
      null,

    name:
      resource.name ||
      null,

    namespace:
      resource.namespace ||
      null,

    region:
      resource.region ||
      null,

    zone:
      resource.zone ||
      null,
  };
}


/*
 * ============================================================================
 * STATE
 * ============================================================================
 */

function projectState(
  state
) {
  if (
    !state
  ) {
    return null;
  }


  return {
    id:
      state.id,

    publicId:
      state.publicId ||
      null,

    observedAt:
      normalizeNullableDate(
        state.observedAt
      ),

    health:
      state.health ||
      null,

    lifecycle:
      state.lifecycle ||
      null,

    version:
      state.version ||
      null,

    fingerprint:
      state.fingerprint ||
      null,
  };
}


/*
 * ============================================================================
 * STATE DELTA
 * ============================================================================
 */

function projectStateDelta(
  delta
) {
  if (
    !delta
  ) {
    return null;
  }


  return {
    comparable:
      Boolean(
        delta.comparable
      ),

    comparisonStatus:
      delta.comparisonStatus ||
      null,

    materialDifferences:
      (
        delta.materialDifferences ||
        []
      )
        .map(
          (difference) => ({
            category:
              difference.category,

            path:
              difference.path,

            before:
              difference.before,

            after:
              difference.after,
          })
        )
        .sort(
          compareDifference
        ),
  };
}


function compareDifference(
  left,
  right
) {
  return (
    `${left.category}:${left.path}`
      .localeCompare(
        `${right.category}:${right.path}`
      )
  );
}


/*
 * ============================================================================
 * DEPENDENCIES
 * ============================================================================
 */

function projectDependencies(
  dependencies
) {
  if (
    !dependencies
  ) {
    return {
      outgoing: [],
      incoming: [],
    };
  }


  return {
    outgoing:
      (
        dependencies.outgoing ||
        []
      )
        .map(
          projectDependency
        )
        .sort(
          compareDependency
        ),

    incoming:
      (
        dependencies.incoming ||
        []
      )
        .map(
          projectDependency
        )
        .sort(
          compareDependency
        ),
  };
}


function projectDependency(
  dependency
) {
  return {
    relationshipId:
      dependency.relationshipId,

    relationshipType:
      dependency.relationshipType,

    resourceId:
      dependency.resourceId,
  };
}


function compareDependency(
  left,
  right
) {
  return (
    [
      left.relationshipType,
      left.resourceId,
      left.relationshipId,
    ]
      .join(
        ":"
      )
      .localeCompare(
        [
          right.relationshipType,
          right.resourceId,
          right.relationshipId,
        ].join(
          ":"
        )
      )
  );
}


/*
 * ============================================================================
 * TOPOLOGY
 * ============================================================================
 */

function projectTopology(
  topology
) {
  return {
    resourceCount:
      topology
        ?.resources
        ?.length ||
      0,

    relationshipCount:
      topology
        ?.relationships
        ?.length ||
      0,
  };
}


/*
 * ============================================================================
 * CHANGES
 * ============================================================================
 */

function projectChanges(
  changes
) {
  return (
    changes ||
    []
  )
    .map(
      (change) => ({
        id:
          change.id,

        relationshipId:
          change.relationshipId ||
          null,

        resourceId:
          change.resourceId ||
          null,

        changeType:
          change.changeType,

        changedAt:
          normalizeNullableDate(
            change.changedAt
          ),
      })
    )
    .sort(
      (
        left,
        right
      ) =>
        String(
          left.changedAt
        ).localeCompare(
          String(
            right.changedAt
          )
        ) ||
        String(
          left.id
        ).localeCompare(
          String(
            right.id
          )
        )
    );
}


/*
 * ============================================================================
 * CORRELATION
 * ============================================================================
 */

function projectCorrelation(
  correlation
) {
  return {
    strongestCandidate:
      correlation
        ?.strongestCandidate
        ? {
            candidateType:
              correlation
                .strongestCandidate
                .candidateType,

            changeId:
              correlation
                .strongestCandidate
                .changeId ||
              null,

            category:
              correlation
                .strongestCandidate
                .category ||
              null,

            correlationStrength:
              correlation
                .strongestCandidate
                .correlationStrength ||
              null,

            score:
              correlation
                .strongestCandidate
                .score ??
              null,
          }
        : null,

    candidateCount:
      correlation
        ?.candidates
        ?.length ||
      0,

    causalityEstablished:
      false,
  };
}


/*
 * ============================================================================
 * SYSTEM DNA TRAITS
 * ============================================================================
 */

function buildTraits(
  context,
  incidentAware
) {
  const traits = [
    {
      trait:
        "RESOURCE_GRAPH_EVIDENCE_AVAILABLE",

      source:
        "RESOURCE_GRAPH",

      evidenceOnly:
        true,
    },
  ];


  if (
    context
      ?.state
      ?.health &&
    !incidentAware
  ) {
    traits.push({
      trait:
        "RESOURCE_CURRENT_HEALTH",

      value:
        context.state.health,

      source:
        "RESOURCE_GRAPH",

      evidenceOnly:
        true,
    });
  }


  if (
    incidentAware
  ) {
    if (
      context
        ?.dependencies
        ?.topologyChanged
    ) {
      traits.push({
        trait:
          "TOPOLOGY_CHANGED_AROUND_INCIDENT",

        source:
          "RESOURCE_GRAPH",

        evidenceOnly:
          true,
      });
    }


    if (
      context
        ?.stateDelta
        ?.comparable &&
      (
        context
          ?.stateDelta
          ?.materialDifferences ||
        []
      ).length >
        0
    ) {
      traits.push({
        trait:
          "INCIDENT_STATE_DIFFERS_FROM_KNOWN_GOOD",

        source:
          "RESOURCE_GRAPH",

        evidenceCount:
          context
            .stateDelta
            .materialDifferences
            .length,

        evidenceOnly:
          true,
      });
    }


    if (
      context
        ?.correlation
        ?.strongestCandidate
    ) {
      traits.push({
        trait:
          "INCIDENT_CHANGE_CORRELATION_AVAILABLE",

        strength:
          context
            .correlation
            .strongestCandidate
            .correlationStrength ||
          null,

        source:
          "RESOURCE_GRAPH",

        causalityEstablished:
          false,

        evidenceOnly:
          true,
      });
    }
  }


  return traits;
}


/*
 * ============================================================================
 * FINGERPRINT
 * ============================================================================
 */

function createFingerprint(
  projection
) {
  return crypto
    .createHash(
      "sha256"
    )
    .update(
      stableStringify(
        projection
      )
    )
    .digest(
      "hex"
    );
}


function normalizeDate(
  value
) {
  const parsed =
    value instanceof Date
      ? value
      : new Date(
          value
        );


  if (
    Number.isNaN(
      parsed.getTime()
    )
  ) {
    const error =
      new Error(
        "Resource Graph System DNA timestamp is invalid"
      );

    error.code =
      "RESOURCE_GRAPH_DNA_TIMESTAMP_INVALID";

    error.executionAuthorized =
      false;

    throw error;
  }


  return parsed;
}


function normalizeNullableDate(
  value
) {
  if (
    !value
  ) {
    return null;
  }


  const parsed =
    value instanceof Date
      ? value
      : new Date(
          value
        );


  return Number.isNaN(
    parsed.getTime()
  )
    ? null
    : parsed.toISOString();
}


module.exports =
  ResourceGraphSystemDnaContributor;