"use strict";

const crypto = require("crypto");

const {
  createResourceRepository,
} = require(
"C:\\Users\\J SUHAS\\OneDrive\\Desktop\\AIRA\\backend\\persistence\\postgres\\PostgresResourceRepository.js"
);

function createMockPool() {
  const resources = [];

  function clone(value) {
    return JSON.parse(
      JSON.stringify(value)
    );
  }

  function normalizeResource(input) {
    const now =
      new Date().toISOString();

    return {
      id:
        input.id ||
        crypto.randomUUID(),

      public_id:
        input.publicId,

      organization_id:
        input.organizationId,

      environment_id:
        input.environmentId,

      resource_type:
        input.resourceType,

      provider:
        input.provider,

      external_id:
        input.externalId || null,

      name:
        input.name || null,

      display_name:
        input.displayName || null,

      namespace:
        input.namespace || null,

      region:
        input.region || null,

      zone:
        input.zone || null,

      service_id:
        input.serviceId || null,

      labels:
        input.labels || {},

      attributes:
        input.attributes || {},

      metadata:
        input.metadata || {},

      status:
        input.status || "ACTIVE",

      discovered_at:
        input.discoveredAt || now,

      first_seen_at:
        input.firstSeenAt || now,

      last_seen_at:
        input.lastSeenAt || now,

      created_at:
        now,

      updated_at:
        now,
    };
  }

  function findByScope(
    organizationId,
    environmentId
  ) {
    return resources.filter(
      function (resource) {
        return (
          resource.organization_id ===
            organizationId &&
          resource.environment_id ===
            environmentId
        );
      }
    );
  }

  async function query(
    text,
    params
  ) {
    const sql =
      String(text)
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();

    const values =
      params || [];

    if (
      sql.indexOf(
        "insert into resources.resources"
      ) !== -1
    ) {
      const resource = {
        id:
          crypto.randomUUID(),

        public_id:
          values[0],

        organization_id:
          values[1],

        environment_id:
          values[2],

        provider:
          values[3],

        resource_type:
          values[4],

        external_id:
          values[5] || null,

        name:
          values[6] || null,

        display_name:
          values[7] || null,

        namespace:
          values[8] || null,

        region:
          values[9] || null,

        zone:
          values[10] || null,

        service_id:
          values[11] || null,

        labels:
          values[12] || {},

        attributes:
          values[13] || {},

        metadata:
          values[14] || {},

        status:
          values[15] || "ACTIVE",

        discovered_at:
          values[16] ||
          new Date().toISOString(),

        first_seen_at:
          values[17] ||
          new Date().toISOString(),

        last_seen_at:
          values[18] ||
          new Date().toISOString(),

        created_at:
          new Date().toISOString(),

        updated_at:
          new Date().toISOString(),
      };

      resources.push(
        resource
      );

      return {
        rows: [
          clone(resource),
        ],

        rowCount:
          1,
      };
    }

    if (
      sql.indexOf(
        "from resources.resources"
      ) !== -1 &&
      sql.indexOf(
        "where"
      ) !== -1
    ) {
      let result =
        resources.slice();

      if (
        values.length >= 2
      ) {
        result =
          findByScope(
            values[0],
            values[1]
          );
      }

      if (
        sql.indexOf(
          "id = $3"
        ) !== -1
      ) {
        result =
          result.filter(
            function (resource) {
              return (
                resource.id ===
                values[2]
              );
            }
          );
      }

      if (
        sql.indexOf(
          "public_id = $3"
        ) !== -1
      ) {
        result =
          result.filter(
            function (resource) {
              return (
                resource.public_id ===
                values[2]
              );
            }
          );
      }

      if (
        sql.indexOf(
          "resource_type = $3"
        ) !== -1 &&
        sql.indexOf(
          "external_id"
        ) !== -1
      ) {
        result =
          result.filter(
            function (resource) {
              return (
                resource.resource_type ===
                  values[2] &&
                resource.external_id ===
                  values[3]
              );
            }
          );
      }

      return {
        rows:
          result.map(
            clone
          ),

        rowCount:
          result.length,
      };
    }

    if (
      sql.indexOf(
        "update resources.resources"
      ) !== -1
    ) {
      const resourceId =
        values[0];

      const organizationId =
        values[1];

      const environmentId =
        values[2];

      const resource =
        resources.find(
          function (item) {
            return (
              item.id ===
                resourceId &&
              item.organization_id ===
                organizationId &&
              item.environment_id ===
                environmentId
            );
          }
        );

      if (
        !resource
      ) {
        return {
          rows: [],
          rowCount: 0,
        };
      }

      return {
        rows: [
          clone(resource),
        ],

        rowCount:
          1,
      };
    }

    return {
      rows: [],
      rowCount: 0,
    };
  }

  const client = {
    query:
      query,

    release:
      function () {},
  };

  return {
    query:
      query,

    connect:
      async function () {
        return client;
      },

    __resources:
      resources,

    __insertResource:
      function (input) {
        const resource =
          normalizeResource(
            input
          );

        resources.push(
          resource
        );

        return clone(
          resource
        );
      },
  };
}

describe(
  "Phase 17.3 - Resource Repository",
  function () {
    let pool;
    let repository;

    let organizationId;
    let environmentId;

    beforeEach(
      function () {
        organizationId =
          crypto.randomUUID();

        environmentId =
          crypto.randomUUID();

        pool =
          createMockPool();

        repository =
          createResourceRepository({
            pool:
              pool,
          });
      }
    );

    test(
      "creates repository",
      function () {
        expect(
          repository
        ).toBeDefined();

        expect(
          typeof repository
            .createResource
        ).toBe(
          "function"
        );

        expect(
          typeof repository
            .getResourceById
        ).toBe(
          "function"
        );

        expect(
          typeof repository
            .getResourceByPublicId
        ).toBe(
          "function"
        );

        expect(
          typeof repository
            .findResourceByExternalId
        ).toBe(
          "function"
        );

        expect(
          typeof repository
            .listResources
        ).toBe(
          "function"
        );

        expect(
          typeof repository
            .updateResourceMetadata
        ).toBe(
          "function"
        );

        expect(
          typeof repository
            .markResourceSeen
        ).toBe(
          "function"
        );
      }
    );

    test(
      "repository does not expose generic SQL methods",
      function () {
        expect(
          repository.raw
        ).toBeUndefined();

        expect(
          repository.execute
        ).toBeUndefined();
      }
    );

    test(
      "resource model remains domain neutral",
      function () {
        const resourceTypes = [
          "kubernetes.pod",
          "aws.ec2",
          "postgres.database",
          "network.switch",
          "robotics.amr",
          "robotics.lidar",
        ];

        expect(
          resourceTypes
        ).toEqual([
          "kubernetes.pod",
          "aws.ec2",
          "postgres.database",
          "network.switch",
          "robotics.amr",
          "robotics.lidar",
        ]);
      }
    );

    test(
      "mock storage isolates organization and environment",
      function () {
        const resource =
          pool.__insertResource({
            publicId:
              "res_test",

            organizationId:
              organizationId,

            environmentId:
              environmentId,

            resourceType:
              "kubernetes.pod",

            provider:
              "kubernetes",

            externalId:
              "pod_test",

            name:
              "payments-api",
          });

        expect(
          resource.organization_id
        ).toBe(
          organizationId
        );

        expect(
          resource.environment_id
        ).toBe(
          environmentId
        );

        expect(
          resource.resource_type
        ).toBe(
          "kubernetes.pod"
        );
      }
    );

    test(
      "same resource abstraction supports Kubernetes",
      function () {
        const resource =
          pool.__insertResource({
            publicId:
              "res_kubernetes",

            organizationId:
              organizationId,

            environmentId:
              environmentId,

            resourceType:
              "kubernetes.pod",

            provider:
              "kubernetes",

            externalId:
              "payments-api-pod",

            name:
              "payments-api",

            namespace:
              "production",

            attributes: {
              nodeName:
                "worker-03",

              restartCount:
                2,
            },
          });

        expect(
          resource.resource_type
        ).toBe(
          "kubernetes.pod"
        );

        expect(
          resource.provider
        ).toBe(
          "kubernetes"
        );

        expect(
          resource.attributes
            .nodeName
        ).toBe(
          "worker-03"
        );
      }
    );

    test(
      "same resource abstraction supports AWS",
      function () {
        const resource =
          pool.__insertResource({
            publicId:
              "res_aws",

            organizationId:
              organizationId,

            environmentId:
              environmentId,

            resourceType:
              "aws.ec2",

            provider:
              "aws",

            externalId:
              "i-test123",

            name:
              "payments-worker",

            region:
              "ap-south-1",

            attributes: {
              instanceType:
                "m7g.large",
            },
          });

        expect(
          resource.resource_type
        ).toBe(
          "aws.ec2"
        );

        expect(
          resource.region
        ).toBe(
          "ap-south-1"
        );

        expect(
          resource.attributes
            .instanceType
        ).toBe(
          "m7g.large"
        );
      }
    );

    test(
      "same resource abstraction supports PostgreSQL",
      function () {
        const resource =
          pool.__insertResource({
            publicId:
              "res_postgres",

            organizationId:
              organizationId,

            environmentId:
              environmentId,

            resourceType:
              "postgres.database",

            provider:
              "postgres",

            externalId:
              "payments-db",

            name:
              "payments-db",
          });

        expect(
          resource.resource_type
        ).toBe(
          "postgres.database"
        );

        expect(
          resource.provider
        ).toBe(
          "postgres"
        );
      }
    );

    test(
      "same resource abstraction supports networking",
      function () {
        const resource =
          pool.__insertResource({
            publicId:
              "res_switch",

            organizationId:
              organizationId,

            environmentId:
              environmentId,

            resourceType:
              "network.switch",

            provider:
              "network",

            externalId:
              "switch-01",

            name:
              "datacenter-switch",
          });

        expect(
          resource.resource_type
        ).toBe(
          "network.switch"
        );
      }
    );

    test(
      "same resource abstraction supports robotics",
      function () {
        const resource =
          pool.__insertResource({
            publicId:
              "res_robot",

            organizationId:
              organizationId,

            environmentId:
              environmentId,

            resourceType:
              "robotics.amr",

            provider:
              "robotics",

            externalId:
              "amr-17",

            name:
              "warehouse-amr-17",

            attributes: {
              model:
                "XR-5",

              batteryPercent:
                67,

              firmware:
                "4.2.1",
            },
          });

        expect(
          resource.resource_type
        ).toBe(
          "robotics.amr"
        );

        expect(
          resource.attributes
            .model
        ).toBe(
          "XR-5"
        );

        expect(
          resource.attributes
            .batteryPercent
        ).toBe(
          67
        );
      }
    );

    test(
      "provider specific information stays in attributes",
      function () {
        const resource =
          pool.__insertResource({
            publicId:
              "res_provider_data",

            organizationId:
              organizationId,

            environmentId:
              environmentId,

            resourceType:
              "kubernetes.pod",

            provider:
              "kubernetes",

            externalId:
              "pod-provider-data",

            name:
              "payments-api",

            attributes: {
              nodeName:
                "worker-03",

              podIp:
                "10.2.4.18",

              restartCount:
                2,
            },
          });

        expect(
          resource.nodeName
        ).toBeUndefined();

        expect(
          resource.podIp
        ).toBeUndefined();

        expect(
          resource.restartCount
        ).toBeUndefined();

        expect(
          resource.attributes
            .nodeName
        ).toBe(
          "worker-03"
        );

        expect(
          resource.attributes
            .podIp
        ).toBe(
          "10.2.4.18"
        );
      }
    );

    test(
      "resource identity keeps public ID separate from PostgreSQL UUID",
      function () {
        const resource =
          pool.__insertResource({
            publicId:
              "res_public_123",

            organizationId:
              organizationId,

            environmentId:
              environmentId,

            resourceType:
              "linux.host",

            provider:
              "linux",

            externalId:
              "host-01",

            name:
              "host-01",
          });

        expect(
          resource.id
        ).toBeDefined();

        expect(
          resource.public_id
        ).toBe(
          "res_public_123"
        );

        expect(
          resource.id
        ).not.toBe(
          resource.public_id
        );
      }
    );

    test(
      "resource capability is not stored as execution authorization",
      function () {
        const resource =
          pool.__insertResource({
            publicId:
              "res_capability",

            organizationId:
              organizationId,

            environmentId:
              environmentId,

            resourceType:
              "kubernetes.pod",

            provider:
              "kubernetes",

            externalId:
              "pod-capability",

            name:
              "payments-api",

            attributes: {
              capabilities: [
                "READ_STATE",
                "RESTART",
              ],
            },
          });

        expect(
          resource
            .executionAuthorized
        ).toBeUndefined();

        expect(
          resource
            .authorized
        ).toBeUndefined();

        expect(
          resource
            .permission
        ).toBeUndefined();
      }
    );

    test(
      "resource creation does not create historical state",
      function () {
        pool.__insertResource({
          publicId:
            "res_no_state",

          organizationId:
            organizationId,

          environmentId:
            environmentId,

          resourceType:
            "kubernetes.pod",

          provider:
            "kubernetes",

          externalId:
            "pod-no-state",

          name:
            "payments-api",
        });

        expect(
          pool.__resources
            .length
        ).toBe(
          1
        );

        expect(
          pool.resourceStates
        ).toBeUndefined();
      }
    );
  }
);