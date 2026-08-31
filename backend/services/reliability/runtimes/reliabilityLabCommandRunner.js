"use strict";

const {
  spawn,
} =
  require(
    "node:child_process"
  );


const DEFAULT_TIMEOUT_MS =
  30_000;


function runCommand(
  command,
  args = [],
  options = {}
) {
  requireSafeCommand(
    command
  );


  requireSafeArguments(
    args
  );


  const timeoutMs =
    Number.isFinite(
      options.timeoutMs
    ) &&
    options.timeoutMs >
      0
      ? options.timeoutMs
      : DEFAULT_TIMEOUT_MS;


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
        spawn(
          command,
          args,
          {
            cwd:
              options.cwd ||
              process.cwd(),

            env:
              options.env ||
              process.env,

            shell:
              false,

            windowsHide:
              true,

            stdio: [
              "ignore",
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


            child.kill();


            settled =
              true;


            reject(
              commandError(
                "RELIABILITY_LAB_COMMAND_TIMEOUT",
                `${command} timed out after ${timeoutMs}ms`,
                {
                  command,

                  args:
                    [...args],

                  stdout,

                  stderr,
                }
              )
            );
          },

          timeoutMs
        );


      child.stdout.on(
        "data",
        (
          chunk
        ) => {
          stdout +=
            chunk.toString();
        }
      );


      child.stderr.on(
        "data",
        (
          chunk
        ) => {
          stderr +=
            chunk.toString();
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
            commandError(
              "RELIABILITY_LAB_COMMAND_START_FAILED",
              error.message,
              {
                command,

                args:
                  [...args],

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
          code,
          signal
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


          const result = {
            command,

            args:
              [...args],

            code,

            signal:
              signal ||
              null,

            stdout:
              stdout.trim(),

            stderr:
              stderr.trim(),

            executionAuthorized:
              false,
          };


          if (
            code !==
              0
          ) {
            reject(
              commandError(
                "RELIABILITY_LAB_COMMAND_FAILED",
                `${command} exited with code ${code}`,
                result
              )
            );


            return;
          }


          resolve(
            Object.freeze(
              result
            )
          );
        }
      );
    }
  );
}


function requireSafeCommand(
  command
) {
  if (
    ![
      "kubectl",
      "docker",
    ].includes(
      command
    )
  ) {
    throw commandError(
      "RELIABILITY_LAB_COMMAND_NOT_ALLOWED",
      `Reliability Lab command ${command} is not allowed`
    );
  }
}


function requireSafeArguments(
  args
) {
  if (
    !Array.isArray(
      args
    )
  ) {
    throw commandError(
      "RELIABILITY_LAB_COMMAND_ARGUMENTS_INVALID",
      "Command arguments must be an array"
    );
  }


  for (
    const value
    of args
  ) {
    if (
      typeof value !==
      "string"
    ) {
      throw commandError(
        "RELIABILITY_LAB_COMMAND_ARGUMENT_INVALID",
        "Every command argument must be a string"
      );
    }


    if (
      value.includes(
        "\0"
      )
    ) {
      throw commandError(
        "RELIABILITY_LAB_COMMAND_ARGUMENT_INVALID",
        "Command arguments cannot contain NUL characters"
      );
    }
  }
}


function commandError(
  code,
  message,
  metadata =
    {}
) {
  return Object.assign(
    new Error(
      message
    ),

    {
      name:
        "ReliabilityLabCommandError",

      code,

      ...metadata,

      executionAuthorized:
        false,
    }
  );
}


module.exports = {
  DEFAULT_TIMEOUT_MS,

  runCommand,

  commandError,
};