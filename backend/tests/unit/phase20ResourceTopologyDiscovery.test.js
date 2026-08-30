"use strict";

const {
  normalizeDiscoveredResource,

  extractProviderResources,
} =
  require(
    "../../services/integrations/integrationDiscoveryNormalizer"
  );

const {
  IntegrationResourceDiscoveryGateway,
} =
  require(
    "../../services/integrations/integrationResourceDiscoveryGateway"
  );

const {
  IntegrationTopologyDiscoveryGateway,

  normalizeRelationshipObservation,
} =
  require(
    "../../services/integrations/integrationTopologyDiscoveryGateway"
  );


const CONTEXT = {
  organizationId:
    "aira-dev-org",

  environmentId:
    "env_aira_development",

  integrationId:
    "int_conn_test",

  provider:
    "aws",
};


describe(
  "Phase 20.10 Resource Discovery → Phase 17",
  () => {
    test(
      "AWS ResourceTagMapping is normalized into Phase 17 Resource + ResourceState",
      () => {
        const normalized =
          normalizeDiscoveredResource({
            ...CONTEXT,

            rawResource: {
              ResourceARN:
                "arn:aws:ec2:ap-south-1:123456789012:instance/i-123",

              Tags: [
                {
                  Key:
                    "service",

                  Value:
                    "api",
                },
              ],
            },

            observedAt:
              new Date(
                "2026-08-30T00:00:00.000Z"
              ),
          });


        expect(
          normalized
            .resource
            .resourceType
        ).toBe(
          "aws.ec2"
        );


        expect(
          normalized
            .resource
            .externalId
        ).toBe(
          "arn:aws:ec2:ap-south-1:123456789012:instance/i-123"
        );


        expect(
          normalized
            .resource
            .region
        ).toBe(
          "ap-south-1"
        );


        expect(
          normalized
            .resource
            .labels
            .service
        ).toBe(
          "api"
        );


        expect(
          normalized
            .state
            .fingerprint
        ).toHaveLength(
          64
        );


        expect(
          normalized
            .state
            .lifecycle
        ).toBe(
          "DISCOVERED"
        );
      }
    );


    test(
      "Azure VM is normalized into azure.vm",
      () => {
        const normalized =
          normalizeDiscoveredResource({
            organizationId:
              "aira-dev-org",

            environmentId:
              "env_aira_development",

            integrationId:
              "int_azure",

            provider:
              "azure",

            rawResource: {
              id:
                "/subscriptions/1/resourceGroups/rg/providers/Microsoft.Compute/virtualMachines/api-vm",

              name:
                "api-vm",

              type:
                "Microsoft.Compute/virtualMachines",

              location:
                "centralindia",

              tags: {
                service:
                  "api",
              },
            },
          });


        expect(
          normalized
            .resource
            .resourceType
        ).toBe(
          "azure.vm"
        );


        expect(
          normalized
            .resource
            .name
        ).toBe(
          "api-vm"
        );


        expect(
          normalized
            .resource
            .region
        ).toBe(
          "centralindia"
        );
      }
    );


    test(
      "GCP monitored-resource descriptor is not persisted as a fake infrastructure instance",
      () => {
        expect(
          () =>
            normalizeDiscoveredResource({
              organizationId:
                "aira-dev-org",

              environmentId:
                "env_aira_development",

              integrationId:
                "int_gcp",

              provider:
                "gcp",

              rawResource: {
                type:
                  "gce_instance",

                displayName:
                  "VM Instance",

                description:
                  "Descriptor only",
              },
            })
        ).toThrow(
          expect.objectContaining({
            code:
              "INTEGRATION_DISCOVERY_NOT_RESOURCE_INSTANCE",
          })
        );
      }
    );


    test(
      "AWS provider result extraction uses ResourceTagMappingList",
      () => {
        const resources =
          extractProviderResources(
            "aws",
            {
              ResourceTagMappingList: [
                {
                  ResourceARN:
                    "arn:aws:ec2:region:acct:instance/i-1",
                },
              ],
            }
          );


        expect(
          resources
        ).toHaveLength(
          1
        );
      }
    );


    test(
      "resource discovery persists through Phase 17 ingestion service",
      async () => {
        const runtime = {
          discoverResources:
            jest.fn(
              async () => ({
                data: {
                  resources: [
                    {
                      resourceType:
                        "aws.ec2",

                      externalId:
                        "instance-1",

                      name:
                        "api-1",
                    },
                  ],
                },

                provenance: {
                  invocationId:
                    "inv-1",
                },

                observedAt:
                  "2026-08-30T00:00:00.000Z",

                executionAuthorized:
                  false,
              })
            ),
        };


        const resourceStateIngestionService = {
          ingestNormalized:
            jest.fn(
              async (
                normalized
              ) => ({
                resource: {
                  id:
                    "resource-uuid",

                  ...normalized
                    .resource,
                },

                state: {
                  id:
                    "state-uuid",

                  ...normalized
                    .state,
                },

                resourceCreated:
                  true,

                fingerprint:
                  normalized
                    .state
                    .fingerprint,

                executionAuthorized:
                  false,
              })
            ),
        };


        const gateway =
          new IntegrationResourceDiscoveryGateway({
            runtime,

            resourceStateIngestionService,
          });


        const result =
          await gateway
            .discoverResources(
              CONTEXT
            );


        expect(
          runtime
            .discoverResources
        ).toHaveBeenCalledTimes(
          1
        );


        expect(
          resourceStateIngestionService
            .ingestNormalized
        ).toHaveBeenCalledTimes(
          1
        );


        expect(
          result.persisted
        ).toBe(
          1
        );


        expect(
          result.created
        ).toBe(
          1
        );


        expect(
          result.canonicalAuthority
        ).toBe(
          "PHASE_17_POSTGRESQL_RESOURCE_GRAPH"
        );


        expect(
          result.executionAuthorized
        ).toBe(
          false
        );
      }
    );


    test(
      "non-instance discovery results are explicitly skipped",
      async () => {
        const gateway =
          new IntegrationResourceDiscoveryGateway({
            runtime: {
              discoverResources:
                jest.fn(
                  async () => ({
                    data: {
                      resources: [
                        {
                          type:
                            "descriptor",
                        },
                      ],
                    },

                    executionAuthorized:
                      false,
                  })
                ),
            },

            resourceStateIngestionService: {
              ingestNormalized:
                jest.fn(),
            },
          });


        const result =
          await gateway
            .discoverResources({
              ...CONTEXT,

              provider:
                "gcp",
            });


        expect(
          result.discovered
        ).toBe(
          1
        );


        expect(
          result.persisted
        ).toBe(
          0
        );


        expect(
          result.skipped
        ).toBe(
          1
        );
      }
    );
  }
);


describe(
  "Phase 20.11 Relationship Discovery + Changes → Phase 17",
  () => {
    test(
      "relationship observation normalizes provider endpoints",
      () => {
        const result =
          normalizeRelationshipObservation({
            provider:
              "aws",

            observedAt:
              new Date(
                "2026-08-30T00:00:00.000Z"
              ),

            relationship: {
              source: {
                resourceType:
                  "aws.ec2",

                externalId:
                  "instance-1",
              },

              target: {
                resourceType:
                  "aws.rds",

                externalId:
                  "database-1",
              },

              relationshipType:
                "depends_on",

              confidence:
                0.9,
            },
          });


        expect(
          result.relationshipType
        ).toBe(
          "DEPENDS_ON"
        );


        expect(
          result.source.provider
        ).toBe(
          "aws"
        );


        expect(
          result.target.externalId
        ).toBe(
          "database-1"
        );


        expect(
          result.confidence
        ).toBe(
          0.9
        );
      }
    );


    test(
      "relationship discovery resolves Phase 17 resources and writes temporal relationship",
      async () => {
        const runtime = {
          discoverRelationships:
            jest.fn(
              async () => ({
                data: {
                  relationships: [
                    {
                      source: {
                        resourceType:
                          "aws.ec2",

                        externalId:
                          "instance-1",
                      },

                      target: {
                        resourceType:
                          "aws.rds",

                        externalId:
                          "database-1",
                      },

                      relationshipType:
                        "DEPENDS_ON",

                      confidence:
                        1,
                    },
                  ],
                },

                provenance: {
                  invocationId:
                    "rel-inv-1",
                },

                executionAuthorized:
                  false,
              })
            ),
        };


        const resourceRepository = {
          findResourceByExternalId:
            jest.fn(
              async (
                input
              ) => {
                if (
                  input.externalId ===
                  "instance-1"
                ) {
                  return {
                    id:
                      "resource-source",
                  };
                }


                if (
                  input.externalId ===
                  "database-1"
                ) {
                  return {
                    id:
                      "resource-target",
                  };
                }


                return null;
              }
            ),
        };


        const relationshipRepository = {
          createRelationship:
            jest.fn(
              async (
                input
              ) => ({
                id:
                  "relationship-1",

                ...input,

                executionAuthorized:
                  false,
              })
            ),
        };


        const gateway =
          new IntegrationTopologyDiscoveryGateway({
            runtime,

            resourceRepository,

            relationshipRepository,

            resourceDiscoveryGateway:
              {},

            temporalTopologyQueryService:
              {},
          });


        const result =
          await gateway
            .discoverRelationships(
              CONTEXT
            );


        expect(
          resourceRepository
            .findResourceByExternalId
        ).toHaveBeenCalledTimes(
          2
        );


        expect(
          relationshipRepository
            .createRelationship
        ).toHaveBeenCalledTimes(
          1
        );


        const persisted =
          relationshipRepository
            .createRelationship
            .mock
            .calls[0][0];


        expect(
          persisted
            .sourceResourceId
        ).toBe(
          "resource-source"
        );


        expect(
          persisted
            .targetResourceId
        ).toBe(
          "resource-target"
        );


        expect(
          persisted
            .relationshipType
        ).toBe(
          "DEPENDS_ON"
        );


        expect(
          result.persisted
        ).toBe(
          1
        );


        expect(
          result.executionAuthorized
        ).toBe(
          false
        );
      }
    );


    test(
      "missing endpoint is skipped instead of creating corrupt relationship",
      async () => {
        const gateway =
          new IntegrationTopologyDiscoveryGateway({
            runtime: {
              discoverRelationships:
                jest.fn(
                  async () => ({
                    data: {
                      relationships: [
                        {
                          source: {
                            resourceType:
                              "aws.ec2",

                            externalId:
                              "missing",
                          },

                          target: {
                            resourceType:
                              "aws.rds",

                            externalId:
                              "database",
                          },

                          relationshipType:
                            "DEPENDS_ON",
                        },
                      ],
                    },

                    executionAuthorized:
                      false,
                  })
                ),
            },

            resourceRepository: {
              findResourceByExternalId:
                jest.fn(
                  async (
                    input
                  ) =>
                    input.externalId ===
                    "database"
                      ? {
                          id:
                            "target",
                        }
                      : null
                ),
            },

            relationshipRepository: {
              createRelationship:
                jest.fn(),
            },

            resourceDiscoveryGateway:
              {},

            temporalTopologyQueryService:
              {},
          });


        const result =
          await gateway
            .discoverRelationships(
              CONTEXT
            );


        expect(
          result.persisted
        ).toBe(
          0
        );


        expect(
          result.skipped
        ).toBe(
          1
        );


        expect(
          result.relationships[0]
            .reason
        ).toBe(
          "RELATIONSHIP_ENDPOINT_NOT_FOUND"
        );
      }
    );


    test(
      "getChanges applies provider observations then reads canonical Phase 17 change ledger",
      async () => {
        const runtime = {
          getChanges:
            jest.fn(
              async () => ({
                data: {
                  changes: [
                    {
                      kind:
                        "RESOURCE",

                      resource: {
                        resourceType:
                          "aws.ec2",

                        externalId:
                          "instance-1",
                      },
                    },

                    {
                      kind:
                        "RELATIONSHIP",

                      relationship: {
                        source: {
                          resourceType:
                            "aws.ec2",

                          externalId:
                            "instance-1",
                        },

                        target: {
                          resourceType:
                            "aws.rds",

                          externalId:
                            "database-1",
                        },

                        relationshipType:
                          "DEPENDS_ON",
                      },
                    },
                  ],
                },

                provenance: {
                  invocationId:
                    "changes-invocation",
                },

                observedAt:
                  "2026-08-30T00:00:00.000Z",

                executionAuthorized:
                  false,
              })
            ),
        };


        const resourceDiscoveryGateway = {
          persistProviderResources:
            jest.fn(
              async () => ({
                persisted:
                  1,

                executionAuthorized:
                  false,
              })
            ),
        };


        const temporalTopologyQueryService = {
          getChangesBetween:
            jest.fn(
              async () => [
                {
                  changeType:
                    "RELATIONSHIP_CREATED",

                  executionAuthorized:
                    false,
                },
              ]
            ),
        };


        const gateway =
          new IntegrationTopologyDiscoveryGateway({
            runtime,

            resourceDiscoveryGateway,

            resourceRepository:
              {},

            relationshipRepository:
              {},

            temporalTopologyQueryService,
          });


        gateway.persistRelationships =
          jest.fn(
            async () => ({
              persisted:
                1,

              executionAuthorized:
                false,
            })
          );


        const result =
          await gateway
            .getChanges({
              ...CONTEXT,

              from:
                "2026-08-30T00:00:00.000Z",

              to:
                "2026-08-30T01:00:00.000Z",
            });


        expect(
          resourceDiscoveryGateway
            .persistProviderResources
        ).toHaveBeenCalledTimes(
          1
        );


        expect(
          gateway
            .persistRelationships
        ).toHaveBeenCalledTimes(
          1
        );


        expect(
          temporalTopologyQueryService
            .getChangesBetween
        ).toHaveBeenCalledTimes(
          1
        );


        expect(
          result
            .canonicalChanges
        ).toHaveLength(
          1
        );


        expect(
          result
            .canonicalAuthority
        ).toBe(
          "PHASE_17_GRAPH_CHANGE_EVENTS"
        );


        expect(
          result.executionAuthorized
        ).toBe(
          false
        );
      }
    );


    test(
      "topology runtime cannot grant execution authority",
      async () => {
        const gateway =
          new IntegrationTopologyDiscoveryGateway({
            runtime: {
              discoverRelationships:
                jest.fn(
                  async () => ({
                    data:
                      {},

                    executionAuthorized:
                      true,
                  })
                ),
            },

            resourceRepository:
              {},

            relationshipRepository:
              {},

            resourceDiscoveryGateway:
              {},

            temporalTopologyQueryService:
              {},
          });


        await expect(
          gateway
            .discoverRelationships(
              CONTEXT
            )
        ).rejects
          .toMatchObject({
            code:
              "INTEGRATION_TOPOLOGY_AUTHORITY_VIOLATION",

            executionAuthorized:
              false,
          });
      }
    );
  }
);