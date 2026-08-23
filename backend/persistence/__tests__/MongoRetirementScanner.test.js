"use strict";

const fs =
  require(
    "node:fs"
  );

const os =
  require(
    "node:os"
  );

const path =
  require(
    "node:path"
  );

const MongoRetirementScanner =
  require(
    "../migration/MongoRetirementScanner"
  );

describe(
  "MongoRetirementScanner",
  () => {
    let root;

    beforeEach(
      () => {
        root =
          fs.mkdtempSync(
            path.join(
              os.tmpdir(),
              "aira-mongo-retirement-"
            )
          );

        fs.mkdirSync(
          path.join(
            root,
            "services"
          ),
          {
            recursive:
              true,
          }
        );
      }
    );

    afterEach(
      () => {
        fs.rmSync(
          root,
          {
            recursive:
              true,

            force:
              true,
          }
        );
      }
    );

    test(
      "detects direct model imports",
      () => {
        fs.writeFileSync(
          path.join(
            root,
            "services",
            "incidentService.js"
          ),
          `
            "use strict";

            const Incident =
              require("../models/Incident");

            module.exports = Incident;
          `
        );

        const report =
          new MongoRetirementScanner({
            root,
          })
            .scan();

        expect(
          report.ready
        )
          .toBe(
            false
          );

        expect(
          report.summary
            .directModelImports
        )
          .toBe(
            1
          );

        expect(
          report.files
            .directModelFiles
        )
          .toContain(
            "services/incidentService.js"
          );
      }
    );

    test(
      "detects mongoose runtime dependencies",
      () => {
        fs.writeFileSync(
          path.join(
            root,
            "services",
            "dbService.js"
          ),
          `
            "use strict";

            const mongoose =
              require("mongoose");

            async function connect() {
              await mongoose.connect("mongodb://localhost/test");
            }

            module.exports = {
              connect,
            };
          `
        );

        const report =
          new MongoRetirementScanner({
            root,
          })
            .scan();

        expect(
          report.ready
        )
          .toBe(
            false
          );

        expect(
          report.summary
            .mongooseRuntimeImports
        )
          .toBe(
            1
          );

        expect(
          report.summary
            .mongooseConnections
        )
          .toBeGreaterThan(
            0
          );
      }
    );

    test(
      "ignores tests",
      () => {
        fs.mkdirSync(
          path.join(
            root,
            "services",
            "__tests__"
          ),
          {
            recursive:
              true,
          }
        );

        fs.writeFileSync(
          path.join(
            root,
            "services",
            "__tests__",
            "mongo.test.js"
          ),
          `
            const mongoose =
              require("mongoose");

            const Incident =
              require("../../models/Incident");
          `
        );

        const report =
          new MongoRetirementScanner({
            root,
          })
            .scan();

        expect(
          report.summary
            .totalBlockers
        )
          .toBe(
            0
          );

        expect(
          report.ready
        )
          .toBe(
            true
          );
      }
    );

    test(
      "clean repository-backed runtime is retirement ready",
      () => {
        fs.writeFileSync(
          path.join(
            root,
            "services",
            "incidentService.js"
          ),
          `
            "use strict";

            const {
              incidentRepository,
            } =
              require("../persistence/repositories");

            module.exports = {
              incidentRepository,
            };
          `
        );

        const report =
          new MongoRetirementScanner({
            root,
          })
            .scan();

        expect(
          report.ready
        )
          .toBe(
            true
          );

        expect(
          report.summary
            .totalBlockers
        )
          .toBe(
            0
          );
      }
    );
  }
);