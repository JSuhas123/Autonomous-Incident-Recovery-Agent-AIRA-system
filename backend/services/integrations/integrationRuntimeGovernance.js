"use strict";

/**
 * ============================================================================
 * AIRA PHASE 20.15
 * INTEGRATION RUNTIME GOVERNANCE
 * ============================================================================
 *
 * Governance controls whether an integration operation is permitted for a
 * tenant/environment.
 *
 * IMPORTANT:
 *
 * organizationId/environmentId supplied to Phase 20 may be AIRA PUBLIC IDs.
 *
 * integrations.connection_governance stores PostgreSQL UUID ownership.
 *
 * Therefore the runtime must resolve scope through PostgresTenantScope rather
 * than passing public identifiers directly into UUID columns.
 *
 * Governance still DOES NOT authorize execution.
 *
 * executeCapability requires BOTH:
 *
 *   governance allow_execution = true
 *
 * AND
 *
 *   Phase 20.13 persisted deterministic execution authorization.
 * ============================================================================
 */

const PostgresTenantScope =
  require(
    "../../persistence/postgres/PostgresTenantScope"
  );

const {
  INTEGRATION_OPERATION,
} =
  require(
    "../../constants/integrationPlatform"
  );


class IntegrationRuntimeGovernance {
  constructor(
    options = {}
  ) {
    /*
     * Unit tests and specialized callers may inject a governance resolver.
     *
     * Production defaults to PostgreSQL + PostgresTenantScope.
     */
    this.customGetGovernance =
      typeof options.getGovernance ===
      "function"
        ? options.getGovernance
        : null;


    this.scope =
      options.scope ||
      new PostgresTenantScope(
        options
      );
  }


  async getGovernance({
    organizationId,

    environmentId,

    integrationId,
  }) {
    /*
     * Preserve dependency injection for unit tests.
     */
    if (
      this.customGetGovernance
    ) {
      return this
        .customGetGovernance({
          organizationId,

          environmentId,

          integrationId,
        });
    }


    /*
     * Canonical production path.
     *
     * PostgresTenantScope resolves:
     *
     * public organization ID → canonical UUID
     * public environment ID  → canonical UUID
     *
     * and establishes PostgreSQL RLS scope.
     */
    return this.scope.run(
      {
        organizationId,

        environmentId,
      },

      async (
        client,
        resolved
      ) => {
        const result =
          await client.query(
            `
              SELECT *
              FROM
                integrations.connection_governance
              WHERE
                organization_id = $1
                AND environment_id = $2
                AND integration_id = $3
              LIMIT 1
            `,
            [
              resolved
                .organizationUuid,

              resolved
                .environmentUuid,

              String(
                integrationId
              ),
            ]
          );


        return result.rows[0] ||
          null;
      }
    );
  }


  async assertAllowed({
    organizationId,

    environmentId,

    integrationId,

    provider,

    operation,

    capability,
  } = {}) {
    const governance =
      await this
        .getGovernance({
          organizationId,

          environmentId,

          integrationId,
        });


    /*
     * Existing integrations without a governance row remain usable for
     * non-execution operations during migration.
     *
     * Execution is deliberately stricter:
     *
     * executeCapability() requires an explicit governance row with
     * allow_execution=true.
     */
    if (
      !governance
    ) {
      if (
        operation ===
        INTEGRATION_OPERATION
          .EXECUTE_CAPABILITY
      ) {
        throw governanceError(
          "Integration execution requires explicit tenant governance",
          "INTEGRATION_EXECUTION_GOVERNANCE_REQUIRED"
        );
      }


      return {
        governancePresent:
          false,

        allowed:
          true,

        executionAuthorized:
          false,
      };
    }


    if (
      governance.enabled !==
      true
    ) {
      throw governanceError(
        "Integration is disabled by tenant governance",
        "INTEGRATION_DISABLED_BY_GOVERNANCE"
      );
    }


    assertCapabilityGovernance(
      governance,
      capability
    );


    switch (
      operation
    ) {
      case INTEGRATION_OPERATION
        .RECEIVE_SIGNALS:
        requireFlag(
          governance,
          "allow_ingestion",
          "INTEGRATION_INGESTION_BLOCKED"
        );
        break;


      case INTEGRATION_OPERATION
        .QUERY_METRICS:

      case INTEGRATION_OPERATION
        .QUERY_LOGS:

      case INTEGRATION_OPERATION
        .QUERY_TRACES:

      case INTEGRATION_OPERATION
        .HEALTH_CHECK:
        requireFlag(
          governance,
          "allow_queries",
          "INTEGRATION_QUERY_BLOCKED"
        );
        break;


      case INTEGRATION_OPERATION
        .DISCOVER_RESOURCES:

      case INTEGRATION_OPERATION
        .DISCOVER_RELATIONSHIPS:

      case INTEGRATION_OPERATION
        .GET_CHANGES:
        requireFlag(
          governance,
          "allow_resource_discovery",
          "INTEGRATION_DISCOVERY_BLOCKED"
        );
        break;


      case INTEGRATION_OPERATION
        .EXECUTE_CAPABILITY:
        requireFlag(
          governance,
          "allow_execution",
          "INTEGRATION_EXECUTION_BLOCKED_BY_GOVERNANCE"
        );
        break;


      /*
       * sendNotification currently uses capability allow/deny governance.
       */
      default:
        break;
    }


    return {
      governancePresent:
        true,

      allowed:
        true,

      provider:
        governance.provider ||
        provider ||
        null,

      credentialAccessMode:
        governance
          .credential_access_mode ||
        "managed_only",

      rateLimits:
        governance
          .rate_limits ||
        {},

      executionAuthorized:
        false,
    };
  }


  async assertCredentialAccess({
    organizationId,

    environmentId,

    integrationId,
  }) {
    const governance =
      await this
        .getGovernance({
          organizationId,

          environmentId,

          integrationId,
        });


    if (
      governance &&
      governance
        .credential_access_mode ===
        "disabled"
    ) {
      throw governanceError(
        "Credential access is disabled by integration governance",
        "INTEGRATION_CREDENTIAL_ACCESS_DISABLED"
      );
    }


    return {
      allowed:
        true,

      executionAuthorized:
        false,
    };
  }
}


function assertCapabilityGovernance(
  governance,
  capability
) {
  const denied =
    Array.isArray(
      governance
        .denied_capabilities
    )
      ? governance
          .denied_capabilities
      : [];


  if (
    denied.includes(
      capability
    )
  ) {
    throw governanceError(
      `Integration capability "${capability}" is denied by tenant governance`,
      "INTEGRATION_CAPABILITY_DENIED"
    );
  }


  const allowed =
    Array.isArray(
      governance
        .allowed_capabilities
    )
      ? governance
          .allowed_capabilities
      : [];


  if (
    allowed.length >
      0 &&
    !allowed.includes(
      capability
    )
  ) {
    throw governanceError(
      `Integration capability "${capability}" is outside tenant allow-list`,
      "INTEGRATION_CAPABILITY_NOT_ALLOWED"
    );
  }
}


function requireFlag(
  governance,
  field,
  code
) {
  if (
    governance[
      field
    ] !==
    true
  ) {
    throw governanceError(
      `Integration governance blocks ${field}`,
      code
    );
  }
}


function governanceError(
  message,
  code
) {
  return Object.assign(
    new Error(
      message
    ),
    {
      name:
        "IntegrationRuntimeGovernanceError",

      status:
        403,

      code,

      executionAuthorized:
        false,
    }
  );
}


module.exports = {
  IntegrationRuntimeGovernance,

  assertCapabilityGovernance,
};