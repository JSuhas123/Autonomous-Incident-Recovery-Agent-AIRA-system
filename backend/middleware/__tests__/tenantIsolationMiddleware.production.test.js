"use strict";

const {
  tenantIsolationMiddleware,
  preventCrossTenantOperations,
  createTenantAwareQuery,
  createOrganizationAwareQuery,
  createTenantOwnershipQuery,
  createEnvironmentOwnershipQuery,
  createTenantAwarePipeline,
  createOrganizationAwarePipeline,
  createEnvironmentAwarePipeline,
} =
  require(
    "../tenantIsolationMiddleware"
  );


describe(
  "Phase 11.7 Tenant Isolation Hardening",
  () => {
    function createResponse() {
      const res = {
        statusCode:
          200,

        body:
          null,

        status:
          jest.fn(
            (
              code
            ) => {
              res.statusCode =
                code;

              return res;
            }
          ),

        json:
          jest.fn(
            (
              body
            ) => {
              res.body =
                body;

              return res;
            }
          ),
      };

      return res;
    }


    function createBaseRequest(
      overrides = {}
    ) {
      return {
        method:
          "GET",

        path:
          "/tenants/tenant-a/resource",

        headers:
          {},

        params: {
          tenantId:
            "tenant-a",
        },

        query:
          {},

        body:
          {},

        auth: {
          authenticationType:
            "machine_hmac",

          userId:
            null,

          organizationId:
            "org-a",

          tenantId:
            "tenant-a",

          membershipId:
            null,

          role:
            null,

          scopes:
            [],

          _organization: {
            _id:
              "org-a",

            tenantId:
              "tenant-a",
          },
        },

        tenant: {
          id:
            "tenant-a",
        },

        context:
          null,

        ...overrides,
      };
    }


    test(
      "allows request when authenticated tenant and URL tenant match",
      () => {
        const req =
          createBaseRequest();

        const res =
          createResponse();

        const next =
          jest.fn();


        tenantIsolationMiddleware(
          req,
          res,
          next
        );


        expect(
          next
        )
          .toHaveBeenCalledTimes(
            1
          );


        expect(
          req.context
        )
          .toMatchObject({
            tenantId:
              "tenant-a",

            organizationId:
              "org-a",

            executionAuthorized:
              false,
          });
      }
    );


    test(
      "rejects cross-tenant URL substitution without tenant enumeration",
      () => {
        const req =
          createBaseRequest({
            params: {
              tenantId:
                "tenant-b",
            },
          });

        const res =
          createResponse();

        const next =
          jest.fn();


        tenantIsolationMiddleware(
          req,
          res,
          next
        );


        expect(
          res.status
        )
          .toHaveBeenCalledWith(
            404
          );


        expect(
          res.body
        )
          .toMatchObject({
            code:
              "RESOURCE_NOT_FOUND",

            executionAuthorized:
              false,
          });


        expect(
          next
        )
          .not
          .toHaveBeenCalled();
      }
    );


    test(
      "rejects cross-tenant query substitution",
      () => {
        const req =
          createBaseRequest({
            query: {
              tenantId:
                "tenant-b",
            },
          });

        const res =
          createResponse();

        const next =
          jest.fn();


        tenantIsolationMiddleware(
          req,
          res,
          next
        );


        expect(
          res.status
        )
          .toHaveBeenCalledWith(
            404
          );


        expect(
          next
        )
          .not
          .toHaveBeenCalled();
      }
    );


    test(
      "rejects cross-organization query substitution",
      () => {
        const req =
          createBaseRequest({
            query: {
              organizationId:
                "org-b",
            },
          });

        const res =
          createResponse();

        const next =
          jest.fn();


        tenantIsolationMiddleware(
          req,
          res,
          next
        );


        expect(
          res.status
        )
          .toHaveBeenCalledWith(
            404
          );
      }
    );


    test(
      "rejects cross-tenant header substitution",
      () => {
        const req =
          createBaseRequest({
            headers: {
              "x-tenant-id":
                "tenant-b",
            },
          });

        const res =
          createResponse();

        const next =
          jest.fn();


        tenantIsolationMiddleware(
          req,
          res,
          next
        );


        expect(
          res.status
        )
          .toHaveBeenCalledWith(
            404
          );


        expect(
          next
        )
          .not
          .toHaveBeenCalled();
      }
    );


    test(
      "rejects cross-organization header substitution",
      () => {
        const req =
          createBaseRequest({
            headers: {
              "x-organization-id":
                "org-b",
            },
          });

        const res =
          createResponse();

        const next =
          jest.fn();


        tenantIsolationMiddleware(
          req,
          res,
          next
        );


        expect(
          res.status
        )
          .toHaveBeenCalledWith(
            404
          );
      }
    );


    test(
      "rejects cross-tenant body substitution",
      () => {
        const req =
          createBaseRequest({
            body: {
              tenantId:
                "tenant-b",
            },
          });

        const res =
          createResponse();

        const next =
          jest.fn();


        tenantIsolationMiddleware(
          req,
          res,
          next
        );


        expect(
          res.status
        )
          .toHaveBeenCalledWith(
            404
          );
      }
    );


    test(
      "rejects cross-organization body substitution",
      () => {
        const req =
          createBaseRequest({
            body: {
              organizationId:
                "org-b",
            },
          });

        const res =
          createResponse();

        const next =
          jest.fn();


        tenantIsolationMiddleware(
          req,
          res,
          next
        );


        expect(
          res.status
        )
          .toHaveBeenCalledWith(
            404
          );
      }
    );


    test(
      "fails closed when authenticated tenant context is missing",
      () => {
        const req =
          createBaseRequest({
            auth: {
              organizationId:
                "org-a",

              tenantId:
                null,
            },

            tenant:
              null,
          });

        const res =
          createResponse();

        const next =
          jest.fn();


        tenantIsolationMiddleware(
          req,
          res,
          next
        );


        expect(
          res.status
        )
          .toHaveBeenCalledWith(
            403
          );


        expect(
          res.body
        )
          .toMatchObject({
            code:
              "TENANT_CONTEXT_MISSING",

            executionAuthorized:
              false,
          });
      }
    );


    test(
      "fails closed when authenticated organization context is missing",
      () => {
        const req =
          createBaseRequest({
            auth: {
              tenantId:
                "tenant-a",

              organizationId:
                null,
            },
          });

        const res =
          createResponse();

        const next =
          jest.fn();


        tenantIsolationMiddleware(
          req,
          res,
          next
        );


        expect(
          res.status
        )
          .toHaveBeenCalledWith(
            403
          );


        expect(
          res.body
        )
          .toMatchObject({
            code:
              "ORGANIZATION_CONTEXT_MISSING",

            executionAuthorized:
              false,
          });
      }
    );


    test(
      "rejects canonical request context mismatch",
      () => {
        const req =
          createBaseRequest({
            context: {
              tenantId:
                "tenant-b",

              organizationId:
                "org-a",
            },
          });

        const res =
          createResponse();

        const next =
          jest.fn();


        tenantIsolationMiddleware(
          req,
          res,
          next
        );


        expect(
          res.status
        )
          .toHaveBeenCalledWith(
            403
          );


        expect(
          res.body
        )
          .toMatchObject({
            code:
              "REQUEST_CONTEXT_MISMATCH",

            executionAuthorized:
              false,
          });
      }
    );


    test(
      "rejects conflicting resolved environment context",
      () => {
        const req =
          createBaseRequest({
            context: {
              tenantId:
                "tenant-a",

              organizationId:
                "org-a",

              environmentId:
                "env-a",
            },

            query: {
              environmentId:
                "env-b",
            },
          });

        const res =
          createResponse();

        const next =
          jest.fn();


        tenantIsolationMiddleware(
          req,
          res,
          next
        );


        expect(
          res.status
        )
          .toHaveBeenCalledWith(
            404
          );


        expect(
          next
        )
          .not
          .toHaveBeenCalled();
      }
    );


    test(
      "query helper overwrites caller tenant ownership",
      () => {
        const query =
          createTenantAwareQuery(
            "tenant-a",
            {
              tenantId:
                "tenant-b",

              status:
                "active",
            }
          );


        expect(
          query
        )
          .toEqual({
            tenantId:
              "tenant-a",

            status:
              "active",
          });
      }
    );


    test(
      "organization helper overwrites caller organization ownership",
      () => {
        const query =
          createOrganizationAwareQuery(
            "org-a",
            {
              organizationId:
                "org-b",

              status:
                "active",
            }
          );


        expect(
          query
        )
          .toEqual({
            organizationId:
              "org-a",

            status:
              "active",
          });
      }
    );


    test(
      "dual ownership helper forces both canonical scopes",
      () => {
        const query =
          createTenantOwnershipQuery(
            {
              organizationId:
                "org-a",

              tenantId:
                "tenant-a",
            },
            {
              organizationId:
                "org-b",

              tenantId:
                "tenant-b",

              status:
                "active",
            }
          );


        expect(
          query
        )
          .toEqual({
            organizationId:
              "org-a",

            tenantId:
              "tenant-a",

            status:
              "active",
          });
      }
    );


    test(
      "environment ownership query requires organization and environment",
      () => {
        const query =
          createEnvironmentOwnershipQuery(
            {
              organizationId:
                "org-a",

              environmentId:
                "env-a",
            },
            {
              organizationId:
                "org-b",

              environmentId:
                "env-b",

              status:
                "open",
            }
          );


        expect(
          query
        )
          .toEqual({
            organizationId:
              "org-a",

            environmentId:
              "env-a",

            status:
              "open",
          });
      }
    );


    test(
      "organization aggregation always starts with ownership match",
      () => {
        const pipeline =
          createOrganizationAwarePipeline(
            "org-a",
            [
              {
                $sort: {
                  createdAt:
                    -1,
                },
              },
            ]
          );


        expect(
          pipeline[0]
        )
          .toEqual({
            $match: {
              organizationId:
                "org-a",
            },
          });
      }
    );


    test(
      "environment aggregation always starts with organization and environment match",
      () => {
        const pipeline =
          createEnvironmentAwarePipeline(
            {
              organizationId:
                "org-a",

              environmentId:
                "env-a",
            },
            [
              {
                $limit:
                  10,
              },
            ]
          );


        expect(
          pipeline[0]
        )
          .toEqual({
            $match: {
              organizationId:
                "org-a",

              environmentId:
                "env-a",
            },
          });
      }
    );


    test(
      "request-scoped update strips caller ownership mutation",
      () => {
        const req =
          createBaseRequest();

        const res =
          createResponse();

        const next =
          jest.fn();


        tenantIsolationMiddleware(
          req,
          res,
          next
        );


        const update =
          req.withTenantUpdate({
            name:
              "updated",

            tenantId:
              "tenant-b",

            organizationId:
              "org-b",

            environmentId:
              "env-b",
          });


        expect(
          update
        )
          .toEqual({
            $set: {
              name:
                "updated",

              tenantId:
                "tenant-a",

              organizationId:
                "org-a",
            },
          });
      }
    );


    test(
      "bulk delete cannot be authorized by singleTenant query flag",
      () => {
        const req = {
          method:
            "DELETE",

          params:
            {},

          query: {
            singleTenant:
              "true",
          },

          context: {
            tenantId:
              "tenant-a",

            organizationId:
              "org-a",
          },
        };


        const res =
          createResponse();

        const next =
          jest.fn();


        preventCrossTenantOperations(
          req,
          res,
          next
        );


        expect(
          res.status
        )
          .toHaveBeenCalledWith(
            400
          );


        expect(
          res.body
        )
          .toMatchObject({
            code:
              "BULK_DELETE_BLOCKED",

            executionAuthorized:
              false,
          });


        expect(
          next
        )
          .not
          .toHaveBeenCalled();
      }
    );
  }
);