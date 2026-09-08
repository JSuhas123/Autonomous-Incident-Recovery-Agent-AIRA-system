"use strict";

const fs =
  require(
    "node:fs"
  );

const path =
  require(
    "node:path"
  );


require(
  "dotenv"
).config({
  path:
    path.resolve(
      __dirname,
      "../.env"
    ),
});


const {
  getPostgresPool,
  closePostgresPool,
} =
  require(
    "../persistence/postgres"
  );


const {
  assertCondition,
  makeCheck,
  printChecks,
  printHeader,
  writeArtifact,
} =
  require(
    "./phase25-certification-common"
  );


const VERSION =
  "25.13-product-contract-v1";


const ROOT =
  path.resolve(
    __dirname,
    "../.."
  );


const FRONTEND =
  path.join(
    ROOT,
    "frontend",
    "src"
  );


function read(
  relativePath
) {
  return fs.readFileSync(
    path.join(
      ROOT,
      relativePath
    ),
    "utf8"
  );
}


function collectSourceFiles(
  directory
) {
  const output = [];


  for (
    const entry
    of fs.readdirSync(
      directory,
      {
        withFileTypes:
          true,
      }
    )
  ) {
    if (
      [
        "node_modules",
        "dist",
        "build",
      ].includes(
        entry.name
      )
    ) {
      continue;
    }


    const full =
      path.join(
        directory,
        entry.name
      );


    if (
      entry.isDirectory()
    ) {
      output.push(
        ...collectSourceFiles(
          full
        )
      );
    } else if (
      /\.(js|ts|tsx)$/
        .test(
          entry.name
        )
    ) {
      output.push(
        full
      );
    }
  }


  return output;
}


function sourceContainsNo(
  pattern,
  files
) {
  return files.every(
    (
      file
    ) =>
      !pattern.test(
        fs.readFileSync(
          file,
          "utf8"
        )
      )
  );
}


async function main() {
  printHeader(
    "AIRA PHASE 25.13 — PRODUCT CONTRACT CERTIFICATION"
  );


  const checks = [];


  const contextMiddleware =
    read(
      "backend/middleware/contextMiddleware.js"
    );


  const server =
    read(
      "backend/server.js"
    );


  const productRoutes =
    read(
      "backend/routes/productReadModelRoutes.js"
    );


  const notificationRoutes =
    read(
      "backend/routes/productNotificationRoutes.js"
    );


  const tenantScope =
    read(
      "backend/persistence/postgres/PostgresTenantScope.js"
    );


  const notificationService =
    read(
      "backend/services/product/productNotificationService.js"
    );


  const productContextService =
    read(
      "backend/services/product/productContextService.js"
    );


  const frontendFiles =
    collectSourceFiles(
      path.join(
        FRONTEND,
        "features"
      )
    );


  checks.push(
    makeCheck(
      "browserEnvironmentContext authenticates, builds canonical context and resolves environment",

      /sessionAuthMiddleware[\s\S]*requestContextMiddleware[\s\S]*environmentContextMiddleware/
        .test(
          contextMiddleware
        )
    )
  );


  checks.push(
    makeCheck(
      "Product BFF is mounted behind browserEnvironmentContext",

      /"\/api\/v1\/product"[\s\S]*browserEnvironmentContext[\s\S]*productReadModelRoutes/
        .test(
          server
        )
    )
  );


  checks.push(
    makeCheck(
      "Product notification API is mounted behind browserEnvironmentContext",

      /"\/api\/v1\/product\/notifications"[\s\S]*browserEnvironmentContext[\s\S]*productNotificationRoutes/
        .test(
          server
        )
    )
  );


  checks.push(
    makeCheck(
      "PostgresTenantScope resolves logical scope before RLS and passes resolved identifiers",

      /resolveScope\([\s\S]*set_config\([\s\S]*resolved[\s\S]*organizationUuid[\s\S]*resolved[\s\S]*environmentUuid[\s\S]*work\([\s\S]*client,[\s\S]*resolved/
        .test(
          tenantScope
        )
    )
  );


  checks.push(
    makeCheck(
      "Product read-model wrapper always declares executionAuthorized=false",

      /executionAuthorized:\s*false/
        .test(
          productRoutes
        )
    )
  );


  checks.push(
    makeCheck(
      "Product notification wrapper always declares executionAuthorized=false",

      /executionAuthorized:\s*false/
        .test(
          notificationRoutes
        )
    )
  );


  checks.push(
    makeCheck(
      "Product persona cannot grant authorization",

      /personaGrantsAuthorization[\s\S]*false/
        .test(
          productContextService
        )
    )
  );


  checks.push(
    makeCheck(
      "Browser organization is explicitly non-authoritative in ProductContext",

      /browserOrganizationAuthoritative[\s\S]*false/
        .test(
          productContextService
        )
    )
  );


  checks.push(
    makeCheck(
      "Browser environment is explicitly non-authoritative in ProductContext",

      /browserEnvironmentAuthoritative[\s\S]*false/
        .test(
          productContextService
        )
    )
  );


  checks.push(
    makeCheck(
      "Product notifications reject execution-authority injection",

      /PRODUCT_NOTIFICATION_AUTHORITY_VIOLATION/
        .test(
          notificationService
        )
    )
  );


  checks.push(
    makeCheck(
      "Product notification SQL uses resolved organization UUID",

      /resolved\.organizationUuid/
        .test(
          notificationService
        )
    )
  );


  checks.push(
    makeCheck(
      "Product notification SQL uses resolved environment UUID",

      /resolved\.environmentUuid/
        .test(
          notificationService
        )
    )
  );


  checks.push(
    makeCheck(
      "Production feature layer contains no fixture imports",

      sourceContainsNo(
        /\.fixture(?:['"]|\b)|FixtureNotice/,
        frontendFiles
      )
    )
  );


  checks.push(
    makeCheck(
      "Fake freshness text removed",

      sourceContainsNo(
        /Updated moments ago/i,
        frontendFiles
      )
    )
  );


  checks.push(
    makeCheck(
      "Previously identified fabricated product metrics removed",

      sourceContainsNo(
        /99\.91|186 incident|76% recovery|100% audit|94% policy/i,
        frontendFiles
      )
    )
  );


  const pool =
    getPostgresPool();


  const rls =
    await pool.query(
      `
        SELECT
            n.nspname
                AS schema_name,

            c.relname
                AS table_name,

            c.relrowsecurity
                AS rls,

            c.relforcerowsecurity
                AS force_rls

        FROM
            pg_class c

        JOIN
            pg_namespace n
        ON
            n.oid =
                c.relnamespace

        WHERE
            (
                n.nspname,
                c.relname
            )
            IN (
                (
                    'product',
                    'organization_profiles'
                ),
                (
                    'product',
                    'notification_events'
                ),
                (
                    'product',
                    'notification_receipts'
                )
            )

        ORDER BY
            n.nspname,
            c.relname
      `
    );


  const rlsRows =
    rls.rows;


  checks.push(
    makeCheck(
      "Phase-25 product persistence tables have FORCE RLS",

      rlsRows.length ===
        3 &&
      rlsRows.every(
        (
          row
        ) =>
          row.rls ===
            true &&
          row.force_rls ===
            true
      ),

      `${rlsRows.length}/3 tables found`
    )
  );


  const authorityConstraint =
    await pool.query(
      `
        SELECT
            1

        FROM
            pg_constraint

        WHERE
            conname =
                'product_notification_never_executes'

        LIMIT 1
      `
    );


  checks.push(
    makeCheck(
      "Database prevents product notifications from carrying execution authority",

      authorityConstraint.rowCount ===
        1
    )
  );


  const passed =
    checks.every(
      (
        check
      ) =>
        check.passed
    );


  printChecks(
    checks
  );


  assertCondition(
    passed,

    "PHASE25_13_CONTRACT_FAILED",

    "Phase 25.13 product contract certification failed",

    checks.filter(
      (
        check
      ) =>
        !check.passed
    )
  );


  const result =
    writeArtifact(
      "phase25-13-product-contract",
      {
        version:
          VERSION,

        phase:
          "25.13",

        certificationType:
          "PRODUCT_CONTRACT",

        passed:
          true,

        checks,

        invariants: {
          browserOrganizationAuthoritative:
            false,

          browserEnvironmentAuthoritative:
            false,

          personaGrantsAuthorization:
            false,

          notificationReadAcknowledgesIncident:
            false,

          executionAuthorized:
            false,
        },
      }
    );


  console.log(
    ""
  );


  console.log(
    `Artifact: ${result.filePath}`
  );


  console.log(
    "PASS — PHASE 25.13 PRODUCT CONTRACT CERTIFIED"
  );
}


main()
  .catch(
    (
      error
    ) => {
      console.error(
        "[phase25.13] FAILED:",
        {
          code:
            error.code ||
            null,

          message:
            error.message,

          details:
            error.details ||
            null,
        }
      );


      process.exitCode =
        1;
    }
  )
  .finally(
    async () => {
      try {
        await closePostgresPool();
      } catch {
        // no-op
      }
    }
  );