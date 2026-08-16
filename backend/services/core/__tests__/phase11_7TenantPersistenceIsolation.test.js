"use strict";

const mongoose =
  require(
    "mongoose"
  );

const Environment =
  require(
    "../../../models/Environment"
  );

const Organization =
  require(
    "../../../models/Organization"
  );

const EnvironmentService =
  require(
    "../environmentService"
  );


jest.mock(
  "../../../models/Environment"
);

jest.mock(
  "../../../models/Organization"
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
      }
    );


    test(
      "environment lookup always includes organization ownership",
      async () => {
        Environment
          .findOne
          .mockResolvedValue(
            null
          );


        await EnvironmentService
          .getByIdForOrganization(
            envA,
            orgA
          );


        expect(
          Environment.findOne
        )
          .toHaveBeenCalledWith(
            expect.objectContaining({
              _id:
                envA,

              organizationId:
                orgA,

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
        /*
         * Persistence layer returns null because the
         * organization-scoped query does not match.
         */
        Environment
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
          Environment.findOne
        )
          .toHaveBeenCalledWith(
            expect.objectContaining({
              _id:
                envA,

              organizationId:
                orgA,
            })
          );
      }
    );


    test(
      "environment listing is organization scoped",
      async () => {
        const sort =
          jest.fn()
            .mockResolvedValue(
              []
            );


        Environment
          .find
          .mockReturnValue({
            sort,
          });


        await EnvironmentService
          .listForOrganization(
            orgA
          );


        expect(
          Environment.find
        )
          .toHaveBeenCalledWith(
            expect.objectContaining({
              organizationId:
                orgA,

              status: {
                $ne:
                  "archived",
              },
            })
          );
      }
    );


    test(
  "default environment lookup cannot cross organization boundary",
  async () => {
    const defaultEnvironmentId =
      new mongoose.Types.ObjectId();


    /*
     * First lookup:
     *
     * explicit defaultEnvironmentId scoped to orgA.
     *
     * Return null so the service falls back to the first
     * active environment for the same organization.
     */
    Environment
      .findOne
      .mockResolvedValueOnce(
        null
      );


    /*
     * Second lookup:
     *
     * Environment.findOne(...).sort(...)
     *
     * Therefore the mock must return a query-like object
     * exposing sort().
     */
    const sort =
      jest.fn()
        .mockResolvedValue(
          null
        );


    Environment
      .findOne
      .mockReturnValueOnce({
        sort,
      });


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


    /*
     * Explicit default environment lookup must include
     * organization ownership.
     */
    expect(
      Environment.findOne
    )
      .toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          _id:
            defaultEnvironmentId,

          organizationId:
            orgA,

          status: {
            $ne:
              "archived",
          },
        })
      );


    /*
     * Compatibility fallback must ALSO remain within orgA.
     */
    expect(
      Environment.findOne
    )
      .toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          organizationId:
            orgA,

          status:
            "active",
        })
      );


    expect(
      sort
    )
      .toHaveBeenCalledWith({
        createdAt:
          1,
      });
  }
);


    test(
      "environment creation writes canonical organization ownership",
      async () => {
        Organization
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


        Environment
          .countDocuments
          .mockResolvedValue(
            0
          );


        Environment
          .findOne
          .mockResolvedValue(
            null
          );


        const createdEnvironment = {
          _id:
            envA,

          organizationId:
            orgA,
        };


        Environment
          .create
          .mockResolvedValue(
            createdEnvironment
          );


        /*
         * Mock entitlement methods used by creation.
         */
        const EntitlementService =
          require(
            "../entitlementService"
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
          Environment.create
        )
          .toHaveBeenCalledWith(
            expect.objectContaining({
              organizationId:
                orgA,

              name:
                "Staging",
            })
          );


        expect(
          result
            .organizationId
        )
          .toEqual(
            orgA
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
            orgA,

          type:
            "custom",

          name:
            "Old",

          description:
            "",

          criticality:
            "medium",

          settings: {
            allowAutonomousExecution:
              false,

            requireApprovalForDestructiveActions:
              true,

            timezone:
              null,
          },

          save:
            jest.fn()
              .mockResolvedValue(),
        };


        Environment
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
          Environment.findOne
        )
          .toHaveBeenCalledWith(
            expect.objectContaining({
              _id:
                envA,

              organizationId:
                orgA,
            })
          );


        expect(
          environmentDocument.name
        )
          .toBe(
            "Updated"
          );


        expect(
          environmentDocument.save
        )
          .toHaveBeenCalledTimes(
            1
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
            orgA,

          type:
            "custom",

          name:
            "Original",

          description:
            "",

          criticality:
            "medium",

          settings: {
            allowAutonomousExecution:
              false,

            requireApprovalForDestructiveActions:
              true,

            timezone:
              null,
          },

          save:
            jest.fn()
              .mockResolvedValue(),
        };


        Environment
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
          .toEqual(
            orgA
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
            orgA,

          status:
            "active",

          save:
            jest.fn()
              .mockResolvedValue(),
        };


        Environment
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
          Environment.findOne
        )
          .toHaveBeenCalledWith(
            expect.objectContaining({
              _id:
                envA,

              organizationId:
                orgA,
            })
          );


        expect(
          environmentDocument
            .status
        )
          .toBe(
            "maintenance"
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
            orgA,

          status:
            "active",
        };


        Environment
          .findOne
          .mockResolvedValue(
            environmentDocument
          );


        Organization
          .updateOne
          .mockResolvedValue({
            modifiedCount:
              1,
          });


        await EnvironmentService
          .setDefaultEnvironment(
            envA,
            orgA
          );


        expect(
          Organization.updateOne
        )
          .toHaveBeenCalledWith(
            expect.objectContaining({
              _id:
                orgA,

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
      "environment summary scopes every aggregate count to organization",
      async () => {
        Environment
          .countDocuments
          .mockResolvedValue(
            0
          );


        const EntitlementService =
          require(
            "../entitlementService"
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


        await EnvironmentService
          .getEnvironmentSummary(
            orgA
          );


        expect(
          Environment
            .countDocuments
        )
          .toHaveBeenCalledTimes(
            4
          );


        for (
          const call
          of Environment
            .countDocuments
            .mock
            .calls
        ) {
          expect(
            call[0]
          )
            .toEqual(
              expect.objectContaining({
                organizationId:
                  orgA,
              })
            );
        }
      }
    );


    test(
      "organization A query never substitutes organization B",
      async () => {
        Environment
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
          Environment
            .findOne
            .mock
            .calls[0][0];


        expect(
          query.organizationId
        )
          .toEqual(
            orgA
          );


        expect(
          query.organizationId
        )
          .not
          .toEqual(
            orgB
          );
      }
    );
  }
);