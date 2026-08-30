"use strict";

/**
 * ============================================================================
 * AIRA PHASE 21.6
 * DETERMINISTIC RELIABILITY LAB FIXTURE
 * ============================================================================
 *
 * This application exists only inside the AIRA Reliability Lab.
 *
 * It deliberately contains NO failure injection endpoints.
 *
 * Failure injection belongs to the separate Phase 21 Failure Injection Engine
 * and may only operate after the LAB_ONLY safety boundary is implemented.
 *
 * Roles:
 *
 *   api
 *      exposes an HTTP API and creates deterministic order events.
 *
 *   worker
 *      consumes RabbitMQ order events and marks the order processed.
 *
 * Dependencies:
 *
 *   PostgreSQL
 *   Redis
 *   RabbitMQ
 *
 * Endpoints:
 *
 *   GET  /health
 *   GET  /ready
 *   GET  /state
 *   GET  /metrics
 *
 * API role:
 *
 *   POST /orders
 *   GET  /orders/:id
 *
 * ============================================================================
 */


const crypto =
  require(
    "node:crypto"
  );


const express =
  require(
    "express"
  );


const {
  Pool,
} =
  require(
    "pg"
  );


const {
  createClient,
} =
  require(
    "redis"
  );


const amqp =
  require(
    "amqplib"
  );


const client =
  require(
    "prom-client"
  );


/*
 * ============================================================================
 * CONFIGURATION
 * ============================================================================
 */


const SERVICE_ROLE =
  String(
    process.env
      .SERVICE_ROLE ||
    "api"
  )
    .trim()
    .toLowerCase();


if (
  ![
    "api",
    "worker",
  ].includes(
    SERVICE_ROLE
  )
) {
  throw new Error(
    `Unsupported Reliability Lab SERVICE_ROLE "${SERVICE_ROLE}"`
  );
}


const PORT =
  Number(
    process.env.PORT ||
    (
      SERVICE_ROLE ===
      "worker"
        ? 8081
        : 8080
    )
  );


const POSTGRES_URL =
  process.env
    .POSTGRES_URL ||
  "postgresql://aira_lab:aira_lab_password@postgres:5432/aira_lab";


const REDIS_URL =
  process.env
    .REDIS_URL ||
  "redis://redis:6379";


const RABBITMQ_URL =
  process.env
    .RABBITMQ_URL ||
  "amqp://guest:guest@rabbitmq:5672";


const RABBITMQ_QUEUE =
  process.env
    .RABBITMQ_QUEUE ||
  "aira.reliability.orders";


const LAB_ID =
  process.env
    .AIRA_LAB_ID ||
  "aira-reliability-lab";


const SAFETY_CLASS =
  process.env
    .AIRA_SAFETY_CLASS ||
  "LAB_ONLY";


if (
  SAFETY_CLASS !==
  "LAB_ONLY"
) {
  throw new Error(
    "Reliability Lab fixture requires AIRA_SAFETY_CLASS=LAB_ONLY"
  );
}


/*
 * ============================================================================
 * STATE
 * ============================================================================
 */


const startedAt =
  new Date();


const state = {
  serviceRole:
    SERVICE_ROLE,

  labId:
    LAB_ID,

  safetyClass:
    SAFETY_CLASS,

  postgresConnected:
    false,

  redisConnected:
    false,

  rabbitmqConnected:
    false,

  workerConsuming:
    false,

  lastDependencyCheckAt:
    null,

  lastProcessedOrderId:
    null,

  lastError:
    null,

  executionAuthorized:
    false,
};


/*
 * ============================================================================
 * METRICS
 * ============================================================================
 */


const registry =
  new client.Registry();


client.collectDefaultMetrics({
  register:
    registry,

  labels: {
    service:
      `aira-lab-${SERVICE_ROLE}`,

    reliability_lab:
      "true",
  },
});


const httpRequests =
  new client.Counter({
    name:
      "aira_lab_http_requests_total",

    help:
      "HTTP requests received by the AIRA Reliability Lab fixture.",

    labelNames: [
      "service",
      "method",
      "route",
      "status",
    ],

    registers: [
      registry,
    ],
  });


const ordersCreated =
  new client.Counter({
    name:
      "aira_lab_orders_created_total",

    help:
      "Orders created by the deterministic Reliability Lab fixture.",

    registers: [
      registry,
    ],
  });


const ordersProcessed =
  new client.Counter({
    name:
      "aira_lab_orders_processed_total",

    help:
      "Orders processed by the Reliability Lab worker.",

    registers: [
      registry,
    ],
  });


const dependencyHealth =
  new client.Gauge({
    name:
      "aira_lab_dependency_healthy",

    help:
      "Dependency health where 1 is healthy and 0 is unhealthy.",

    labelNames: [
      "service",
      "dependency",
    ],

    registers: [
      registry,
    ],
  });


/*
 * ============================================================================
 * POSTGRESQL
 * ============================================================================
 */


const postgres =
  new Pool({
    connectionString:
      POSTGRES_URL,

    max:
      5,

    idleTimeoutMillis:
      10_000,

    connectionTimeoutMillis:
      2_000,
  });


postgres.on(
  "error",

  (
    error
  ) => {
    state
      .postgresConnected =
      false;

    recordError(
      error
    );
  }
);


async function initialiseDatabase() {
  await postgres.query(
    `
      CREATE TABLE IF NOT EXISTS
        lab_orders (
          id TEXT PRIMARY KEY,

          description TEXT NOT NULL,

          status TEXT NOT NULL,

          created_at TIMESTAMPTZ NOT NULL
            DEFAULT NOW(),

          processed_at TIMESTAMPTZ
        )
    `
  );


  state.postgresConnected =
    true;
}


/*
 * ============================================================================
 * REDIS
 * ============================================================================
 */


const redis =
  createClient({
    url:
      REDIS_URL,

    socket: {
      reconnectStrategy:
        (
          retries
        ) =>
          Math.min(
            250 *
              (
                retries +
                1
              ),

            2000
          ),
    },
  });


redis.on(
  "ready",

  () => {
    state.redisConnected =
      true;
  }
);


redis.on(
  "end",

  () => {
    state.redisConnected =
      false;
  }
);


redis.on(
  "error",

  (
    error
  ) => {
    state.redisConnected =
      false;

    recordError(
      error
    );
  }
);


/*
 * ============================================================================
 * RABBITMQ
 * ============================================================================
 */


let rabbitConnection =
  null;


let rabbitChannel =
  null;


let rabbitReconnectTimer =
  null;


async function connectRabbitMQ() {
  if (
    rabbitChannel
  ) {
    return rabbitChannel;
  }


  try {
    rabbitConnection =
      await amqp.connect(
        RABBITMQ_URL
      );


    rabbitConnection.on(
      "error",

      (
        error
      ) => {
        recordError(
          error
        );
      }
    );


    rabbitConnection.on(
      "close",

      () => {
        state
          .rabbitmqConnected =
          false;

        state
          .workerConsuming =
          false;

        rabbitConnection =
          null;

        rabbitChannel =
          null;

        scheduleRabbitReconnect();
      }
    );


    rabbitChannel =
      await rabbitConnection
        .createChannel();


    await rabbitChannel
      .assertQueue(
        RABBITMQ_QUEUE,
        {
          durable:
            false,
        }
      );


    state.rabbitmqConnected =
      true;


    if (
      SERVICE_ROLE ===
      "worker"
    ) {
      await beginConsumer();
    }


    return rabbitChannel;
  } catch (
    error
  ) {
    state.rabbitmqConnected =
      false;

    recordError(
      error
    );

    scheduleRabbitReconnect();

    throw error;
  }
}


function scheduleRabbitReconnect() {
  if (
    rabbitReconnectTimer
  ) {
    return;
  }


  rabbitReconnectTimer =
    setTimeout(
      async () => {
        rabbitReconnectTimer =
          null;


        try {
          await connectRabbitMQ();
        } catch (
          error
        ) {
          recordError(
            error
          );
        }
      },

      2000
    );
}


/*
 * ============================================================================
 * WORKER
 * ============================================================================
 */


async function beginConsumer() {
  if (
    SERVICE_ROLE !==
      "worker" ||
    !rabbitChannel ||
    state.workerConsuming
  ) {
    return;
  }


  await rabbitChannel
    .consume(
      RABBITMQ_QUEUE,

      async (
        message
      ) => {
        if (
          !message
        ) {
          return;
        }


        try {
          const payload =
            JSON.parse(
              message.content
                .toString(
                  "utf8"
                )
            );


          await postgres.query(
            `
              UPDATE
                lab_orders

              SET
                status =
                  'PROCESSED',

                processed_at =
                  NOW()

              WHERE
                id =
                  $1
            `,
            [
              payload.orderId,
            ]
          );


          await redis.set(
            `order:${payload.orderId}:status`,

            "PROCESSED",

            {
              EX:
                3600,
            }
          );


          state
            .lastProcessedOrderId =
            payload.orderId;


          ordersProcessed.inc();


          rabbitChannel.ack(
            message
          );
        } catch (
          error
        ) {
          recordError(
            error
          );


          rabbitChannel.nack(
            message,
            false,
            true
          );
        }
      },

      {
        noAck:
          false,
      }
    );


  state.workerConsuming =
    true;
}


/*
 * ============================================================================
 * DEPENDENCY HEALTH
 * ============================================================================
 */


async function checkDependencies() {
  const result = {
    postgres:
      false,

    redis:
      false,

    rabbitmq:
      false,
  };


  try {
    await postgres.query(
      "SELECT 1"
    );


    result.postgres =
      true;

    state.postgresConnected =
      true;
  } catch (
    error
  ) {
    state.postgresConnected =
      false;

    recordError(
      error
    );
  }


  try {
    if (
      !redis.isOpen
    ) {
      await redis.connect();
    }


    await redis.ping();


    result.redis =
      true;

    state.redisConnected =
      true;
  } catch (
    error
  ) {
    state.redisConnected =
      false;

    recordError(
      error
    );
  }


  try {
    await connectRabbitMQ();


    result.rabbitmq =
      Boolean(
        rabbitChannel
      );

    state.rabbitmqConnected =
      result.rabbitmq;
  } catch (
    error
  ) {
    state.rabbitmqConnected =
      false;
  }


  state.lastDependencyCheckAt =
    new Date()
      .toISOString();


  for (
    const [
      dependency,
      healthy,
    ]
    of Object.entries(
      result
    )
  ) {
    dependencyHealth.set(
      {
        service:
          SERVICE_ROLE,

        dependency,
      },

      healthy
        ? 1
        : 0
    );
  }


  return {
    ...result,

    healthy:
      Object.values(
        result
      )
        .every(
          Boolean
        ),
  };
}


/*
 * ============================================================================
 * HTTP APPLICATION
 * ============================================================================
 */


const app =
  express();


app.disable(
  "x-powered-by"
);


app.use(
  express.json({
    limit:
      "32kb",
  })
);


app.use(
  (
    req,
    res,
    next
  ) => {
    const started =
      Date.now();


    res.on(
      "finish",

      () => {
        httpRequests.inc({
          service:
            SERVICE_ROLE,

          method:
            req.method,

          route:
            req.route
              ?.path ||
            req.path,

          status:
            String(
              res.statusCode
            ),
        });


        res.setHeader?.(
          "x-aira-lab-duration-ms",
          String(
            Date.now() -
            started
          )
        );
      }
    );


    next();
  }
);


app.get(
  "/health",

  (
    req,
    res
  ) => {
    res.json({
      service:
        `aira-lab-${SERVICE_ROLE}`,

      status:
        "UP",

      lab:
        true,

      safetyClass:
        SAFETY_CLASS,

      uptimeSeconds:
        Math.floor(
          process.uptime()
        ),

      startedAt:
        startedAt
          .toISOString(),

      executionAuthorized:
        false,
    });
  }
);


app.get(
  "/ready",

  async (
    req,
    res
  ) => {
    const dependencies =
      await checkDependencies();


    const workerReady =
      SERVICE_ROLE !==
        "worker" ||
      state.workerConsuming;


    const ready =
      dependencies.healthy &&
      workerReady;


    res
      .status(
        ready
          ? 200
          : 503
      )
      .json({
        service:
          `aira-lab-${SERVICE_ROLE}`,

        ready,

        dependencies,

        workerConsuming:
          SERVICE_ROLE ===
            "worker"
            ? state
                .workerConsuming
            : null,

        executionAuthorized:
          false,
      });
  }
);


app.get(
  "/state",

  async (
    req,
    res
  ) => {
    const dependencies =
      await checkDependencies();


    res.json({
      service:
        `aira-lab-${SERVICE_ROLE}`,

      labId:
        LAB_ID,

      safetyClass:
        SAFETY_CLASS,

      dependencies,

      workerConsuming:
        state.workerConsuming,

      lastProcessedOrderId:
        state.lastProcessedOrderId,

      lastDependencyCheckAt:
        state.lastDependencyCheckAt,

      lastError:
        state.lastError,

      executionAuthorized:
        false,
    });
  }
);


app.get(
  "/metrics",

  async (
    req,
    res
  ) => {
    res.set(
      "Content-Type",
      registry.contentType
    );


    res.end(
      await registry.metrics()
    );
  }
);


/*
 * ============================================================================
 * API ROLE
 * ============================================================================
 */


if (
  SERVICE_ROLE ===
  "api"
) {
  app.post(
    "/orders",

    async (
      req,
      res,
      next
    ) => {
      try {
        const description =
          String(
            req.body
              ?.description ||
            "Reliability Lab deterministic order"
          )
            .trim()
            .slice(
              0,
              500
            );


        const orderId =
          `lab_order_${crypto.randomUUID()}`;


        await postgres.query(
          `
            INSERT INTO
              lab_orders (
                id,
                description,
                status
              )

            VALUES (
              $1,
              $2,
              'CREATED'
            )
          `,
          [
            orderId,

            description,
          ]
        );


        await redis.set(
          `order:${orderId}:status`,

          "CREATED",

          {
            EX:
              3600,
          }
        );


        const channel =
          await connectRabbitMQ();


        channel.sendToQueue(
          RABBITMQ_QUEUE,

          Buffer.from(
            JSON.stringify({
              eventType:
                "order.created",

              orderId,

              createdAt:
                new Date()
                  .toISOString(),
            })
          ),

          {
            persistent:
              false,

            contentType:
              "application/json",
          }
        );


        ordersCreated.inc();


        res
          .status(
            202
          )
          .json({
            orderId,

            status:
              "CREATED",

            executionAuthorized:
              false,
          });
      } catch (
        error
      ) {
        next(
          error
        );
      }
    }
  );


  app.get(
    "/orders/:orderId",

    async (
      req,
      res,
      next
    ) => {
      try {
        const result =
          await postgres.query(
            `
              SELECT
                id,
                description,
                status,
                created_at,
                processed_at

              FROM
                lab_orders

              WHERE
                id =
                  $1

              LIMIT 1
            `,
            [
              req.params
                .orderId,
            ]
          );


        if (
          !result.rows[0]
        ) {
          return res
            .status(
              404
            )
            .json({
              error:
                "ORDER_NOT_FOUND",

              executionAuthorized:
                false,
            });
        }


        return res.json({
          order:
            result.rows[0],

          executionAuthorized:
            false,
        });
      } catch (
        error
      ) {
        return next(
          error
        );
      }
    }
  );
}


/*
 * ============================================================================
 * ERROR HANDLER
 * ============================================================================
 */


app.use(
  (
    error,
    req,
    res,
    next
  ) => {
    recordError(
      error
    );


    res
      .status(
        503
      )
      .json({
        error:
          "LAB_DEPENDENCY_OPERATION_FAILED",

        message:
          safeError(
            error
          ),

        executionAuthorized:
          false,
      });
  }
);


/*
 * ============================================================================
 * STARTUP
 * ============================================================================
 */


async function start() {
  await retry(
    initialiseDatabase,

    30,
    1000
  );


  await retry(
    async () => {
      if (
        !redis.isOpen
      ) {
        await redis.connect();
      }


      await redis.ping();
    },

    30,
    1000
  );


  await retry(
    connectRabbitMQ,

    30,
    1000
  );


  app.listen(
    PORT,
    "0.0.0.0",

    () => {
      console.log(
        JSON.stringify({
          event:
            "aira_reliability_fixture_started",

          serviceRole:
            SERVICE_ROLE,

          port:
            PORT,

          labId:
            LAB_ID,

          safetyClass:
            SAFETY_CLASS,

          executionAuthorized:
            false,
        })
      );
    }
  );
}


/*
 * ============================================================================
 * HELPERS
 * ============================================================================
 */


async function retry(
  operation,
  attempts,
  delayMs
) {
  let lastError =
    null;


  for (
    let attempt =
      1;
    attempt <=
      attempts;
    attempt++
  ) {
    try {
      return await operation();
    } catch (
      error
    ) {
      lastError =
        error;


      recordError(
        error
      );


      if (
        attempt <
        attempts
      ) {
        await sleep(
          delayMs
        );
      }
    }
  }


  throw lastError;
}


function sleep(
  ms
) {
  return new Promise(
    (
      resolve
    ) =>
      setTimeout(
        resolve,
        ms
      )
  );
}


function safeError(
  error
) {
  return String(
    error?.message ||
    "unknown error"
  )
    .replace(
      /(?:password|secret|token|authorization)\s*[:=]\s*[^\s,;]+/gi,

      "[REDACTED]"
    )
    .slice(
      0,
      500
    );
}


function recordError(
  error
) {
  state.lastError = {
    message:
      safeError(
        error
      ),

    at:
      new Date()
        .toISOString(),
  };
}


/*
 * ============================================================================
 * SHUTDOWN
 * ============================================================================
 */


async function shutdown(
  signal
) {
  console.log(
    JSON.stringify({
      event:
        "aira_reliability_fixture_shutdown",

      serviceRole:
        SERVICE_ROLE,

      signal,

      executionAuthorized:
        false,
    })
  );


  try {
    if (
      rabbitChannel
    ) {
      await rabbitChannel.close();
    }
  } catch (
    error
  ) {
    recordError(
      error
    );
  }


  try {
    if (
      rabbitConnection
    ) {
      await rabbitConnection.close();
    }
  } catch (
    error
  ) {
    recordError(
      error
    );
  }


  try {
    if (
      redis.isOpen
    ) {
      await redis.quit();
    }
  } catch (
    error
  ) {
    recordError(
      error
    );
  }


  try {
    await postgres.end();
  } catch (
    error
  ) {
    recordError(
      error
    );
  }


  process.exit(
    0
  );
}


process.on(
  "SIGTERM",

  () =>
    shutdown(
      "SIGTERM"
    )
);


process.on(
  "SIGINT",

  () =>
    shutdown(
      "SIGINT"
    )
);


start()
  .catch(
    (
      error
    ) => {
      console.error(
        JSON.stringify({
          event:
            "aira_reliability_fixture_start_failed",

          message:
            safeError(
              error
            ),

          executionAuthorized:
            false,
        })
      );


      process.exit(
        1
      );
    }
  );