"use strict";


const fs =
  require(
    "node:fs"
  );


const path =
  require(
    "node:path"
  );


const {
  EVIDENCE_GRADE,

  EVIDENCE_GRADE_DEFINITION,

  EVIDENCE_GRADE_ORDER,

  REALITY_CASE_SOURCE_KIND,

  SOURCE_KIND_ALLOWED_EVIDENCE_GRADES,

  getEvidenceGradeDefinition,

  compareEvidenceGrades,

  evidenceGradeAtLeast,

  isEvidenceGradeCompatibleWithSourceKind,
} =
  require(
    "../../constants/reality"
  );


describe(
  "Phase 23R.4A Evidence Grade Alignment",

  () => {
    test(
      "canonical evidence ladder is exactly E0 through E6",

      () => {
        expect(
          EVIDENCE_GRADE_ORDER
        ).toEqual([
          "E0",

          "E1",

          "E2",

          "E3",

          "E4",

          "E5",

          "E6",
        ]);


        expect(
          EVIDENCE_GRADE
        ).toEqual({
          E0:
            "E0",

          E1:
            "E1",

          E2:
            "E2",

          E3:
            "E3",

          E4:
            "E4",

          E5:
            "E5",

          E6:
            "E6",
        });
      }
    );


    test(
      "grade meanings match the canonical Phase 23R evidence hierarchy",

      () => {
        expect(
          EVIDENCE_GRADE_DEFINITION
            .E0
            .key
        ).toBe(
          "SYNTHETIC"
        );


        expect(
          EVIDENCE_GRADE_DEFINITION
            .E1
            .key
        ).toBe(
          "CONTROLLED_AIRA_LAB"
        );


        expect(
          EVIDENCE_GRADE_DEFINITION
            .E2
            .key
        ).toBe(
          "INDEPENDENT_EXTERNAL_BENCHMARK"
        );


        expect(
          EVIDENCE_GRADE_DEFINITION
            .E3
            .key
        ).toBe(
          "RECONSTRUCTED_PRODUCTION_INCIDENT"
        );


        expect(
          EVIDENCE_GRADE_DEFINITION
            .E4
            .key
        ).toBe(
          "CUSTOMER_SHADOW_INCIDENT"
        );


        expect(
          EVIDENCE_GRADE_DEFINITION
            .E5
            .key
        ).toBe(
          "HUMAN_APPROVED_PRODUCTION_RECOVERY"
        );


        expect(
          EVIDENCE_GRADE_DEFINITION
            .E6
            .key
        ).toBe(
          "VERIFIED_AUTONOMOUS_PRODUCTION_RECOVERY"
        );
      }
    );


    test(
      "grade metadata distinguishes benchmark, production, shadow, human-approved and autonomous evidence",

      () => {
        expect(
          getEvidenceGradeDefinition(
            "E2"
          )
        ).toMatchObject({
          external:
            true,

          productionOrigin:
            false,

          productionExecution:
            false,

          autonomousProductionRecovery:
            false,
        });


        expect(
          getEvidenceGradeDefinition(
            "E4"
          )
        ).toMatchObject({
          external:
            true,

          productionOrigin:
            true,

          customerOrigin:
            true,

          productionExecution:
            false,

          autonomousProductionRecovery:
            false,
        });


        expect(
          getEvidenceGradeDefinition(
            "E5"
          )
        ).toMatchObject({
          productionExecution:
            true,

          autonomousProductionRecovery:
            false,
        });


        expect(
          getEvidenceGradeDefinition(
            "E6"
          )
        ).toMatchObject({
          productionExecution:
            true,

          autonomousProductionRecovery:
            true,
        });
      }
    );


    test(
      "grade comparison follows increasing evidentiary strength",

      () => {
        expect(
          compareEvidenceGrades(
            "E0",
            "E1"
          )
        ).toBeLessThan(
          0
        );


        expect(
          compareEvidenceGrades(
            "E3",
            "E3"
          )
        ).toBe(
          0
        );


        expect(
          compareEvidenceGrades(
            "E6",
            "E5"
          )
        ).toBeGreaterThan(
          0
        );


        expect(
          evidenceGradeAtLeast(
            "E4",
            "E2"
          )
        ).toBe(
          true
        );


        expect(
          evidenceGradeAtLeast(
            "E1",
            "E2"
          )
        ).toBe(
          false
        );
      }
    );


    test(
      "source kinds map to the canonical evidence grades",

      () => {
        const expected =
          [
            [
              REALITY_CASE_SOURCE_KIND
                .SYNTHETIC,

              "E0",
            ],

            [
              REALITY_CASE_SOURCE_KIND
                .GENERATED_SIMULATION,

              "E0",
            ],

            [
              REALITY_CASE_SOURCE_KIND
                .AIRA_LAB,

              "E1",
            ],

            [
              REALITY_CASE_SOURCE_KIND
                .EXTERNAL_BENCHMARK,

              "E2",
            ],

            [
              REALITY_CASE_SOURCE_KIND
                .PUBLIC_INCIDENT_RECONSTRUCTION,

              "E3",
            ],

            [
              REALITY_CASE_SOURCE_KIND
                .CUSTOMER_SHADOW,

              "E4",
            ],

            [
              REALITY_CASE_SOURCE_KIND
                .HUMAN_APPROVED_PRODUCTION,

              "E5",
            ],

            [
              REALITY_CASE_SOURCE_KIND
                .VERIFIED_PRODUCTION,

              "E6",
            ],
          ];


        for (
          const [
            sourceKind,
            grade,
          ]
          of expected
        ) {
          expect(
            isEvidenceGradeCompatibleWithSourceKind(
              sourceKind,
              grade
            )
          ).toBe(
            true
          );


          expect(
            SOURCE_KIND_ALLOWED_EVIDENCE_GRADES[
              sourceKind
            ]
          ).toContain(
            grade
          );
        }
      }
    );


    test(
      "external benchmark cannot claim lab, reconstruction, shadow or production grade",

      () => {
        expect(
          isEvidenceGradeCompatibleWithSourceKind(
            REALITY_CASE_SOURCE_KIND
              .EXTERNAL_BENCHMARK,

            "E1"
          )
        ).toBe(
          false
        );


        expect(
          isEvidenceGradeCompatibleWithSourceKind(
            REALITY_CASE_SOURCE_KIND
              .EXTERNAL_BENCHMARK,

            "E3"
          )
        ).toBe(
          false
        );


        expect(
          isEvidenceGradeCompatibleWithSourceKind(
            REALITY_CASE_SOURCE_KIND
              .EXTERNAL_BENCHMARK,

            "E4"
          )
        ).toBe(
          false
        );


        expect(
          isEvidenceGradeCompatibleWithSourceKind(
            REALITY_CASE_SOURCE_KIND
              .EXTERNAL_BENCHMARK,

            "E5"
          )
        ).toBe(
          false
        );


        expect(
          isEvidenceGradeCompatibleWithSourceKind(
            REALITY_CASE_SOURCE_KIND
              .EXTERNAL_BENCHMARK,

            "E6"
          )
        ).toBe(
          false
        );
      }
    );


    test(
      "controlled AIRA lab cannot claim independent external or production evidence",

      () => {
        expect(
          isEvidenceGradeCompatibleWithSourceKind(
            REALITY_CASE_SOURCE_KIND
              .AIRA_LAB,

            "E1"
          )
        ).toBe(
          true
        );


        expect(
          isEvidenceGradeCompatibleWithSourceKind(
            REALITY_CASE_SOURCE_KIND
              .AIRA_LAB,

            "E2"
          )
        ).toBe(
          false
        );


        expect(
          isEvidenceGradeCompatibleWithSourceKind(
            REALITY_CASE_SOURCE_KIND
              .AIRA_LAB,

            "E5"
          )
        ).toBe(
          false
        );


        expect(
          isEvidenceGradeCompatibleWithSourceKind(
            REALITY_CASE_SOURCE_KIND
              .AIRA_LAB,

            "E6"
          )
        ).toBe(
          false
        );
      }
    );


    test(
      "Python normalizer contains the same canonical evidence semantics",

      () => {
        const pythonPath =
          path.resolve(
            __dirname,

            "../../../intelligence/reality/normalization/reality_case_normalizer.py"
          );


        const source =
          fs.readFileSync(
            pythonPath,

            "utf8"
          );


        expect(
          source
        ).toContain(
          '"SYNTHETIC"'
        );


        expect(
          source
        ).toContain(
          '"CONTROLLED_AIRA_LAB"'
        );


        expect(
          source
        ).toContain(
          '"INDEPENDENT_EXTERNAL_BENCHMARK"'
        );


        expect(
          source
        ).toContain(
          '"RECONSTRUCTED_PRODUCTION_INCIDENT"'
        );


        expect(
          source
        ).toContain(
          '"CUSTOMER_SHADOW_INCIDENT"'
        );


        expect(
          source
        ).toContain(
          '"HUMAN_APPROVED_PRODUCTION_RECOVERY"'
        );


        expect(
          source
        ).toContain(
          '"VERIFIED_AUTONOMOUS_PRODUCTION_RECOVERY"'
        );


        expect(
          source
        ).toContain(
          '"EXTERNAL_BENCHMARK": {'
        );


        expect(
          source
        ).toContain(
          '"E2"'
        );
      }
    );


    test(
      "no evidence grade definition itself grants execution authority",

      () => {
        for (
          const definition
          of Object.values(
            EVIDENCE_GRADE_DEFINITION
          )
        ) {
          expect(
            definition
              .executionAuthorized
          ).not.toBe(
            true
          );
        }
      }
    );
  }
);