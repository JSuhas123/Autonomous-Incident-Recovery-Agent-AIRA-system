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


function normalizerError(
  code,
  message,
  status =
    422,
  metadata =
    {}
) {
  return Object.assign(
    new Error(
      message
    ),
    {
      code,

      status,

      executionAuthorized:
        false,

      ...metadata,
    }
  );
}


function parseNormalizerError(
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


class PythonRealityNormalizer {
  constructor(
    options =
      {}
  ) {
    this.pythonBinary =
      options.pythonBinary ||

      process.env
        .AIRA_REALITY_PYTHON_BIN ||

      process.env
        .PYTHON_BIN ||

      "python";


    this.scriptPath =
      options.scriptPath ||

      path.resolve(
        __dirname,
        "../../../intelligence/reality/cli/normalize_dataset.py"
      );


    this.spawnProcess =
      options.spawnProcess ||
      spawn;


    this.timeoutMs =
      Number(
        options.timeoutMs ||

        process.env
          .AIRA_REALITY_NORMALIZER_TIMEOUT_MS ||

        30000
      );
  }


  async normalize(
    rawDataset
  ) {
    if (
      !rawDataset ||

      typeof rawDataset !==
        "object" ||

      Array.isArray(
        rawDataset
      )
    ) {
      throw normalizerError(
        "REALITY_RAW_DATASET_INVALID",
        "Raw reality dataset must be an object"
      );
    }


    const input =
      JSON.stringify(
        rawDataset
      );


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
                normalizerError(
                  "REALITY_NORMALIZER_TIMEOUT",
                  "Reality dataset normalizer timed out",
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

          (
            error
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


            reject(
              normalizerError(
                "REALITY_NORMALIZER_PROCESS_FAILED",
                "Failed to start the reality dataset normalizer",
                503,
                {
                  cause:
                    error,
                }
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
                parseNormalizerError(
                  stderr
                );


              reject(
                normalizerError(
                  parsed
                    ?.error
                    ?.code ||

                  "REALITY_NORMALIZATION_FAILED",

                  parsed
                    ?.error
                    ?.message ||

                  "Reality dataset normalization failed",

                  422,

                  {
                    normalizerExitCode:
                      code,
                  }
                )
              );


              return;
            }


            let normalized;


            try {
              normalized =
                JSON.parse(
                  stdout
                );
            } catch (
              error
            ) {
              reject(
                normalizerError(
                  "REALITY_NORMALIZER_OUTPUT_INVALID",
                  "Reality normalizer returned invalid JSON",
                  502,
                  {
                    cause:
                      error,
                  }
                )
              );


              return;
            }


            if (
              normalized
                .executionAuthorized ===
                true
            ) {
              reject(
                normalizerError(
                  "REALITY_NORMALIZER_AUTHORITY_VIOLATION",
                  "Reality normalizer attempted to grant execution authority",
                  500
                )
              );


              return;
            }


            resolve(
              normalized
            );
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
  PythonRealityNormalizer,

  parseNormalizerError,
};