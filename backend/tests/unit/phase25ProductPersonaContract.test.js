"use strict";

/**
 * ============================================================================
 * AIRA PHASE 25.0A
 * PRODUCT PERSONA CONTRACT CERTIFICATION
 * ============================================================================
 */

const {
  ORGANIZATION_ROLES,
} = require(
  "../../constants/roles"
);

const {
  PRODUCT_PERSONAS,
  PRODUCT_PERSONA_VALUES,
  DEFAULT_PERSONA_BY_ROLE,
  PRODUCT_PERSONA_METADATA,
  isKnownProductPersona,
  getDefaultPersonaForRole,
  getProductPersonaMetadata,
} = require(
  "../../constants/productPersonas"
);

describe(
  "AIRA Phase 25.0A — Product Persona Contract",
  () => {
    test(
      "defines exactly the canonical Phase 25 product personas",
      () => {
        expect(
          PRODUCT_PERSONA_VALUES
            .slice()
            .sort()
        ).toEqual(
          [
            "administration",
            "developer",
            "executive",
            "governance",
            "operations",
          ].sort()
        );
      }
    );

    test(
      "maps owner to administration",
      () => {
        expect(
          getDefaultPersonaForRole(
            ORGANIZATION_ROLES
              .OWNER
          )
        ).toBe(
          PRODUCT_PERSONAS
            .ADMINISTRATION
        );
      }
    );

    test(
      "maps admin to administration",
      () => {
        expect(
          getDefaultPersonaForRole(
            ORGANIZATION_ROLES
              .ADMIN
          )
        ).toBe(
          PRODUCT_PERSONAS
            .ADMINISTRATION
        );
      }
    );

    test(
      "maps platform engineer to operations",
      () => {
        expect(
          getDefaultPersonaForRole(
            ORGANIZATION_ROLES
              .PLATFORM_ENGINEER
          )
        ).toBe(
          PRODUCT_PERSONAS
            .OPERATIONS
        );
      }
    );

    test(
      "maps developer to developer persona",
      () => {
        expect(
          getDefaultPersonaForRole(
            ORGANIZATION_ROLES
              .DEVELOPER
          )
        ).toBe(
          PRODUCT_PERSONAS
            .DEVELOPER
        );
      }
    );

    test(
      "maps security analyst to governance",
      () => {
        expect(
          getDefaultPersonaForRole(
            ORGANIZATION_ROLES
              .SECURITY_ANALYST
          )
        ).toBe(
          PRODUCT_PERSONAS
            .GOVERNANCE
        );
      }
    );

    test(
      "maps auditor to governance",
      () => {
        expect(
          getDefaultPersonaForRole(
            ORGANIZATION_ROLES
              .AUDITOR
          )
        ).toBe(
          PRODUCT_PERSONAS
            .GOVERNANCE
        );
      }
    );

    test(
      "maps viewer to executive presentation",
      () => {
        expect(
          getDefaultPersonaForRole(
            ORGANIZATION_ROLES
              .VIEWER
          )
        ).toBe(
          PRODUCT_PERSONAS
            .EXECUTIVE
        );
      }
    );

    test(
      "does not introduce executive as an organization authorization role",
      () => {
        expect(
          Object.values(
            ORGANIZATION_ROLES
          )
        ).not.toContain(
          "executive"
        );
      }
    );

    test(
      "contains metadata for every persona",
      () => {
        for (
          const persona
          of
          PRODUCT_PERSONA_VALUES
        ) {
          expect(
            PRODUCT_PERSONA_METADATA[
              persona
            ]
          ).toBeDefined();

          expect(
            PRODUCT_PERSONA_METADATA[
              persona
            ].id
          ).toBe(
            persona
          );

          expect(
            PRODUCT_PERSONA_METADATA[
              persona
            ].label
          ).toEqual(
            expect.any(
              String
            )
          );

          expect(
            PRODUCT_PERSONA_METADATA[
              persona
            ]
              .defaultLandingPath
          ).toMatch(
            /^\//
          );
        }
      }
    );

    test(
      "recognizes valid product personas",
      () => {
        for (
          const persona
          of
          PRODUCT_PERSONA_VALUES
        ) {
          expect(
            isKnownProductPersona(
              persona
            )
          ).toBe(
            true
          );
        }
      }
    );

    test(
      "rejects invalid product personas",
      () => {
        expect(
          isKnownProductPersona(
            "owner"
          )
        ).toBe(
          false
        );

        expect(
          isKnownProductPersona(
            "root"
          )
        ).toBe(
          false
        );

        expect(
          isKnownProductPersona(
            ""
          )
        ).toBe(
          false
        );

        expect(
          isKnownProductPersona(
            null
          )
        ).toBe(
          false
        );
      }
    );

    test(
      "falls back safely to executive presentation for an unknown role",
      () => {
        expect(
          getDefaultPersonaForRole(
            "unknown_role"
          )
        ).toBe(
          PRODUCT_PERSONAS
            .EXECUTIVE
        );
      }
    );

    test(
      "returns complete persona metadata",
      () => {
        const metadata =
          getProductPersonaMetadata(
            PRODUCT_PERSONAS
              .OPERATIONS
          );

        expect(
          metadata
        ).toMatchObject({
          id:
            PRODUCT_PERSONAS
              .OPERATIONS,

          label:
            "Operations",

          defaultLandingPath:
            "/operations",
        });
      }
    );

    test(
      "unknown persona metadata safely resolves to executive",
      () => {
        const metadata =
          getProductPersonaMetadata(
            "invalid"
          );

        expect(
          metadata.id
        ).toBe(
          PRODUCT_PERSONAS
            .EXECUTIVE
        );
      }
    );

    test(
      "default mapping covers every canonical organization role",
      () => {
        for (
          const role
          of
          Object.values(
            ORGANIZATION_ROLES
          )
        ) {
          expect(
            DEFAULT_PERSONA_BY_ROLE[
              role
            ]
          ).toBeDefined();

          expect(
            PRODUCT_PERSONA_VALUES
          ).toContain(
            DEFAULT_PERSONA_BY_ROLE[
              role
            ]
          );
        }
      }
    );
  }
);