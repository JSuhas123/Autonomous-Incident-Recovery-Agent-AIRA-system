"use strict";


const fs =
  require(
    "fs"
  );


const path =
  require(
    "path"
  );


const {
  RESOURCE_TYPES,

  isValidResourceType,

  isKnownResourceType,
} =
  require(
    "../../constants/resourceTypes"
  );


const {
  RESOURCE_CAPABILITIES,

  isKnownResourceCapability,
} =
  require(
    "../../constants/resourceCapabilities"
  );


const {
  RELATIONSHIP_TYPES,

  isValidRelationshipType,
} =
  require(
    "../../constants/relationshipTypes"
  );


const {
  assertValidResource,
} =
  require(
    "../../contracts/topology/resourceContract"
  );


const {
  assertValidResourceState,
} =
  require(
    "../../contracts/topology/resourceStateContract"
  );


const {
  assertValidRelationship,
} =
  require(
    "../../contracts/topology/relationshipContract"
  );


const {
  assertValidKnownGoodState,
} =
  require(
    "../../contracts/topology/knownGoodStateContract"
  );


const {
  assertValidCapability,
} =
  require(
    "../../contracts/topology/capabilityContract"
  );


const migrationPath =
  path.join(
    __dirname,
    "..",
    "..",
    "persistence",
    "postgres",
    "migrations",
    "0065_temporal_resource_graph_foundation.sql"
  );


describe(
  "Phase 17.0-17.2 temporal resource graph foundation",
  () => {

    test(
      "resource types are domain-neutral namespaced identifiers",
      () => {

        expect(
          RESOURCE_TYPES.KUBERNETES_POD
        ).toBe(
          "kubernetes.pod"
        );


        expect(
          RESOURCE_TYPES.AWS_EC2
        ).toBe(
          "aws.ec2"
        );


        expect(
          RESOURCE_TYPES.POSTGRES_DATABASE
        ).toBe(
          "postgres.database"
        );


        expect(
          RESOURCE_TYPES.NETWORK_SWITCH
        ).toBe(
          "network.switch"
        );


        expect(
          RESOURCE_TYPES.ROBOTICS_AMR
        ).toBe(
          "robotics.amr"
        );


        expect(
          RESOURCE_TYPES.ROBOTICS_LIDAR
        ).toBe(
          "robotics.lidar"
        );


        expect(
          isKnownResourceType(
            "robotics.amr"
          )
        ).toBe(
          true
        );
      }
    );


    test(
      "future namespaced resource types do not require core graph redesign",
      () => {

        expect(
          isValidResourceType(
            "robotics.navigation_controller"
          )
        ).toBe(
          true
        );


        expect(
          isValidResourceType(
            "industrial.plc"
          )
        ).toBe(
          true
        );


        expect(
          isValidResourceType(
            "KubernetesPod"
          )
        ).toBe(
          false
        );
      }
    );


    test(
      "resource contract accepts Kubernetes AWS PostgreSQL and robotics through one model",
      () => {

        const examples =
          [
            {
              publicId:
                "res_k8s",

              organizationId:
                "org_test",

              environmentId:
                "env_test",

              resourceType:
                "kubernetes.pod",

              provider:
                "kubernetes",

              name:
                "payments-api-7d8fc5",

              namespace:
                "production",

              attributes: {
                nodeName:
                  "worker-03",
              },
            },

            {
              publicId:
                "res_aws",

              organizationId:
                "org_test",

              environmentId:
                "env_test",

              resourceType:
                "aws.ec2",

              provider:
                "aws",

              name:
                "payments-worker",

              region:
                "ap-south-1",

              attributes: {
                instanceType:
                  "m7g.large",
              },
            },

            {
              publicId:
                "res_pg",

              organizationId:
                "org_test",

              environmentId:
                "env_test",

              resourceType:
                "postgres.database",

              provider:
                "postgres",

              name:
                "payments-primary",
            },

            {
              publicId:
                "res_robot",

              organizationId:
                "org_test",

              environmentId:
                "env_test",

              resourceType:
                "robotics.amr",

              provider:
                "robotics",

              name:
                "warehouse-amr-17",

              attributes: {
                model:
                  "XR-5",

                batteryPercent:
                  67,
              },
            },
          ];


        for (
          const resource
          of examples
        ) {
          expect(
            () =>
              assertValidResource(
                resource
              )
          ).not.toThrow();
        }
      }
    );


    test(
      "resource contract rejects provider-specific core fields",
      () => {

        expect(
          () =>
            assertValidResource({
              publicId:
                "res_invalid",

              organizationId:
                "org_test",

              environmentId:
                "env_test",

              resourceType:
                "kubernetes.pod",

              podIp:
                "10.2.4.18",
            })
        ).toThrow();
      }
    );


    test(
      "resource state contract represents immutable snapshot data",
      () => {

        expect(
          () =>
            assertValidResourceState({
              publicId:
                "state_1",

              organizationId:
                "org_test",

              environmentId:
                "env_test",

              resourceId:
                "res_test",

              observedAt:
                "2026-08-28T10:01:00.000Z",

              health:
                "HEALTHY",

              lifecycle:
                "RUNNING",

              configuration: {
                image:
                  "payments:v51",
              },

              runtime: {
                replicas:
                  5,
              },

              fingerprint:
                "sha256-example",

              source:
                "kubernetes",
            })
        ).not.toThrow();
      }
    );


    test(
      "known-good state requires evidence",
      () => {

        expect(
          () =>
            assertValidKnownGoodState({
              publicId:
                "kgs_1",

              organizationId:
                "org_test",

              environmentId:
                "env_test",

              resourceId:
                "res_test",

              resourceStateId:
                "state_1",

              validFrom:
                "2026-08-28T10:00:00.000Z",

              confidence:
                0.95,

              evidenceCount:
                0,

              healthEvidence:
                {},

              reason:
                "Healthy before deployment",

              source:
                "health-verification",

              status:
                "ACTIVE",
            })
        ).toThrow();
      }
    );


    test(
      "known-good state accepts evidence-backed state",
      () => {

        expect(
          () =>
            assertValidKnownGoodState({
              publicId:
                "kgs_1",

              organizationId:
                "org_test",

              environmentId:
                "env_test",

              resourceId:
                "res_test",

              resourceStateId:
                "state_1",

              validFrom:
                "2026-08-28T10:00:00.000Z",

              confidence:
                0.95,

              evidenceCount:
                3,

              healthEvidence: {
                healthCheck:
                  "passed",

                slo:
                  "within_target",

                activeIncident:
                  false,
              },

              reason:
                "Stable verified healthy state",

              source:
                "health-verification",

              status:
                "ACTIVE",
            })
        ).not.toThrow();
      }
    );


    test(
      "relationships remain domain-neutral",
      () => {

        expect(
          RELATIONSHIP_TYPES.DEPENDS_ON
        ).toBe(
          "DEPENDS_ON"
        );


        expect(
          RELATIONSHIP_TYPES.RUNS_ON
        ).toBe(
          "RUNS_ON"
        );


        expect(
          RELATIONSHIP_TYPES.CONTROLS
        ).toBe(
          "CONTROLS"
        );


        expect(
          isValidRelationshipType(
            "USES_SENSOR"
          )
        ).toBe(
          true
        );
      }
    );


    test(
      "relationship contract rejects self relationships",
      () => {

        expect(
          () =>
            assertValidRelationship({
              publicId:
                "rel_1",

              organizationId:
                "org_test",

              environmentId:
                "env_test",

              sourceResourceId:
                "res_same",

              targetResourceId:
                "res_same",

              relationshipType:
                "DEPENDS_ON",

              validFrom:
                "2026-08-28T10:00:00.000Z",
            })
        ).toThrow();
      }
    );


    test(
      "capability represents technical ability without authorization",
      () => {

        expect(
          isKnownResourceCapability(
            RESOURCE_CAPABILITIES.RESTART
          )
        ).toBe(
          true
        );


        const capability =
          assertValidCapability({
            resourceId:
              "res_test",

            capability:
              "RESTART",

            available:
              true,

            source:
              "kubernetes",

            observedAt:
              "2026-08-28T10:00:00.000Z",
          });


        expect(
          capability
        ).not.toHaveProperty(
          "authorized"
        );


        expect(
          capability
        ).not.toHaveProperty(
          "permission"
        );


        expect(
          capability
        ).not.toHaveProperty(
          "executionAuthorized"
        );
      }
    );


    test(
      "migration evolves existing resources instead of creating competing resource identity",
      () => {

        const sql =
          fs.readFileSync(
            migrationPath,
            "utf8"
          );


        expect(
          sql
        ).toContain(
          "ALTER TABLE\n    resources.resources"
        );


        expect(
          sql
        ).not.toContain(
          "CREATE TABLE IF NOT EXISTS\n    topology.resources"
        );
      }
    );


    test(
      "migration creates temporal state known-good capability and relationship history",
      () => {

        const sql =
          fs.readFileSync(
            migrationPath,
            "utf8"
          );


        expect(
          sql
        ).toContain(
          "resources.resource_states"
        );


        expect(
          sql
        ).toContain(
          "resources.known_good_states"
        );


        expect(
          sql
        ).toContain(
          "resources.resource_capabilities"
        );


        expect(
          sql
        ).toContain(
          "resources.relationship_history"
        );


        expect(
          sql
        ).toContain(
          "resources.graph_change_events"
        );
      }
    );


    test(
      "tenant-owned Phase 17 tables enable and force RLS",
      () => {

        const sql =
          fs.readFileSync(
            migrationPath,
            "utf8"
          );


        const tables =
          [
            "resources.resource_capabilities",
            "resources.resource_states",
            "resources.known_good_states",
            "resources.relationship_history",
            "resources.graph_change_events",
          ];


        for (
          const table
          of tables
        ) {
          expect(
            sql
          ).toContain(
            `ALTER TABLE\n    ${table}\nENABLE ROW LEVEL SECURITY`
          );


          expect(
            sql
          ).toContain(
            `ALTER TABLE\n    ${table}\nFORCE ROW LEVEL SECURITY`
          );
        }
      }
    );


    test(
      "known-good persistence requires positive evidence count",
      () => {

        const sql =
          fs.readFileSync(
            migrationPath,
            "utf8"
          );


        expect(
          sql
        ).toContain(
          "evidence_count > 0"
        );
      }
    );


    test(
      "migration does not introduce Neo4j or execution authorization",
      () => {

        const sql =
          fs
            .readFileSync(
              migrationPath,
              "utf8"
            )
            .toLowerCase();


        expect(
          sql
        ).not.toContain(
          "neo4j"
        );


        expect(
          sql
        ).not.toContain(
          "execution_authorized"
        );
      }
    );
  }
);