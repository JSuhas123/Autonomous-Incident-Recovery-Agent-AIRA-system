"use strict";


const http =
  require(
    "node:http"
  );


const PORT =
  positiveInteger(
    process.env
      .PHASE21_WEBHOOK_SINK_PORT,

    19081
  );


const MAX_BODY_BYTES =
  1024 *
  1024;


let accepted =
  0;


let rejected =
  0;


let bytesReceived =
  0;


const startedAt =
  Date.now();


const server =
  http.createServer(
    (
      request,
      response
    ) => {
      if (
        ![
          "POST",
          "PUT",
          "PATCH",
        ].includes(
          request.method
        )
      ) {
        rejected +=
          1;


        response.writeHead(
          405,
          {
            "Content-Type":
              "application/json",
          }
        );


        response.end(
          JSON.stringify({
            ok:
              false,

            error:
              "method_not_allowed",
          })
        );


        return;
      }


      let requestBytes =
        0;


      request.on(
        "data",

        (
          chunk
        ) => {
          requestBytes +=
            chunk.length;


          if (
            requestBytes >
            MAX_BODY_BYTES
          ) {
            rejected +=
              1;


            request.destroy();
          }
        }
      );


      request.on(
        "end",

        () => {
          accepted +=
            1;


          bytesReceived +=
            requestBytes;


          response.writeHead(
            204,
            {
              "Connection":
                "keep-alive",

              "Cache-Control":
                "no-store",
            }
          );


          response.end();
        }
      );
    }
  );


server.listen(
  PORT,
  "127.0.0.1",

  () => {
    console.log(
      "\n=============================================================="
    );

    console.log(
      "AIRA PHASE 21 WEBHOOK OUTGOING LAB SINK"
    );

    console.log(
      "=============================================================="
    );

    console.log(
      `URL:              http://127.0.0.1:${PORT}/aira-phase21`
    );

    console.log(
      "Safety class:     LAB_ONLY"
    );

    console.log(
      "Production:       false"
    );

    console.log(
      "Persistence:      none"
    );

    console.log(
      "Execution auth:   false"
    );

    console.log(
      "==============================================================\n"
    );
  }
);


const stats =
  setInterval(
    () => {
      const elapsedSeconds =
        Math.max(
          1,
          (
            Date.now() -
            startedAt
          ) /
            1000
        );


      console.log(
        [
          "[sink]",

          `accepted=${accepted}`,

          `rejected=${rejected}`,

          `rate=${(
            accepted /
            elapsedSeconds
          ).toFixed(
            2
          )}/s`,

          `bytes=${bytesReceived}`,
        ].join(
          " "
        )
      );
    },

    10000
  );


function shutdown(
  signal
) {
  clearInterval(
    stats
  );


  console.log(
    `\nReceived ${signal}. Closing Reliability Lab sink...`
  );


  server.close(
    () => {
      console.log(
        `Final accepted: ${accepted}`
      );

      console.log(
        `Final rejected: ${rejected}`
      );


      process.exit(
        0
      );
    }
  );
}


process.on(
  "SIGINT",
  () =>
    shutdown(
      "SIGINT"
    )
);


process.on(
  "SIGTERM",
  () =>
    shutdown(
      "SIGTERM"
    )
);


function positiveInteger(
  value,
  fallback
) {
  const parsed =
    Number.parseInt(
      value,
      10
    );


  return Number.isInteger(
    parsed
  ) &&
    parsed >
      0
    ? parsed
    : fallback;
}