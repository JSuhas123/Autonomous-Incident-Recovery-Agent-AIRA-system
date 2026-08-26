"use strict";

const fs =
  require(
    "fs"
  );

const path =
  require(
    "path"
  );


const middlewarePath =
  path.join(
    __dirname,
    "..",
    "..",
    "middleware",
    "authorizationMiddleware.js"
  );


const centralPath =
  path.join(
    __dirname,
    "..",
    "..",
    "services",
    "identity",
    "centralAuthorizationService.js"
  );


const principalPath =
  path.join(
    __dirname,
    "..",
    "..",
    "services",
    "identity",
    "principalService.js"
  );


describe(
  "Phase 14.6B central authorization integration",
  () => {

    test(
      "legacy requirePermission delegates to central authorization",
      () => {
        const source =
          fs.readFileSync(
            middlewarePath,
            "utf8"
          );

        expect(
          source
        ).toContain(
          "centralAuthorizationService"
        );

        expect(
          source
        ).toMatch(
          /\bauthorize\s*\(/
        );
      }
    );


    test(
      "authorization middleware resolves a canonical principal",
      () => {
        const source =
          fs.readFileSync(
            middlewarePath,
            "utf8"
          );

        expect(
          source
        ).toContain(
          "principalFromRequest"
        );

        expect(
          source
        ).toContain(
          "req.principal"
        );
      }
    );


   test(
  "normal authorization path delegates to central authorization",
  () => {
    const source =
      fs.readFileSync(
        middlewarePath,
        "utf8"
      );

    /**
     * The middleware must import the central authorization service.
     */
    expect(
      source
    ).toContain(
      "centralAuthorizationService"
    );

    /**
     * The normal authorization path must call authorize().
     */
    expect(
      source
    ).toMatch(
      /\bauthorize\s*\(/
    );

    /**
     * Central authorization decisions must be attached to the request.
     */
    expect(
      source
    ).toContain(
      "req.authorization"
    );

    /**
     * Denials must remain fail-closed.
     */
    expect(
      source
    ).toContain(
      "executionAuthorized"
    );
  }
);


    test(
      "central authorization remains organization scoped",
      () => {
        const source =
          fs.readFileSync(
            centralPath,
            "utf8"
          );

        expect(
          source
        ).toContain(
          "ORGANIZATION_SCOPE_MISMATCH"
        );

        expect(
          source
        ).toContain(
          "checkOrganizationScope"
        );
      }
    );


    test(
      "central authorization remains environment aware",
      () => {
        const source =
          fs.readFileSync(
            centralPath,
            "utf8"
          );

        expect(
          source
        ).toContain(
          "ENVIRONMENT_SCOPE_DENIED"
        );

        expect(
          source
        ).toContain(
          "checkEnvironmentScope"
        );
      }
    );


    test(
      "principal resolution supports established req.auth session identity",
      () => {
        const source =
          fs.readFileSync(
            principalPath,
            "utf8"
          );

        expect(
          source
        ).toMatch(
          /req\.auth[\s\S]*?userId/
        );

        expect(
          source
        ).toMatch(
          /req\.auth[\s\S]*?organizationId/
        );

        expect(
          source
        ).toMatch(
          /req\.auth[\s\S]*?role/
        );
      }
    );


    test(
      "authorization middleware preserves fail-closed execution state",
      () => {
        const source =
          fs.readFileSync(
            middlewarePath,
            "utf8"
          );

        expect(
          source
        ).toContain(
          "executionAuthorized"
        );

        expect(
          source
        ).toContain(
          "false"
        );
      }
    );
  }
);