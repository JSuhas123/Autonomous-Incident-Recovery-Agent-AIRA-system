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


const scopePath =
  path.join(
    __dirname,
    "..",
    "..",
    "constants",
    "permissionScopes.js"
  );


const auditPath =
  path.join(
    __dirname,
    "..",
    "..",
    "services",
    "identity",
    "authorizationDecisionAuditService.js"
  );


describe(
  "Phase 14.6 final central authorization integration",
  () => {

    test(
      "permission middleware delegates decisions centrally",
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
      "permission middleware resolves environment requirements from permission registry",
      () => {
        const source =
          fs.readFileSync(
            middlewarePath,
            "utf8"
          );


        expect(
          source
        ).toContain(
          "permissionRequiresEnvironment"
        );


        expect(
          source
        ).toContain(
          "resolveRequireEnvironment"
        );
      }
    );


    test(
      "authorization decisions are audited centrally",
      () => {
        const source =
          fs.readFileSync(
            middlewarePath,
            "utf8"
          );


        expect(
          source
        ).toContain(
          "recordAuthorizationDecision"
        );
      }
    );


    test(
      "authorization audit distinguishes allow and deny",
      () => {
        const source =
          fs.readFileSync(
            auditPath,
            "utf8"
          );


        expect(
          source
        ).toContain(
          "authorization_allowed"
        );


        expect(
          source
        ).toContain(
          "authorization_denied"
        );
      }
    );


    test(
      "permission scope registry exists",
      () => {
        expect(
          fs.existsSync(
            scopePath
          )
        ).toBe(
          true
        );
      }
    );


    test(
      "authorization middleware retains executionAuthorized false on denial",
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


    test(
      "legacy role middleware is not reintroduced",
      () => {
        const source =
          fs.readFileSync(
            middlewarePath,
            "utf8"
          );


        expect(
          source
        ).not.toMatch(
          /\brequireRoles\s*\(/
        );
      }
    );
  }
);