"use strict";

const redis =
  require(
    "redis"
  );


// ============================================================================
// PHASE 11.6 — ADMISSION CONTROL / RATE LIMITING
// ============================================================================

const DEFAULT_WINDOW_MS =
  60_000;


const DEFAULT_LIMITS =
  Object.freeze({
    decision:
      1000,

    action:
      500,

    policy:
      100,

    api:
      10000,
  });


const VALID_OPERATIONS =
  new Set(
    Object.keys(
      DEFAULT_LIMITS
    )
  );


class RateLimitingService {
  constructor(
    options = {}
  ) {
    this.client =
      options.client ||
      null;

    this.connected =
      Boolean(
        options.connected &&
        this.client
      );

    this.localCounters =
      new Map();


    this.defaultLimits = {
      ...DEFAULT_LIMITS,

      ...(
        options.defaultLimits ||
        {}
      ),
    };


    this.windowMs =
      this.normalizePositiveInteger(
        options.windowMs,
        DEFAULT_WINDOW_MS
      );


    this.now =
      typeof options.now ===
      "function"
        ? options.now
        : () =>
            Date.now();


    this.maxLocalEntries =
      this.normalizePositiveInteger(
        options.maxLocalEntries,
        10000
      );


    this.redisFailureMode =
      options.redisFailureMode ||
      "LOCAL_FALLBACK";


    this.lastRedisError =
      null;
  }


  // ==========================================================================
  // CONNECT
  // ==========================================================================

  async connect(
    url =
      process.env.REDIS_URL ||
      "redis://localhost:6379"
  ) {
    /*
     * Tests or callers may inject an already-connected client.
     */
    if (
      this.client &&
      this.connected
    ) {
      return this;
    }


    try {
      console.log(
        `[rate-limit] Connecting to Redis at ${this.redactUrl(
          url
        )}...`
      );


      if (
        !this.client
      ) {
        this.client =
          redis.createClient({
            url,

            socket: {
              reconnectStrategy:
                () =>
                  false,
            },
          });
      }


      this.client.on(
        "error",
        (
          error
        ) => {
          this.connected =
            false;

          this.lastRedisError =
            error?.message ||
            "Redis error";
        }
      );


      this.client.on(
        "connect",
        () => {
          this.connected =
            true;

          this.lastRedisError =
            null;

          console.log(
            "[rate-limit] ✓ Connected to Redis"
          );
        }
      );


      this.client.on(
        "ready",
        () => {
          this.connected =
            true;

          this.lastRedisError =
            null;
        }
      );


      this.client.on(
        "end",
        () => {
          this.connected =
            false;
        }
      );


      const connectionPromise =
        this.client
          .connect();


      const timeoutPromise =
        new Promise(
          (
            _,
            reject
          ) => {
            const timer =
              setTimeout(
                () =>
                  reject(
                    Object.assign(
                      new Error(
                        "Redis connection timeout"
                      ),
                      {
                        code:
                          "RATE_LIMIT_REDIS_TIMEOUT",
                      }
                    )
                  ),
                2000
              );

            if (
              typeof timer.unref ===
              "function"
            ) {
              timer.unref();
            }
          }
        );


      try {
        await Promise.race([
          connectionPromise,
          timeoutPromise,
        ]);

        this.connected =
          true;

        this.lastRedisError =
          null;
      } catch (
        error
      ) {
        this.connected =
          false;

        this.lastRedisError =
          error.message;

        console.warn(
          `[rate-limit] Redis unavailable; using local fallback: ${error.message}`
        );
      }


      return this;
    } catch (
      error
    ) {
      this.connected =
        false;

      this.lastRedisError =
        error.message;

      console.warn(
        `[rate-limit] Redis connection failed; using local fallback: ${error.message}`
      );

      return this;
    }
  }


  // ==========================================================================
  // CHECK LIMIT
  // ==========================================================================

  async checkLimit(
    tenantId,
    operation =
      "api",
    limit =
      null
  ) {
    const normalizedTenantId =
      this.normalizeTenantId(
        tenantId
      );


    const normalizedOperation =
      this.normalizeOperation(
        operation
      );


    const finalLimit =
      this.resolveLimit(
        normalizedOperation,
        limit
      );


    const key =
      this.buildKey(
        normalizedTenantId,
        normalizedOperation
      );


    try {
      if (
        this.connected &&
        this.client
      ) {
        return await this
          .checkRedisLimit({
            key,

            tenantId:
              normalizedTenantId,

            operation:
              normalizedOperation,

            limit:
              finalLimit,
          });
      }


      return this
        .checkLocalLimit({
          key,

          tenantId:
            normalizedTenantId,

          operation:
            normalizedOperation,

          limit:
            finalLimit,

          degraded:
            true,

          degradationReason:
            "REDIS_UNAVAILABLE",
        });
    } catch (
      error
    ) {
      /*
       * Phase 11.5 + 11.6 interaction:
       *
       * Redis is DEGRADABLE.
       *
       * We therefore DO NOT fail open with unlimited traffic.
       *
       * Falling back to bounded local admission control is safer
       * than returning allowed=true for every request.
       */
      this.connected =
        false;

      this.lastRedisError =
        error.message;


      console.error(
        `[rate-limit] Redis limit check failed; using bounded local fallback: ${error.message}`
      );


      return this
        .checkLocalLimit({
          key,

          tenantId:
            normalizedTenantId,

          operation:
            normalizedOperation,

          limit:
            finalLimit,

          degraded:
            true,

          degradationReason:
            "REDIS_CHECK_FAILED",

          dependencyError:
            error.message,
        });
    }
  }


  // ==========================================================================
  // REDIS LIMIT
  // ==========================================================================

  async checkRedisLimit({
    key,
    tenantId,
    operation,
    limit,
  }) {
    const windowSeconds =
      Math.max(
        1,
        Math.ceil(
          this.windowMs /
          1000
        )
      );


    /*
     * Fixed-window counter.
     *
     * INCR + initial PEXPIRE are executed atomically.
     *
     * We intentionally do not accept any limit from request headers.
     */
    const script = `
      local key = KEYS[1]
      local windowMs = tonumber(ARGV[1])

      local current = redis.call("INCR", key)

      if current == 1 then
        redis.call("PEXPIRE", key, windowMs)
      end

      local ttl = redis.call("PTTL", key)

      if ttl < 0 then
        redis.call("PEXPIRE", key, windowMs)
        ttl = windowMs
      end

      return { current, ttl }
    `;


    const response =
      await this.client
        .eval(
          script,
          {
            keys: [
              key,
            ],

            arguments: [
              String(
                this.windowMs
              ),
            ],
          }
        );


    const current =
      Number(
        response?.[0] ||
        0
      );


    const ttl =
      Number(
        response?.[1] ||
        (
          windowSeconds *
          1000
        )
      );


    return this
      .buildDecision({
        tenantId,
        operation,
        limit,
        current,

        resetAfterMs:
          Math.max(
            0,
            ttl
          ),

        source:
          "redis",

        degraded:
          false,
      });
  }


  // ==========================================================================
  // LOCAL FALLBACK
  // ==========================================================================

  checkLocalLimit({
    key,
    tenantId,
    operation,
    limit,
    degraded =
      false,
    degradationReason =
      null,
    dependencyError =
      null,
  }) {
    const now =
      this.now();


    let counter =
      this.localCounters
        .get(
          key
        );


    if (
      !counter ||
      now >=
        counter.resetTime
    ) {
      counter = {
        count:
          0,

        resetTime:
          now +
          this.windowMs,
      };
    }


    counter.count +=
      1;


    this.localCounters
      .set(
        key,
        counter
      );


    this.pruneLocalCounters(
      now
    );


    return this
      .buildDecision({
        tenantId,
        operation,
        limit,

        current:
          counter.count,

        resetAfterMs:
          Math.max(
            0,
            counter.resetTime -
            now
          ),

        source:
          "local",

        degraded,

        degradationReason,

        dependencyError,
      });
  }


  // ==========================================================================
  // DECISION
  // ==========================================================================

  buildDecision({
    tenantId,
    operation,
    limit,
    current,
    resetAfterMs,
    source,
    degraded =
      false,
    degradationReason =
      null,
    dependencyError =
      null,
  }) {
    const allowed =
      current <=
      limit;


    const remaining =
      Math.max(
        0,
        limit -
        current
      );


    const retryAfterMs =
      allowed
        ? 0
        : Math.max(
            1,
            resetAfterMs
          );


    return {
      allowed,

      decision:
        allowed
          ? "ACCEPT"
          : "RATE_LIMIT",

      tenantId,

      operation,

      limit,

      current,

      remaining,

      resetAfterMs:
        Math.max(
          0,
          resetAfterMs
        ),

      retryAfterMs,

      source,

      degraded:
        Boolean(
          degraded
        ),

      degradationReason,

      dependencyError,

      /*
       * Admission control does not grant permission for
       * infrastructure mutation.
       */
      executionAuthorized:
        false,
    };
  }


  // ==========================================================================
  // RESET
  // ==========================================================================

  async resetLimit(
    tenantId,
    operation =
      "api"
  ) {
    const normalizedTenantId =
      this.normalizeTenantId(
        tenantId
      );


    const normalizedOperation =
      this.normalizeOperation(
        operation
      );


    const key =
      this.buildKey(
        normalizedTenantId,
        normalizedOperation
      );


    this.localCounters
      .delete(
        key
      );


    try {
      if (
        this.connected &&
        this.client
      ) {
        await this.client
          .del(
            key
          );
      }


      return {
        reset:
          true,

        tenantId:
          normalizedTenantId,

        operation:
          normalizedOperation,

        executionAuthorized:
          false,
      };
    } catch (
      error
    ) {
      console.error(
        `[rate-limit] Error resetting limit: ${error.message}`
      );


      return {
        reset:
          false,

        tenantId:
          normalizedTenantId,

        operation:
          normalizedOperation,

        error:
          error.message,

        executionAuthorized:
          false,
      };
    }
  }


  // ==========================================================================
  // USAGE
  // ==========================================================================

  async getUsage(
    tenantId,
    operation =
      "api"
  ) {
    const normalizedTenantId =
      this.normalizeTenantId(
        tenantId
      );


    const normalizedOperation =
      this.normalizeOperation(
        operation
      );


    const key =
      this.buildKey(
        normalizedTenantId,
        normalizedOperation
      );


    try {
      if (
        this.connected &&
        this.client
      ) {
        const count =
          await this.client
            .get(
              key
            );


        return {
          count:
            count
              ? Number.parseInt(
                  count,
                  10
                )
              : 0,

          source:
            "redis",

          executionAuthorized:
            false,
        };
      }


      const counter =
        this.localCounters
          .get(
            key
          );


      return {
        count:
          counter
            ? counter.count
            : 0,

        source:
          "local",

        degraded:
          true,

        executionAuthorized:
          false,
      };
    } catch (
      error
    ) {
      console.error(
        `[rate-limit] Error getting usage: ${error.message}`
      );


      const counter =
        this.localCounters
          .get(
            key
          );


      return {
        count:
          counter
            ? counter.count
            : 0,

        source:
          "local",

        degraded:
          true,

        error:
          error.message,

        executionAuthorized:
          false,
      };
    }
  }


  // ==========================================================================
  // STATUS
  // ==========================================================================

  getStatus() {
    return {
      redisConnected:
        this.connected,

      fallbackActive:
        !this.connected,

      localCounterCount:
        this.localCounters
          .size,

      windowMs:
        this.windowMs,

      limits: {
        ...this.defaultLimits,
      },

      lastRedisError:
        this.lastRedisError,

      executionAuthorized:
        false,
    };
  }


  // ==========================================================================
  // HELPERS
  // ==========================================================================

  normalizeTenantId(
    tenantId
  ) {
    if (
      typeof tenantId !==
        "string" ||
      !tenantId.trim()
    ) {
      /*
       * We intentionally retain a bounded default bucket for
       * unauthenticated/non-tenant routes.
       *
       * Tenant-protected routes should provide organization scope
       * before reaching this middleware.
       */
      return "default";
    }


    return tenantId
      .trim()
      .slice(
        0,
        200
      );
  }


  normalizeOperation(
    operation
  ) {
    if (
      typeof operation !==
        "string"
    ) {
      return "api";
    }


    const normalized =
      operation
        .trim()
        .toLowerCase();


    return VALID_OPERATIONS
      .has(
        normalized
      )
        ? normalized
        : "api";
  }


  resolveLimit(
    operation,
    override
  ) {
    /*
     * Override exists for trusted server-side configuration/tests.
     *
     * The Express middleware NEVER sources this value from
     * X-Rate-Limit or another caller-controlled header.
     */
    if (
      override !==
        null &&
      override !==
        undefined
    ) {
      return this
        .normalizePositiveInteger(
          override,
          this.defaultLimits[
            operation
          ] ||
          this.defaultLimits
            .api
        );
    }


    return this
      .normalizePositiveInteger(
        this.defaultLimits[
          operation
        ],
        DEFAULT_LIMITS
          .api
      );
  }


  normalizePositiveInteger(
    value,
    fallback
  ) {
    const parsed =
      Number(
        value
      );


    if (
      !Number.isFinite(
        parsed
      ) ||
      parsed <=
        0
    ) {
      return fallback;
    }


    return Math.max(
      1,
      Math.floor(
        parsed
      )
    );
  }


  buildKey(
    tenantId,
    operation
  ) {
    return [
      "ratelimit",
      encodeURIComponent(
        tenantId
      ),
      encodeURIComponent(
        operation
      ),
    ].join(
      ":"
    );
  }


  pruneLocalCounters(
    now =
      this.now()
  ) {
    /*
     * Prevent degraded Redis mode from creating an unbounded
     * in-memory tenant map.
     */
    for (
      const [
        key,
        counter,
      ]
      of this.localCounters
    ) {
      if (
        now >=
        counter.resetTime
      ) {
        this.localCounters
          .delete(
            key
          );
      }
    }


    if (
      this.localCounters
        .size <=
      this.maxLocalEntries
    ) {
      return;
    }


    const overflow =
      this.localCounters
        .size -
      this.maxLocalEntries;


    let removed =
      0;


    for (
      const key
      of this.localCounters
        .keys()
    ) {
      this.localCounters
        .delete(
          key
        );

      removed +=
        1;


      if (
        removed >=
        overflow
      ) {
        break;
      }
    }
  }


  redactUrl(
    url
  ) {
    try {
      const parsed =
        new URL(
          url
        );


      if (
        parsed.username
      ) {
        parsed.username =
          "***";
      }


      if (
        parsed.password
      ) {
        parsed.password =
          "***";
      }


      return parsed
        .toString();
    } catch {
      return "[redacted]";
    }
  }
}


// ============================================================================
// SHARED SINGLETON
// ============================================================================

let sharedService =
  null;


function getRateLimitService() {
  if (
    !sharedService
  ) {
    sharedService =
      new RateLimitingService();

    /*
     * Startup remains non-blocking.
     *
     * Until Redis becomes available the service uses its bounded
     * local fallback.
     */
    sharedService
      .connect()
      .catch(
        (
          error
        ) => {
          console.warn(
            `[rate-limit] Background Redis initialization failed: ${error.message}`
          );
        }
      );
  }


  return sharedService;
}


// ============================================================================
// EXPRESS MIDDLEWARE
// ============================================================================

function rateLimitingMiddleware(
  operation =
    "api",
  options = {}
) {
  const service =
    options.service ||
    getRateLimitService();


  const trustedLimit =
    options.limit ??
    null;


  return async (
    req,
    res,
    next
  ) => {
    try {
      /*
       * Prefer authenticated organization/tenant context.
       *
       * Header fallback exists for compatibility with existing routes,
       * but callers cannot control their numeric rate limit.
       */
      const tenantId =
        req.organizationId ||
        req.tenantId ||
        req.user
          ?.organizationId ||
        req.params
          ?.tenantId ||
        req.get(
          "x-tenant-id"
        ) ||
        "default";


      const result =
        await service
          .checkLimit(
            tenantId,
            operation,
            trustedLimit
          );


      // ======================================================================
      // STANDARD ADMISSION METADATA
      // ======================================================================

      res.set(
        "X-Rate-Limit-Limit",
        String(
          result.limit
        )
      );


      res.set(
        "X-Rate-Limit-Remaining",
        String(
          result.remaining
        )
      );


      res.set(
        "X-Rate-Limit-Reset",
        String(
          Date.now() +
          result.resetAfterMs
        )
      );


      res.set(
        "X-Rate-Limit-Source",
        result.source
      );


      if (
        result.degraded
      ) {
        res.set(
          "X-Rate-Limit-Degraded",
          "true"
        );
      }


      // ======================================================================
      // REJECTION
      // ======================================================================

      if (
        !result.allowed
      ) {
        const retryAfterSeconds =
          Math.max(
            1,
            Math.ceil(
              result.retryAfterMs /
              1000
            )
          );


        res.set(
          "Retry-After",
          String(
            retryAfterSeconds
          )
        );


        return res
          .status(
            429
          )
          .json({
            error:
              "Too many requests",

            code:
              "RATE_LIMIT_EXCEEDED",

            decision:
              "RATE_LIMIT",

            operation:
              result.operation,

            retryAfterMs:
              result.retryAfterMs,

            limit:
              result.limit,

            current:
              result.current,

            remaining:
              result.remaining,

            degraded:
              result.degraded,

            /*
             * Admission control cannot authorize recovery execution.
             */
            executionAuthorized:
              false,
          });
      }


      /*
       * Make admission metadata available to downstream handlers
       * without changing request semantics.
       */
      req.rateLimit =
        result;


      return next();
    } catch (
      error
    ) {
      /*
       * Unexpected middleware failures should not silently remove
       * all admission control.
       *
       * The normal Redis failure path is already handled by
       * RateLimitingService using bounded local fallback.
       *
       * Reaching this block means the admission-control layer itself
       * malfunctioned.
       */
      console.error(
        "[rate-limit-middleware] Admission control failure:",
        error.message
      );


      return res
        .status(
          503
        )
        .json({
          error:
            "Admission control unavailable",

          code:
            "ADMISSION_CONTROL_UNAVAILABLE",

          retryable:
            true,

          executionAuthorized:
            false,
        });
    }
  };
}


// ============================================================================
// TEST / COMPOSITION FACTORY
// ============================================================================

function createRateLimitService(
  options = {}
) {
  return new RateLimitingService(
    options
  );
}


// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  RateLimitingService,

  rateLimitingMiddleware,

  createRateLimitService,

  getRateLimitService,

  DEFAULT_LIMITS,

  DEFAULT_WINDOW_MS,
};