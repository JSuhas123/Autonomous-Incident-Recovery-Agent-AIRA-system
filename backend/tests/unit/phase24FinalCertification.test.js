"use strict";


const fs =
  require(
    "node:fs"
  );


const path =
  require(
    "node:path"
  );


describe(
  "AIRA Phase 24.9 — final certification integrity",
  () => {
    test(
      "0104 creates isolated certification evidence",
      () => {
        const migration =
          fs.readFileSync(
            path.resolve(
              __dirname,

              "../../persistence/postgres/migrations/0104_learning_certification_integrity.sql"
            ),

            "utf8"
          );


        expect(
          migration
        ).toContain(
          "learning.certification_runs"
        );


        expect(
          migration
        ).toContain(
          "learning.certification_evidence"
        );


        expect(
          (
            migration.match(
              /FORCE ROW LEVEL SECURITY/g
            )
            ||
            []
          ).length
        ).toBeGreaterThanOrEqual(
          2
        );


        expect(
          migration
        ).toMatch(
          /production_certified[\s\S]*DEFAULT FALSE/
        );


        expect(
          migration
        ).toMatch(
          /execution_authorized[\s\S]*DEFAULT FALSE/
        );
      }
    );


    test(
      "final certification requires adversarial and live-state evidence",
      () => {
        const source =
          fs.readFileSync(
            path.resolve(
              __dirname,

              "../../scripts/certify-phase24-final.js"
            ),

            "utf8"
          );


        expect(
          source
        ).toContain(
          "phase24-adversarial-"
        );


        expect(
          source
        ).toContain(
          "phase24-live-state-"
        );


        expect(
          source
        ).toContain(
          "sourceChainHash"
        );


        expect(
          source
        ).toContain(
          "executionAuthorityGranted"
        );
      }
    );
  }
);