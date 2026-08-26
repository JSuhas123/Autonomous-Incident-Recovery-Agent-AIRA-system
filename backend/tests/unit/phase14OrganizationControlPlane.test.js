"use strict";

/**
 * ============================================================================
 * AIRA PHASE 14.3 — ORGANIZATION CONTROL PLANE STATIC CONTRACT
 * ============================================================================
 *
 * This test validates architecture/security properties without depending on
 * cosmetic source formatting.
 */

const fs =
  require(
    "fs"
  );

const path =
  require(
    "path"
  );

const routePath =
  path.join(
    __dirname,
    "..",
    "..",
    "routes",
    "organizationRoutes.js"
  );

const serverPath =
  path.join(
    __dirname,
    "..",
    "..",
    "server.js"
  );

describe(
  "Phase 14.3 organization control plane",
  () => {
    test(
      "organization route exists",
      () => {
        expect(
          fs.existsSync(
            routePath
          )
        ).toBe(
          true
        );
      }
    );

    test(
      "organization API uses canonical organization context",
      () => {
        const source =
          fs.readFileSync(
            routePath,
            "utf8"
          );

        expect(
          source
        ).toMatch(
          /\bbrowserOrganizationContext\b/
        );

        /**
         * Organization ownership must come from req.context.
         *
         * Do not reintroduce Phase-13 auth fallbacks or body-controlled
         * organization ownership.
         */
        expect(
          source
        ).not.toMatch(
          /req\s*\.\s*auth\s*\??\.\s*organizationId/
        );

        expect(
          source
        ).not.toMatch(
          /req\s*\.\s*auth\s*\??\.\s*tenantId/
        );

        expect(
          source
        ).not.toMatch(
          /req\s*\.\s*body\s*\??\.\s*organizationId/
        );

        expect(
          source
        ).toMatch(
          /req\s*\.\s*context/
        );
      }
    );

    test(
      "organization mutations are permission authorized",
      () => {
        const source =
          fs.readFileSync(
            routePath,
            "utf8"
          );

        /**
         * Match both:
         *
         * PERMISSIONS.ORGANIZATION_MANAGE
         *
         * and:
         *
         * PERMISSIONS
         *   .ORGANIZATION_MANAGE
         */
        expect(
          source
        ).toMatch(
          /PERMISSIONS\s*\.\s*ORGANIZATION_MANAGE/
        );

        expect(
          source
        ).toMatch(
          /requirePermission\s*\(/
        );

        expect(
          source
        ).not.toMatch(
          /\brequireRoles\s*\(/
        );

       expect(
  source
).not.toMatch(
  /\brequireRoles\s*\(/
);

expect(
  source
).toMatch(
  /\brequirePermission\s*\(/
);
      }
    );

    test(
      "member reads remain organization scoped",
      () => {
        const source =
          fs.readFileSync(
            routePath,
            "utf8"
          );

        expect(
          source
        ).toMatch(
          /\borganizationMembershipRepository\b/
        );

        expect(
          source
        ).toMatch(
          /organizationId\s*:\s*req\s*\.\s*context\s*\??\.\s*organizationId|organizationId\s*:\s*req\s*\.\s*context[\s\S]*?\.organizationId/
        );

        expect(
          source
        ).toMatch(
          /["'`]MEMBERSHIP_NOT_FOUND["'`]/
        );

        /**
         * Individual membership lookup must include organization ownership,
         * preventing cross-tenant membership ID enumeration.
         */
        expect(
          source
        ).toMatch(
          /findOne\s*\(\s*\{[\s\S]*?_id\s*:[\s\S]*?membershipId[\s\S]*?organizationId\s*:/m
        );
      }
    );

    test(
      "server mounts organization API",
      () => {
        const source =
          fs.readFileSync(
            serverPath,
            "utf8"
          );

        /**
         * Formatting-independent import validation.
         */
        expect(
          source
        ).toMatch(
          /require\s*\(\s*["']\.\/routes\/organizationRoutes["']\s*\)/
        );

        /**
         * Formatting-independent mount validation.
         */
        expect(
          source
        ).toMatch(
          /app\s*\.\s*use\s*\(\s*["']\/api\/v1\/organizations["']\s*,\s*organizationRoutes\s*\)/
        );
      }
    );

    test(
      "organization reads use organization.read permission",
      () => {
        const source =
          fs.readFileSync(
            routePath,
            "utf8"
          );

        expect(
          source
        ).toMatch(
          /PERMISSIONS\s*\.\s*ORGANIZATION_READ/
        );
      }
    );

    test(
      "role metadata comes from canonical role-permission bundles",
      () => {
        const source =
          fs.readFileSync(
            routePath,
            "utf8"
          );

        expect(
          source
        ).toMatch(
          /\bORGANIZATION_ROLE_VALUES\b/
        );

        expect(
          source
        ).toMatch(
          /\bgetPermissionsForRole\b/
        );
      }
    );

    test(
      "removed memberships are excluded from normal member directory",
      () => {
        const source =
          fs.readFileSync(
            routePath,
            "utf8"
          );

        expect(
          source
        ).toMatch(
          /membership\s*\.\s*status\s*!==\s*["']removed["']/
        );
      }
    );
  }
);