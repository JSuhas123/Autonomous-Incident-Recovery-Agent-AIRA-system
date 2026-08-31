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


const {
  SCRIPT_VERSION,

  findNewestArtifact,

  sourceFrozen,

  validateGeneratedReport,
} =
  require(
    "../../scripts/generate-phase21-10d-report"
  );


describe(
  "Phase 21.10D report generator",

  () => {
    test(
      "generator version is frozen",

      () => {
        expect(
          SCRIPT_VERSION
        )
          .toBe(
            "21.10D-generator-v1"
          );
      }
    );


    test(
      "frozen source detection accepts top-level frozen",

      () => {
        expect(
          sourceFrozen({
            frozen:
              true,
          })
        )
          .toBe(
            true
          );
      }
    );


    test(
      "frozen source detection accepts finalResult frozen",

      () => {
        expect(
          sourceFrozen({
            finalResult: {
              frozen:
                true,
            },
          })
        )
          .toBe(
            true
          );
      }
    );


    test(
      "newest passing frozen artifact is selected",

      () => {
        const directory =
          fs.mkdtempSync(
            path.join(
              os.tmpdir(),
              "aira-phase21-10d-"
            )
          );


        const oldPath =
          path.join(
            directory,
            "phase21-test-2026-01-01.json"
          );


        const newPath =
          path.join(
            directory,
            "phase21-test-2026-01-02.json"
          );


        fs.writeFileSync(
          oldPath,
          JSON.stringify({
            status:
              "PASS",

            frozen:
              true,
          })
        );


        fs.writeFileSync(
          newPath,
          JSON.stringify({
            status:
              "PASS",

            frozen:
              true,
          })
        );


        const oldTime =
          new Date(
            "2026-01-01T00:00:00Z"
          );


        const newTime =
          new Date(
            "2026-01-02T00:00:00Z"
          );


        fs.utimesSync(
          oldPath,
          oldTime,
          oldTime
        );


        fs.utimesSync(
          newPath,
          newTime,
          newTime
        );


        const selected =
          findNewestArtifact(
            directory,
            "phase21-test-"
          );


        expect(
          selected
        )
          .toBe(
            newPath
          );


        fs.rmSync(
          directory,
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
      "failed certificate is ignored",

      () => {
        const directory =
          fs.mkdtempSync(
            path.join(
              os.tmpdir(),
              "aira-phase21-10d-"
            )
          );


        const failedPath =
          path.join(
            directory,
            "phase21-test-failed.json"
          );


        fs.writeFileSync(
          failedPath,
          JSON.stringify({
            status:
              "FAIL",

            frozen:
              true,
          })
        );


        expect(
          findNewestArtifact(
            directory,
            "phase21-test-"
          )
        )
          .toBeNull();


        fs.rmSync(
          directory,
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
      "generated report must remain non-authorizing",

      () => {
        const valid = {
          status:
            "PASS",

          authority: {
            productionCertified:
              false,

            executionAuthorized:
              false,
          },

          capacity: {
            summary: {
              allCertifiedProvidersRecovered:
                true,
            },
          },

          tenancy: {
            summary: {
              isolationPassed:
                true,
            },
          },

          interpretation: {
            missingMeasurementsInvented:
              false,
          },
        };


        expect(
          validateGeneratedReport(
            valid
          )
        )
          .toBe(
            true
          );


        const invalid = {
          ...valid,

          authority: {
            ...valid.authority,

            executionAuthorized:
              true,
          },
        };


        expect(
          () =>
            validateGeneratedReport(
              invalid
            )
        )
          .toThrow(
            "forbidden authority"
          );
      }
    );


    test(
      "provider recovery failure rejects report",

      () => {
        const report = {
          status:
            "PASS",

          authority: {
            productionCertified:
              false,

            executionAuthorized:
              false,
          },

          capacity: {
            summary: {
              allCertifiedProvidersRecovered:
                false,
            },
          },

          tenancy: {
            summary: {
              isolationPassed:
                true,
            },
          },

          interpretation: {
            missingMeasurementsInvented:
              false,
          },
        };


        expect(
          () =>
            validateGeneratedReport(
              report
            )
        )
          .toThrow(
            "Not all certified integration paths recovered"
          );
      }
    );


    test(
      "tenant isolation failure rejects report",

      () => {
        const report = {
          status:
            "PASS",

          authority: {
            productionCertified:
              false,

            executionAuthorized:
              false,
          },

          capacity: {
            summary: {
              allCertifiedProvidersRecovered:
                true,
            },
          },

          tenancy: {
            summary: {
              isolationPassed:
                false,
            },
          },

          interpretation: {
            missingMeasurementsInvented:
              false,
          },
        };


        expect(
          () =>
            validateGeneratedReport(
              report
            )
        )
          .toThrow(
            "Multi-tenant isolation evidence did not pass"
          );
      }
    );


    test(
      "invented missing measurement marker rejects report",

      () => {
        const report = {
          status:
            "PASS",

          authority: {
            productionCertified:
              false,

            executionAuthorized:
              false,
          },

          capacity: {
            summary: {
              allCertifiedProvidersRecovered:
                true,
            },
          },

          tenancy: {
            summary: {
              isolationPassed:
                true,
            },
          },

          interpretation: {
            missingMeasurementsInvented:
              true,
          },
        };


        expect(
          () =>
            validateGeneratedReport(
              report
            )
        )
          .toThrow(
            "must never invent missing measurements"
          );
      }
    );
  }
);