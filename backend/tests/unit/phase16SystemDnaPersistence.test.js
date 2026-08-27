"use strict";


const {
  SystemDnaTrustService,
} =
  require(
    "../../services/memory/dna/systemDnaTrustService"
  );


const {
  SystemDnaSnapshotService,
} =
  require(
    "../../services/memory/dna/systemDnaSnapshotService"
  );


const {
  PostgresSystemDnaService,
} =
  require(
    "../../services/memory/dna/postgresSystemDnaService"
  );


describe(
  "Phase 16.15E-G System DNA trust snapshots and persistence",
  () => {

    test(
      "DNA trust reflects coverage evidence and conflicts",
      () => {
        const service =
          new SystemDnaTrustService();


        const result =
          service.score({
            aggregation: {
              averageTrust:
                0.9,

              averageConfidence:
                0.8,

              evidenceCount:
                12,

              memoryCount:
                12,

              evidenceMemoryIds: [
                "a",
                "b",
              ],

              coverage: {
                familyCount:
                  6,
              },
            },

            conflicts: {
              conflictCount:
                1,

              requiresHumanReview:
                true,

              critical:
                false,
            },
          });


        expect(
          result.score
        ).toBeGreaterThan(
          0
        );


        expect(
          result.score
        ).toBeLessThanOrEqual(
          1
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
      "same fingerprint does not require another snapshot",
      () => {
        const service =
          new SystemDnaSnapshotService();


        const result =
          service.compare({
            previous: {
              fingerprint:
                "abc",
            },

            current: {
              fingerprint:
                "abc",
            },
          });


        expect(
          result.changed
        ).toBe(
          false
        );


        expect(
          result.reason
        ).toBe(
          "UNCHANGED"
        );
      }
    );


    test(
      "changed fingerprint requires rebuild",
      () => {
        const service =
          new SystemDnaSnapshotService();


        const result =
          service.compare({
            previous: {
              fingerprint:
                "abc",
            },

            current: {
              fingerprint:
                "def",
            },
          });


        expect(
          result.changed
        ).toBe(
          true
        );


        expect(
          result.reason
        ).toBe(
          "DNA_CHANGED"
        );
      }
    );


    test(
      "initial DNA creates snapshot",
      async () => {
        const builder = {
          build:
            jest.fn(
              async () => ({
                dna: {
                  fingerprint:
                    "fingerprint-one",

                  scopeType:
                    "SERVICE",

                  environmentPublicId:
                    "env",

                  servicePublicId:
                    "service",

                  evidenceCount:
                    2,

                  trustScore:
                    0,

                  metadata: {},
                },

                aggregation: {
                  averageTrust:
                    0.8,

                  averageConfidence:
                    0.8,

                  evidenceCount:
                    2,

                  memoryCount:
                    2,

                  evidenceMemoryIds: [
                    "mem-1",
                    "mem-2",
                  ],

                  coverage: {
                    familyCount:
                      2,
                  },
                },

                conflicts: {
                  conflictCount:
                    0,

                  requiresHumanReview:
                    false,

                  critical:
                    false,
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
              async () => ({
                public_id:
                  "dna-service-1",

                status:
                  "ACTIVE",
              })
            ),
        };


        const service =
          new PostgresSystemDnaService({
            builder,

            repository,
          });


        const result =
          await service.rebuild({
            organizationId:
              "aira-dev-org",
          });


        expect(
          result.created
        ).toBe(
          true
        );


        expect(
          result.duplicate
        ).toBe(
          false
        );


        expect(
          repository.createSnapshot
        ).toHaveBeenCalledTimes(
          1
        );
      }
    );


    test(
      "unchanged DNA is idempotent",
      async () => {
        const builder = {
          build:
            jest.fn(
              async () => ({
                dna: {
                  fingerprint:
                    "same",

                  scopeType:
                    "TENANT",

                  evidenceCount:
                    1,

                  metadata: {},
                },

                aggregation: {
                  averageTrust:
                    0.8,

                  averageConfidence:
                    0.8,

                  evidenceCount:
                    1,

                  memoryCount:
                    1,

                  evidenceMemoryIds: [
                    "mem-1",
                  ],

                  coverage: {
                    familyCount:
                      1,
                  },
                },

                conflicts: {
                  conflictCount:
                    0,

                  requiresHumanReview:
                    false,

                  critical:
                    false,
                },
              })
            ),
        };


        const repository = {
          findActive:
            jest.fn(
              async () => ({
                fingerprint:
                  "same",

                public_id:
                  "existing",
              })
            ),

          supersedeActive:
            jest.fn(),

          createSnapshot:
            jest.fn(),
        };


        const service =
          new PostgresSystemDnaService({
            builder,

            repository,
          });


        const result =
          await service.rebuild({
            organizationId:
              "aira-dev-org",
          });


        expect(
          result.created
        ).toBe(
          false
        );


        expect(
          result.duplicate
        ).toBe(
          true
        );


        expect(
          repository.createSnapshot
        ).not.toHaveBeenCalled();


        expect(
          repository.supersedeActive
        ).not.toHaveBeenCalled();
      }
    );


    test(
      "changed DNA supersedes previous snapshot",
      async () => {
        const builder = {
          build:
            jest.fn(
              async () => ({
                dna: {
                  fingerprint:
                    "new",

                  scopeType:
                    "TENANT",

                  evidenceCount:
                    2,

                  metadata: {},
                },

                aggregation: {
                  averageTrust:
                    0.9,

                  averageConfidence:
                    0.9,

                  evidenceCount:
                    2,

                  memoryCount:
                    2,

                  evidenceMemoryIds: [
                    "a",
                    "b",
                  ],

                  coverage: {
                    familyCount:
                      2,
                  },
                },

                conflicts: {
                  conflictCount:
                    0,

                  requiresHumanReview:
                    false,

                  critical:
                    false,
                },
              })
            ),
        };


        const repository = {
          findActive:
            jest.fn(
              async () => ({
                fingerprint:
                  "old",
              })
            ),

          supersedeActive:
            jest.fn(
              async () =>
                1
            ),

          createSnapshot:
            jest.fn(
              async () => ({
                public_id:
                  "new-dna",
              })
            ),
        };


        const service =
          new PostgresSystemDnaService({
            builder,

            repository,
          });


        const result =
          await service.rebuild({
            organizationId:
              "aira-dev-org",
          });


        expect(
          result.created
        ).toBe(
          true
        );


        expect(
          repository.supersedeActive
        ).toHaveBeenCalledTimes(
          1
        );


        expect(
          repository.createSnapshot
        ).toHaveBeenCalledTimes(
          1
        );
      }
    );


    test(
      "DNA persistence never grants execution authority",
      async () => {
        const builder = {
          build:
            async () => ({
              dna: {
                fingerprint:
                  "safe",

                scopeType:
                  "TENANT",

                evidenceCount:
                  0,

                metadata: {},
              },

              aggregation: {
                averageTrust:
                  0,

                averageConfidence:
                  0,

                evidenceCount:
                  0,

                memoryCount:
                  0,

                evidenceMemoryIds:
                  [],

                coverage: {
                  familyCount:
                    0,
                },
              },

              conflicts: {
                conflictCount:
                  0,

                requiresHumanReview:
                  false,

                critical:
                  false,
              },
            }),
        };


        const repository = {
          findActive:
            async () =>
              null,

          createSnapshot:
            async () => ({
              public_id:
                "safe-dna",
            }),

          supersedeActive:
            async () =>
              0,
        };


        const service =
          new PostgresSystemDnaService({
            builder,

            repository,
          });


        const result =
          await service.rebuild({
            organizationId:
              "aira-dev-org",
          });


        expect(
          result.safety
            .executionAuthorized
        ).toBe(
          false
        );


        expect(
          result.safety
            .evidenceOnly
        ).toBe(
          true
        );
      }
    );
  }
);