"use strict";

const PostgresResourceRepository =
  require(
    "../../persistence/postgres/PostgresResourceRepository"
  );

const PostgresResourceStateRepository =
  require(
    "../../persistence/postgres/PostgresResourceStateRepository"
  );

const ResourceNormalizerRegistry =
  require(
    "./normalization/ResourceNormalizerRegistry"
  );


class ResourceStateIngestionService {
  constructor(
    options = {}
  ) {
    this.resourceRepository =
      options.resourceRepository ||
      new PostgresResourceRepository(
        options
      );


    this.resourceStateRepository =
      options.resourceStateRepository ||
      new PostgresResourceStateRepository(
        options
      );


    this.normalizers =
      options.normalizers ||
      new ResourceNormalizerRegistry(
        options.normalizerOptions
      );
  }


  async ingestProviderObservation(
    input = {},
    transaction = null
  ) {
    requireProvider(
      input.provider
    );


    const normalized =
      this.normalizers
        .normalize(
          input.provider,
          input
        );


    return this.ingestNormalized(
      normalized,
      transaction
    );
  }


  async ingestNormalized(
    normalized,
    transaction = null
  ) {
    validateNormalized(
      normalized
    );


    const resourceInput =
      normalized.resource;


    const stateInput =
      normalized.state;


    let resource =
      await this.resourceRepository
        .findResourceByExternalId(
          {
            organizationId:
              resourceInput.organizationId,

            environmentId:
              resourceInput.environmentId,

            provider:
              resourceInput.provider,

            resourceType:
              resourceInput.resourceType,

            externalId:
              resourceInput.externalId,
          },

          transaction
        );


    let createdResource =
      false;


    if (
      !resource
    ) {
      resource =
        await this.resourceRepository
          .createResource(
            resourceInput,
            transaction
          );


      createdResource =
        true;
    }
    else {
      const updated =
        await this.resourceRepository
          .updateResourceMetadata(
            {
              organizationId:
                resourceInput.organizationId,

              environmentId:
                resourceInput.environmentId,

              resourceId:
                resource.id,

              name:
                resourceInput.name,

              displayName:
                resourceInput.displayName,

              namespace:
                resourceInput.namespace,

              region:
                resourceInput.region,

              zone:
                resourceInput.zone,

              serviceId:
                resourceInput.serviceId,

              labels:
                resourceInput.labels,

              attributes:
                resourceInput.attributes,

              metadata:
                resourceInput.metadata,

              status:
                resourceInput.status,
            },

            transaction
          );


      resource =
        updated ||
        resource;


      const seen =
        await this.resourceRepository
          .markResourceSeen(
            {
              organizationId:
                resourceInput.organizationId,

              environmentId:
                resourceInput.environmentId,

              resourceId:
                resource.id,

              seenAt:
                resourceInput.lastSeenAt ||
                stateInput.observedAt,
            },

            transaction
          );


      resource =
        seen ||
        resource;
    }


    /*
     * State snapshots are intentionally appended even when a
     * fingerprint repeats.
     *
     * Same-state observations at different times remain useful evidence.
     */
    const state =
      await this.resourceStateRepository
        .appendResourceState(
          {
            ...stateInput,

            organizationId:
              resourceInput.organizationId,

            environmentId:
              resourceInput.environmentId,

            resourceId:
              resource.id,
          },

          transaction
        );


    return {
      resource,

      state,

      resourceCreated:
        createdResource,

      fingerprint:
        state.fingerprint,

      executionAuthorized:
        false,
    };
  }
}


function validateNormalized(
  value
) {
  if (
    !value ||
    typeof value !==
      "object" ||
    !value.resource ||
    !value.state
  ) {
    throw ingestionError(
      "Normalizer must return resource and state",
      "RESOURCE_NORMALIZED_PAYLOAD_INVALID"
    );
  }


  if (
    !value.resource
      .externalId
  ) {
    throw ingestionError(
      "Normalized Resource externalId is required",
      "RESOURCE_NORMALIZED_EXTERNAL_ID_REQUIRED"
    );
  }


  if (
    value.resource
      .organizationId !==
      value.state
        .organizationId ||
    value.resource
      .environmentId !==
      value.state
        .environmentId
  ) {
    throw ingestionError(
      "Normalized Resource and ResourceState scope mismatch",
      "RESOURCE_NORMALIZED_SCOPE_MISMATCH"
    );
  }
}


function requireProvider(
  value
) {
  if (
    !value
  ) {
    throw ingestionError(
      "Provider is required for Resource ingestion",
      "RESOURCE_INGESTION_PROVIDER_REQUIRED"
    );
  }
}


function ingestionError(
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
  ResourceStateIngestionService;