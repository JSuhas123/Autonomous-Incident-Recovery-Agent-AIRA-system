"use strict";


const path =
  require(
    "node:path"
  );


const {
  spawn,
} =
  require(
    "node:child_process"
  );


const {
  humanLearningError,
} =
  require(
    "../../contracts/humanLearning"
  );


const {
  validateGeneratorResponse,
} =
  require(
    "../../contracts/humanLearningGenerator"
  );


function parseGeneratorError(
  stderr
) {
  const text =
    String(
      stderr ||
      ""
    ).trim();


  if (
    !text
  ) {
    return null;
  }


  try {
    return JSON.parse(
      text
    );
  } catch {
    return null;
  }
}


class PythonHumanLearningGenerator {
  constructor(
    options = {}
  ) {
    this.pythonBinary =
      options.pythonBinary ||

      process.env
        .AIRA_LEARNING_PYTHON_BIN ||

      process.env
        .PYTHON_BIN ||

      "python";


    this.scriptPath =
      options.scriptPath ||

      path.resolve(
        __dirname,

        "../../../intelligence/learning/cli/generate_candidates.py"
      );


    this.spawnProcess =
      options.spawnProcess ||
      spawn;


    this.timeoutMs =
      Number(
        options.timeoutMs ||

        process.env
          .AIRA_LEARNING_GENERATOR_TIMEOUT_MS ||

        30000
      );
  }


  async generate(
    sourceBundle
  ) {
    if (
      !sourceBundle ||

      typeof sourceBundle !==
        "object" ||

      Array.isArray(
        sourceBundle
      )
    ) {
      throw humanLearningError(
        "HUMAN_LEARNING_SOURCE_INVALID",
        "Frozen source bundle must be an object"
      );
    }


    if (
      sourceBundle.executionAuthorized ===
      true
    ) {
      throw humanLearningError(
        "HUMAN_LEARNING_EXECUTION_AUTHORITY_FORBIDDEN",
        "Learning source cannot carry execution authority",
        403
      );
    }


    const input =
      JSON.stringify({
        sourceBundle,

        executionAuthorized:
          false,
      });


    return new Promise(
      (
        resolve,
        reject
      ) => {
        let stdout =
          "";


        let stderr =
          "";


        let settled =
          false;


        const child =
          this.spawnProcess(
            this.pythonBinary,

            [
              this.scriptPath,
            ],

            {
              stdio: [
                "pipe",
                "pipe",
                "pipe",
              ],
            }
          );


        const timer =
          setTimeout(
            () => {
              if (
                settled
              ) {
                return;
              }


              settled =
                true;


              child.kill(
                "SIGKILL"
              );


              reject(
                humanLearningError(
                  "HUMAN_LEARNING_GENERATOR_TIMEOUT",
                  "Human learning candidate generator timed out",
                  504
                )
              );
            },

            this.timeoutMs
          );


        child.stdout.on(
          "data",

          (
            chunk
          ) => {
            stdout +=
              chunk.toString(
                "utf8"
              );
          }
        );


        child.stderr.on(
          "data",

          (
            chunk
          ) => {
            stderr +=
              chunk.toString(
                "utf8"
              );
          }
        );


        child.on(
          "error",

          () => {
            if (
              settled
            ) {
              return;
            }


            settled =
              true;


            clearTimeout(
              timer
            );


            reject(
              humanLearningError(
                "HUMAN_LEARNING_GENERATOR_PROCESS_FAILED",
                "Failed to start the human learning candidate generator",
                500
              )
            );
          }
        );


        child.on(
          "close",

          (
            code
          ) => {
            if (
              settled
            ) {
              return;
            }


            settled =
              true;


            clearTimeout(
              timer
            );


            if (
              code !==
              0
            ) {
              const parsed =
                parseGeneratorError(
                  stderr
                );


              reject(
                humanLearningError(
                  parsed
                    ?.error
                    ?.code ||

                  "HUMAN_LEARNING_GENERATOR_FAILED",

                  parsed
                    ?.error
                    ?.message ||

                  "Human learning candidate generator failed",

                  422
                )
              );


              return;
            }


            let parsed;


            try {
              parsed =
                JSON.parse(
                  stdout
                );
            } catch {
              reject(
                humanLearningError(
                  "HUMAN_LEARNING_GENERATOR_OUTPUT_INVALID",
                  "Human learning candidate generator returned invalid JSON",
                  502
                )
              );


              return;
            }


            try {
              resolve(
                validateGeneratorResponse(
                  parsed,

                  {
                    sourceBundleId:
                      sourceBundle.publicId ||
                      sourceBundle.id,

                    sourceDigest:
                      sourceBundle.sourceDigest,
                  }
                )
              );
            } catch (
              error
            ) {
              reject(
                error
              );
            }
          }
        );


        child.stdin.end(
          input
        );
      }
    );
  }
}


module.exports = {
  PythonHumanLearningGenerator,

  parseGeneratorError,
};