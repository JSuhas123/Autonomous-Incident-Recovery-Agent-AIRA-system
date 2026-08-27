"use strict";


const {
  MemoryScopeResolver,
  SCOPE_PRIORITY,
  SCOPE_ORDER,
} =
  require(
    "../../services/memory/context/memoryScopeResolver"
  );


describe(
  "Phase 16.14C memory scope resolver",
  () => {

    let resolver;


    const request = {
      organizationId:
        "aira-dev-org",

      environmentId:
        "env_aira_development",

      serviceId:
        "service-api",

      resourceId:
        "resource-api-01",

      incidentId:
        "inc-123",
    };


    beforeEach(
      () => {
        resolver =
          new MemoryScopeResolver();
      }
    );


    function memory(
      scopeType,
      overrides =
        {}
    ) {
      return {
        publicId:
          `mem-${scopeType.toLowerCase()}`,

        memoryType:
          "SEMANTIC",

        scopeType,

        organizationId:
          "aira-dev-org",

        environmentId:
          "env_aira_development",

        serviceId:
          "service-api",

        resourceId:
          "resource-api-01",

        incidentId:
          "inc-123",

        status:
          "ACTIVE",

        ...overrides,
      };
    }


    test(
      "defines deterministic operational scope hierarchy",
      () => {
        expect(
          SCOPE_ORDER
        ).toEqual([
          "INCIDENT",
          "RESOURCE",
          "SERVICE",
          "ENVIRONMENT",
          "TENANT",
          "GLOBAL",
        ]);


        expect(
          SCOPE_PRIORITY.INCIDENT
        ).toBeGreaterThan(
          SCOPE_PRIORITY.RESOURCE
        );


        expect(
          SCOPE_PRIORITY.RESOURCE
        ).toBeGreaterThan(
          SCOPE_PRIORITY.SERVICE
        );


        expect(
          SCOPE_PRIORITY.SERVICE
        ).toBeGreaterThan(
          SCOPE_PRIORITY.ENVIRONMENT
        );


        expect(
          SCOPE_PRIORITY.ENVIRONMENT
        ).toBeGreaterThan(
          SCOPE_PRIORITY.TENANT
        );


        expect(
          SCOPE_PRIORITY.TENANT
        ).toBeGreaterThan(
          SCOPE_PRIORITY.GLOBAL
        );
      }
    );


    test(
      "accepts exact incident memory",
      () => {
        const result =
          resolver.resolve({
            memory:
              memory(
                "INCIDENT"
              ),

            request,
          });


        expect(
          result
        ).toMatchObject({
          eligible:
            true,

          scopeType:
            "INCIDENT",

          scopeScore:
            600,

          matchLevel:
            "INCIDENT",

          rejectionReason:
            null,
        });
      }
    );


    test(
      "rejects memory from another incident",
      () => {
        const result =
          resolver.resolve({
            memory:
              memory(
                "INCIDENT",
                {
                  incidentId:
                    "inc-foreign",
                }
              ),

            request,
          });


        expect(
          result.eligible
        ).toBe(
          false
        );


        expect(
          result.rejectionReason
        ).toBe(
          "INCIDENT_MISMATCH"
        );
      }
    );


    test(
      "accepts exact resource memory",
      () => {
        const result =
          resolver.resolve({
            memory:
              memory(
                "RESOURCE"
              ),

            request,
          });


        expect(
          result.eligible
        ).toBe(
          true
        );


        expect(
          result.scopeScore
        ).toBe(
          500
        );
      }
    );


    test(
      "rejects memory for another resource",
      () => {
        const result =
          resolver.resolve({
            memory:
              memory(
                "RESOURCE",
                {
                  resourceId:
                    "resource-other",
                }
              ),

            request,
          });


        expect(
          result
            .rejectionReason
        ).toBe(
          "RESOURCE_MISMATCH"
        );
      }
    );


    test(
      "accepts exact service memory",
      () => {
        const result =
          resolver.resolve({
            memory:
              memory(
                "SERVICE"
              ),

            request,
          });


        expect(
          result.eligible
        ).toBe(
          true
        );


        expect(
          result.scopeScore
        ).toBe(
          400
        );
      }
    );


    test(
      "rejects service memory belonging to another service",
      () => {
        const result =
          resolver.resolve({
            memory:
              memory(
                "SERVICE",
                {
                  serviceId:
                    "service-payments",
                }
              ),

            request,
          });


        expect(
          result
            .rejectionReason
        ).toBe(
          "SERVICE_MISMATCH"
        );
      }
    );


    test(
      "accepts matching environment memory",
      () => {
        const result =
          resolver.resolve({
            memory:
              memory(
                "ENVIRONMENT"
              ),

            request,
          });


        expect(
          result.eligible
        ).toBe(
          true
        );


        expect(
          result.scopeScore
        ).toBe(
          300
        );
      }
    );


    test(
      "tenant memory is accepted for same tenant",
      () => {
        const result =
          resolver.resolve({
            memory:
              memory(
                "TENANT"
              ),

            request,
          });


        expect(
          result.eligible
        ).toBe(
          true
        );


        expect(
          result.scopeScore
        ).toBe(
          200
        );
      }
    );


    test(
      "cross-tenant memory is rejected before scope ranking",
      () => {
        const result =
          resolver.resolve({
            memory:
              memory(
                "INCIDENT",
                {
                  organizationId:
                    "foreign-org",
                }
              ),

            request,
          });


        expect(
          result.eligible
        ).toBe(
          false
        );


        expect(
          result
            .rejectionReason
        ).toBe(
          "TENANT_MISMATCH"
        );
      }
    );


    test(
      "global memory is rejected unless explicitly requested",
      () => {
        const result =
          resolver.resolve({
            memory:
              memory(
                "GLOBAL",
                {
                  organizationId:
                    null,

                  environmentId:
                    null,

                  serviceId:
                    null,

                  resourceId:
                    null,

                  incidentId:
                    null,
                }
              ),

            request,

            includeGlobal:
              false,
          });


        expect(
          result.eligible
        ).toBe(
          false
        );


        expect(
          result
            .rejectionReason
        ).toBe(
          "GLOBAL_MEMORY_NOT_REQUESTED"
        );
      }
    );


    test(
      "global memory is accepted when explicitly enabled",
      () => {
        const result =
          resolver.resolve({
            memory:
              memory(
                "GLOBAL",
                {
                  organizationId:
                    null,
                }
              ),

            request,

            includeGlobal:
              true,
          });


        expect(
          result
        ).toMatchObject({
          eligible:
            true,

          scopeScore:
            100,

          matchLevel:
            "GLOBAL",
        });
      }
    );


    test(
      "resolveMany orders accepted memories from most local to broadest",
      () => {
        const result =
          resolver.resolveMany({
            memories: [
              memory(
                "GLOBAL",
                {
                  organizationId:
                    null,
                }
              ),

              memory(
                "TENANT"
              ),

              memory(
                "SERVICE"
              ),

              memory(
                "INCIDENT"
              ),

              memory(
                "ENVIRONMENT"
              ),

              memory(
                "RESOURCE"
              ),
            ],

            request,

            includeGlobal:
              true,
          });


        expect(
          result.accepted.map(
            (
              item
            ) =>
              item
                .resolution
                .scopeType
          )
        ).toEqual([
          "INCIDENT",
          "RESOURCE",
          "SERVICE",
          "ENVIRONMENT",
          "TENANT",
          "GLOBAL",
        ]);


        expect(
          result
            .diagnostics
            .acceptedCount
        ).toBe(
          6
        );


        expect(
          result
            .diagnostics
            .rejectedCount
        ).toBe(
          0
        );
      }
    );

    test(
  "PostgreSQL UUID memory uses verified public tenant identity for scope resolution",
  () => {
    const resolver =
      new MemoryScopeResolver();


    const result =
      resolver.resolve({
        memory: {
          publicId:
            "mem-real",

          organizationId:
            "7644e288-cb54-4f7c-adcc-afc73e202041",

          tenantPublicId:
            "aira-dev-org",

          environmentId:
            "31b283ea-22b1-4786-80ec-7ba889cdd7b4",

          environmentPublicId:
            "env_aira_development",

          serviceId:
            "phase16-certification-service",

          servicePublicId:
            "phase16-certification-service",

          memoryType:
            "BEHAVIOURAL",

          scopeType:
            "SERVICE",

          status:
            "ACTIVE",
        },

        request: {
          organizationId:
            "aira-dev-org",

          environmentId:
            "env_aira_development",

          serviceId:
            "phase16-certification-service",
        },
      });


    expect(
      result.eligible
    ).toBe(
      true
    );


    expect(
      result.scopeType
    ).toBe(
      "SERVICE"
    );


    expect(
      result.scopeScore
    ).toBe(
      400
    );
  }
);


test(
  "incident scope uses PostgreSQL-verified public incident identity",
  () => {
    const resolver =
      new MemoryScopeResolver();


    const result =
      resolver.resolve({
        memory: {
          organizationId:
            "7644e288-cb54-4f7c-adcc-afc73e202041",

          tenantPublicId:
            "aira-dev-org",

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

        request: {
          organizationId:
            "aira-dev-org",

          incidentId:
            "phase16_10_cert_inc_3",
        },
      });


    expect(
      result.eligible
    ).toBe(
      true
    );


    expect(
      result.scopeScore
    ).toBe(
      600
    );
  }
);


test(
  "verified public identity cannot authorize foreign tenant",
  () => {
    const resolver =
      new MemoryScopeResolver();


    const result =
      resolver.resolve({
        memory: {
          organizationId:
            "some-postgres-uuid",

          tenantPublicId:
            "foreign-org",

          serviceId:
            "service-api",

          memoryType:
            "SEMANTIC",

          scopeType:
            "SERVICE",

          status:
            "ACTIVE",
        },

        request: {
          organizationId:
            "aira-dev-org",

          serviceId:
            "service-api",
        },
      });


    expect(
      result.eligible
    ).toBe(
      false
    );


    expect(
      result.rejectionReason
    ).toBe(
      "TENANT_MISMATCH"
    );
  }
);

    test(
      "resolveMany reports rejection reasons",
      () => {
        const result =
          resolver.resolveMany({
            memories: [
              memory(
                "INCIDENT",
                {
                  incidentId:
                    "wrong-incident",
                }
              ),

              memory(
                "SERVICE",
                {
                  serviceId:
                    "wrong-service",
                }
              ),

              memory(
                "TENANT",
                {
                  organizationId:
                    "wrong-org",
                }
              ),
            ],

            request,
          });


        expect(
          result
            .diagnostics
            .acceptedCount
        ).toBe(
          0
        );


        expect(
          result
            .diagnostics
            .rejectedCount
        ).toBe(
          3
        );


        expect(
          result
            .diagnostics
            .rejectionReasons
        ).toEqual({
          INCIDENT_MISMATCH:
            1,

          SERVICE_MISMATCH:
            1,

          TENANT_MISMATCH:
            1,
        });
      }
    );
  }
);