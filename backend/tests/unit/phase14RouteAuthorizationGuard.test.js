"use strict";

/**
 * ============================================================================
 * AIRA PHASE 14.2 — ROUTE AUTHORIZATION REGRESSION GUARD
 * ============================================================================
 *
 * Phase 14 converted route-level authorization from:
 *
 *     if (role === "admin")
 *
 * and:
 *
 *     requireRoles([OWNER, ADMIN])
 *
 * into:
 *
 *     requirePermission(...)
 *     requireAllPermissions(...)
 *     requireAnyPermission(...)
 *
 * This test prevents future route code from silently reintroducing
 * hardcoded organization-role authorization.
 *
 * IMPORTANT:
 *
 * Roles are still legitimate in:
 *
 * - role bundle definitions
 * - membership persistence
 * - UI/display metadata
 * - authentication/session context
 *
 * This guard applies specifically to route-layer authorization.
 */

const fs =
  require(
    "fs"
  );

const path =
  require(
    "path"
  );

const ROUTES_DIRECTORY =
  path.join(
    __dirname,
    "..",
    "..",
    "routes"
  );

/**
 * Files that are intentionally outside the Phase 14 browser RBAC migration.
 *
 * Keep this list extremely small.
 *
 * Adding a file here should require an explicit security justification.
 */
const ALLOWED_ROUTE_EXCEPTIONS =
  new Set([
    /**
     * Authentication endpoints establish identity rather than authorize
     * an already-authenticated organization member.
     */
    "authRoutes.js",

    /**
     * Development-only authentication path.
     *
     * If this route is removed later, remove the exception too.
     */
    "devAuthRoutes.js",
  ]);

/**
 * Patterns representing old route-level role authorization.
 *
 * These intentionally target authorization constructs rather than every
 * appearance of the word "role".
 */
const PROHIBITED_PATTERNS = [
  {
    name:
      "requireRoles helper",

    regex:
      /\brequireRoles\s*\(/g,
  },

  {
    name:
      "allowedRoles membership check",

    regex:
      /\ballowedRoles\s*\.\s*includes\s*\(/g,
  },

  {
    name:
      "hardcoded role equality",

    regex:
      /\b(?:req(?:uest)?\.)?(?:context|auth|user)\s*\??\.\s*role\s*={2,3}\s*["'`]/g,
  },

  {
    name:
      "hardcoded role inequality",

    regex:
      /\b(?:req(?:uest)?\.)?(?:context|auth|user)\s*\??\.\s*role\s*!={1,2}\s*["'`]/g,
  },

  {
    name:
      "ORGANIZATION_ROLES used directly in route authorization",

    regex:
      /\bORGANIZATION_ROLES\.(?:OWNER|ADMIN|PLATFORM_ENGINEER|DEVELOPER|SECURITY_ANALYST|AUDITOR|VIEWER)\b/g,
  },

  {
    name:
      "INSUFFICIENT_ROLE response",

    regex:
      /["'`]INSUFFICIENT_ROLE["'`]/g,
  },
];

function getJavaScriptFiles(
  directory
) {
  if (
    !fs.existsSync(
      directory
    )
  ) {
    return [];
  }

  return fs
    .readdirSync(
      directory,
      {
        withFileTypes:
          true,
      }
    )
    .flatMap(
      (
        entry
      ) => {
        const absolutePath =
          path.join(
            directory,
            entry.name
          );

        if (
          entry.isDirectory()
        ) {
          return getJavaScriptFiles(
            absolutePath
          );
        }

        if (
          !entry.isFile() ||
          !entry.name.endsWith(
            ".js"
          )
        ) {
          return [];
        }

        return [
          absolutePath,
        ];
      }
    );
}

function getLineNumber(
  content,
  index
) {
  return (
    content
      .slice(
        0,
        index
      )
      .split(
        "\n"
      )
      .length
  );
}

describe(
  "Phase 14.2 route authorization guard",
  () => {
    test(
      "route files do not reintroduce hardcoded organization-role authorization",
      () => {
        const files =
          getJavaScriptFiles(
            ROUTES_DIRECTORY
          );

        expect(
          files.length
        ).toBeGreaterThan(
          0
        );

        const violations =
          [];

        for (
          const file
          of files
        ) {
          const basename =
            path.basename(
              file
            );

          if (
            ALLOWED_ROUTE_EXCEPTIONS.has(
              basename
            )
          ) {
            continue;
          }

          const content =
            fs.readFileSync(
              file,
              "utf8"
            );

          for (
            const pattern
            of PROHIBITED_PATTERNS
          ) {
            pattern.regex.lastIndex =
              0;

            let match;

            while (
              (
                match =
                  pattern.regex.exec(
                    content
                  )
              ) !==
              null
            ) {
              violations.push({
                file:
                  path.relative(
                    path.join(
                      __dirname,
                      "..",
                      ".."
                    ),
                    file
                  ),

                line:
                  getLineNumber(
                    content,
                    match.index
                  ),

                pattern:
                  pattern.name,

                match:
                  match[0],
              });

              /**
               * Protect against a zero-width regex accidentally creating an
               * infinite test loop.
               */
              if (
                match.index ===
                pattern.regex.lastIndex
              ) {
                pattern.regex.lastIndex +=
                  1;
              }
            }
          }
        }

        if (
          violations.length >
          0
        ) {
          const report =
            violations
              .map(
                (
                  violation
                ) =>
                  `${violation.file}:${violation.line} ` +
                  `[${violation.pattern}] ` +
                  `${violation.match}`
              )
              .join(
                "\n"
              );

          throw new Error(
            [
              "",
              "Phase 14.2 route authorization regression detected.",
              "",
              report,
              "",
              "Route authorization must use:",
              "  requirePermission(...)",
              "  requireAllPermissions(...)",
              "  requireAnyPermission(...)",
              "",
              "Do not authorize routes using organization role names directly.",
            ].join(
              "\n"
            )
          );
        }

        expect(
          violations
        ).toEqual(
          []
        );
      }
    );

    test(
      "Phase 14 authorization infrastructure exists",
      () => {
        const requiredFiles = [
          path.join(
            __dirname,
            "..",
            "..",
            "constants",
            "permissions.js"
          ),

          path.join(
            __dirname,
            "..",
            "..",
            "constants",
            "rolePermissions.js"
          ),

          path.join(
            __dirname,
            "..",
            "..",
            "services",
            "identity",
            "authorizationService.js"
          ),

          path.join(
            __dirname,
            "..",
            "..",
            "middleware",
            "authorizationMiddleware.js"
          ),
        ];

        for (
          const requiredFile
          of requiredFiles
        ) {
          expect(
            fs.existsSync(
              requiredFile
            )
          ).toBe(
            true
          );
        }
      }
    );
  }
);