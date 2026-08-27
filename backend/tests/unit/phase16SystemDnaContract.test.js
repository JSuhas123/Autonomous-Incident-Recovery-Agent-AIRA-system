"use strict";


const {
  SystemDnaContract,
  SYSTEM_DNA_MEMORY_FAMILIES,
} =
  require(
    "../../services/memory/dna/systemDnaContract"
  );


const {
  SystemDnaService,
} =
  require(
    "../../services/memory/dna/systemDnaService"
  );


describe(
  "Phase 16.15A System DNA contract",
  () => {

    test(
      "supports all six Phase 16 memory families",
      () => {
        expect(
          SYSTEM_DNA_MEMORY_FAMILIES
        ).toEqual([
          "EPISODIC",
          "OUTCOME",
          "PROCEDURAL",
          "SEMANTIC",
          "HUMAN",
          "BEHAVIOURAL",
        ]);
      }
    );


    test(
      "creates tenant System DNA",
      () => {
        const contract =
          new SystemDnaContract();


        const dna =
          contract
            .createDna({
              organizationId:
                "org-uuid",

              tenantPublicId:
                "aira-dev-org",

              scopeType:
                "TENANT",

              evidenceMemoryIds: [
                "mem-1",
                "mem-2",
              ],

              memoryFamilyCounts: {
                EPISODIC:
                  1,

                PROCEDURAL:
                  1,
              },

              confidence:
                0.8,

              trustScore:
                0.9,
            });


        expect(
          dna.scopeType
        ).toBe(
          "TENANT"
        );


        expect(
          dna.evidenceCount
        ).toBe(
          2
        );


        expect(
          dna.memoryFamilyCounts
            .EPISODIC
        ).toBe(
          1
        );


        expect(
          dna.safety
            .executionAuthorized
        ).toBe(
          false
        );
      }
    );


    test(
      "SERVICE DNA requires environment and service identity",
      () => {
        const contract =
          new SystemDnaContract();


        expect(
          () =>
            contract
              .createDna({
                organizationId:
                  "org-uuid",

                scopeType:
                  "SERVICE",
              })
        ).toThrow(
          expect.objectContaining({
            code:
              "SYSTEM_DNA_SERVICE_IDENTITY_REQUIRED",
          })
        );
      }
    );


    test(
      "RESOURCE DNA requires environment service and resource",
      () => {
        const contract =
          new SystemDnaContract();


        expect(
          () =>
            contract
              .createDna({
                organizationId:
                  "org-uuid",

                scopeType:
                  "RESOURCE",

                environmentId:
                  "env",

                serviceId:
                  "service",
              })
        ).toThrow(
          expect.objectContaining({
            code:
              "SYSTEM_DNA_RESOURCE_IDENTITY_REQUIRED",
          })
        );
      }
    );


    test(
      "DNA fingerprint is deterministic for same evidence",
      () => {
        const contract =
          new SystemDnaContract();


        const first =
          contract
            .createDna({
              organizationId:
                "org",

              scopeType:
                "TENANT",

              evidenceMemoryIds: [
                "mem-b",
                "mem-a",
              ],
            });


        const second =
          contract
            .createDna({
              organizationId:
                "org",

              scopeType:
                "TENANT",

              evidenceMemoryIds: [
                "mem-a",
                "mem-b",
              ],
            });


        expect(
          first.fingerprint
        ).toBe(
          second.fingerprint
        );
      }
    );


    test(
      "DNA confidence and trust are bounded",
      () => {
        const contract =
          new SystemDnaContract();


        const dna =
          contract
            .createDna({
              organizationId:
                "org",

              scopeType:
                "TENANT",

              confidence:
                8,

              trustScore:
                -2,
            });


        expect(
          dna.confidence
        ).toBe(
          1
        );


        expect(
          dna.trustScore
        ).toBe(
          0
        );
      }
    );


    test(
      "System DNA never grants execution authority",
      () => {
        const service =
          new SystemDnaService();


        const dna =
          service
            .build({
              organizationId:
                "org",

              scopeType:
                "TENANT",
            });


        expect(
          dna.safety
            .evidenceOnly
        ).toBe(
          true
        );


        expect(
          dna.safety
            .executionAuthorized
        ).toBe(
          false
        );


        expect(
          dna.safety
            .grantsExecutionPermission
        ).toBe(
          false
        );


        expect(
          dna.safety
            .bypassesPolicy
        ).toBe(
          false
        );


        expect(
          dna.safety
            .bypassesApproval
        ).toBe(
          false
        );


        expect(
          dna.safety
            .bypassesEntitlements
        ).toBe(
          false
        );


        expect(
          dna.safety
            .bypassesKillSwitch
        ).toBe(
          false
        );
      }
    );
  }
);