"use strict";

const {
  canonicalFingerprint,
} =
  require(
    "../topology/normalization/CanonicalFingerprint"
  );

const {
  isValidResourceType,
} =
  require(
    "../../constants/resourceTypes"
  );

const {
  RESOURCE_HEALTH,
  RESOURCE_LIFECYCLE,
} =
  require(
    "../../constants/resourceStateTypes"
  );


function normalizeDiscoveredResource({
  organizationId,

  environmentId,

  integrationId,

  provider,

  rawResource,

  observedAt =
    new Date(),
} = {}) {
  requireScope({
    organizationId,

    environmentId,

    integrationId,

    provider,
  });


  if (
    !rawResource ||
    typeof rawResource !==
      "object" ||
    Array.isArray(
      rawResource
    )
  ) {
    throw normalizationError(
      "Discovered resource must be an object",
      "INTEGRATION_DISCOVERY_RESOURCE_INVALID"
    );
  }


  const normalizedProvider =
    normalizeProvider(
      provider
    );


  const identity =
    resolveResourceIdentity(
      normalizedProvider,
      rawResource,
      integrationId
    );


  if (
    !identity
  ) {
    throw normalizationError(
      "Provider discovery result does not describe a concrete resource instance",
      "INTEGRATION_DISCOVERY_NOT_RESOURCE_INSTANCE"
    );
  }


  if (
    !isValidResourceType(
      identity.resourceType
    )
  ) {
    throw normalizationError(
      `Invalid discovered resource type "${identity.resourceType}"`,
      "INTEGRATION_DISCOVERY_RESOURCE_TYPE_INVALID"
    );
  }


  const configuration =
    extractConfiguration(
      rawResource
    );


  const runtime =
    extractRuntime(
      rawResource
    );


  const health =
    normalizeHealth(
      rawResource
    );


  const lifecycle =
    normalizeLifecycle(
      rawResource
    );


  const fingerprint =
    canonicalFingerprint({
      provider:
        normalizedProvider,

      resourceType:
        identity.resourceType,

      externalId:
        identity.externalId,

      configuration,

      runtime,

      health,

      lifecycle,
    });


  return {
    resource: {
      organizationId,

      environmentId,

      provider:
        normalizedProvider,

      resourceType:
        identity.resourceType,

      externalId:
        identity.externalId,

      name:
        identity.name,

      displayName:
        identity.displayName,

      namespace:
        nullableString(
          rawResource.namespace
        ),

      region:
        identity.region,

      zone:
        identity.zone,

      serviceId:
        nullableString(
          rawResource.serviceId
        ),

      labels:
        extractLabels(
          rawResource
        ),

      attributes: {
        integrationId:
          String(
            integrationId
          ),

        discoveredBy:
          "phase20.integration-sdk",

        providerResourceType:
          identity.providerResourceType,
      },

      metadata: {
        provider:
          normalizedProvider,

        integrationId:
          String(
            integrationId
          ),

        discoverySource:
          "integration-platform",
      },

      status:
        lifecycle ===
          RESOURCE_LIFECYCLE
            .DELETED ||
        lifecycle ===
          RESOURCE_LIFECYCLE
            .TERMINATED
          ? "INACTIVE"
          : "ACTIVE",

      discoveredAt:
        observedAt,

      firstSeenAt:
        observedAt,

      lastSeenAt:
        observedAt,
    },


    state: {
      organizationId,

      environmentId,

      observedAt,

      health,

      lifecycle,

      configuration,

      runtime,

      metrics:
        {},

      attributes: {
        provider:
          normalizedProvider,

        integrationId:
          String(
            integrationId
          ),

        providerResourceType:
          identity.providerResourceType,
      },

      version:
        extractVersion(
          rawResource
        ),

      fingerprint,

      source:
        buildSource(
          normalizedProvider,
          integrationId
        ),

      evidence: {
        provider:
          normalizedProvider,

        integrationId:
          String(
            integrationId
          ),

        externalId:
          identity.externalId,

        observedFrom:
          "phase20-resource-discovery",
      },

      metadata:
        {},
    },
  };
}


function extractProviderResources(
  provider,
  value
) {
  if (
    value ===
      null ||
    value ===
      undefined
  ) {
    return [];
  }


  if (
    Array.isArray(
      value
    )
  ) {
    return value;
  }


  if (
    typeof value !==
      "object"
  ) {
    return [];
  }


  /*
   * Canonical Phase 20 provider shape.
   */
  if (
    Array.isArray(
      value.resources
    )
  ) {
    return value.resources;
  }


  if (
    Array.isArray(
      value.canonicalResources
    )
  ) {
    return value
      .canonicalResources;
  }


  /*
   * AWS Resource Groups Tagging API.
   */
  if (
    normalizeProvider(
      provider
    ) ===
      "aws_cloudwatch" ||
    normalizeProvider(
      provider
    ) ===
      "aws"
  ) {
    if (
      Array.isArray(
        value
          .ResourceTagMappingList
      )
    ) {
      return value
        .ResourceTagMappingList;
    }
  }


  /*
   * Some SDK wrappers return an object containing "items".
   */
  if (
    Array.isArray(
      value.items
    )
  ) {
    return value.items;
  }


  return [];
}


function resolveResourceIdentity(
  provider,
  raw,
  integrationId
) {
  /*
   * Preferred canonical provider contract.
   *
   * Future adapters should normalize to this shape themselves.
   */
  if (
    raw.resourceType &&
    raw.externalId
  ) {
    return {
      resourceType:
        String(
          raw.resourceType
        )
          .trim()
          .toLowerCase(),

      externalId:
        String(
          raw.externalId
        ),

      name:
        nullableString(
          raw.name
        ),

      displayName:
        nullableString(
          raw.displayName ||
          raw.name
        ),

      region:
        nullableString(
          raw.region ||
          raw.location
        ),

      zone:
        nullableString(
          raw.zone
        ),

      providerResourceType:
        nullableString(
          raw.providerResourceType ||
          raw.type ||
          raw.kind
        ),
    };
  }


  if (
    provider ===
      "aws_cloudwatch" ||
    provider ===
      "aws"
  ) {
    return normalizeAwsIdentity(
      raw,
      integrationId
    );
  }


  if (
    provider ===
      "azure_monitor" ||
    provider ===
      "azure"
  ) {
    return normalizeAzureIdentity(
      raw
    );
  }


  if (
    provider ===
      "kubernetes"
  ) {
    return normalizeKubernetesIdentity(
      raw,
      integrationId
    );
  }


  /*
   * A GCP monitored-resource descriptor describes a resource TYPE rather than
   * a concrete infrastructure resource instance.
   *
   * Those descriptors must not be persisted as fake Phase 17 resources.
   *
   * Actual GCP resources can still enter through the preferred canonical
   * resourceType + externalId contract above.
   */
  return null;
}


function normalizeAwsIdentity(
  raw,
  integrationId
) {
  const arn =
    nullableString(
      raw.ResourceARN ||
      raw.arn
    );


  if (
    !arn
  ) {
    return null;
  }


  const parts =
    arn.split(
      ":"
    );


  const service =
    String(
      parts[2] ||
      "resource"
    )
      .trim()
      .toLowerCase();


  const resourcePart =
    parts
      .slice(
        5
      )
      .join(
        ":"
      );


  const resourceType =
    mapAwsResourceType(
      service,
      resourcePart
    );


  return {
    resourceType,

    externalId:
      arn,

    name:
      extractAwsName(
        resourcePart
      ),

    displayName:
      extractAwsName(
        resourcePart
      ),

    region:
      nullableString(
        parts[3]
      ),

    zone:
      null,

    providerResourceType:
      service,

    integrationId,
  };
}


function mapAwsResourceType(
  service,
  resourcePart
) {
  if (
    service ===
    "ec2"
  ) {
    return "aws.ec2";
  }


  if (
    service ===
    "rds"
  ) {
    return "aws.rds";
  }


  if (
    service ===
    "lambda"
  ) {
    return "aws.lambda";
  }


  const safeService =
    sanitizeTypeComponent(
      service
    );


  const resourceKind =
    sanitizeTypeComponent(
      String(
        resourcePart ||
        ""
      )
        .split(
          /[/:]/
        )[0] ||
      "resource"
    );


  /*
   * Resource contracts require exactly:
   *
   * domain.type
   *
   * Unknown AWS services therefore stay domain-neutral but valid.
   */
  return (
    safeService ===
    "resource"
      ? "aws.resource"
      : `aws.${safeService || resourceKind || "resource"}`
  );
}


function extractAwsName(
  value
) {
  if (
    !value
  ) {
    return null;
  }


  const parts =
    String(
      value
    )
      .split(
        /[/:]/
      )
      .filter(
        Boolean
      );


  return (
    parts[
      parts.length -
      1
    ] ||
    null
  );
}


function normalizeAzureIdentity(
  raw
) {
  const id =
    nullableString(
      raw.id
    );


  if (
    !id
  ) {
    return null;
  }


  const providerType =
    nullableString(
      raw.type
    );


  const resourceType =
    mapAzureResourceType(
      providerType
    );


  return {
    resourceType,

    externalId:
      id,

    name:
      nullableString(
        raw.name
      ),

    displayName:
      nullableString(
        raw.name
      ),

    region:
      nullableString(
        raw.location
      ),

    zone:
      nullableString(
        raw.zone
      ),

    providerResourceType:
      providerType,
  };
}


function mapAzureResourceType(
  type
) {
  const normalized =
    String(
      type ||
      ""
    )
      .trim()
      .toLowerCase();


  if (
    normalized ===
      "microsoft.compute/virtualmachines"
  ) {
    return "azure.vm";
  }


  const segments =
    normalized
      .split(
        "/"
      )
      .filter(
        Boolean
      );


  const candidate =
    segments[
      segments.length -
      1
    ] ||
    "resource";


  return `azure.${sanitizeTypeComponent(
    candidate
  )}`;
}


function normalizeKubernetesIdentity(
  raw,
  integrationId
) {
  if (
    !raw.kind
  ) {
    return null;
  }


  const kind =
    String(
      raw.kind
    )
      .trim()
      .toLowerCase();


  const supported =
    {
      pod:
        "kubernetes.pod",

      deployment:
        "kubernetes.deployment",

      service:
        "kubernetes.service",

      node:
        "kubernetes.node",

      replicaset:
        "kubernetes.replicaset",

      namespace:
        "kubernetes.namespace",
    };


  const resourceType =
    supported[
      kind
    ];


  if (
    !resourceType
  ) {
    return null;
  }


  const externalId =
    raw.uid
      ? [
          "kubernetes",
          integrationId,
          raw.uid,
        ].join(
          ":"
        )
      : [
          "kubernetes",

          integrationId,

          kind,

          raw.namespace ||
            "_cluster",

          raw.name ||
            "_unknown",
        ].join(
          ":"
        );


  return {
    resourceType,

    externalId,

    name:
      nullableString(
        raw.name
      ),

    displayName:
      nullableString(
        raw.name
      ),

    region:
      null,

    zone:
      null,

    providerResourceType:
      kind,
  };
}


function extractConfiguration(
  raw
) {
  if (
    isObject(
      raw.configuration
    )
  ) {
    return safeObject(
      raw.configuration
    );
  }


  if (
    isObject(
      raw.spec
    )
  ) {
    return safeObject(
      raw.spec
    );
  }


  return {
    tags:
      extractLabels(
        raw
      ),
  };
}


function extractRuntime(
  raw
) {
  if (
    isObject(
      raw.runtime
    )
  ) {
    return safeObject(
      raw.runtime
    );
  }


  if (
    isObject(
      raw.status
    )
  ) {
    return safeObject(
      raw.status
    );
  }


  if (
    typeof raw.status ===
    "string"
  ) {
    return {
      status:
        raw.status,
    };
  }


  return {};
}


function extractLabels(
  raw
) {
  if (
    isObject(
      raw.labels
    )
  ) {
    return safeObject(
      raw.labels
    );
  }


  if (
    isObject(
      raw.tags
    )
  ) {
    return safeObject(
      raw.tags
    );
  }


  if (
    Array.isArray(
      raw.Tags
    )
  ) {
    return Object.fromEntries(
      raw.Tags
        .filter(
          (
            tag
          ) =>
            tag &&
            tag.Key
        )
        .map(
          (
            tag
          ) => [
            String(
              tag.Key
            ),

            String(
              tag.Value ??
              ""
            ),
          ]
        )
    );
  }


  return {};
}


function normalizeHealth(
  raw
) {
  const candidate =
    String(
      raw.health ||
      raw.healthStatus ||
      ""
    )
      .trim()
      .toUpperCase();


  if (
    Object.values(
      RESOURCE_HEALTH
    )
      .includes(
        candidate
      )
  ) {
    return candidate;
  }


  return RESOURCE_HEALTH
    .UNKNOWN;
}


function normalizeLifecycle(
  raw
) {
  const candidate =
    String(
      raw.lifecycle ||
      raw.lifecycleStatus ||
      ""
    )
      .trim()
      .toUpperCase();


  if (
    Object.values(
      RESOURCE_LIFECYCLE
    )
      .includes(
        candidate
      )
  ) {
    return candidate;
  }


  return RESOURCE_LIFECYCLE
    .DISCOVERED;
}


function extractVersion(
  raw
) {
  return nullableString(
    raw.version ||
    raw.resourceVersion ||
    raw.etag
  );
}


function buildSource(
  provider,
  integrationId
) {
  return `integration:${provider}:${String(
    integrationId
  )}`.slice(
    0,
    255
  );
}


function normalizeProvider(
  value
) {
  return String(
    value ||
    ""
  )
    .trim()
    .toLowerCase();
}


function sanitizeTypeComponent(
  value
) {
  const result =
    String(
      value ||
      "resource"
    )
      .trim()
      .toLowerCase()
      .replace(
        /[^a-z0-9_-]+/g,
        "_"
      )
      .replace(
        /^_+|_+$/g,
        ""
      );


  if (
    !result
  ) {
    return "resource";
  }


  if (
    /^[a-z]/
      .test(
        result
      )
  ) {
    return result;
  }


  return `r_${result}`;
}


function requireScope(
  input
) {
  for (
    const field
    of [
      "organizationId",

      "environmentId",

      "integrationId",

      "provider",
    ]
  ) {
    if (
      !input[
        field
      ]
    ) {
      throw normalizationError(
        `${field} is required`,
        "INTEGRATION_DISCOVERY_SCOPE_REQUIRED"
      );
    }
  }
}


function nullableString(
  value
) {
  if (
    value ===
      undefined ||
    value ===
      null
  ) {
    return null;
  }


  const result =
    String(
      value
    )
      .trim();


  return result ||
    null;
}


function isObject(
  value
) {
  return Boolean(
    value &&
    typeof value ===
      "object" &&
    !Array.isArray(
      value
    )
  );
}


function safeObject(
  value
) {
  return isObject(
    value
  )
    ? {
        ...value,
      }
    : {};
}


function normalizationError(
  message,
  code
) {
  return Object.assign(
    new Error(
      message
    ),
    {
      name:
        "IntegrationDiscoveryNormalizationError",

      code,

      executionAuthorized:
        false,
    }
  );
}


module.exports = {
  normalizeDiscoveredResource,

  extractProviderResources,

  resolveResourceIdentity,

  normalizeProvider,
};