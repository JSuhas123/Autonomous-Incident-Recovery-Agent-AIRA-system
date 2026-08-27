"use strict";


const {
  MemoryContextContract,
  AGENT_MEMORY_TYPES,
} =
  require(
    "../../services/memory/context/memoryContextContract"
  );


describe(
  "Phase 16.14A memory context contract",
  () => {

    let contract;


    beforeEach(
      () => {
        contract =
          new MemoryContextContract();
      }
    );


    function memory(
      overrides =
        {}
    ) {
      return {
        id:
          "memory-uuid",

        publicId:
          "mem_test_1",

        organizationId:
          "aira-dev-org",

        environmentId:
          "env_aira_development",

        memoryType:
          "EPISODIC",

        scopeType:
          "INCIDENT",

        title:
          "Test memory",

        summary:
          "Test memory summary",

        confidence:
          0.9,

        trustScore:
          0.8,

        importance:
          0.7,

        status:
          "ACTIVE",

        metadata: {
          executionAuthorized:
            false,
        },

        ...overrides,
      };
    }


    test(
      "supports all six Phase 16 operational memory families",
      () => {
        expect(
          AGENT_MEMORY_TYPES
        ).toEqual(
          [
            "EPISODIC",
            "OUTCOME",
            "PROCEDURAL",
            "SEMANTIC",
            "HUMAN",
            "BEHAVIOURAL",
          ]
        );
      }
    );


    test(
      "creates canonical agent memory context",
      () => {
        const context =
          contract
            .createContext({
              organizationId:
                "aira-dev-org",

              environmentId:
                "env_aira_development",

              incidentId:
                "inc-1",

              query:
                "Why is API latency high?",

              memories: [
                memory(),
              ],
            });


        expect(
          context.request.organizationId
        ).toBe(
          "aira-dev-org"
        );


        expect(
          context.counts.total
        ).toBe(
          1
        );


        expect(
          context.counts.episodic
        ).toBe(
          1
        );


        expect(
          context.retrieval.candidateStore
        ).toBe(
          "qdrant"
        );


        expect(
          context.retrieval.authoritativeStore
        ).toBe(
          "postgresql"
        );
      }
    );


    test(
      "groups memories by operational memory family",
      () => {
        const context =
          contract
            .createContext({
              organizationId:
                "aira-dev-org",

              query:
                "Investigate service",

              memories: [
                memory({
                  publicId:
                    "episode",

                  memoryType:
                    "EPISODIC",
                }),

                memory({
                  publicId:
                    "outcome",

                  memoryType:
                    "OUTCOME",
                }),

                memory({
                  publicId:
                    "procedure",

                  memoryType:
                    "PROCEDURAL",
                }),

                memory({
                  publicId:
                    "semantic",

                  memoryType:
                    "SEMANTIC",
                }),

                memory({
                  publicId:
                    "human",

                  memoryType:
                    "HUMAN",
                }),

                memory({
                  publicId:
                    "behaviour",

                  memoryType:
                    "BEHAVIOURAL",
                }),
              ],
            });


        expect(
          context.counts
        ).toEqual({
          total:
            6,

          episodic:
            1,

          outcome:
            1,

          procedural:
            1,

          semantic:
            1,

          human:
            1,

          behavioural:
            1,
        });
      }
    );


    test(
      "rejects cross-tenant memory",
      () => {
        expect(
          () =>
            contract
              .createContext({
                organizationId:
                  "aira-dev-org",

                query:
                  "Investigate",

                memories: [
                  memory({
                    organizationId:
                      "different-org",
                  }),
                ],
              })
        ).toThrow(
          expect.objectContaining({
            code:
              "MEMORY_CONTEXT_TENANT_VIOLATION",
          })
        );
      }
    );


    test(
      "allows GLOBAL knowledge without tenant ownership",
      () => {
        const context =
          contract
            .createContext({
              organizationId:
                "aira-dev-org",

              query:
                "Investigate",

              memories: [
                memory({
                  organizationId:
                    null,

                  scopeType:
                    "GLOBAL",

                  memoryType:
                    "SEMANTIC",
                }),
              ],
            });


        expect(
          context.counts.semantic
        ).toBe(
          1
        );
      }
    );


    test(
      "rejects unsupported memory types",
      () => {
        expect(
          () =>
            contract
              .createContext({
                organizationId:
                  "aira-dev-org",

                query:
                  "Investigate",

                memories: [
                  memory({
                    memoryType:
                      "UNKNOWN_MEMORY",
                  }),
                ],
              })
        ).toThrow(
          expect.objectContaining({
            code:
              "MEMORY_CONTEXT_TYPE_UNSUPPORTED",
          })
        );
      }
    );


    test(
      "memory context never grants infrastructure execution",
      () => {
        const context =
          contract
            .createContext({
              organizationId:
                "aira-dev-org",

              query:
                "Should we restart API?",

              memories: [
                memory({
                  memoryType:
                    "PROCEDURAL",
                }),
              ],
            });


        expect(
          context.safety.executionAuthorized
        ).toBe(
          false
        );


        expect(
          context.safety.grantsExecutionPermission
        ).toBe(
          false
        );


        expect(
          context.safety.bypassesPolicy
        ).toBe(
          false
        );


        expect(
          context.safety.suppressesAlerts
        ).toBe(
          false
        );


        expect(
          contract.assertSafeContext(
            context
          )
        ).toBe(
          true
        );
      }
    );


    test(
  "PostgreSQL hydrated UUID memory accepts verified public tenant identity",
  () => {
    const contract =
      new MemoryContextContract();


    const context =
      contract.createContext({
        organizationId:
          "aira-dev-org",

        query:
          "Investigate",

        memories: [
          {
            publicId:
              "mem-real",

            organizationId:
              "7644e288-cb54-4f7c-adcc-afc73e202041",

            tenantPublicId:
              "aira-dev-org",

            memoryType:
              "BEHAVIOURAL",

            scopeType:
              "SERVICE",

            status:
              "ACTIVE",
          },
        ],
      });


    expect(
      context.counts.total
    ).toBe(
      1
    );


    expect(
      context.memories[0]
        .organizationId
    ).toBe(
      "7644e288-cb54-4f7c-adcc-afc73e202041"
    );


    expect(
      context.memories[0]
        .tenantPublicId
    ).toBe(
      "aira-dev-org"
    );
  }
);


test(
  "verified public tenant identity still rejects foreign tenant",
  () => {
    const contract =
      new MemoryContextContract();


    expect(
      () =>
        contract.createContext({
          organizationId:
            "aira-dev-org",

          query:
            "Investigate",

          memories: [
            {
              publicId:
                "mem-foreign",

              organizationId:
                "some-postgres-uuid",

              tenantPublicId:
                "foreign-org",

              memoryType:
                "SEMANTIC",

              scopeType:
                "SERVICE",

              status:
                "ACTIVE",
            },
          ],
        })
    ).toThrow(
      expect.objectContaining({
        code:
          "MEMORY_CONTEXT_TENANT_VIOLATION",
      })
    );
  }
);

test(
  "verified public incident identity survives context normalization",
  () => {
    const contract =
      new MemoryContextContract();


    const context =
      contract.createContext({
        organizationId:
          "aira-dev-org",

        incidentId:
          "phase16_10_cert_inc_3",

        query:
          "What happened after recovery?",

        memories: [
          {
            publicId:
              "outcome-memory",

            organizationId:
              "7644e288-cb54-4f7c-adcc-afc73e202041",

            tenantPublicId:
              "aira-dev-org",

            environmentId:
              "31b283ea-22b1-4786-80ec-7ba889cdd7b4",

            environmentPublicId:
              "env_aira_development",

            incidentId:
              "95a73c4c-9b92-454d-8678-29a22e13e0af",

            incidentPublicId:
              "phase16_10_cert_inc_3",

            memoryType:
              "OUTCOME",

            scopeType:
              "INCIDENT",

            status:
              "ACTIVE",
          },
        ],
      });


    expect(
      context.memories[0]
        .tenantPublicId
    ).toBe(
      "aira-dev-org"
    );


    expect(
      context.memories[0]
        .incidentPublicId
    ).toBe(
      "phase16_10_cert_inc_3"
    );


    expect(
      context.memories[0]
        .incidentId
    ).toBe(
      "95a73c4c-9b92-454d-8678-29a22e13e0af"
    );
  }
);

    test(
      "unsafe mutated context is rejected",
      () => {
        const context =
          contract
            .createContext({
              organizationId:
                "aira-dev-org",

              query:
                "Investigate",

              memories:
                [],
            });


        context
          .safety
          .executionAuthorized =
          true;


        expect(
          () =>
            contract
              .assertSafeContext(
                context
              )
        ).toThrow(
          expect.objectContaining({
            code:
              "MEMORY_CONTEXT_SAFETY_VIOLATION",
          })
        );
      }
    );
  }
);