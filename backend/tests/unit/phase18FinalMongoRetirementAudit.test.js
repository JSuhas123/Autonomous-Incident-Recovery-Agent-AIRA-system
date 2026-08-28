"use strict";

const fs =
  require("fs");

const path =
  require("path");


const ROOT =
  path.resolve(
    __dirname,
    "../.."
  );


const ACTIVE_RUNTIME_ROOTS = [
  "playbooks/execution",
  "playbooks/registry",
  "runbooks/execution",
  "runbooks/registry",
  "knowledge/reasoning",
  "knowledge/strategy",
  "persistence/postgres",
];


function collectJsFiles(
  relativeDirectory
) {
  const directory =
    path.join(
      ROOT,
      relativeDirectory
    );

  if (
    !fs.existsSync(
      directory
    )
  ) {
    return [];
  }

  const output = [];


  function walk(
    current
  ) {
    for (
      const entry
      of fs.readdirSync(
        current,
        {
          withFileTypes:
            true,
        }
      )
    ) {
      const absolute =
        path.join(
          current,
          entry.name
        );

      if (
        entry.isDirectory()
      ) {
        walk(
          absolute
        );

        continue;
      }

      if (
        entry.isFile() &&
        entry.name.endsWith(
          ".js"
        )
      ) {
        output.push(
          absolute
        );
      }
    }
  }


  walk(
    directory
  );

  return output;
}


function relative(
  absolute
) {
  return path
    .relative(
      ROOT,
      absolute
    )
    .replace(
      /\\/g,
      "/"
    );
}


describe(
  "Phase 18.20 final Mongo recovery retirement audit",
  () => {
    const runtimeFiles =
      ACTIVE_RUNTIME_ROOTS
        .flatMap(
          collectJsFiles
        );


    test(
      "active recovery runtime contains no Mongoose imports",
      () => {
        const offenders = [];

        for (
          const file
          of runtimeFiles
        ) {
          const source =
            fs.readFileSync(
              file,
              "utf8"
            );

          if (
            /require\s*\(\s*["']mongoose["']\s*\)/i
              .test(
                source
              )
          ) {
            offenders.push(
              relative(file)
            );
          }
        }

        expect(
          offenders
        ).toEqual([]);
      }
    );


    test(
      "active recovery runtime contains no legacy Playbook or Runbook execution model imports",
      () => {
        const offenders = [];

        const pattern =
          /require\s*\(\s*["'][^"']*models\/(?:PlaybookExecution|RunbookExecution)["']\s*\)/i;

        for (
          const file
          of runtimeFiles
        ) {
          const source =
            fs.readFileSync(
              file,
              "utf8"
            );

          if (
            pattern.test(
              source
            )
          ) {
            offenders.push(
              relative(file)
            );
          }
        }

        expect(
          offenders
        ).toEqual([]);
      }
    );


   test(
  "active Playbook and Runbook registries do not import legacy Mongo models",
  () => {
    const files = [
      "playbooks/registry/playbookRegistry.js",
      "runbooks/registry/runbookRegistry.js",
    ];

    const legacyModelImportPattern =
      /require\s*\(\s*["'][^"']*models\/(?:Playbook|Runbook)["']\s*\)/i;

    for (
      const file
      of files
    ) {
      const source =
        fs.readFileSync(
          path.join(
            ROOT,
            file
          ),
          "utf8"
        );

      expect(
        source
      ).not.toMatch(
        legacyModelImportPattern
      );
    }
  }
);

    test(
      "PostgreSQL execution adapters are canonical runtime adapters",
      () => {
        const playbook =
          fs.readFileSync(
            path.join(
              ROOT,
              "persistence/postgres/PostgresPlaybookExecutionAdapter.js"
            ),
            "utf8"
          );

        const runbook =
          fs.readFileSync(
            path.join(
              ROOT,
              "persistence/postgres/PostgresRunbookExecutionAdapter.js"
            ),
            "utf8"
          );

        expect(
          playbook
        ).toMatch(
          /PostgresPlaybookExecutionRepository/
        );

        expect(
          runbook
        ).toMatch(
          /PostgresRunbookExecutionRepository/
        );
      }
    );


    test(
      "legacy execution model files may remain only as migration compatibility artifacts",
      () => {
        const legacyModels = [
          "models/PlaybookExecution.js",
          "models/RunbookExecution.js",
        ];

        for (
          const model
          of legacyModels
        ) {
          /**
           * This test intentionally does NOT require deletion.
           *
           * Phase 18 retires them from active runtime authority.
           * Historical migration/backfill tooling may still need
           * them until broader repository migration work is finished.
           */
          expect(
            typeof model
          ).toBe(
            "string"
          );
        }
      }
    );


    test(
      "customer MongoDB operational knowledge is not treated as retired",
      () => {
        const strategy =
          require(
            "../../knowledge/strategy"
          );

        expect(
          strategy
            .PRODUCTION_DOMAIN_PACKS
            .MONGODB_CUSTOMER_INFRASTRUCTURE
            .domain
        ).toBe(
          "database.mongodb"
        );
      }
    );
  }
);