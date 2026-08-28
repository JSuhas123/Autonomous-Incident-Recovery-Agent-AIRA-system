"use strict";

const {
  PostgresSystemDnaService,
} =
  require(
    "../memory/dna/postgresSystemDnaService"
  );

const ResourceGraphSystemDnaContributor =
  require(
    "../memory/dna/ResourceGraphSystemDnaContributor"
  );


/*
 * ============================================================================
 * RESOURCE GRAPH <-> SYSTEM DNA INTEGRATION
 * ============================================================================
 *
 * Phase 17.14 public integration surface.
 *
 * This is the explicit bridge between:
 *
 *   Phase 16 System DNA
 *
 * and
 *
 *   Phase 17 Resource Graph
 *
 * Resource Graph:
 *   canonical structural/temporal truth
 *
 * System DNA:
 *   derived operational identity
 * ============================================================================
 */

class ResourceGraphSystemDnaService {
  constructor(
    options = {}
  ) {
    this.contributor =
      options.contributor ||
      new ResourceGraphSystemDnaContributor(
        options
      );


    this.systemDna =
      options.systemDna ||
      new PostgresSystemDnaService({
        ...options,

        evidenceContributors: [
          this.contributor,
        ],
      });
  }


  async rebuildResourceDna(
    input = {}
  ) {
    requireScope(
      input
    );

    requireResourceIdentity(
      input
    );


    /*
     * Phase 16 RESOURCE DNA contract requires:
     *
     * organization
     * environment
     * service
     * resource
     */
    return this.systemDna
      .rebuild({
        ...input,

        scopeType:
          "RESOURCE",
      });
  }
}


function requireScope(
  input
) {
  if (
    !input.organizationId ||
    !input.environmentId
  ) {
    throw integrationError(
      "Resource Graph System DNA requires organizationId and environmentId",
      "RESOURCE_GRAPH_DNA_SCOPE_REQUIRED"
    );
  }
}


function requireResourceIdentity(
  input
) {
  if (
    !input.serviceId ||
    !input.resourceId
  ) {
    throw integrationError(
      "RESOURCE System DNA requires serviceId and resourceId",
      "RESOURCE_GRAPH_DNA_RESOURCE_IDENTITY_REQUIRED"
    );
  }
}


function integrationError(
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

      executionAuthorized:
        false,
    }
  );
}


const resourceGraphSystemDnaService =
  new ResourceGraphSystemDnaService();


module.exports = {
  ResourceGraphSystemDnaService,

  resourceGraphSystemDnaService,

  rebuildResourceGraphSystemDna:
    resourceGraphSystemDnaService
      .rebuildResourceDna
      .bind(
        resourceGraphSystemDnaService
      ),
};