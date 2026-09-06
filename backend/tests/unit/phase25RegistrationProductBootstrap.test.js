"use strict";

/**
 * ============================================================================
 * AIRA PHASE 25.1C
 * REGISTRATION PRODUCT BOOTSTRAP CERTIFICATION
 * ============================================================================
 */

const {
  PRODUCT_PERSONAS,
} = require(
  "../../constants/productPersonas"
);

const {
  REGISTRATION_NEXT_ACTIONS,

  RegistrationProductBootstrapService,

  deriveRegistrationNextAction,
} = require(
  "../../services/product/registrationProductBootstrapService"
);


function createAuthResult(
  overrides = {}
) {
  return {
    user: {
      id:
        "user_001",

      fullName:
        "AIRA Owner",

      email:
        "owner@example.com",

      status:
        "active",
    },

    organization: {
      id:
        "org_001",

      name:
        "Example Systems",

      slug:
        "example-systems-123456",

      tenantId:
        "example_systems_123456",

      status:
        "active",
    },

    membership: {
      id:
        "membership_001",

      role:
        "owner",

      status:
        "active",
    },

    csrfToken:
      "csrf-test",

    ...overrides,
  };
}


function createEnvironmentRepository(
  environment = {}
) {
  return {
    findOne:
      jest.fn(
        async () => ({
          id:
            "env_001",

          organizationId:
            "org_001",

          name:
            "Development",

          slug:
            "development",

          environmentType:
            "development",

          criticality:
            "low",

          status:
            "active",

          isDefault:
            true,

          ...environment,
        })
      ),
  };
}


function createProfileService(
  overrides = {}
) {
  return {
    upsertProfile:
      jest.fn(
        async ({
          organizationId,
          input,
        }) => ({
          id:
            "orgprof_001",

          organizationId,

          legalName:
            input.legalName,

          profileStatus:
            "incomplete",

          metadata:
            input.metadata,

          ...overrides,
        })
      ),
  };
}


describe(
  "AIRA Phase 25.1C — Registration Product Bootstrap",
  () => {
    test(
      "resolves canonical default environment after registration",
      async () => {
        const repository =
          createEnvironmentRepository();

        const service =
          new RegistrationProductBootstrapService({
            environmentRepository:
              repository,

            organizationProfileService:
              createProfileService(),
          });


        const result =
          await service.bootstrap(
            createAuthResult()
          );


        expect(
          repository.findOne
        ).toHaveBeenCalled();


        expect(
          result
            .productContext
            .environment
            .id
        ).toBe(
          "env_001"
        );
      }
    );


    test(
      "initializes organization profile from canonical organization",
      async () => {
        const profileService =
          createProfileService();


        const service =
          new RegistrationProductBootstrapService({
            environmentRepository:
              createEnvironmentRepository(),

            organizationProfileService:
              profileService,
          });


        await service.bootstrap(
          createAuthResult()
        );


        expect(
          profileService
            .upsertProfile
        ).toHaveBeenCalledWith({
          organizationId:
            "org_001",

          environmentId:
            "env_001",

          input: {
            legalName:
              "Example Systems",

            metadata: {
              source:
                "registration",

              phase:
                "25.1C",
            },
          },
        });
      }
    );


    test(
      "owner receives administration persona",
      async () => {
        const service =
          new RegistrationProductBootstrapService({
            environmentRepository:
              createEnvironmentRepository(),

            organizationProfileService:
              createProfileService(),
          });


        const result =
          await service.bootstrap(
            createAuthResult()
          );


        expect(
          result
            .productContext
            .identity
            .persona
        ).toBe(
          PRODUCT_PERSONAS
            .ADMINISTRATION
        );
      }
    );


    test(
      "incomplete company profile produces profile onboarding action",
      async () => {
        const service =
          new RegistrationProductBootstrapService({
            environmentRepository:
              createEnvironmentRepository(),

            organizationProfileService:
              createProfileService({
                profileStatus:
                  "incomplete",
              }),
          });


        const result =
          await service.bootstrap(
            createAuthResult()
          );


        expect(
          result
            .onboarding
            .nextAction
        ).toBe(
          REGISTRATION_NEXT_ACTIONS
            .COMPLETE_COMPANY_PROFILE
        );


        expect(
          result
            .onboarding
            .companyProfileComplete
        ).toBe(
          false
        );
      }
    );


    test(
      "complete company profile advances toward team invitation",
      () => {
        expect(
          deriveRegistrationNextAction({
            profile: {
              profileStatus:
                "complete",
            },
          })
        ).toBe(
          REGISTRATION_NEXT_ACTIONS
            .INVITE_TEAM
        );
      }
    );


    test(
      "registration bootstrap exposes persona landing destination",
      async () => {
        const service =
          new RegistrationProductBootstrapService({
            environmentRepository:
              createEnvironmentRepository(),

            organizationProfileService:
              createProfileService(),
          });


        const result =
          await service.bootstrap(
            createAuthResult()
          );


        expect(
          result
            .landing
            .path
        ).toBe(
          "/overview"
        );
      }
    );


    test(
      "registration does not grant execution authority",
      async () => {
        const service =
          new RegistrationProductBootstrapService({
            environmentRepository:
              createEnvironmentRepository(),

            organizationProfileService:
              createProfileService(),
          });


        const result =
          await service.bootstrap(
            createAuthResult()
          );


        expect(
          result
            .safety
            .registrationGrantsExecutionAuthority
        ).toBe(
          false
        );


        expect(
          result
            .safety
            .profileGrantsExecutionAuthority
        ).toBe(
          false
        );


        expect(
          result
            .safety
            .personaGrantsExecutionAuthority
        ).toBe(
          false
        );


        expect(
          result
            .safety
            .executionAuthorized
        ).toBe(
          false
        );
      }
    );


    test(
      "missing environment fails closed",
      async () => {
        const repository = {
          findOne:
            jest.fn(
              async () =>
                null
            ),
        };


        const service =
          new RegistrationProductBootstrapService({
            environmentRepository:
              repository,

            organizationProfileService:
              createProfileService(),
          });


        await expect(
          service.bootstrap(
            createAuthResult()
          )
        ).rejects.toMatchObject({
          code:
            "PRODUCT_REGISTRATION_ENVIRONMENT_MISSING",

          status:
            503,

          executionAuthorized:
            false,
        });
      }
    );


    test(
      "missing identity state fails closed",
      async () => {
        const service =
          new RegistrationProductBootstrapService({
            environmentRepository:
              createEnvironmentRepository(),

            organizationProfileService:
              createProfileService(),
          });


        await expect(
          service.bootstrap({
            user: {
              id:
                "user_001",
            },

            organization:
              null,

            membership:
              null,
          })
        ).rejects.toMatchObject({
          code:
            "PRODUCT_REGISTRATION_IDENTITY_INCOMPLETE",

          executionAuthorized:
            false,
        });
      }
    );
  }
);