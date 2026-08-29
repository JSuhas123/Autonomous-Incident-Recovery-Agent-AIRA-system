"use strict";

const PostgresTenantScope =
  require(
    "./PostgresTenantScope"
  );


/*
 * ============================================================================
 * AIRA PHASE 19.8
 * POSTGRES RESOURCE CAPABILITY REPOSITORY
 * ============================================================================
 *
 * READ-ONLY Phase 19 adapter over the certified Phase 17 capability model:
 *
 *   resources.capabilities
 *   resources.resource_capabilities
 *
 * Capability means:
 *
 *   TECHNICALLY POSSIBLE
 *
 * Capability NEVER means:
 *
 *   AUTHORIZED
 *
 * This repository does NOT create a second capability authority.
 *
 * ============================================================================
 */


class PostgresResourceCapabilityRepository {
  constructor(
    options = {}
  ) {
    this.scope =
      options.scope ||
      new PostgresTenantScope(
        options
      );
  }


  async listResourceCapabilities(
    input = {},
    transaction = null
  ) {
    requireScope(
      input
    );


    if (
      !input.resourceId
    ) {
      throw createError(
        "resourceId is required",
        "RESOURCE_CAPABILITY_RESOURCE_REQUIRED"
      );
    }


    const availableOnly =
      input.availableOnly !==
      false;


    return this.scope.run(
      {
        organizationId:
          input.organizationId,

        environmentId:
          input.environmentId,
      },

      async (
        client,
        resolved
      ) => {
        const values = [
          resolved
            .organizationUuid,

          resolved
            .environmentUuid,

          input.resourceId,
        ];


        const conditions = [
          "rc.organization_id = $1",

          "rc.environment_id = $2",

          "rc.resource_id = $3",

          "c.status = 'ACTIVE'",
        ];


        if (
          availableOnly
        ) {
          conditions.push(
            "rc.available = true"
          );
        }


        const result =
          await client.query(
            `
              SELECT
                rc.id,

                rc.public_id,

                rc.organization_id,

                rc.environment_id,

                rc.resource_id,

                rc.capability_id,

                rc.available,

                rc.source,

                rc.observed_at,

                rc.metadata,

                rc.created_at,

                rc.updated_at,

                c.capability_key,

                c.description
                  AS capability_description,

                c.metadata
                  AS capability_metadata,

                c.status
                  AS capability_status

              FROM
                resources.resource_capabilities rc

              JOIN
                resources.capabilities c
              ON
                c.id =
                rc.capability_id

              WHERE
                ${conditions.join(
                  "\nAND "
                )}

              ORDER BY
                c.capability_key ASC,
                rc.observed_at DESC
            `,
            values
          );


        return result.rows.map(
          (
            row
          ) =>
            exposeCapability(
              row,
              resolved
            )
        );
      },

      transaction
    );
  }


  async listAvailableCapabilityKeys(
    input = {},
    transaction = null
  ) {
    const capabilities =
      await this
        .listResourceCapabilities(
          {
            ...input,

            availableOnly:
              true,
          },

          transaction
        );


    return capabilities.map(
      (
        capability
      ) =>
        capability
          .capabilityKey
    );
  }
}


/*
 * ============================================================================
 * EXPOSURE
 * ============================================================================
 */


function exposeCapability(
  row,
  resolved
) {
  return {
    id:
      row.id,

    publicId:
      row.public_id,

    organizationId:
      resolved
        ?.applicationOrganizationId ||
      row.organization_id,

    environmentId:
      resolved
        ?.applicationEnvironmentId ||
      row.environment_id,

    canonicalOrganizationId:
      row.organization_id,

    canonicalEnvironmentId:
      row.environment_id,

    resourceId:
      row.resource_id,

    capabilityId:
      row.capability_id,

    capabilityKey:
      row.capability_key,

    description:
      row.capability_description ||
      null,

    available:
      row.available ===
      true,

    source:
      row.source,

    observedAt:
      row.observed_at,

    metadata:
      row.metadata ||
      {},

    capabilityMetadata:
      row.capability_metadata ||
      {},

    capabilityStatus:
      row.capability_status,

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,

    capabilityImpliesAuthorization:
      false,

    executionAuthorized:
      false,
  };
}


/*
 * ============================================================================
 * HELPERS
 * ============================================================================
 */


function requireScope(
  input = {}
) {
  if (
    !input.organizationId ||
    !input.environmentId
  ) {
    throw createError(
      "Resource capability lookup requires organizationId and environmentId",
      "RESOURCE_CAPABILITY_SCOPE_REQUIRED"
    );
  }
}


function createError(
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
  PostgresResourceCapabilityRepository;