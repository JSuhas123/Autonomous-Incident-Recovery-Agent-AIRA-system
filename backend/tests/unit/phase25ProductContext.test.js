"use strict";

/**
 * ============================================================================
 * AIRA PHASE 25.0B
 * PRODUCT CONTEXT CONTRACT CERTIFICATION
 * ============================================================================
 */

const {
  ORGANIZATION_ROLES,
} =
  require(
    "../../constants/roles"
  );

const {
  getPermissionsForRole,
} =
  require(
    "../../constants/rolePermissions"
  );

const {
  PRODUCT_PERSONAS,
} =
  require(
    "../../constants/productPersonas"
  );

const {
  buildProductContext,
} =
  require(
    "../../services/product/productContextService"
  );


function createContext(
  overrides = {}
) {
  return {
    authenticationType:
      "session",

    userId:
      "user_001",

    organizationId:
      "org_001",

    tenantId:
      "tenant_001",

    membershipId:
      "membership_001",

    role:
      ORGANIZATION_ROLES
        .PLATFORM_ENGINEER,

    requestId:
      "request_001",

    organization: {
      _id:
        "org_001",

      tenantId:
        "tenant_001",

      name:
        "AIRA Test Organization",

      slug:
        "aira-test-organization",

      status:
        "active",
    },

    membership: {
      _id:
        "membership_001",

      role:
        ORGANIZATION_ROLES
          .PLATFORM_ENGINEER,

      status:
        "active",
    },

    environment: {
      _id:
        "env_001",

      organizationId:
        "org_001",

      name:
        "Production",

      slug:
        "production",

      environmentType:
        "production",

      criticality:
        "critical",

      status:
        "active",
    },

    ...overrides,
  };
}


describe(
  "AIRA Phase 25.0B — Product Context",
  () => {
    test(
      "derives operations persona for platform engineer",
      () => {
        const result =
          buildProductContext(
            createContext()
          );

        expect(
          result.identity
            .persona
        ).toBe(
          PRODUCT_PERSONAS
            .OPERATIONS
        );
      }
    );


    test(
      "uses canonical backend role permissions",
      () => {
        const source =
          createContext({
            /*
             * This deliberately attempts to inject fake
             * browser/request permissions.
             */
            permissions: [
              "root.everything",
            ],
          });

        const result =
          buildProductContext(
            source
          );

        expect(
          result.identity
            .permissions
            .slice()
            .sort()
        ).toEqual(
          getPermissionsForRole(
            ORGANIZATION_ROLES
              .PLATFORM_ENGINEER
          )
            .slice()
            .sort()
        );

        expect(
          result.identity
            .permissions
        ).not.toContain(
          "root.everything"
        );
      }
    );


    test(
      "does not expose persona as execution authority",
      () => {
        const result =
          buildProductContext(
            createContext()
          );

        expect(
          result.safety
            .personaGrantsAuthorization
        ).toBe(
          false
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
      "marks browser organization as non-authoritative",
      () => {
        const result =
          buildProductContext(
            createContext()
          );

        expect(
          result.safety
            .browserOrganizationAuthoritative
        ).toBe(
          false
        );
      }
    );


    test(
      "marks browser environment as non-authoritative",
      () => {
        const result =
          buildProductContext(
            createContext()
          );

        expect(
          result.safety
            .browserEnvironmentAuthoritative
        ).toBe(
          false
        );
      }
    );


    test(
      "returns canonical organization identity",
      () => {
        const result =
          buildProductContext(
            createContext()
          );

        expect(
          result.organization
        ).toEqual({
          id:
            "org_001",

          tenantId:
            "tenant_001",

          name:
            "AIRA Test Organization",

          slug:
            "aira-test-organization",

          status:
            "active",
        });
      }
    );


    test(
      "returns active environment context",
      () => {
        const result =
          buildProductContext(
            createContext()
          );

        expect(
          result.environment
        ).toEqual({
          id:
            "env_001",

          organizationId:
            "org_001",

          name:
            "Production",

          slug:
            "production",

          type:
            "production",

          criticality:
            "critical",

          status:
            "active",
        });
      }
    );


    test(
      "includes persona landing metadata",
      () => {
        const result =
          buildProductContext(
            createContext()
          );

        expect(
          result.identity
            .personaMetadata
            .defaultLandingPath
        ).toBe(
          "/operations"
        );
      }
    );


    test(
      "owner resolves to administration",
      () => {
        const result =
          buildProductContext(
            createContext({
              role:
                ORGANIZATION_ROLES
                  .OWNER,
            })
          );

        expect(
          result.identity.persona
        ).toBe(
          PRODUCT_PERSONAS
            .ADMINISTRATION
        );
      }
    );


    test(
      "auditor resolves to governance",
      () => {
        const result =
          buildProductContext(
            createContext({
              role:
                ORGANIZATION_ROLES
                  .AUDITOR,
            })
          );

        expect(
          result.identity.persona
        ).toBe(
          PRODUCT_PERSONAS
            .GOVERNANCE
        );
      }
    );


    test(
      "viewer resolves to executive presentation",
      () => {
        const result =
          buildProductContext(
            createContext({
              role:
                ORGANIZATION_ROLES
                  .VIEWER,
            })
          );

        expect(
          result.identity.persona
        ).toBe(
          PRODUCT_PERSONAS
            .EXECUTIVE
        );
      }
    );


    test(
      "rejects missing authenticated context",
      () => {
        expect(
          () =>
            buildProductContext(
              null
            )
        ).toThrow(
          "Authenticated request context is required"
        );
      }
    );


    test(
      "rejects context without membership role",
      () => {
        const context =
          createContext({
            role:
              null,

            membership:
              null,
          });

        expect(
          () =>
            buildProductContext(
              context
            )
        ).toThrow(
          "Organization membership role is required"
        );
      }
    );
  }
);