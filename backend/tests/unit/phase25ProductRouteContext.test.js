"use strict";

/**
 * ============================================================================
 * AIRA PHASE 25.2B
 * PRODUCT ROUTE CONTEXT CERTIFICATION
 * ============================================================================
 */

const {
  getServerRequestContext,

  requireProductEnvironment,

  rejectClientTenantAuthority,
} =
  require(
    "../../services/product/productRouteContext"
  );


function requestFixture(
  overrides = {}
) {
  return {
    user: {
      id:
        "user_server_001",
    },

    organization: {
      id:
        "org_server_001",

      name:
        "AIRA Example",

      slug:
        "aira-example",

      tenantId:
        "tenant_server_001",
    },

    membership: {
      id:
        "membership_server_001",

      role:
        "owner",
    },

    environment: {
      id:
        "env_server_001",

      name:
        "Development",
    },

    requestId:
      "request_server_001",

    body:
      {},

    query:
      {},

    ...overrides,
  };
}


describe(
  "AIRA Phase 25.2B — Product Route Context",
  () => {
    test(
      "resolves user identity from server request",
      () => {
        const result =
          getServerRequestContext(
            requestFixture()
          );


        expect(
          result.userId
        ).toBe(
          "user_server_001"
        );
      }
    );


    test(
      "resolves authoritative organization context",
      () => {
        const result =
          getServerRequestContext(
            requestFixture()
          );


        expect(
          result.organizationId
        ).toBe(
          "org_server_001"
        );
      }
    );


    test(
      "resolves authoritative environment context",
      () => {
        const result =
          getServerRequestContext(
            requestFixture()
          );


        expect(
          result.environmentId
        ).toBe(
          "env_server_001"
        );
      }
    );


    test(
      "resolves membership role",
      () => {
        const result =
          getServerRequestContext(
            requestFixture()
          );


        expect(
          result.role
        ).toBe(
          "owner"
        );
      }
    );


    test(
      "does not use browser body organizationId as scope",
      () => {
        const req =
          requestFixture({
            body: {
              organizationId:
                "org_attacker",
            },
          });


        expect(
          () =>
            rejectClientTenantAuthority(
              req
            )
        ).toThrow(
          "Client-supplied organizationId is not authoritative"
        );
      }
    );


    test(
      "rejects browser query tenantId",
      () => {
        const req =
          requestFixture({
            query: {
              tenantId:
                "tenant_attacker",
            },
          });


        expect(
          () =>
            rejectClientTenantAuthority(
              req
            )
        ).toThrow(
          "Client-supplied tenantId is not authoritative"
        );
      }
    );


    test(
      "rejects browser body environmentId",
      () => {
        const req =
          requestFixture({
            body: {
              environmentId:
                "env_attacker",
            },
          });


        expect(
          () =>
            rejectClientTenantAuthority(
              req
            )
        ).toThrow(
          "Client-supplied environmentId is not authoritative"
        );
      }
    );


    test(
      "allows ordinary profile payload without tenant identifiers",
      () => {
        const req =
          requestFixture({
            body: {
              legalName:
                "Example Ltd",

              industry:
                "Software",
            },
          });


        expect(
          () =>
            rejectClientTenantAuthority(
              req
            )
        ).not.toThrow();
      }
    );


    test(
      "requires authenticated user",
      () => {
        const req =
          requestFixture({
            user:
              null,
          });


        expect(
          () =>
            getServerRequestContext(
              req
            )
        ).toThrow(
          "Authenticated user context is required"
        );
      }
    );


    test(
      "requires organization context",
      () => {
        const req =
          requestFixture({
            organization:
              null,
          });


        expect(
          () =>
            getServerRequestContext(
              req
            )
        ).toThrow(
          "Authoritative organization context is required"
        );
      }
    );


    test(
      "requires membership role",
      () => {
        const req =
          requestFixture({
            membership: {
              id:
                "membership_server_001",

              role:
                null,
            },
          });


        expect(
          () =>
            getServerRequestContext(
              req
            )
        ).toThrow(
          "Organization membership role is required"
        );
      }
    );


    test(
      "requires environment for environment-scoped product operations",
      () => {
        const context =
          getServerRequestContext(
            requestFixture({
              environment:
                null,
            })
          );


        expect(
          () =>
            requireProductEnvironment(
              context
            )
        ).toThrow(
          "Authoritative environment context is required"
        );
      }
    );
  }
);