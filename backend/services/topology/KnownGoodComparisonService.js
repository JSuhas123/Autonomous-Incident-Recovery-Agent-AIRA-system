"use strict";

const PostgresKnownGoodComparisonRepository =
  require(
    "../../persistence/postgres/PostgresKnownGoodComparisonRepository"
  );

const IncidentTopologyReconstructionService =
  require(
    "./IncidentTopologyReconstructionService"
  );

const {
  stableStringify,
} = require(
  "./normalization/CanonicalFingerprint"
);


/*
 * ============================================================================
 * KNOWN-GOOD COMPARISON SERVICE
 * ============================================================================
 *
 * Phase 17.11
 *
 * Compares:
 *
 *   evidence-backed Known-Good ResourceState
 *
 * versus
 *
 *   observed ResourceState at time T
 *
 * Difference categories:
 *
 *   configuration
 *   runtime
 *   metrics
 *   attributes
 *   version
 *   health
 *   lifecycle
 *   fingerprint
 *
 * fingerprint is DERIVED evidence and is not itself treated as a root cause.
 * ============================================================================
 */

class KnownGoodComparisonService {
  constructor(
    options = {}
  ) {
    this.repository =
      options.repository ||
      new PostgresKnownGoodComparisonRepository(
        options
      );


    this.incidentTopology =
      options.incidentTopology ||
      new IncidentTopologyReconstructionService(
        options
      );
  }


  /*
   * ==========================================================================
   * COMPARE AT ARBITRARY TIME
   * ==========================================================================
   */

  async compareAtTime(
    input = {},
    transaction = null
  ) {
    requireScope(
      input
    );

    requireResourceId(
      input.resourceId
    );


    const at =
      requireTimestamp(
        input.at
      );


    const evidence =
      await this.repository
        .getComparisonStatesAtTime(
          {
            organizationId:
              input.organizationId,

            environmentId:
              input.environmentId,

            resourceId:
              input.resourceId,

            at,
          },

          transaction
        );


    if (
      !evidence.observedState
    ) {
      throw comparisonError(
        "No ResourceState exists at or before the requested comparison time",
        "KNOWN_GOOD_COMPARISON_OBSERVED_STATE_NOT_FOUND"
      );
    }


    /*
     * Lack of Known-Good is valid operational state.
     *
     * Do not manufacture a baseline.
     */
    if (
      !evidence.knownGood ||
      !evidence.knownGoodState
    ) {
      return {
        resourceId:
          input.resourceId,

        comparedAt:
          at,

        comparable:
          false,

        comparisonStatus:
          "NO_KNOWN_GOOD",

        knownGood:
          null,

        knownGoodState:
          null,

        observedState:
          evidence.observedState,

        identical:
          false,

        differences:
          [],

        materialDifferences:
          [],

        summary: {
          differenceCount:
            0,

          materialDifferenceCount:
            0,

          changedCategories:
            [],

          baselineAvailable:
            false,
        },

        executionAuthorized:
          false,
      };
    }


    const differences =
      buildStateDifferences(
        evidence.knownGoodState,
        evidence.observedState
      );


    const materialDifferences =
      differences.filter(
        (difference) =>
          !difference.derived
      );


    return {
      resourceId:
        input.resourceId,

      comparedAt:
        at,

      comparable:
        true,

      comparisonStatus:
        materialDifferences.length ===
          0
          ? "MATCH"
          : "DIFFERENT",

      knownGood:
        evidence.knownGood,

      knownGoodState:
        evidence.knownGoodState,

      observedState:
        evidence.observedState,

      identical:
        differences.length ===
        0,

      differences,

      materialDifferences,

      summary: {
        differenceCount:
          differences.length,

        materialDifferenceCount:
          materialDifferences.length,

        changedCategories:
          [
            ...new Set(
              materialDifferences.map(
                (difference) =>
                  difference.category
              )
            ),
          ],

        baselineAvailable:
          true,

        fingerprintChanged:
          differences.some(
            (difference) =>
              difference.category ===
              "fingerprint"
          ),
      },

      executionAuthorized:
        false,
    };
  }


  /*
   * ==========================================================================
   * COMPARE AT INCIDENT
   * ==========================================================================
   */

  async compareIncident(
    input = {},
    transaction = null
  ) {
    requireScope(
      input
    );

    requireResourceId(
      input.resourceId
    );


    if (
      !input.incidentId
    ) {
      throw comparisonError(
        "Known-good incident comparison requires incidentId",
        "KNOWN_GOOD_COMPARISON_INCIDENT_ID_REQUIRED"
      );
    }


    const reconstruction =
      await this.incidentTopology
        .reconstructAtIncident(
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
              1,

            direction:
              input.direction ||
              "BOTH",

            relationshipTypes:
              input.relationshipTypes ||
              [],
          },

          transaction
        );


    const comparison =
      await this.compareAtTime(
        {
          organizationId:
            input.organizationId,

          environmentId:
            input.environmentId,

          resourceId:
            input.resourceId,

          at:
            reconstruction.incidentAt,
        },

        transaction
      );


    return {
      incident:
        reconstruction.incident,

      incidentAt:
        reconstruction.incidentAt,

      topology:
        reconstruction.topology,

      ...comparison,

      executionAuthorized:
        false,
    };
  }
}


/*
 * ============================================================================
 * DIFFERENCE ENGINE
 * ============================================================================
 */

function buildStateDifferences(
  knownGood,
  observed
) {
  const differences = [];


  compareObjectCategory(
    differences,
    "configuration",
    knownGood.configuration ||
      {},
    observed.configuration ||
      {}
  );


  compareObjectCategory(
    differences,
    "runtime",
    knownGood.runtime ||
      {},
    observed.runtime ||
      {}
  );


  compareObjectCategory(
    differences,
    "metrics",
    knownGood.metrics ||
      {},
    observed.metrics ||
      {}
  );


  compareObjectCategory(
    differences,
    "attributes",
    knownGood.attributes ||
      {},
    observed.attributes ||
      {}
  );


  compareScalar(
    differences,
    "version",
    "version",
    knownGood.version,
    observed.version
  );


  compareScalar(
    differences,
    "health",
    "health",
    knownGood.health,
    observed.health
  );


  compareScalar(
    differences,
    "lifecycle",
    "lifecycle",
    knownGood.lifecycle,
    observed.lifecycle
  );


  /*
   * Fingerprint is derived from normalized state.
   *
   * Preserve it as useful evidence, but mark derived=true so it is not
   * double-counted as an independent material difference.
   */
  if (
    knownGood.fingerprint !==
    observed.fingerprint
  ) {
    differences.push({
      category:
        "fingerprint",

      path:
        "fingerprint",

      before:
        knownGood.fingerprint,

      after:
        observed.fingerprint,

      beforePresent:
        knownGood.fingerprint !==
        undefined,

      afterPresent:
        observed.fingerprint !==
        undefined,

      derived:
        true,
    });
  }


  return differences;
}


function compareObjectCategory(
  output,
  category,
  before,
  after
) {
  walkDifference(
    output,
    category,
    "",
    before,
    after
  );
}


function walkDifference(
  output,
  category,
  path,
  before,
  after
) {
  if (
    equivalent(
      before,
      after
    )
  ) {
    return;
  }


  if (
    isPlainObject(
      before
    ) &&
    isPlainObject(
      after
    )
  ) {
    const keys =
      [
        ...new Set([
          ...Object.keys(
            before
          ),

          ...Object.keys(
            after
          ),
        ]),
      ].sort();


    for (
      const key
      of keys
    ) {
      walkDifference(
        output,

        category,

        path
          ? `${path}.${key}`
          : key,

        before[key],

        after[key]
      );
    }


    return;
  }


  output.push({
    category,

    path:
      path ||
      category,

    before:
      serializableValue(
        before
      ),

    after:
      serializableValue(
        after
      ),

    beforePresent:
      before !==
      undefined,

    afterPresent:
      after !==
      undefined,

    derived:
      false,
  });
}


function compareScalar(
  output,
  category,
  path,
  before,
  after
) {
  if (
    equivalent(
      before,
      after
    )
  ) {
    return;
  }


  output.push({
    category,

    path,

    before:
      serializableValue(
        before
      ),

    after:
      serializableValue(
        after
      ),

    beforePresent:
      before !==
      undefined,

    afterPresent:
      after !==
      undefined,

    derived:
      false,
  });
}


function equivalent(
  left,
  right
) {
  return (
    stableStringify(
      left
    ) ===
    stableStringify(
      right
    )
  );
}


function isPlainObject(
  value
) {
  return (
    value !==
      null &&
    typeof value ===
      "object" &&
    !Array.isArray(
      value
    ) &&
    !(
      value instanceof
      Date
    )
  );
}


function serializableValue(
  value
) {
  if (
    value ===
    undefined
  ) {
    return null;
  }


  return value;
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
    throw comparisonError(
      "Known-good comparison requires tenant scope",
      "KNOWN_GOOD_COMPARISON_SCOPE_REQUIRED"
    );
  }
}


function requireResourceId(
  value
) {
  if (
    !value
  ) {
    throw comparisonError(
      "Known-good comparison requires resourceId",
      "KNOWN_GOOD_COMPARISON_RESOURCE_ID_REQUIRED"
    );
  }
}


function requireTimestamp(
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
    throw comparisonError(
      "Known-good comparison timestamp is invalid",
      "KNOWN_GOOD_COMPARISON_TIMESTAMP_INVALID"
    );
  }


  return timestamp;
}


function comparisonError(
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
  KnownGoodComparisonService;