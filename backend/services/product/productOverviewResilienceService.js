"use strict";


const PostgresTenantScope =
  require(
    "../../persistence/postgres/PostgresTenantScope"
  );


const productReadModelService =
  require(
    "./productReadModelService"
  );


const COMMERCIAL_DEGRADATION_CODES =
  new Set([
    "ENTITLEMENT_CONFIGURATION_MISSING",
    "ENTITLEMENT_NOT_FOUND",
    "SUBSCRIPTION_NOT_FOUND",
    "SUBSCRIPTION_CONFIGURATION_MISSING",
    "BILLING_CONFIGURATION_MISSING",
  ]);


function normalizeIncidents(
  value
) {
  if (
    Array.isArray(
      value
    )
  ) {
    return value;
  }


  if (
    Array.isArray(
      value?.incidents
    )
  ) {
    return value.incidents;
  }


  return [];
}


function normalizeText(
  value
) {
  return String(
    value ||
    ""
  ).toLowerCase();
}


function isClosedIncident(
  incident
) {
  return [
    "resolved",
    "closed",
  ].includes(
    normalizeText(
      incident?.status
    )
  );
}


function isCriticalIncident(
  incident
) {
  return (
    normalizeText(
      incident?.severity
    ) ===
      "critical" ||
    normalizeText(
      incident?.rawSeverity
    ) ===
      "critical"
  );
}


function activeIncidentCount(
  incidents
) {
  return incidents.filter(
    (
      incident
    ) =>
      !isClosedIncident(
        incident
      )
  ).length;
}


function criticalIncidentCount(
  incidents
) {
  return incidents.filter(
    (
      incident
    ) =>
      isCriticalIncident(
        incident
      ) &&
      !isClosedIncident(
        incident
      )
  ).length;
}


function deriveHealth(
  incidents
) {
  if (
    incidents.some(
      (
        incident
      ) =>
        isCriticalIncident(
          incident
        ) &&
        !isClosedIncident(
          incident
        )
    )
  ) {
    return "critical";
  }


  if (
    activeIncidentCount(
      incidents
    ) >
    0
  ) {
    return "warning";
  }


  return "healthy";
}


class ProductOverviewResilienceService {
  constructor(
    options = {}
  ) {
    this.tenantScope =
      options.tenantScope ||
      new PostgresTenantScope(
        options
      );
  }


  isCommercialDependencyFailure(
    error
  ) {
    return COMMERCIAL_DEGRADATION_CODES
      .has(
        error?.code
      );
  }


  /**
   * --------------------------------------------------------------------------
   * PRODUCT-SAFE ENVIRONMENT STATE
   * --------------------------------------------------------------------------
   *
   * This intentionally avoids EnvironmentService.getEnvironmentSummary()
   * because that summary legitimately includes commercial entitlement state.
   *
   * The Product BFF only needs enough non-commercial environment information
   * to render the rest of the overview when commercial data is unavailable.
   *
   * IMPORTANT:
   *
   * PostgresTenantScope resolves browser/public identifiers into canonical
   * database UUIDs.
   *
   * Raw SQL MUST use:
   *
   *   resolved.organizationUuid
   *   resolved.environmentUuid
   *
   * and never assume request identifiers are physical database primary keys.
   */
  async getEnvironmentProductState({
    organizationId,
    environmentId,
  }) {
    return this.tenantScope
      .run(
        {
          organizationId,
          environmentId,
        },

        async (
          client,
          resolved
        ) => {
          const databaseOrganizationId =
            resolved
              .organizationUuid;


          const databaseEnvironmentId =
            resolved
              .environmentUuid;


          const [
            environmentResult,
            countResult,
          ] =
            await Promise.all([
              client.query(
                `
                  SELECT
                      id,
                      public_id,
                      name,
                      environment_type,
                      criticality,
                      status,
                      settings,
                      maintenance_started_at,
                      archived_at

                  FROM
                      tenancy.environments

                  WHERE
                      organization_id =
                          $1

                      AND

                      id =
                          $2

                  LIMIT 1
                `,
                [
                  databaseOrganizationId,
                  databaseEnvironmentId,
                ]
              ),


              client.query(
                `
                  SELECT
                      COUNT(*) FILTER (
                          WHERE
                              status <>
                                  'archived'
                      )::int
                          AS total,

                      COUNT(*) FILTER (
                          WHERE
                              status =
                                  'active'
                      )::int
                          AS active,

                      COUNT(*) FILTER (
                          WHERE
                              status =
                                  'maintenance'
                      )::int
                          AS maintenance,

                      COUNT(*) FILTER (
                          WHERE
                              environment_type =
                                  'production'

                              AND

                              status <>
                                  'archived'
                      )::int
                          AS production

                  FROM
                      tenancy.environments

                  WHERE
                      organization_id =
                          $1
                `,
                [
                  databaseOrganizationId,
                ]
              ),
            ]);


          const environment =
            environmentResult
              .rows[0] ||
            null;


          if (
            !environment
          ) {
            const error =
              new Error(
                "Current environment is unavailable"
              );


            error.status =
              404;


            error.code =
              "PRODUCT_ENVIRONMENT_NOT_FOUND";


            error.executionAuthorized =
              false;


            throw error;
          }


          const counts =
            countResult
              .rows[0] ||
            {};


          return {
            currentEnvironment: {
              id:
                environment.public_id ||
                environment.id,

              name:
                environment.name ||
                "Environment",

              type:
                environment.environment_type ||
                null,

              criticality:
                environment.criticality ||
                null,

              status:
                environment.status,

              settings:
                environment.settings ||
                {},
            },


            environmentSummary: {
              total:
                Number(
                  counts.total ||
                  0
                ),

              active:
                Number(
                  counts.active ||
                  0
                ),

              maintenance:
                Number(
                  counts.maintenance ||
                  0
                ),

              hasProduction:
                Number(
                  counts.production ||
                  0
                ) >
                0,
            },
          };
        }
      );
  }


  async getOverview({
    organizationId,
    environmentId,
  }) {
    try {
      /*
       * Primary path.
       *
       * Existing Product Read Model remains authoritative.
       */
      const model =
        await productReadModelService
          .getOverview({
            organizationId,
            environmentId,
          });


      return {
        ...model,


        commercial: {
          status:
            "available",

          reason:
            null,
        },


        degraded:
          false,


        degradedDependencies:
          [],


        executionAuthorized:
          false,
      };
    } catch (
      error
    ) {
      /*
       * Only known commercial-display dependency failures are degraded.
       *
       * Unknown failures continue through the normal error path.
       */
      if (
        !this
          .isCommercialDependencyFailure(
            error
          )
      ) {
        throw error;
      }


      const [
        incidentModel,
        environmentState,
      ] =
        await Promise.all([
          productReadModelService
            .getIncidentList({
              organizationId,
              environmentId,
            }),


          this
            .getEnvironmentProductState({
              organizationId,
              environmentId,
            }),
        ]);


      const incidents =
        normalizeIncidents(
          incidentModel
        );


      const active =
        activeIncidentCount(
          incidents
        );


      const critical =
        criticalIncidentCount(
          incidents
        );


      return {
        generatedAt:
          new Date()
            .toISOString(),


        scope: {
          organizationId,
          environmentId,
        },


        health:
          deriveHealth(
            incidents
          ),


        metrics: [
          {
            id:
              "active-incidents",

            label:
              "Active incidents",

            value:
              String(
                active
              ),

            detail:
              "Current environment",

            state:
              active >
              0
                ? "warning"
                : "healthy",
          },


          {
            id:
              "critical-incidents",

            label:
              "Critical incidents",

            value:
              String(
                critical
              ),

            detail:
              "Current environment",

            state:
              critical >
              0
                ? "critical"
                : "healthy",
          },


          {
            id:
              "environment-status",

            label:
              "Environment",

            value:
              String(
                environmentState
                  .currentEnvironment
                  .status ||
                "unknown"
              ),

            detail:
              environmentState
                .currentEnvironment
                .name,

            state:
              environmentState
                .currentEnvironment
                .status ===
              "active"
                ? "healthy"
                : "warning",
          },


          {
            id:
              "commercial",

            label:
              "Commercial state",

            value:
              "Unavailable",

            detail:
              "Authoritative commercial data is unavailable",

            state:
              "warning",
          },
        ],


        incidents,


        currentEnvironment:
          environmentState
            .currentEnvironment,


        environmentSummary: {
          ...environmentState
            .environmentSummary,


          /*
           * Intentionally unknown.
           *
           * Product BFF never guesses billing values.
           */
          plan:
            null,

          limit:
            null,

          remaining:
            null,
        },


        commercial: {
          status:
            "unavailable",

          reason:
            error.code,

          message:
            "Commercial and entitlement information is currently unavailable from the authoritative billing system.",
        },


        degraded:
          true,


        degradedDependencies: [
          {
            dependency:
              "commercial",

            code:
              error.code,

            status:
              "unavailable",
          },
        ],


        safety: {
          executionAuthorized:
            false,

          personaGrantsAuthorization:
            false,

          degradedStateGrantsAuthorization:
            false,
        },


        executionAuthorized:
          false,
      };
    }
  }
}


const productOverviewResilienceService =
  new ProductOverviewResilienceService();


module.exports =
  productOverviewResilienceService;


module.exports
  .ProductOverviewResilienceService =
  ProductOverviewResilienceService;