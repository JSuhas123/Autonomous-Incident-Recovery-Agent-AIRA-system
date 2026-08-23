"use strict";

jest.mock(
  "../repositories",
  () => ({
    tenantConfigRepository: {
      findOne:
        jest.fn(),
    },

    policyRepository: {
      findActiveForTenant:
        jest.fn(),
    },
  })
);

const {
  tenantConfigRepository,
  policyRepository,
} =
  require(
    "../repositories"
  );

const TenantService =
  require(
    "../../services/core/tenantService"
  );


describe(
  "Policy persistence boundary",
  () => {
    beforeEach(
      () => {
        jest.clearAllMocks();
      }
    );


    test(
      "tenant policy lookup uses repository boundaries",
      async () => {
        tenantConfigRepository
          .findOne
          .mockResolvedValue({
            tenantId:
              "tenant-1",

            status:
              "active",

            policyVersion:
              4,
          });


        policyRepository
          .findActiveForTenant
          .mockResolvedValue({
            tenantId:
              "tenant-1",

            version:
              4,
          });


        const result =
          await TenantService
            .getTenantPolicy(
              "tenant-1"
            );


        expect(
          tenantConfigRepository
            .findOne
        )
          .toHaveBeenCalledWith(
            {
              tenantId:
                "tenant-1",

              status:
                "active",
            },
            {
              includeSecrets:
                true,
            }
          );


        expect(
          policyRepository
            .findActiveForTenant
        )
          .toHaveBeenCalledWith(
            "tenant-1",
            4
          );


        expect(
          result
        )
          .toEqual({
            tenantId:
              "tenant-1",

            version:
              4,
          });
      }
    );


    test(
      "missing tenant stops policy lookup",
      async () => {
        tenantConfigRepository
          .findOne
          .mockResolvedValue(
            null
          );


        const result =
          await TenantService
            .getTenantPolicy(
              "tenant-missing"
            );


        expect(
          result
        )
          .toBeNull();


        expect(
          policyRepository
            .findActiveForTenant
        )
          .not
          .toHaveBeenCalled();
      }
    );


    test(
      "missing active policy returns null",
      async () => {
        tenantConfigRepository
          .findOne
          .mockResolvedValue({
            tenantId:
              "tenant-1",

            status:
              "active",

            policyVersion:
              4,
          });


        policyRepository
          .findActiveForTenant
          .mockResolvedValue(
            null
          );


        const result =
          await TenantService
            .getTenantPolicy(
              "tenant-1"
            );


        expect(
          result
        )
          .toBeNull();


        expect(
          policyRepository
            .findActiveForTenant
        )
          .toHaveBeenCalledWith(
            "tenant-1",
            4
          );
      }
    );
  }
);