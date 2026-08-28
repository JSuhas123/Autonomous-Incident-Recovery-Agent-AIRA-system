"use strict";

const ResourceGraphSystemDnaContributor =
  require(
    "../../services/memory/dna/ResourceGraphSystemDnaContributor"
  );

const {
  PostgresSystemDnaService,
} =
  require(
    "../../services/memory/dna/postgresSystemDnaService"
  );

const {
  ResourceGraphSystemDnaService,
} =
  require(
    "../../services/topology/ResourceGraphSystemDnaService"
  );


describe(
  "Phase 17.14 - Resource Graph <-> System DNA",
  function () {
    const organizationId =
      "aira-dev-org";

    const environmentId =
      "env_aira_development";

    const serviceId =
      "payments";

    const resourceId =
      "resource-api";

    const asOf =
      new Date(
        "2026-08-28T10:00:00.000Z"
      );


    test(
      "current Resource Graph produces deterministic DNA evidence",
      async function () {
        const resourceContext = {
          buildCurrentContext:
            jest.fn(
              async () => ({
                resource: {
                  id:
                    resourceId,

                  provider:
                    "kubernetes",

                  resourceType:
                    "kubernetes.deployment",

                  name:
                    "payments-api",
                },

                state: {
                  id:
                    "state-1",

                  resourceId,

                  observedAt:
                    asOf,

                  health:
                    "HEALTHY",

                  lifecycle:
                    "RUNNING",

                  version:
                    "v21",

                  fingerprint:
                    "state-fingerprint",
                },

                dependencies: {
                  outgoing: [
                    {
                      relationshipId:
                        "rel-db",

                      relationshipType:
                        "DEPENDS_ON",

                      resourceId:
                        "postgres",
                    },
                  ],

                  incoming: [],

                  counts: {
                    outgoing:
                      1,

                    incoming:
                      0,

                    total:
                      1,
                  },
                },

                topology: {
                  resources: [
                    {
                      id:
                        resourceId,
                    },

                    {
                      id:
                        "postgres",
                    },
                  ],

                  relationships: [
                    {
                      id:
                        "rel-db",
                    },
                  ],
                },

                evidenceOnly:
                  true,

                executionAuthorized:
                  false,
              })
            ),
        };


        const contributor =
          new ResourceGraphSystemDnaContributor({
            resourceContext,
          });


        const first =
          await contributor
            .contribute({
              input: {
                organizationId,

                environmentId,

                serviceId,

                resourceId,

                asOf,
              },

              built: {
                dna: {
                  scopeType:
                    "RESOURCE",
                },
              },
            });


        const second =
          await contributor
            .contribute({
              input: {
                organizationId,

                environmentId,

                serviceId,

                resourceId,

                asOf,
              },

              built: {
                dna: {
                  scopeType:
                    "RESOURCE",
                },
              },
            });


        expect(
          first.fingerprint
        ).toBe(
          second.fingerprint
        );


        expect(
          first.contributor
        ).toBe(
          "RESOURCE_GRAPH"
        );
      }
    );


    test(
      "does not contribute Resource evidence to non-RESOURCE DNA",
      async function () {
        const contributor =
          new ResourceGraphSystemDnaContributor({
            resourceContext:
              {},
          });


        const result =
          await contributor
            .contribute({
              input: {
                organizationId,
              },

              built: {
                dna: {
                  scopeType:
                    "TENANT",
                },
              },
            });


        expect(
          result
        ).toBeNull();
      }
    );


    test(
      "incident-aware contribution preserves correlation as evidence only",
      async function () {
        const resourceContext = {
          buildIncidentContext:
            jest.fn(
              async () => ({
                resource: {
                  id:
                    resourceId,

                  resourceType:
                    "application.service",
                },

                incident: {
                  id:
                    "incident-1",

                  publicId:
                    "incident-1",

                  severity:
                    "critical",
                },

                state: {
                  current: {
                    id:
                      "current",

                    health:
                      "HEALTHY",
                  },

                  incident: {
                    id:
                      "incident-state",

                    health:
                      "DEGRADED",
                  },

                  knownGood: {
                    id:
                      "known-good",

                    health:
                      "HEALTHY",
                  },
                },

                stateDelta: {
                  comparable:
                    true,

                  comparisonStatus:
                    "DIFFERENT",

                  materialDifferences: [
                    {
                      category:
                        "configuration",

                      path:
                        "replicas",

                      before:
                        4,

                      after:
                        2,
                    },
                  ],
                },

                dependencies: {
                  current: {
                    outgoing: [],
                    incoming: [],
                  },

                  preIncident: {
                    outgoing: [],
                    incoming: [],
                  },

                  incident: {
                    outgoing: [
                      {
                        relationshipId:
                          "rel-redis",

                        relationshipType:
                          "CONNECTS_TO",

                        resourceId:
                          "redis",
                      },
                    ],

                    incoming: [],
                  },

                  topologyChanged:
                    true,
                },

                recentChanges: [
                  {
                    id:
                      "change-1",

                    relationshipId:
                      "rel-redis",

                    changeType:
                      "RELATIONSHIP_CREATED",

                    changedAt:
                      new Date(
                        "2026-08-28T09:59:00.000Z"
                      ),
                  },
                ],

                correlation: {
                  candidates: [
                    {
                      rank:
                        1,
                    },
                  ],

                  strongestCandidate: {
                    candidateType:
                      "GRAPH_CHANGE",

                    changeId:
                      "change-1",

                    correlationStrength:
                      "STRONG",

                    score:
                      0.84,

                    causalityEstablished:
                      false,
                  },

                  causalityEstablished:
                    false,
                },
              })
            ),
        };


        const contributor =
          new ResourceGraphSystemDnaContributor({
            resourceContext,
          });


        const result =
          await contributor
            .contribute({
              input: {
                organizationId,

                environmentId,

                serviceId,

                resourceId,

                incidentId:
                  "incident-1",

                asOf,
              },

              built: {
                dna: {
                  scopeType:
                    "RESOURCE",
                },
              },
            });


        expect(
          result.evidence
            .projection
            .correlation
            .causalityEstablished
        ).toBe(
          false
        );


        expect(
          result.safety
            .executionAuthorized
        ).toBe(
          false
        );
      }
    );


    test(
      "Resource Graph evidence extends DNA fingerprint",
      async function () {
        const builder = {
          build:
            jest.fn(
              async () => ({
                dna: {
                  fingerprint:
                    "memory-fingerprint",

                  scopeType:
                    "RESOURCE",

                  environmentPublicId:
                    environmentId,

                  servicePublicId:
                    serviceId,

                  resourcePublicId:
                    resourceId,

                  traits: [],

                  metadata: {},

                  safety: {
                    evidenceOnly:
                      true,

                    executionAuthorized:
                      false,
                  },
                },

                aggregation: {
                  memoryCount:
                    1,
                },

                conflicts: {
                  conflictCount:
                    0,
                },
              })
            ),
        };


        const trustService = {
          score:
            jest.fn(
              () => ({
                score:
                  0.9,

                components:
                  {},

                provenance: {
                  evidenceCount:
                    1,
                },
              })
            ),
        };


        const repository = {
          findActive:
            jest.fn(
              async () =>
                null
            ),

          supersedeActive:
            jest.fn(),

          createSnapshot:
            jest.fn(
              async ({
                dna,
              }) => ({
                id:
                  "snapshot-1",

                fingerprint:
                  dna.fingerprint,
              })
            ),
        };


        const snapshotService = {
          compare:
            jest.fn(
              ({
                previous,
                current,
              }) => ({
                changed:
                  !previous ||
                  previous.fingerprint !==
                    current.fingerprint,

                currentFingerprint:
                  current.fingerprint,
              })
            ),
        };


        const contributor = {
          contribute:
            jest.fn(
              async () => ({
                contributor:
                  "RESOURCE_GRAPH",

                version:
                  "17.14.v1",

                fingerprint:
                  "graph-fingerprint",

                evidence: {
                  projection: {},
                },

                traits: [
                  {
                    trait:
                      "RESOURCE_GRAPH_EVIDENCE_AVAILABLE",
                  },
                ],

                safety: {
                  evidenceOnly:
                    true,

                  executionAuthorized:
                    false,

                  grantsExecutionPermission:
                    false,

                  bypassesPolicy:
                    false,
                },
              })
            ),
        };


        const service =
          new PostgresSystemDnaService({
            builder,

            trustService,

            repository,

            snapshotService,

            evidenceContributors: [
              contributor,
            ],
          });


        const result =
          await service.rebuild({
            organizationId,

            environmentId,

            serviceId,

            resourceId,

            scopeType:
              "RESOURCE",
          });


        expect(
          result.dna.fingerprint
        ).not.toBe(
          "memory-fingerprint"
        );


        expect(
          result.dna.metadata
            .baseMemoryFingerprint
        ).toBe(
          "memory-fingerprint"
        );


        expect(
          result.created
        ).toBe(
          true
        );
      }
    );


    test(
      "same memory and same graph evidence remain idempotent",
      async function () {
        const builder = {
          build:
            jest.fn(
              async () => ({
                dna: {
                  fingerprint:
                    "memory-fingerprint",

                  scopeType:
                    "RESOURCE",

                  environmentPublicId:
                    environmentId,

                  servicePublicId:
                    serviceId,

                  resourcePublicId:
                    resourceId,

                  traits: [],

                  metadata: {},
                },

                aggregation:
                  {},

                conflicts:
                  {},
              })
            ),
        };


        const trustService = {
          score:
            jest.fn(
              () => ({
                score:
                  0.9,

                components:
                  {},

                provenance: {
                  evidenceCount:
                    1,
                },
              })
            ),
        };


        let storedFingerprint =
          null;


        const repository = {
          findActive:
            jest.fn(
              async () =>
                storedFingerprint
                  ? {
                      fingerprint:
                        storedFingerprint,
                    }
                  : null
            ),

          supersedeActive:
            jest.fn(),

          createSnapshot:
            jest.fn(
              async ({
                dna,
              }) => {
                storedFingerprint =
                  dna.fingerprint;


                return {
                  fingerprint:
                    dna.fingerprint,
                };
              }
            ),
        };


        const snapshotService = {
          compare({
            previous,
            current,
          }) {
            return {
              changed:
                !previous ||
                previous.fingerprint !==
                  current.fingerprint,
            };
          },
        };


        const contributor = {
          contribute:
            jest.fn(
              async () => ({
                contributor:
                  "RESOURCE_GRAPH",

                version:
                  "17.14.v1",

                fingerprint:
                  "stable-graph",

                evidence:
                  {},

                traits:
                  [],

                safety: {
                  evidenceOnly:
                    true,

                  executionAuthorized:
                    false,

                  grantsExecutionPermission:
                    false,

                  bypassesPolicy:
                    false,
                },
              })
            ),
        };


        const service =
          new PostgresSystemDnaService({
            builder,

            trustService,

            repository,

            snapshotService,

            evidenceContributors: [
              contributor,
            ],
          });


        const first =
          await service.rebuild({
            organizationId,

            environmentId,

            serviceId,

            resourceId,

            scopeType:
              "RESOURCE",
          });


        const second =
          await service.rebuild({
            organizationId,

            environmentId,

            serviceId,

            resourceId,

            scopeType:
              "RESOURCE",
          });


        expect(
          first.created
        ).toBe(
          true
        );


        expect(
          second.duplicate
        ).toBe(
          true
        );


        expect(
          repository
            .createSnapshot
        ).toHaveBeenCalledTimes(
          1
        );
      }
    );


    test(
      "changed Resource Graph evidence creates new DNA snapshot",
      async function () {
        const builder = {
          build:
            jest.fn(
              async () => ({
                dna: {
                  fingerprint:
                    "same-memory",

                  scopeType:
                    "RESOURCE",

                  environmentPublicId:
                    environmentId,

                  servicePublicId:
                    serviceId,

                  resourcePublicId:
                    resourceId,

                  traits: [],

                  metadata: {},
                },

                aggregation:
                  {},

                conflicts:
                  {},
              })
            ),
        };


        const trustService = {
          score:
            jest.fn(
              () => ({
                score:
                  0.9,

                components:
                  {},

                provenance: {
                  evidenceCount:
                    1,
                },
              })
            ),
        };


        let active =
          null;


        const repository = {
          findActive:
            jest.fn(
              async () =>
                active
            ),

          supersedeActive:
            jest.fn(
              async () => {
                active =
                  null;
              }
            ),

          createSnapshot:
            jest.fn(
              async ({
                dna,
              }) => {
                active = {
                  fingerprint:
                    dna.fingerprint,
                };


                return active;
              }
            ),
        };


        const snapshotService = {
          compare({
            previous,
            current,
          }) {
            return {
              changed:
                !previous ||
                previous.fingerprint !==
                  current.fingerprint,
            };
          },
        };


        let graphFingerprint =
          "graph-v1";


        const contributor = {
          contribute:
            jest.fn(
              async () => ({
                contributor:
                  "RESOURCE_GRAPH",

                version:
                  "17.14.v1",

                fingerprint:
                  graphFingerprint,

                evidence:
                  {},

                traits:
                  [],

                safety: {
                  evidenceOnly:
                    true,

                  executionAuthorized:
                    false,

                  grantsExecutionPermission:
                    false,

                  bypassesPolicy:
                    false,
                },
              })
            ),
        };


        const service =
          new PostgresSystemDnaService({
            builder,

            trustService,

            repository,

            snapshotService,

            evidenceContributors: [
              contributor,
            ],
          });


        await service.rebuild({
          organizationId,

          environmentId,

          serviceId,

          resourceId,

          scopeType:
            "RESOURCE",
        });


        graphFingerprint =
          "graph-v2";


        const second =
          await service.rebuild({
            organizationId,

            environmentId,

            serviceId,

            resourceId,

            scopeType:
              "RESOURCE",
          });


        expect(
          second.created
        ).toBe(
          true
        );


        expect(
          repository
            .createSnapshot
        ).toHaveBeenCalledTimes(
          2
        );
      }
    );


    test(
      "Resource Graph does not increase memory evidence count or trust",
      async function () {
        const builder = {
          build:
            jest.fn(
              async () => ({
                dna: {
                  fingerprint:
                    "memory",

                  evidenceMemoryIds: [
                    "mem-1",
                  ],

                  evidenceCount:
                    1,

                  scopeType:
                    "RESOURCE",

                  environmentPublicId:
                    environmentId,

                  servicePublicId:
                    serviceId,

                  resourcePublicId:
                    resourceId,

                  traits: [],

                  metadata: {},
                },

                aggregation: {
                  memoryCount:
                    1,
                },

                conflicts:
                  {},
              })
            ),
        };


        const trustService = {
          score:
            jest.fn(
              () => ({
                score:
                  0.5,

                components:
                  {},

                provenance: {
                  evidenceCount:
                    1,
                },
              })
            ),
        };


        const service =
          new PostgresSystemDnaService({
            builder,

            trustService,

            snapshotService: {
              compare:
                () => ({
                  changed:
                    true,
                }),
            },

            repository: {
              findActive:
                async () =>
                  null,

              createSnapshot:
                async ({
                  dna,
                }) => ({
                  dna,
                }),
            },

            evidenceContributors: [
              {
                contribute:
                  async () => ({
                    contributor:
                      "RESOURCE_GRAPH",

                    fingerprint:
                      "graph",

                    evidence:
                      {},

                    traits:
                      [],

                    safety: {
                      evidenceOnly:
                        true,

                      executionAuthorized:
                        false,

                      grantsExecutionPermission:
                        false,

                      bypassesPolicy:
                        false,
                    },
                  }),
              },
            ],
          });


        const result =
          await service.rebuild({
            organizationId,

            environmentId,

            serviceId,

            resourceId,

            scopeType:
              "RESOURCE",
          });


        expect(
          result.dna.evidenceCount
        ).toBe(
          1
        );


        expect(
          result.dna.evidenceMemoryIds
        ).toEqual([
          "mem-1",
        ]);


        expect(
          result.dna.trustScore
        ).toBe(
          0.5
        );
      }
    );


    test(
      "unsafe contributor is rejected",
      async function () {
        const service =
          new PostgresSystemDnaService({
            builder: {
              build:
                async () => ({
                  dna: {
                    fingerprint:
                      "memory",

                    scopeType:
                      "RESOURCE",
                  },

                  aggregation:
                    {},

                  conflicts:
                    {},
                }),
            },

            evidenceContributors: [
              {
                contribute:
                  async () => ({
                    contributor:
                      "RESOURCE_GRAPH",

                    fingerprint:
                      "bad",

                    safety: {
                      evidenceOnly:
                        false,

                      executionAuthorized:
                        true,

                      grantsExecutionPermission:
                        true,

                      bypassesPolicy:
                        true,
                    },
                  }),
              },
            ],
          });


        await expect(
          service.rebuild({
            organizationId,

            environmentId,

            serviceId,

            resourceId,

            scopeType:
              "RESOURCE",
          })
        ).rejects.toMatchObject({
          code:
            "SYSTEM_DNA_CONTRIBUTOR_SAFETY_VIOLATION",
        });
      }
    );


    test(
      "integration service forces RESOURCE DNA scope",
      async function () {
        const systemDna = {
          rebuild:
            jest.fn(
              async (
                input
              ) =>
                input
            ),
        };


        const service =
          new ResourceGraphSystemDnaService({
            contributor:
              {},

            systemDna,
          });


        const result =
          await service
            .rebuildResourceDna({
              organizationId,

              environmentId,

              serviceId,

              resourceId,
            });


        expect(
          result.scopeType
        ).toBe(
          "RESOURCE"
        );
      }
    );


    test(
      "integration never exposes execution methods",
      function () {
        const service =
          new ResourceGraphSystemDnaService({
            contributor:
              {},

            systemDna:
              {},
          });


        expect(
          service.authorize
        ).toBeUndefined();


        expect(
          service.execute
        ).toBeUndefined();


        expect(
          service.executeRecovery
        ).toBeUndefined();
      }
    );
  }
);