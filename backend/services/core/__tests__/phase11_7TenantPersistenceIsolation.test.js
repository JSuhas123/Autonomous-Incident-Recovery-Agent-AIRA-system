"use strict";

const mongoose =
  require(
    "mongoose"
  );

jest.mock(
  "../../../persistence/repositories",
  () => ({
    environmentRepository: {
      findOne:
        jest.fn(),

      findMany:
        jest.fn(),

      create:
        jest.fn(),

      updateOne:
        jest.fn(),

      save:
        jest.fn(),
    },

    organizationRepository: {
      findOne:
        jest.fn(),

      updateOne:
        jest.fn(),

      save:
        jest.fn(),
    },
  })
);

const {
  environmentRepository,
  organizationRepository,
} =
  require(
    "../../../persistence/repositories"
  );

const EnvironmentService =
  require(
    "../environmentService"
  );

const EntitlementService =
  require(
    "../entitlementService"
  );


describe(
  "Phase 11.7 Tenant Persistence Isolation",
  () => {
    const orgA =
      new mongoose.Types.ObjectId();

    const orgB =
      new mongoose.Types.ObjectId();

    const envA =
      new mongoose.Types.ObjectId();


    beforeEach(
      () => {
        jest.clearAllMocks();

        environmentRepository
          .findOne
          .mockResolvedValue(
            null
          );

        environmentRepository
          .findMany
          .mockResolvedValue(
            []
          );

        environmentRepository
          .create
          .mockResolvedValue(
            null
          );

        environmentRepository
          .updateOne
          .mockResolvedValue({
            acknowledged:
              true,

            matchedCount:
              1,

            modifiedCount:
              1,
          });

        environmentRepository
          .save
          .mockImplementation(
            async (
              environment
            ) =>
              environment
          );

        organizationRepository
          .findOne
          .mockResolvedValue(
            null
          );

        organizationRepository
          .updateOne
          .mockResolvedValue({
            acknowledged:
              true,

            matchedCount:
              1,

            modifiedCount:
              1,
          });
      }
    );


    test(
      "environment lookup always includes organization ownership",
      async () => {
        await EnvironmentService
          .getByIdForOrganization(
            envA,
            orgA
          );


        expect(
          environmentRepository
            .findOne
        )
          .toHaveBeenCalledWith(
            expect.objectContaining({
              _id:
                String(
                  envA
                ),

              organizationId:
                String(
                  orgA
                ),

              status: {
                $ne:
                  "archived",
              },
            })
          );
      }
    );


    test(
      "cross-organization environment is indistinguishable from missing environment",
      async () => {
        environmentRepository
          .findOne
          .mockResolvedValue(
            null
          );


        await expect(
          EnvironmentService
            .requireEnvironment(
              envA,
              orgA
            )
        )
          .rejects
          .toMatchObject({
            code:
              "ENVIRONMENT_NOT_FOUND",

            status:
              404,
          });


        expect(
          environmentRepository
            .findOne
        )
          .toHaveBeenCalledWith(
            expect.objectContaining({
              _id:
                String(
                  envA
                ),

              organizationId:
                String(
                  orgA
                ),
            })
          );
      }
    );


    test(
      "environment listing is organization scoped",
      async () => {
        environmentRepository
          .findMany
          .mockResolvedValue(
            []
          );


        const result =
          await EnvironmentService
            .listForOrganization(
              orgA
            );


        expect(
          environmentRepository
            .findMany
        )
          .toHaveBeenCalledWith(
            expect.objectContaining({
              organizationId:
                String(
                  orgA
                ),

              status: {
                $ne:
                  "archived",
              },
            })
          );


        expect(
          result
        )
          .toEqual(
            []
          );
      }
    );


    test(
      "default environment lookup cannot cross organization boundary",
      async () => {
        const defaultEnvironmentId =
          new mongoose.Types
            .ObjectId();


        environmentRepository
          .findOne
          .mockResolvedValueOnce(
            null
          );


        environmentRepository
          .findMany
          .mockResolvedValueOnce(
            []
          );


        const result =
          await EnvironmentService
            .getDefaultForOrganization({
              _id:
                orgA,

              settings: {
                defaultEnvironmentId,
              },
            });


        expect(
          result
        )
          .toBeNull();


        expect(
          environmentRepository
            .findOne
        )
          .toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
              _id:
                defaultEnvironmentId,

              organizationId:
                String(
                  orgA
                ),

              status: {
                $ne:
                  "archived",
              },
            })
          );


        expect(
          environmentRepository
            .findMany
        )
          .toHaveBeenCalledWith(
            expect.objectContaining({
              organizationId:
                String(
                  orgA
                ),

              status:
                "active",
            })
          );
      }
    );


    test(
      "environment creation writes canonical organization ownership",
      async () => {
        organizationRepository
          .findOne
          .mockResolvedValue({
            _id:
              orgA,

            status:
              "active",

            settings: {
              defaultEnvironmentId:
                new mongoose.Types
                  .ObjectId(),
            },
          });


        environmentRepository
          .findMany
          .mockResolvedValue(
            []
          );


        /*
         * duplicate-slug lookup
         */
        environmentRepository
          .findOne
          .mockResolvedValue(
            null
          );


        const createdEnvironment = {
          _id:
            envA,

          organizationId:
            String(
              orgA
            ),

          name:
            "Staging",

          slug:
            "staging",

          type:
            "custom",

          status:
            "active",
        };


        environmentRepository
          .create
          .mockResolvedValue(
            createdEnvironment
          );


        jest
          .spyOn(
            EntitlementService,
            "assertWithinLimit"
          )
          .mockResolvedValue();


        jest
          .spyOn(
            EntitlementService,
            "assertEnabled"
          )
          .mockResolvedValue();


        const result =
          await EnvironmentService
            .createEnvironment(
              orgA,
              {
                name:
                  "Staging",

                type:
                  "custom",
              }
            );


        expect(
          environmentRepository
            .create
        )
          .toHaveBeenCalledWith(
            expect.objectContaining({
              organizationId:
                String(
                  orgA
                ),

              name:
                "Staging",

              slug:
                "staging",

              type:
                "custom",
            })
          );


        expect(
          result
            .organizationId
        )
          .toBe(
            String(
              orgA
            )
          );
      }
    );


    test(
      "environment update first resolves environment within organization scope",
      async () => {
        const environmentDocument = {
          _id:
            envA,

          organizationId:
            String(
              orgA
            ),

          type:
            "custom",

          name:
            "Old",

          description:
            "",

          criticality:
            "medium",

          status:
            "active",

          settings: {
            allowAutonomousExecution:
              false,

            requireApprovalForDestructiveActions:
              true,

            timezone:
              null,
          },
        };


        environmentRepository
          .findOne
          .mockResolvedValue(
            environmentDocument
          );


        await EnvironmentService
          .updateEnvironment(
            envA,
            orgA,
            {
              name:
                "Updated",
            }
          );


        expect(
          environmentRepository
            .findOne
        )
          .toHaveBeenCalledWith(
            expect.objectContaining({
              _id:
                String(
                  envA
                ),

              organizationId:
                String(
                  orgA
                ),
            })
          );


        expect(
          environmentDocument
            .name
        )
          .toBe(
            "Updated"
          );


        expect(
          environmentRepository
            .save
        )
          .toHaveBeenCalledWith(
            environmentDocument
          );
      }
    );


    test(
      "environment update cannot mutate organization ownership through input data",
      async () => {
        const environmentDocument = {
          _id:
            envA,

          organizationId:
            String(
              orgA
            ),

          type:
            "custom",

          name:
            "Original",

          description:
            "",

          criticality:
            "medium",

          status:
            "active",

          settings: {
            allowAutonomousExecution:
              false,

            requireApprovalForDestructiveActions:
              true,

            timezone:
              null,
          },
        };


        environmentRepository
          .findOne
          .mockResolvedValue(
            environmentDocument
          );


        await EnvironmentService
          .updateEnvironment(
            envA,
            orgA,
            {
              organizationId:
                orgB,

              name:
                "Updated",
            }
          );


        expect(
          environmentDocument
            .organizationId
        )
          .toBe(
            String(
              orgA
            )
          );


        expect(
          environmentDocument
            .organizationId
        )
          .not
          .toBe(
            String(
              orgB
            )
          );
      }
    );


    test(
      "maintenance transition is organization scoped",
      async () => {
        const environmentDocument = {
          _id:
            envA,

          organizationId:
            String(
              orgA
            ),

          status:
            "active",

          settings: {},
        };


        environmentRepository
          .findOne
          .mockResolvedValue(
            environmentDocument
          );


        await EnvironmentService
          .enterMaintenance(
            envA,
            orgA,
            "planned"
          );


        expect(
          environmentRepository
            .findOne
        )
          .toHaveBeenCalledWith(
            expect.objectContaining({
              _id:
                String(
                  envA
                ),

              organizationId:
                String(
                  orgA
                ),
            })
          );


        expect(
          environmentDocument
            .status
        )
          .toBe(
            "maintenance"
          );


        expect(
          environmentDocument
            .maintenanceReason
        )
          .toBe(
            "planned"
          );


        expect(
          environmentRepository
            .save
        )
          .toHaveBeenCalledWith(
            environmentDocument
          );
      }
    );


    test(
      "default environment update is organization scoped",
      async () => {
        const environmentDocument = {
          _id:
            envA,

          organizationId:
            String(
              orgA
            ),

          status:
            "active",
        };


        environmentRepository
          .findOne
          .mockResolvedValue(
            environmentDocument
          );


        await EnvironmentService
          .setDefaultEnvironment(
            envA,
            orgA
          );


        expect(
          organizationRepository
            .updateOne
        )
          .toHaveBeenCalledWith(
            expect.objectContaining({
              _id:
                String(
                  orgA
                ),

              status:
                "active",
            }),

            expect.objectContaining({
              $set:
                expect.objectContaining({
                  "settings.defaultEnvironmentId":
                    envA,
                }),
            })
          );
      }
    );


    test(
      "environment summary scopes every aggregate read to organization",
      async () => {
        environmentRepository
          .findMany
          .mockResolvedValue(
            []
          );


        jest
          .spyOn(
            EntitlementService,
            "getSubscription"
          )
          .mockResolvedValue({
            plan:
              "test",
          });


        jest
          .spyOn(
            EntitlementService,
            "getEntitlement"
          )
          .mockResolvedValue(
            10
          );


        const result =
          await EnvironmentService
            .getEnvironmentSummary(
              orgA
            );


        expect(
          environmentRepository
            .findMany
        )
          .toHaveBeenCalledTimes(
            4
          );


        for (
          const call
          of environmentRepository
            .findMany
            .mock
            .calls
        ) {
          expect(
            call[0]
          )
            .toEqual(
              expect.objectContaining({
                organizationId:
                  String(
                    orgA
                  ),
              })
            );
        }


        expect(
          result
        )
          .toEqual({
            total:
              0,

            active:
              0,

            maintenance:
              0,

            hasProduction:
              false,

            plan:
              "test",

            limit:
              10,

            remaining:
              10,
          });
      }
    );


    test(
      "organization A query never substitutes organization B",
      async () => {
        environmentRepository
          .findOne
          .mockResolvedValue(
            null
          );


        await EnvironmentService
          .getByIdForOrganization(
            envA,
            orgA
          );


        const query =
          environmentRepository
            .findOne
            .mock
            .calls[0][0];


        expect(
          query.organizationId
        )
          .toBe(
            String(
              orgA
            )
          );


        expect(
          query.organizationId
        )
          .not
          .toBe(
            String(
              orgB
            )
          );
      }
    );
  }
);