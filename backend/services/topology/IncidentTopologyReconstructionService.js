
"use strict";

const PostgresIncidentTopologyRepository =
  require(
    "../../persistence/postgres/PostgresIncidentTopologyRepository"
  );

const TemporalTopologyQueryService =
  require(
    "./TemporalTopologyQueryService"
  );


const DEFAULT_PRE_WINDOW_MS =
  5 *
  60 *
  1000;

const DEFAULT_POST_WINDOW_MS =
  5 *
  60 *
  1000;


/*
 * ============================================================================
 * INCIDENT TOPOLOGY RECONSTRUCTION SERVICE
 * ============================================================================
 *
 * Phase 17.10
 *
 * Reconstructs:
 *
 *   PRE-INCIDENT
 *   AT-INCIDENT
 *   POST-INCIDENT
 *
 * topology around one explicitly identified root Resource.
 *
 * Root Resource is required intentionally.
 *
 * An Incident may identify only service_id or correlation information and
 * therefore may not map uniquely to one Resource UUID.
 *
 * We do NOT silently guess that mapping.
 *
 * Later Phase 17.13 Agent Resource Context can compose richer Resource
 * resolution.
 * ============================================================================
 */

class IncidentTopologyReconstructionService {
  constructor(
    options = {}
  ) {
    this.incidentRepository =
      options.incidentRepository ||
      new PostgresIncidentTopologyRepository(
        options
      );


    this.temporalTopology =
      options.temporalTopology ||
      new TemporalTopologyQueryService(
        options
      );
  }


  /*
   * ==========================================================================
   * COMPLETE INCIDENT RECONSTRUCTION
   * ==========================================================================
   */

  async reconstruct(
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


    const incident =
      await this.incidentRepository
        .getIncident(
          {
            organizationId:
              input.organizationId,

            environmentId:
              input.environmentId,

            incidentId:
              input.incidentId,
          },

          transaction
        );


    if (
      !incident
    ) {
      throw serviceError(
        "Incident was not found inside the requested scope",
        "INCIDENT_TOPOLOGY_INCIDENT_NOT_FOUND"
      );
    }


    /*
     * Canonical incident anchor.
     *
     * Preference:
     *
     *   started_at
     *   detected_at
     *   first_detected_at
     *   created_at
     *
     * started_at is preferred because it most closely represents
     * when the incident condition actually began.
     */
    const incidentAt =
      resolveIncidentAnchor(
        incident
      );


    const preWindowMs =
      normalizeWindow(
        input.preWindowMs,
        DEFAULT_PRE_WINDOW_MS,
        "preWindowMs"
      );


    const postWindowMs =
      normalizeWindow(
        input.postWindowMs,
        DEFAULT_POST_WINDOW_MS,
        "postWindowMs"
      );


    const preIncidentAt =
      new Date(
        incidentAt.getTime() -
        preWindowMs
      );


    /*
     * Prefer actual lifecycle completion when available.
     *
     * Otherwise inspect a configurable period after incident start.
     */
    const postIncidentAt =
      resolvePostIncidentTime(
        incident,
        incidentAt,
        postWindowMs
      );


    const depth =
      input.depth ===
        undefined
        ? 2
        : input.depth;


    const topologyInput = {
      organizationId:
        input.organizationId,

      environmentId:
        input.environmentId,

      resourceId:
        input.resourceId,

      depth,

      direction:
        input.direction ||
        "BOTH",

      relationshipTypes:
        input.relationshipTypes ||
        [],
    };


    const [
      preIncident,
      atIncident,
      postIncident,
      changes,
    ] =
      await Promise.all([
        this.temporalTopology
          .getTopologyAtTime(
            {
              ...topologyInput,

              at:
                preIncidentAt,
            },

            transaction
          ),

        this.temporalTopology
          .getTopologyAtTime(
            {
              ...topologyInput,

              at:
                incidentAt,
            },

            transaction
          ),

        this.temporalTopology
          .getTopologyAtTime(
            {
              ...topologyInput,

              at:
                postIncidentAt,
            },

            transaction
          ),

        this.temporalTopology
          .getChangesBetween(
            {
              organizationId:
                input.organizationId,

              environmentId:
                input.environmentId,

              from:
                preIncidentAt,

              to:
                postIncidentAt,

              limit:
                input.changeLimit ||
                1000,
            },

            transaction
          ),
      ]);


    /*
     * Root Resource must exist in the temporal graph.
     *
     * This also prevents an arbitrary Resource ID from being attached
     * to an otherwise valid incident reconstruction.
     */
    if (
      !atIncident ||
      !Array.isArray(
        atIncident.resources
      ) ||
      !atIncident.resources.some(
        (resource) =>
          resource.id ===
          input.resourceId
      )
    ) {
      throw serviceError(
        "Root Resource was not found inside the incident tenant/environment",
        "INCIDENT_TOPOLOGY_RESOURCE_NOT_FOUND"
      );
    }


    return {
      incident,

      rootResourceId:
        input.resourceId,

      timeline: {
        preIncidentAt,

        incidentAt,

        postIncidentAt,

        preWindowMs,

        postWindowMs,
      },

      snapshots: {
        preIncident,

        atIncident,

        postIncident,
      },

      changes,

      summary:
        buildSummary({
          preIncident,
          atIncident,
          postIncident,
          changes,
        }),

      executionAuthorized:
        false,
    };
  }


  /*
   * ==========================================================================
   * LIGHTWEIGHT INCIDENT-AT-TIME CONTEXT
   *
   * Useful when caller only needs the actual incident moment.
   * ==========================================================================
   */

  async reconstructAtIncident(
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


    const incident =
      await this.incidentRepository
        .getIncident(
          {
            organizationId:
              input.organizationId,

            environmentId:
              input.environmentId,

            incidentId:
              input.incidentId,
          },

          transaction
        );


    if (
      !incident
    ) {
      throw serviceError(
        "Incident was not found inside the requested scope",
        "INCIDENT_TOPOLOGY_INCIDENT_NOT_FOUND"
      );
    }


    const incidentAt =
      resolveIncidentAnchor(
        incident
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
              incidentAt,

            depth:
              input.depth ??
              2,

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
      incident,

      incidentAt,

      topology,

      executionAuthorized:
        false,
    };
  }
}


/*
 * ============================================================================
 * TIMELINE
 * ============================================================================
 */

function resolveIncidentAnchor(
  incident
) {
  const candidates = [
    incident.startedAt,
    incident.detectedAt,
    incident.firstDetectedAt,
    incident.createdAt,
  ];


  for (
    const candidate
    of candidates
  ) {
    if (
      !candidate
    ) {
      continue;
    }


    const parsed =
      new Date(
        candidate
      );


    if (
      !Number.isNaN(
        parsed.getTime()
      )
    ) {
      return parsed;
    }
  }


  throw serviceError(
    "Incident does not contain a valid temporal anchor",
    "INCIDENT_TOPOLOGY_TIME_UNAVAILABLE"
  );
}


function resolvePostIncidentTime(
  incident,
  incidentAt,
  postWindowMs
) {
  /*
   * Closed/resolved timestamp is stronger historical evidence
   * than an arbitrary post-window offset.
   */
  const lifecycleCandidates = [
    incident.closedAt,
    incident.resolvedAt,
  ];


  for (
    const candidate
    of lifecycleCandidates
  ) {
    if (
      !candidate
    ) {
      continue;
    }


    const parsed =
      new Date(
        candidate
      );


    if (
      !Number.isNaN(
        parsed.getTime()
      ) &&
      parsed >=
        incidentAt
    ) {
      return parsed;
    }
  }


  return new Date(
    incidentAt.getTime() +
    postWindowMs
  );
}


function normalizeWindow(
  value,
  defaultValue,
  fieldName
) {
  if (
    value === undefined ||
    value === null
  ) {
    return defaultValue;
  }


  const parsed =
    Number(
      value
    );


  if (
    !Number.isFinite(
      parsed
    ) ||
    parsed <
      0
  ) {
    throw serviceError(
      `${fieldName} must be a non-negative number`,
      "INCIDENT_TOPOLOGY_WINDOW_INVALID"
    );
  }


  /*
   * Cap individual reconstruction windows at 24 hours.
   *
   * Broader forensic queries should later use the dedicated
   * temporal query engine directly.
   */
  return Math.min(
    parsed,
    24 *
      60 *
      60 *
      1000
  );
}


/*
 * ============================================================================
 * RECONSTRUCTION SUMMARY
 * ============================================================================
 */

function buildSummary({
  preIncident,
  atIncident,
  postIncident,
  changes,
}) {
  const preResourceIds =
    resourceIds(
      preIncident
    );

  const incidentResourceIds =
    resourceIds(
      atIncident
    );

  const postResourceIds =
    resourceIds(
      postIncident
    );


  const preRelationshipIds =
    relationshipIds(
      preIncident
    );

  const incidentRelationshipIds =
    relationshipIds(
      atIncident
    );

  const postRelationshipIds =
    relationshipIds(
      postIncident
    );


  return {
    preIncident: {
      resources:
        preResourceIds.size,

      relationships:
        preRelationshipIds.size,
    },

    atIncident: {
      resources:
        incidentResourceIds.size,

      relationships:
        incidentRelationshipIds.size,
    },

    postIncident: {
      resources:
        postResourceIds.size,

      relationships:
        postRelationshipIds.size,
    },

    resourcesAppearedByIncident:
      difference(
        incidentResourceIds,
        preResourceIds
      ),

    resourcesMissingByIncident:
      difference(
        preResourceIds,
        incidentResourceIds
      ),

    relationshipsAppearedByIncident:
      difference(
        incidentRelationshipIds,
        preRelationshipIds
      ),

    relationshipsMissingByIncident:
      difference(
        preRelationshipIds,
        incidentRelationshipIds
      ),

    resourcesAppearedAfterIncident:
      difference(
        postResourceIds,
        incidentResourceIds
      ),

    resourcesMissingAfterIncident:
      difference(
        incidentResourceIds,
        postResourceIds
      ),

    relationshipsAppearedAfterIncident:
      difference(
        postRelationshipIds,
        incidentRelationshipIds
      ),

    relationshipsMissingAfterIncident:
      difference(
        incidentRelationshipIds,
        postRelationshipIds
      ),

    graphChangeCount:
      Array.isArray(
        changes
      )
        ? changes.length
        : 0,
  };
}


function resourceIds(
  topology
) {
  return new Set(
    (
      topology
        ?.resources ||
      []
    ).map(
      (resource) =>
        resource.id
    )
  );
}


function relationshipIds(
  topology
) {
  return new Set(
    (
      topology
        ?.relationships ||
      []
    ).map(
      (relationship) =>
        relationship.id
    )
  );
}


function difference(
  left,
  right
) {
  return Array.from(
    left
  ).filter(
    (value) =>
      !right.has(
        value
      )
  );
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
    throw serviceError(
      "Incident topology reconstruction requires organizationId and environmentId",
      "INCIDENT_TOPOLOGY_SCOPE_REQUIRED"
    );
  }
}


function requireIncidentId(
  value
) {
  if (
    !value
  ) {
    throw serviceError(
      "Incident topology reconstruction requires incidentId",
      "INCIDENT_TOPOLOGY_INCIDENT_ID_REQUIRED"
    );
  }
}


function requireResourceId(
  value
) {
  if (
    !value
  ) {
    throw serviceError(
      "Incident topology reconstruction requires explicit root resourceId",
      "INCIDENT_TOPOLOGY_RESOURCE_ID_REQUIRED"
    );
  }
}


function serviceError(
  message,
  code
) {
  return Object.assign(
    new Error(
      message
    ),
    {
      code,

      executionAuthorized:
        false,
    }
  );
}


module.exports =
  IncidentTopologyReconstructionService;