"use strict";


const {
  MemoryLifecycleService,
} =
  require(
    "../../services/memory/context/memoryLifecycleService"
  );


describe(
  "Phase 16.14E memory lifecycle",
  () => {

    test(
      "ACTIVE memory may become STALE",
      () => {
        const service =
          new MemoryLifecycleService({
            memoryRepository:
              {},
          });


        expect(
          service.canTransition(
            "ACTIVE",
            "STALE"
          )
        ).toBe(
          true
        );
      }
    );


    test(
      "STALE memory may be reactivated",
      () => {
        const service =
          new MemoryLifecycleService({
            memoryRepository:
              {},
          });


        expect(
          service.canTransition(
            "STALE",
            "ACTIVE"
          )
        ).toBe(
          true
        );
      }
    );


    test(
      "REVOKED memory cannot become ACTIVE",
      () => {
        const service =
          new MemoryLifecycleService({
            memoryRepository:
              {},
          });


        expect(
          service.canTransition(
            "REVOKED",
            "ACTIVE"
          )
        ).toBe(
          false
        );
      }
    );


    test(
      "ARCHIVED memory cannot be silently restored",
      () => {
        const service =
          new MemoryLifecycleService({
            memoryRepository:
              {},
          });


        expect(
          service.canTransition(
            "ARCHIVED",
            "ACTIVE"
          )
        ).toBe(
          false
        );
      }
    );


    test(
      "invalid transition fails closed",
      () => {
        const service =
          new MemoryLifecycleService({
            memoryRepository:
              {},
          });


        expect(
          () =>
            service.assertTransition(
              "REVOKED",
              "ACTIVE"
            )
        ).toThrow(
          expect.objectContaining({
            code:
              "MEMORY_LIFECYCLE_TRANSITION_INVALID",
          })
        );
      }
    );


    test(
      "transition updates memory and preserves safety",
      async () => {
        const repository = {
          findByPublicId:
            jest.fn(
              async () => ({
                publicId:
                  "mem-1",

                status:
                  "ACTIVE",

                metadata: {
                  phase:
                    "16",
                },
              })
            ),

          updateMemory:
            jest.fn(
              async (
                input
              ) => ({
                publicId:
                  input.publicId,

                status:
                  input.patch.status,

                metadata:
                  input.patch.metadata,
              })
            ),
        };


        const service =
          new MemoryLifecycleService({
            memoryRepository:
              repository,
          });


        const result =
          await service.transition({
            organizationId:
              "aira-dev-org",

            publicId:
              "mem-1",

            toStatus:
              "STALE",

            reason:
              "Freshness expired",
          });


        expect(
          result.changed
        ).toBe(
          true
        );


        expect(
          result.currentStatus
        ).toBe(
          "STALE"
        );


        expect(
          result
            .memory
            .metadata
            .executionAuthorized
        ).toBe(
          false
        );


        expect(
          repository.updateMemory
        ).toHaveBeenCalledTimes(
          1
        );
      }
    );


    test(
      "same lifecycle state is idempotent",
      async () => {
        const repository = {
          findByPublicId:
            jest.fn(
              async () => ({
                publicId:
                  "mem-1",

                status:
                  "STALE",
              })
            ),

          updateMemory:
            jest.fn(),
        };


        const service =
          new MemoryLifecycleService({
            memoryRepository:
              repository,
          });


        const result =
          await service.transition({
            organizationId:
              "aira-dev-org",

            publicId:
              "mem-1",

            toStatus:
              "STALE",
          });


        expect(
          result.changed
        ).toBe(
          false
        );


        expect(
          repository.updateMemory
        ).not.toHaveBeenCalled();
      }
    );


    test(
      "supersede requires active replacement memory",
      async () => {
        const repository = {
          findByPublicId:
            jest.fn(
              async ({
                publicId,
              }) => {
                if (
                  publicId ===
                    "replacement"
                ) {
                  return {
                    publicId:
                      "replacement",

                    status:
                      "STALE",
                  };
                }


                return {
                  publicId:
                    "old",

                  status:
                    "ACTIVE",
                };
              }
            ),
        };


        const service =
          new MemoryLifecycleService({
            memoryRepository:
              repository,
          });


        await expect(
          service.supersede({
            organizationId:
              "aira-dev-org",

            publicId:
              "old",

            supersededByPublicId:
              "replacement",
          })
        ).rejects.toMatchObject({
          code:
            "MEMORY_LIFECYCLE_SUPERSEDING_MEMORY_NOT_ACTIVE",
        });
      }
    );


    test(
      "only ACTIVE memories are retrieval eligible",
      () => {
        const service =
          new MemoryLifecycleService({
            memoryRepository:
              {},
          });


        const result =
          service.filterRetrievalEligible([
            {
              publicId:
                "active",

              status:
                "ACTIVE",
            },

            {
              publicId:
                "stale",

              status:
                "STALE",
            },

            {
              publicId:
                "superseded",

              status:
                "SUPERSEDED",
            },

            {
              publicId:
                "archived",

              status:
                "ARCHIVED",
            },

            {
              publicId:
                "revoked",

              status:
                "REVOKED",
            },
          ]);


        expect(
          result.accepted
        ).toHaveLength(
          1
        );


        expect(
          result.accepted[0]
            .publicId
        ).toBe(
          "active"
        );


        expect(
          result.rejected
        ).toHaveLength(
          4
        );
      }
    );


    test(
      "revocation never deletes historical memory",
      async () => {
        const repository = {
          findByPublicId:
            jest.fn(
              async () => ({
                publicId:
                  "mem-danger",

                status:
                  "ACTIVE",

                metadata:
                  {},
              })
            ),

          updateMemory:
            jest.fn(
              async (
                input
              ) => ({
                publicId:
                  input.publicId,

                status:
                  input.patch.status,

                metadata:
                  input.patch.metadata,
              })
            ),
        };


        const service =
          new MemoryLifecycleService({
            memoryRepository:
              repository,
          });


        const result =
          await service.revoke({
            organizationId:
              "aira-dev-org",

            publicId:
              "mem-danger",

            reason:
              "Evidence proven incorrect",
          });


        expect(
          result.currentStatus
        ).toBe(
          "REVOKED"
        );


        expect(
          repository.updateMemory
        ).toHaveBeenCalled();


        expect(
          repository.deleteMemory
        ).toBeUndefined();
      }
    );
  }
);