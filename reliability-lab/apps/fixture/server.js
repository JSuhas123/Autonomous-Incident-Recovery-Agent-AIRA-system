"use strict";

/**
 * ============================================================================
 * AIRA — PHASE 21.6
 * DETERMINISTIC RELIABILITY LAB FIXTURE
 * ============================================================================
 *
 * This workload exists ONLY inside the AIRA Reliability Lab.
 *
 * It provides deterministic infrastructure behavior that later Phase-21
 * experiments can break externally.
 *
 * IMPORTANT:
 *
 * - This application contains NO failure-injection endpoints.
 * - This application does NOT authorize execution.
 * - Ground truth is NOT exposed to AIRA.
 * - Failure injection belongs to Phase 21.9.
 * - LAB_ONLY enforcement for injectors belongs to Phase 21.10.
 *
 * Roles:
 *
 *   api
 *     Creates and reads deterministic orders.
 *
 *   worker
 *     Consumes RabbitMQ order messages and marks orders processed.
 *
 * Dependencies:
 *
 *   PostgreSQL
 *   Redis
 *   RabbitMQ
 *
 * ============================================================================
 */

const crypto = require("node:crypto");

const express = require("express");

const {
  Pool,
} = require("pg");

const {
  createClient,
} = require("redis");

const amqp = require("amqplib");

const client = require("prom-client");


/*
 * ============================================================================
 * CONFIGURATION
 * ============================================================================
 */

const SERVICE_ROLE =
  String(
    process.env.SERVICE_ROLE ||
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
    `Unsupported SERVICE_ROLE "${SERVICE_ROLE}".`
  );
}


const PORT =
  Number(
    process.env.PORT ||
    (
      SERVICE_ROLE === "worker"
        ? 8081
        : 8080
    )
  );


const POSTGRES_URL =
  process.env.POSTGRES_URL ||
  "postgresql://aira_lab:aira_lab_password@postgres:5432/aira_lab";


const REDIS_URL =
  process.env.REDIS_URL ||
  "redis://redis:6379";


const RABBITMQ_URL =
  process.env.RABBITMQ_URL ||
  "amqp://guest:guest@rabbitmq:5672";


const RABBITMQ_QUEUE =
  process.env.RABBITMQ_QUEUE ||
  "aira.reliability.orders";


const LAB_ID =
  process.env.AIRA_LAB_ID ||
  "aira-reliability-lab";


const SAFETY_CLASS =
  process.env.AIRA_SAFETY_CLASS ||
  "LAB_ONLY";


if (
  SAFETY_CLASS !== "LAB_ONLY"
) {
  throw new Error(
    "Reliability Lab fixture requires AIRA_SAFETY_CLASS=LAB_ONLY."
  );
}


/*
 * ============================================================================
 * RUNTIME STATE
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
 * PROMETHEUS
 * ============================================================================
 */

const registry =
  new client.Registry();


registry.setDefaultLabels({
  service:
    `aira-lab-${SERVICE_ROLE}`,

  reliability_lab:
    "true",

  phase:
    "21",
});


client.collectDefaultMetrics({
  register:
    registry,
});


const httpRequests =
  new client.Counter({
    name:
      "aira_lab_http_requests_total",

    help:
      "HTTP requests received by a Reliability Lab fixture service.",

    labelNames: [
      "method",
      "route",
      "status",
    ],

    registers: [
      registry,
    ],
  });


const httpDuration =
  new client.Histogram({
    name:
      "aira_lab_http_request_duration_seconds",

    help:
      "Reliability Lab HTTP request duration.",

    labelNames: [
      "method",
      "route",
    ],

    buckets: [
      0.005,
      0.01,
      0.025,
      0.05,
      0.1,
      0.25,
      0.5,
      1,
      2,
      5,
    ],

    registers: [
      registry,
    ],
  });


const dependencyHealth =
  new client.Gauge({
    name:
      "aira_lab_dependency_healthy",

    help:
      "Dependency health where 1 means healthy and 0 means unhealthy.",

    labelNames: [
      "dependency",
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
      "Orders created by the Reliability Lab API.",

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


/*
 * ============================================================================
 * ERROR STATE
 * ============================================================================
 */

function recordError(
  error
) {
  const normalized =
    error instanceof Error
      ? error
      : new Error(
          String(
            error
          )
        );


  state.lastError = {
    name:
      normalized.name,

    message:
      normalized.message,

    at:
      new Date()
        .toISOString(),
  };


  console.error(
    JSON.stringify({
      level:
        "error",

      service:
        `aira-lab-${SERVICE_ROLE}`,

      labId:
        LAB_ID,

      message:
        normalized.message,

      at:
        state.lastError.at,
    })
  );
}


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
    state.postgresConnected =
      false;

    recordError(
      error
    );
  }
);


async function initialiseDatabase() {
  await postgres.query(
    `
      CREATE TABLE IF NOT EXISTS lab_orders (
        id TEXT PRIMARY KEY,
        description TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
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
      reconnectStrategy(
        retries
      ) {
        return Math.min(
          250 *
            (
              retries +
              1
            ),

          2000
        );
      },
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


async function ensureRedis() {
  if (
    !redis.isOpen
  ) {
    await redis.connect();
  }


  await redis.ping();


  state.redisConnected =
    true;
}


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


function clearRabbitState() {
  state.rabbitmqConnected =
    false;

  state.workerConsuming =
    false;

  rabbitChannel =
    null;

  rabbitConnection =
    null;
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
        clearRabbitState();

        scheduleRabbitReconnect();
      }
    );


    rabbitChannel =
      await rabbitConnection
        .createChannel();


    await rabbitChannel.assertQueue(
      RABBITMQ_QUEUE,
      {
        durable:
          false,
      }
    );


    state.rabbitmqConnected =
      true;


    if (
      SERVICE_ROLE === "worker"
    ) {
      await beginConsumer();
    }


    return rabbitChannel;
  } catch (
    error
  ) {
    clearRabbitState();

    scheduleRabbitReconnect();

    throw error;
  }
}


/*
 * ============================================================================
 * WORKER
 * ============================================================================
 */

async function beginConsumer() {
  if (
    SERVICE_ROLE !== "worker" ||
    !rabbitChannel ||
    state.workerConsuming
  ) {
    return;
  }


  await rabbitChannel.consume(
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


        if (
          !payload.orderId
        ) {
          throw new Error(
            "RabbitMQ order message missing orderId."
          );
        }


        await postgres.query(
          `
            UPDATE lab_orders

            SET
              status = 'PROCESSED',
              processed_at = NOW()

            WHERE
              id = $1
          `,
          [
            payload.orderId,
          ]
        );


        await ensureRedis();


        await redis.set(
          `order:${payload.orderId}:status`,
          "PROCESSED",
          {
            EX:
              3600,
          }
        );


        state.lastProcessedOrderId =
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


        if (
          rabbitChannel
        ) {
          rabbitChannel.nack(
            message,
            false,
            true
          );
        }
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

async function checkPostgres() {
  try {
    await postgres.query(
      "SELECT 1"
    );


    state.postgresConnected =
      true;

    return true;
  } catch (
    error
  ) {
    state.postgresConnected =
      false;

    recordError(
      error
    );

    return false;
  }
}


async function checkRedis() {
  try {
    await ensureRedis();

    return true;
  } catch (
    error
  ) {
    state.redisConnected =
      false;

    recordError(
      error
    );

    return false;
  }
}


async function checkRabbitMQ() {
  try {
    await connectRabbitMQ();


    state.rabbitmqConnected =
      Boolean(
        rabbitChannel
      );


    return state.rabbitmqConnected;
  } catch (
    error
  ) {
    state.rabbitmqConnected =
      false;

    recordError(
      error
    );

    return false;
  }
}


async function checkDependencies() {
  const [
    postgresHealthy,
    redisHealthy,
    rabbitmqHealthy,
  ] =
    await Promise.all([
      checkPostgres(),
      checkRedis(),
      checkRabbitMQ(),
    ]);


  const result = {
    postgres:
      postgresHealthy,

    redis:
      redisHealthy,

    rabbitmq:
      rabbitmqHealthy,
  };


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
 * EXPRESS APPLICATION
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
    const endTimer =
      httpDuration.startTimer({
        method:
          req.method,

        route:
          req.path,
      });


    res.on(
      "finish",

      () => {
        endTimer();


        httpRequests.inc({
          method:
            req.method,

          route:
            req.route?.path ||
            req.path,

          status:
            String(
              res.statusCode
            ),
        });
      }
    );


    next();
  }
);


/*
 * ============================================================================
 * HEALTH
 * ============================================================================
 */

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

      role:
        SERVICE_ROLE,

      labId:
        LAB_ID,

      lab:
        true,

      safetyClass:
        SAFETY_CLASS,

      startedAt:
        startedAt.toISOString(),

      uptimeSeconds:
        Math.floor(
          process.uptime()
        ),

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
      SERVICE_ROLE !== "worker" ||
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

        role:
          SERVICE_ROLE,

        ready,

        dependencies,

        workerConsuming:
          SERVICE_ROLE === "worker"
            ? state.workerConsuming
            : null,

        executionAuthorized:
          false,
      });
  }
);


app.get(
  "/dependency-health",

  async (
    req,
    res
  ) => {
    const dependencies =
      await checkDependencies();


    res
      .status(
        dependencies.healthy
          ? 200
          : 503
      )
      .json({
        service:
          `aira-lab-${SERVICE_ROLE}`,

        dependencies,

        executionAuthorized:
          false,
      });
  }
);


app.get(
  "/debug/state",

  async (
    req,
    res
  ) => {
    const dependencies =
      await checkDependencies();


    res.json({
      service:
        `aira-lab-${SERVICE_ROLE}`,

      role:
        SERVICE_ROLE,

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


    res.send(
      await registry.metrics()
    );
  }
);


/*
 * ============================================================================
 * API ROLE
 * ============================================================================
 */

app.post(
  "/orders",

  async (
    req,
    res
  ) => {
    if (
      SERVICE_ROLE !== "api"
    ) {
      return res
        .status(
          404
        )
        .json({
          error:
            "NOT_AVAILABLE_FOR_ROLE",

          executionAuthorized:
            false,
        });
    }


    const description =
      typeof req.body?.description === "string"
        ? req.body.description.trim()
        : "";


    if (
      !description
    ) {
      return res
        .status(
          400
        )
        .json({
          error:
            "DESCRIPTION_REQUIRED",

          executionAuthorized:
            false,
        });
    }


    if (
      description.length > 256
    ) {
      return res
        .status(
          400
        )
        .json({
          error:
            "DESCRIPTION_TOO_LONG",

          maximumLength:
            256,

          executionAuthorized:
            false,
        });
    }


    try {
      const dependencies =
        await checkDependencies();


      if (
        !dependencies.healthy
      ) {
        return res
          .status(
            503
          )
          .json({
            error:
              "DEPENDENCY_UNAVAILABLE",

            dependencies,

            executionAuthorized:
              false,
          });
      }


      const orderId =
        crypto.randomUUID();


      await postgres.query(
        `
          INSERT INTO lab_orders (
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


      await rabbitChannel.sendToQueue(
        RABBITMQ_QUEUE,
        Buffer.from(
          JSON.stringify({
            orderId,
            createdAt:
              new Date()
                .toISOString(),
          }),
          "utf8"
        ),
        {
          persistent:
            false,

          contentType:
            "application/json",
        }
      );


      ordersCreated.inc();


      return res
        .status(
          201
        )
        .json({
          id:
            orderId,

          description,

          status:
            "CREATED",

          executionAuthorized:
            false,
        });
    } catch (
      error
    ) {
      recordError(
        error
      );


      return res
        .status(
          503
        )
        .json({
          error:
            "ORDER_CREATION_FAILED",

          message:
            error.message,

          executionAuthorized:
            false,
        });
    }
  }
);


app.get(
  "/orders/:id",

  async (
    req,
    res
  ) => {
    if (
      SERVICE_ROLE !== "api"
    ) {
      return res
        .status(
          404
        )
        .json({
          error:
            "NOT_AVAILABLE_FOR_ROLE",

          executionAuthorized:
            false,
        });
    }


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

            FROM lab_orders

            WHERE
              id = $1
          `,
          [
            req.params.id,
          ]
        );


      if (
        result.rowCount === 0
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


      const order =
        result.rows[0];


      return res.json({
        id:
          order.id,

        description:
          order.description,

        status:
          order.status,

        createdAt:
          order.created_at,

        processedAt:
          order.processed_at,

        executionAuthorized:
          false,
      });
    } catch (
      error
    ) {
      recordError(
        error
      );


      return res
        .status(
          503
        )
        .json({
          error:
            "ORDER_LOOKUP_FAILED",

          message:
            error.message,

          executionAuthorized:
            false,
        });
    }
  }
);


/*
 * ============================================================================
 * STARTUP
 * ============================================================================
 */

async function initialiseDependencies() {
  let lastError = null;


  for (
    let attempt = 1;
    attempt <= 30;
    attempt += 1
  ) {
    try {
      await initialiseDatabase();

      await ensureRedis();

      await connectRabbitMQ();


      if (
        SERVICE_ROLE === "worker"
      ) {
        await beginConsumer();
      }


      console.log(
        JSON.stringify({
          level:
            "info",

          message:
            "Reliability Lab dependencies initialized.",

          service:
            `aira-lab-${SERVICE_ROLE}`,

          attempt,

          labId:
            LAB_ID,
        })
      );


      return;
    } catch (
      error
    ) {
      lastError =
        error;


      recordError(
        error
      );


      await new Promise(
        (
          resolve
        ) =>
          setTimeout(
            resolve,
            2000
          )
      );
    }
  }


  throw new Error(
    `Reliability Lab dependencies failed to initialize: ${
      lastError?.message ||
      "unknown error"
    }`
  );
}


let httpServer =
  null;


async function start() {
  await initialiseDependencies();


  httpServer =
    app.listen(
      PORT,
      "0.0.0.0",

      () => {
        console.log(
          JSON.stringify({
            level:
              "info",

            message:
              "AIRA Reliability Lab fixture started.",

            service:
              `aira-lab-${SERVICE_ROLE}`,

            role:
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
 * SHUTDOWN
 * ============================================================================
 */

let shuttingDown =
  false;


async function shutdown(
  signal
) {
  if (
    shuttingDown
  ) {
    return;
  }


  shuttingDown =
    true;


  console.log(
    JSON.stringify({
      level:
        "info",

      message:
        "Reliability Lab fixture shutting down.",

      service:
        `aira-lab-${SERVICE_ROLE}`,

      signal,
    })
  );


  if (
    rabbitReconnectTimer
  ) {
    clearTimeout(
      rabbitReconnectTimer
    );

    rabbitReconnectTimer =
      null;
  }


  await new Promise(
    (
      resolve
    ) => {
      if (
        !httpServer
      ) {
        resolve();

        return;
      }


      httpServer.close(
        () => resolve()
      );
    }
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


process.on(
  "unhandledRejection",

  (
    error
  ) => {
    recordError(
      error
    );
  }
);


start()
  .catch(
    (
      error
    ) => {
      recordError(
        error
      );

      process.exit(
        1
      );
    }
  );
