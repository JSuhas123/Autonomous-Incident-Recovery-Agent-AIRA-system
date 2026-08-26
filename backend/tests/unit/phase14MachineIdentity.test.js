"use strict";

const fs =
  require(
    "fs"
  );

const path =
  require(
    "path"
  );


const servicePath =
  path.join(
    __dirname,
    "..",
    "..",
    "services",
    "identity",
    "serviceAccountService.js"
  );


const middlewarePath =
  path.join(
    __dirname,
    "..",
    "..",
    "middleware",
    "serviceAccountAuthMiddleware.js"
  );


const routesPath =
  path.join(
    __dirname,
    "..",
    "..",
    "routes",
    "serviceAccountRoutes.js"
  );


const migrationPath =
  path.join(
    __dirname,
    "..",
    "..",
    "persistence",
    "postgres",
    "migrations",
    "0039_service_accounts_api_keys.sql"
  );


describe(
  "Phase 14.4 machine identity",
  () => {
    test(
      "service account infrastructure exists",
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
            middlewarePath
          )
        ).toBe(
          true
        );

        expect(
          fs.existsSync(
            routesPath
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
      "API keys are hashed before persistence",
      () => {
        const source =
          fs.readFileSync(
            servicePath,
            "utf8"
          );

        expect(
          source
        ).toContain(
          "createHash"
        );

        expect(
          source
        ).toContain(
          '"sha256"'
        );

        expect(
          source
        ).toMatch(
          /key_hash/
        );
      }
    );


    test(
      "authentication uses timing safe hash comparison",
      () => {
        const source =
          fs.readFileSync(
            servicePath,
            "utf8"
          );

        expect(
          source
        ).toContain(
          "timingSafeEqual"
        );
      }
    );


    test(
      "plaintext API key is returned only from create and rotate paths",
      () => {
        const source =
          fs.readFileSync(
            servicePath,
            "utf8"
          );

        expect(
          source
        ).toMatch(
          /secret:\s*generated\.plaintext/
        );

        expect(
  source
).not.toMatch(
  /\bSELECT\b[^;]*\bplaintext\b/gi
);

expect(
  source
).not.toMatch(
  /\bSELECT\b[^;]*\bsecret\b/gi
);

expect(
  source
).not.toMatch(
  /\bSELECT\b[^;]*\bkey_secret\b/gi
);
      }
    );


    test(
      "service account revocation revokes its API keys",
      () => {
        const source =
          fs.readFileSync(
            servicePath,
            "utf8"
          );

        expect(
          source
        ).toMatch(
          /UPDATE[\s\S]*identity\.api_keys/
        );

        expect(
          source
        ).toContain(
          "service_account_revoked"
        );
      }
    );


    test(
      "machine actor remains distinct from user actor",
      () => {
        const source =
          fs.readFileSync(
            middlewarePath,
            "utf8"
          );

        expect(
          source
        ).toContain(
          '"SERVICE_ACCOUNT"'
        );

        expect(
          source
        ).not.toMatch(
          /userId\s*:\s*actor\.serviceAccountId/
        );
      }
    );


    test(
      "machine identity management uses permissions rather than roles",
      () => {
        const source =
          fs.readFileSync(
            routesPath,
            "utf8"
          );

        expect(
          source
        ).toMatch(
          /requirePermission/
        );

        expect(
          source
        ).not.toMatch(
          /\brequireRoles\s*\(/
        );
      }
    );


    test(
      "database structurally prevents cross-organization API keys",
      () => {
        const source =
          fs.readFileSync(
            migrationPath,
            "utf8"
          );

        expect(
          source
        ).toContain(
          "aira_validate_api_key_scope"
        );

        expect(
          source
        ).toContain(
          "API key organization does not match service account organization"
        );
      }
    );
  }
);