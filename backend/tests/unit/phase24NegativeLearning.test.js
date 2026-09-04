"use strict";


const path =
  require(
    "node:path"
  );


const {
  spawnSync,
} =
  require(
    "node:child_process"
  );


const PROJECT_ROOT =
  path.resolve(
    __dirname,
    "../../.."
  );


const GENERATOR_SCRIPT =
  path.resolve(
    PROJECT_ROOT,
    "intelligence/learning/cli/generate_candidates.py"
  );


function runGenerator(
  sourceBundle
) {
  const pythonBinary =
    process.env
      .AIRA_LEARNING_PYTHON_BIN ||

    process.env
      .PYTHON_BIN ||

    (
      process.platform ===
        "win32"
        ? "py"
        : "python"
    );


  const result =
    spawnSync(
      pythonBinary,

      [
        GENERATOR_SCRIPT,
      ],

      {
        cwd:
          PROJECT_ROOT,

        input:
          JSON.stringify({
            sourceBundle,

            executionAuthorized:
              false,
          }),

        encoding:
          "utf8",

        timeout:
          30000,
      }
    );


  if (
    result.error
  ) {
    throw result.error;
  }


  if (
    result.status !==
    0
  ) {
    throw new Error(
      [
        "Python learning generator failed.",

        `exitCode=${result.status}`,

        `stdout=${result.stdout}`,

        `stderr=${result.stderr}`,
      ].join(
        "\n"
      )
    );
  }


  return JSON.parse(
    result.stdout
  );
}


function makeSourceBundle(
  actions
) {
  return {
    publicId:
      "lsrc_phase24_negative_test",

    sourceDigest:
      "b".repeat(
        64
      ),

    observationPayload:
      [],

    assertionPayload:
      [],

    diagnosisPayload:
      [],

    actionPayload:
      actions,

    verificationPayload:
      [],

    outcomePayload:
      [],

    executionAuthorized:
      false,
  };
}


describe(
  "AIRA Phase 24.3 — negative learning boundary",
  () => {
    test(
      "failed human action becomes NEGATIVE_PROCEDURE candidate",
      () => {
        const result =
          runGenerator(
            makeSourceBundle([
              {
                eventType:
                  "ACTION_FAILED",

                truthLevel:
                  "OBSERVATION",

                summary:
                  "restart database primary",

                payload:
                  {},

                evidenceRefs:
                  [],
              },
            ])
          );


        const candidate =
          result
            .candidates
            .find(
              (
                item
              ) =>
                item.candidateType ===
                "NEGATIVE_PROCEDURE"
            );


        expect(
          candidate
        ).toBeDefined();


        expect(
          candidate.candidatePayload
            .failedActions
        ).toEqual([
          "restart database primary",
        ]);


        expect(
          candidate.candidatePayload
            .instruction
        ).toBe(
          "DO_NOT_GENERALIZE_WITHOUT_VALIDATION"
        );


        expect(
          candidate.truthLevel
        ).toBe(
          "CANDIDATE"
        );


        expect(
          candidate.executionAuthorized
        ).toBe(
          false
        );
      }
    );


    test(
      "rejected human action becomes CONTRAINDICATION candidate",
      () => {
        const result =
          runGenerator(
            makeSourceBundle([
              {
                eventType:
                  "ACTION_REJECTED",

                truthLevel:
                  "ASSERTION",

                summary:
                  "delete production namespace",

                payload:
                  {},

                evidenceRefs:
                  [],
              },
            ])
          );


        const candidate =
          result
            .candidates
            .find(
              (
                item
              ) =>
                item.candidateType ===
                "CONTRAINDICATION"
            );


        expect(
          candidate
        ).toBeDefined();


        expect(
          candidate.candidatePayload
            .rejectedActions
        ).toEqual([
          "delete production namespace",
        ]);


        expect(
          candidate.candidatePayload
            .assertionStatus
        ).toBe(
          "UNVALIDATED"
        );


        expect(
          candidate.truthLevel
        ).toBe(
          "CANDIDATE"
        );


        expect(
          candidate.executionAuthorized
        ).toBe(
          false
        );
      }
    );


    test(
      "temporary mitigation becomes ANTI_PATTERN and never recovery strategy",
      () => {
        const result =
          runGenerator(
            makeSourceBundle([
              {
                eventType:
                  "MITIGATION_APPLIED",

                truthLevel:
                  "OBSERVATION",

                summary:
                  "scale replicas to temporarily absorb load",

                payload:
                  {},

                evidenceRefs:
                  [],
              },
            ])
          );


        const candidateTypes =
          result
            .candidates
            .map(
              (
                candidate
              ) =>
                candidate.candidateType
            );


        expect(
          candidateTypes
        ).toContain(
          "ANTI_PATTERN"
        );


        expect(
          candidateTypes
        ).not.toContain(
          "RECOVERY_STRATEGY"
        );


        const antiPattern =
          result
            .candidates
            .find(
              (
                candidate
              ) =>
                candidate.candidateType ===
                "ANTI_PATTERN"
            );


        expect(
          antiPattern
            .candidatePayload
            .prohibitedInference
        ).toBe(
          "TEMPORARY_MITIGATION_EQUALS_ROOT_FIX"
        );


        expect(
          antiPattern
            .candidatePayload
            .rootCauseCorrected
        ).toBe(
          "NOT_ESTABLISHED"
        );


        expect(
          antiPattern
            .candidatePayload
            .serviceRestored
        ).toBe(
          "POSSIBLE"
        );
      }
    );


    test(
      "ACTION_SUCCEEDED alone cannot manufacture recovery knowledge",
      () => {
        const result =
          runGenerator(
            makeSourceBundle([
              {
                eventType:
                  "ACTION_SUCCEEDED",

                truthLevel:
                  "OBSERVATION",

                summary:
                  "restart application pod",

                payload:
                  {},

                evidenceRefs:
                  [],
              },
            ])
          );


        expect(
          result
            .candidates
            .some(
              (
                candidate
              ) =>
                candidate.candidateType ===
                "RECOVERY_STRATEGY"
            )
        ).toBe(
          false
        );
      }
    );


    test(
      "explicit root-fix assertion may create recovery candidate but root correction remains unproven",
      () => {
        const source =
          makeSourceBundle([
            {
              eventType:
                "ROOT_FIX_APPLIED",

              truthLevel:
                "OBSERVATION",

              summary:
                "restore previous application configuration",

              payload:
                {},

              evidenceRefs:
                [],
            },
          ]);


        source
          .diagnosisPayload = [
            {
              eventType:
                "DIAGNOSIS_DECLARED",

              truthLevel:
                "ASSERTION",

              summary:
                "invalid application configuration",

              payload:
                {},

              evidenceRefs:
                [],
            },
          ];


        source
          .assertionPayload = [
            ...source
              .diagnosisPayload,
          ];


        source
          .verificationPayload = [
            {
              eventType:
                "VERIFICATION_PERFORMED",

              truthLevel:
                "OBSERVATION",

              summary:
                "service remained healthy during verification window",

              payload:
                {},

              evidenceRefs:
                [],
            },
          ];


        const result =
          runGenerator(
            source
          );


        const recovery =
          result
            .candidates
            .find(
              (
                candidate
              ) =>
                candidate.candidateType ===
                "RECOVERY_STRATEGY"
            );


        expect(
          recovery
        ).toBeDefined();


        expect(
          recovery
            .candidatePayload
            .rootCauseCorrected
        ).toBe(
          "UNPROVEN"
        );


        expect(
          recovery
            .candidatePayload
            .serviceRestored
        ).toBe(
          "UNPROVEN"
        );


        expect(
          recovery.truthLevel
        ).toBe(
          "CANDIDATE"
        );


        expect(
          recovery.executionAuthorized
        ).toBe(
          false
        );
      }
    );


    test(
      "combined hostile/failed/temporary human actions preserve all negative-learning classes without authority",
      () => {
        const result =
          runGenerator(
            makeSourceBundle([
              {
                eventType:
                  "ACTION_FAILED",

                truthLevel:
                  "OBSERVATION",

                summary:
                  "restart database primary",

                payload:
                  {},

                evidenceRefs:
                  [],
              },

              {
                eventType:
                  "ACTION_REJECTED",

                truthLevel:
                  "ASSERTION",

                summary:
                  "delete production namespace",

                payload:
                  {},

                evidenceRefs:
                  [],
              },

              {
                eventType:
                  "MITIGATION_APPLIED",

                truthLevel:
                  "OBSERVATION",

                summary:
                  "scale replicas to temporarily absorb load",

                payload:
                  {},

                evidenceRefs:
                  [],
              },
            ])
          );


        const types =
          new Set(
            result
              .candidates
              .map(
                (
                  candidate
                ) =>
                  candidate.candidateType
              )
          );


        expect(
          types.has(
            "NEGATIVE_PROCEDURE"
          )
        ).toBe(
          true
        );


        expect(
          types.has(
            "CONTRAINDICATION"
          )
        ).toBe(
          true
        );


        expect(
          types.has(
            "ANTI_PATTERN"
          )
        ).toBe(
          true
        );


        expect(
          types.has(
            "RECOVERY_STRATEGY"
          )
        ).toBe(
          false
        );


        expect(
          result.executionAuthorized
        ).toBe(
          false
        );


        for (
          const candidate
          of result.candidates
        ) {
          expect(
            candidate.truthLevel
          ).toBe(
            "CANDIDATE"
          );


          expect(
            candidate.executionAuthorized
          ).toBe(
            false
          );


          expect(
            candidate.knowledgeScope
          ).not.toBe(
            "GLOBAL"
          );
        }
      }
    );
  }
);