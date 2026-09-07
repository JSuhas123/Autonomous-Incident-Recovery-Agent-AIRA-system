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

    throw error;
  }


  const [
    incidentRows,
    environments,
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
        .listEnvironments(
          organizationId
        ),
    ]);


  const environment =
    (
      Array.isArray(
        environments
      )
        ? environments
        : []
    )
      .find(
        (
          candidate
        ) =>
          String(
            candidate.id
          ) ===
          String(
            environmentId
          )
      ) ||
    null;


  const autonomousExecutionAllowed =
    environment
      ?.settings
      ?.allowAutonomousExecution ===
    true;


  /*
   * Phase 25 Shadow Mode is a PRODUCT OBSERVATION MODE.
   *
   * This read model:
   *
   * - observes existing persisted incident data
   * - does not trigger diagnosis
   * - does not create recovery decisions
   * - does not execute infrastructure operations
   * - does not grant authorization
   *
   * Human-vs-AIRA comparison percentages are intentionally omitted until
   * sufficient real comparison evidence exists.
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
            incident.status
          )
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
            incident.status
          )
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

    mode: {
      shadowMode:
        true,

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

    cases:
      [],

    safety: {
      executionAuthorized:
        false,

      productModeGrantsAuthority:
        false,

      comparisonScoreGrantsAuthority:
        false,
    },
  };
}


module.exports = {
  getShadowMode,
};