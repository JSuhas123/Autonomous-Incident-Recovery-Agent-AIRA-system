"use strict";


const {
  Incident,
} =
  require(
    "../../persistence/operational/canonicalModels"
  );


const EnvironmentService =
  require(
    "../core/environmentService"
  );


function numberValue(
  value
) {
  const parsed =
    Number(
      value
    );


  return Number.isFinite(
    parsed
  )
    ? parsed
    : 0;
}


function sameIdentifier(
  left,
  right
) {
  if (
    left ===
      null ||
    left ===
      undefined ||
    right ===
      null ||
    right ===
      undefined
  ) {
    return false;
  }


  return (
    String(
      left
    ) ===
    String(
      right
    )
  );
}


async function getShadowMode({
  organizationId,
  environmentId,
}) {
  if (
    !organizationId ||
    !environmentId
  ) {
    const error =
      new Error(
        "Shadow Mode requires authoritative organization and environment scope"
      );


    error.status =
      400;


    error.code =
      "SHADOW_MODE_SCOPE_REQUIRED";


    error.executionAuthorized =
      false;


    throw error;
  }


  /*
   * ========================================================================
   * AUTHORITATIVE ENVIRONMENT LOOKUP
   * ========================================================================
   *
   * EnvironmentService.listEnvironments() does not exist in the canonical
   * environment service.
   *
   * Phase 25 must use the real environment-domain API:
   *
   *     EnvironmentService.listForOrganization()
   *
   * Repository records may expose either `_id` or `id` depending on the
   * persistence provider. EnvironmentService.safeEnvironment() normalizes
   * the result before it enters the product read model.
   * ========================================================================
   */

  const [
    incidentRows,
    environmentRows,
  ] =
    await Promise.all([
      Incident
        .find({
          organizationId,
          environmentId,
        })
        .sort({
          createdAt:
            -1,
        })
        .limit(
          100
        )
        .lean(),

      EnvironmentService
        .listForOrganization(
          organizationId,
          {
            includeArchived:
              false,
          }
        ),
    ]);


  const rawEnvironment =
    (
      Array.isArray(
        environmentRows
      )
        ? environmentRows
        : []
    )
      .find(
        (
          candidate
        ) =>
          sameIdentifier(
            candidate
              ?._id ??
            candidate
              ?.id,

            environmentId
          )
      ) ||
    null;


  /*
   * The browser may only reach this read model after authoritative context
   * resolution. If that context and the environment-domain lookup disagree,
   * fail closed rather than fabricating environment settings.
   */
  if (
    !rawEnvironment
  ) {
    const error =
      new Error(
        "Current environment is unavailable in authoritative organization scope"
      );


    error.status =
      404;


    error.code =
      "SHADOW_MODE_ENVIRONMENT_NOT_FOUND";


    error.executionAuthorized =
      false;


    throw error;
  }


  const environment =
    EnvironmentService
      .safeEnvironment(
        rawEnvironment
      );


  const autonomousExecutionAllowed =
    environment
      ?.settings
      ?.allowAutonomousExecution ===
    true;


  /*
   * ========================================================================
   * PHASE 25 SHADOW MODE CONTRACT
   * ========================================================================
   *
   * Shadow Mode is a PRODUCT OBSERVATION MODE.
   *
   * This read model:
   *
   * - observes already persisted incidents
   * - does not invoke diagnosis
   * - does not create recovery decisions
   * - does not request execution
   * - does not approve execution
   * - does not execute infrastructure operations
   * - does not grant authorization
   *
   * An environment may technically have autonomous execution enabled in its
   * authoritative settings. That is reported as configuration state only.
   *
   * It does NOT mean this Shadow Mode request is authorized to execute.
   *
   * Human-vs-AIRA comparison percentages remain unavailable until real,
   * persisted comparison evidence exists.
   * ========================================================================
   */


  const incidents =
    Array.isArray(
      incidentRows
    )
      ? incidentRows
      : [];


  const resolved =
    incidents.filter(
      (
        incident
      ) =>
        [
          "resolved",
          "closed",
        ].includes(
          String(
            incident.status ||
            ""
          )
            .trim()
            .toLowerCase()
        )
    );


  const active =
    incidents.filter(
      (
        incident
      ) =>
        ![
          "resolved",
          "closed",
        ].includes(
          String(
            incident.status ||
            ""
          )
            .trim()
            .toLowerCase()
        )
    );


  const evidenceCount =
    incidents.reduce(
      (
        total,
        incident
      ) =>
        total +
        numberValue(
          incident
            ?.evidenceCount
        ),

      0
    );


  return {
    generatedAt:
      new Date()
        .toISOString(),


    scope: {
      organizationId,
      environmentId,
    },


    environment: {
      id:
        environment
          ?.id ||
        String(
          environmentId
        ),

      name:
        environment
          ?.name ||
        null,

      type:
        environment
          ?.type ||
        null,

      criticality:
        environment
          ?.criticality ||
        null,

      status:
        environment
          ?.status ||
        null,
    },


    mode: {
      shadowMode:
        true,

      /*
       * This is authoritative ENVIRONMENT CONFIGURATION only.
       *
       * It is deliberately separated from executionAuthorized.
       */
      autonomousExecutionAllowed,

      autonomousExecutionPerformed:
        false,

      executionAuthorized:
        false,
    },


    metrics: [
      {
        id:
          "observed",

        label:
          "Incidents observed",

        value:
          String(
            incidents.length
          ),

        detail:
          "Current environment",

        state:
          "info",
      },

      {
        id:
          "active",

        label:
          "Active incidents",

        value:
          String(
            active.length
          ),

        detail:
          "Currently open",

        state:
          active.length >
          0
            ? "warning"
            : "healthy",
      },

      {
        id:
          "resolved",

        label:
          "Resolved incidents",

        value:
          String(
            resolved.length
          ),

        detail:
          "Available for outcome review",

        state:
          "healthy",
      },

      {
        id:
          "evidence",

        label:
          "Evidence items",

        value:
          String(
            evidenceCount
          ),

        detail:
          "Persisted evidence references",

        state:
          "info",
      },

      {
        id:
          "autonomous",

        label:
          "Shadow executions",

        value:
          "0",

        detail:
          "Shadow Mode does not execute",

        state:
          "healthy",
      },
    ],


    comparisons: {
      available:
        false,

      sampleSize:
        0,

      diagnosisAgreement:
        null,

      actionAgreement:
        null,

      reason:
        (
          "No Phase-25 product comparison aggregate is published until " +
          "real human/AIRA comparison evidence is available."
        ),
    },


    /*
     * Do not fabricate case comparison history.
     *
     * Future phases may populate this only from authoritative comparison
     * evidence.
     */
    cases:
      [],


    safety: {
      executionAuthorized:
        false,

      productModeGrantsAuthority:
        false,

      environmentConfigurationGrantsAuthority:
        false,

      comparisonScoreGrantsAuthority:
        false,

      certificationGrantsAuthority:
        false,
    },


    executionAuthorized:
      false,
  };
}


module.exports = {
  getShadowMode,
};