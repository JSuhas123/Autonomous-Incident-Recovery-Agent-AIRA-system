"use strict";

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

const servicePath =
  path.join(
    __dirname,
    "..",
    "..",
    "services",
    "identity",
    "organizationTeamService.js"
  );

const migrationPath =
  path.join(
    __dirname,
    "..",
    "..",
    "persistence",
    "postgres",
    "migrations",
    "0038_organization_teams.sql"
  );

describe(
  "Phase 14.3E teams control plane",
  () => {
    test(
      "team service and migration exist",
      () => {
        expect(
          fs.existsSync(
            servicePath
          )
        ).toBe(
          true
        );

        expect(
          fs.existsSync(
            migrationPath
          )
        ).toBe(
          true
        );
      }
    );

    test(
      "team mutations require TEAM_MANAGE",
      () => {
        const source =
          fs.readFileSync(
            routePath,
            "utf8"
          );

        expect(
          source
        ).toMatch(
          /PERMISSIONS\s*\.\s*TEAM_MANAGE/
        );

        expect(
          source
        ).not.toMatch(
          /\brequireRoles\s*\(/
        );
      }
    );

    test(
      "team service always carries organization scope",
      () => {
        const source =
          fs.readFileSync(
            servicePath,
            "utf8"
          );

        expect(
          source
        ).toMatch(
          /\borganizationId\b/
        );

        expect(
          source
        ).toMatch(
          /organization_id\s*=\s*\$1/
        );
      }
    );

    test(
      "team membership requires active organization membership",
      () => {
        const source =
          fs.readFileSync(
            servicePath,
            "utf8"
          );

        expect(
          source
        ).toMatch(
          /membership\.status\s*!==\s*["']active["']/
        );

        expect(
          source
        ).toMatch(
          /TEAM_MEMBERSHIP_REQUIRES_ACTIVE_MEMBER/
        );
      }
    );

    test(
      "database migration enforces cross-organization membership isolation",
      () => {
        const source =
          fs.readFileSync(
            migrationPath,
            "utf8"
          );

        expect(
          source
        ).toContain(
          "aira_validate_team_membership_scope"
        );

        expect(
          source
        ).toContain(
          "team organization mismatch"
        );

        expect(
          source
        ).toContain(
          "membership organization mismatch"
        );
      }
    );

    test(
      "teams use soft archive rather than destructive delete",
      () => {
        const source =
          fs.readFileSync(
            servicePath,
            "utf8"
          );

        expect(
          source
        ).toMatch(
          /status\s*=\s*[\s\S]*?['"]archived['"]/
        );

        expect(
          source
        ).toMatch(
          /archived_at/
        );
      }
    );
  }
);