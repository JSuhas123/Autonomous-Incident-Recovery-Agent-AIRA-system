"use strict";

/**
 * ============================================================================
 * AIRA PHASE 25.1C
 * PRODUCT REGISTRATION COMPOSITION CERTIFICATION
 * ============================================================================
 */

const {
  ProductRegistrationService,
} = require(
  "../../services/product/productRegistrationService"
);


describe(
  "AIRA Phase 25.1C — Product Registration Service",
  () => {
    test(
      "identity registration runs before product bootstrap",
      async () => {
        const order = [];


        const authResult = {
          user: {
            id:
              "user_001",
          },

          organization: {
            id:
              "org_001",
          },

          membership: {
            id:
              "membership_001",

            role:
              "owner",
          },

          csrfToken:
            "csrf",
        };


        const registerIdentity =
          jest.fn(
            async () => {
              order.push(
                "identity"
              );

              return authResult;
            }
          );


        const bootstrapService = {
          bootstrap:
            jest.fn(
              async (
                received
              ) => {
                order.push(
                  "product"
                );

                expect(
                  received
                ).toBe(
                  authResult
                );


                return {
                  version:
                    "25.1C",

                  landing: {
                    path:
                      "/overview",
                  },
                };
              }
            ),
        };


        const service =
          new ProductRegistrationService({
            registerIdentity,

            bootstrapService,
          });


        const result =
          await service.register(
            {
              fullName:
                "Test Owner",

              email:
                "owner@example.com",

              password:
                "ExamplePassword123!",

              organizationName:
                "Example Systems",
            },

            {
              ip:
                "127.0.0.1",
            }
          );


        expect(
          order
        ).toEqual([
          "identity",
          "product",
        ]);


        expect(
          result
            .productBootstrap
            .landing
            .path
        ).toBe(
          "/overview"
        );
      }
    );


    test(
      "product bootstrap never runs if identity registration fails",
      async () => {
        const registerIdentity =
          jest.fn(
            async () => {
              const error =
                new Error(
                  "Registration failed"
                );

              error.code =
                "REGISTRATION_FAILED";

              throw error;
            }
          );


        const bootstrapService = {
          bootstrap:
            jest.fn(),
        };


        const service =
          new ProductRegistrationService({
            registerIdentity,

            bootstrapService,
          });


        await expect(
          service.register({
            fullName:
              "Test Owner",

            email:
              "owner@example.com",

            password:
              "ExamplePassword123!",

            organizationName:
              "Example Systems",
          })
        ).rejects.toThrow(
          "Registration failed"
        );


        expect(
          bootstrapService
            .bootstrap
        ).not.toHaveBeenCalled();
      }
    );


    test(
      "registration composition itself grants no execution authority",
      async () => {
        const service =
          new ProductRegistrationService({
            registerIdentity:
              async () => ({
                user: {
                  id:
                    "user_001",
                },

                organization: {
                  id:
                    "org_001",
                },

                membership: {
                  id:
                    "membership_001",

                  role:
                    "owner",
                },
              }),

            bootstrapService: {
              bootstrap:
                async () => ({
                  version:
                    "25.1C",

                  safety: {
                    executionAuthorized:
                      false,
                  },
                }),
            },
          });


        const result =
          await service.register(
            {}
          );


        expect(
          result
            .executionAuthorized
        ).toBe(
          false
        );
      }
    );
  }
);