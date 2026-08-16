"use strict";

/**
 * ============================================================================
 * PHASE 11.15 — CONTROLLED CHAOS / FAILURE INJECTION FRAMEWORK
 * ============================================================================
 *
 * PURPOSE
 *
 * Provide deterministic, bounded and reversible failure injection for:
 *
 * - database failures
 * - Redis/dependency failures
 * - queue/RabbitMQ failures
 * - Kubernetes failures
 * - external service failures
 * - latency
 * - saturation
 * - incident storms
 *
 * SAFETY RULES
 *
 * 1. Chaos is disabled by default.
 * 2. Production chaos is forbidden unless an explicit double opt-in exists.
 * 3. Unknown scenarios fail closed.
 * 4. Every injection has deterministic restore().
 * 5. Timers are tracked and cancelled during restore().
 * 6. Chaos never grants infrastructure execution authority.
 * 7. Chaos injection does not itself perform real infrastructure mutations.
 */


// ============================================================================
// CHAOS STATES
// ============================================================================

const CHAOS_STATE =
  Object.freeze({
    DISABLED:
      "DISABLED",

    READY:
      "READY",

    ACTIVE:
      "ACTIVE",

    RESTORING:
      "RESTORING",

    FAILED:
      "FAILED",
  });


const CHAOS_ERROR =
  Object.freeze({
    DISABLED:
      "CHAOS_DISABLED",

    PRODUCTION_FORBIDDEN:
      "CHAOS_PRODUCTION_FORBIDDEN",

    AUTHORIZATION_REQUIRED:
      "CHAOS_AUTHORIZATION_REQUIRED",

    UNKNOWN_SCENARIO:
      "CHAOS_SCENARIO_NOT_REGISTERED",

    ALREADY_ACTIVE:
      "CHAOS_FAILURE_ALREADY_ACTIVE",

    INVALID_DURATION:
      "CHAOS_DURATION_INVALID",

    INVALID_TARGET:
      "CHAOS_TARGET_INVALID",
  });


const DEFAULT_MAX_DURATION_MS =
  30000;


const ABSOLUTE_MAX_DURATION_MS =
  5 *
  60 *
  1000;


// ============================================================================
// HELPERS
// ============================================================================

function parseBoolean(
  value,
  fallback =
    false
) {
  if (
    value ===
      undefined ||
    value ===
      null
  ) {
    return fallback;
  }


  return [
    "1",
    "true",
    "yes",
    "on",
  ]
    .includes(
      String(
        value
      )
        .trim()
        .toLowerCase()
    );
}


function createChaosError(
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
      code,

      ...metadata,

      executionAuthorized:
        false,
    }
  );
}


function normalizeDuration(
  duration,
  maxDurationMs
) {
  const parsed =
    Number(
      duration
    );


  if (
    !Number.isFinite(
      parsed
    ) ||
    parsed <=
      0
  ) {
    throw createChaosError(
      CHAOS_ERROR
        .INVALID_DURATION,
      "Chaos duration must be a positive number"
    );
  }


  return Math.min(
    Math.floor(
      parsed
    ),
    maxDurationMs,
    ABSOLUTE_MAX_DURATION_MS
  );
}


function sleep(
  durationMs
) {
  return new Promise(
    (
      resolve
    ) => {
      const timer =
        setTimeout(
          resolve,
          durationMs
        );


      if (
        typeof timer.unref ===
        "function"
      ) {
        timer.unref();
      }
    }
  );
}


// ============================================================================
// CHAOS FRAMEWORK
// ============================================================================

class ChaosTestFramework {
  constructor(
    options =
      {}
  ) {
    this.nodeEnv =
      options.nodeEnv ||
      process.env.NODE_ENV ||
      "development";


    this.enabled =
      options.enabled !==
        undefined
        ? Boolean(
            options.enabled
          )
        : parseBoolean(
            process.env
              .AIRA_CHAOS_ENABLED,
            false
          );


    this.productionAllowed =
      options.productionAllowed !==
        undefined
        ? Boolean(
            options.productionAllowed
          )
        : parseBoolean(
            process.env
              .AIRA_CHAOS_PRODUCTION_ALLOWED,
            false
          );


    this.authorizationToken =
      options.authorizationToken ||
      process.env
        .AIRA_CHAOS_TOKEN ||
      null;


    this.maxDurationMs =
      Math.min(
        Number(
          options.maxDurationMs ||
          process.env
            .AIRA_CHAOS_MAX_DURATION_MS ||
          DEFAULT_MAX_DURATION_MS
        ),
        ABSOLUTE_MAX_DURATION_MS
      );


    this.activeFailures =
      new Map();


    this.testResults =
      [];


    this.registeredScenarios =
      new Map();


    this.state =
      this.enabled
        ? CHAOS_STATE
            .READY
        : CHAOS_STATE
            .DISABLED;


    this.totalInjections =
      0;


    this.totalRestorations =
      0;


    this.totalRejected =
      0;


    this.lastError =
      null;


    this.registerBuiltInScenarios();
  }


  // ==========================================================================
  // SAFETY
  // ==========================================================================

  assertChaosAllowed(
    options =
      {}
  ) {
    if (
      !this.enabled
    ) {
      this.totalRejected +=
        1;


      throw createChaosError(
        CHAOS_ERROR
          .DISABLED,
        "Chaos testing is disabled"
      );
    }


    if (
      this.nodeEnv ===
      "production"
    ) {
      /*
       * Production requires two independent explicit opt-ins:
       *
       * AIRA_CHAOS_ENABLED=true
       * AIRA_CHAOS_PRODUCTION_ALLOWED=true
       */
      if (
        !this.productionAllowed
      ) {
        this.totalRejected +=
          1;


        throw createChaosError(
          CHAOS_ERROR
            .PRODUCTION_FORBIDDEN,
          "Chaos testing is forbidden in production"
        );
      }


      if (
        !this.authorizationToken ||
        options.authorizationToken !==
        this.authorizationToken
      ) {
        this.totalRejected +=
          1;


        throw createChaosError(
          CHAOS_ERROR
            .AUTHORIZATION_REQUIRED,
          "Explicit chaos authorization is required in production"
        );
      }
    }


    return {
      allowed:
        true,

      executionAuthorized:
        false,
    };
  }


  // ==========================================================================
  // SCENARIO REGISTRY
  // ==========================================================================

  registerBuiltInScenarios() {
    const names = [
      "database-unavailable",
      "database-latency",
      "database-intermittent",

      "redis-unavailable",

      "rabbitmq-unavailable",
      "queue-saturation",
      "queue-latency",
      "queue-reordering",

      "kubernetes-unavailable",
      "kubernetes-timeout",

      "external-service-unavailable",
      "external-service-timeout",
      "external-service-latency",

      "incident-storm",
    ];


    for (
      const name
      of names
    ) {
      this.registerScenario(
        name,
        {
          builtIn:
            true,
        }
      );
    }
  }


  registerScenario(
    name,
    metadata =
      {}
  ) {
    if (
      !name ||
      typeof name !==
        "string"
    ) {
      throw createChaosError(
        CHAOS_ERROR
          .UNKNOWN_SCENARIO,
        "Chaos scenario name is required"
      );
    }


    this.registeredScenarios
      .set(
        name,
        {
          name,

          ...metadata,
        }
      );


    return {
      registered:
        true,

      scenario:
        name,

      executionAuthorized:
        false,
    };
  }


  assertScenarioRegistered(
    scenario
  ) {
    if (
      !this.registeredScenarios
        .has(
          scenario
        )
    ) {
      throw createChaosError(
        CHAOS_ERROR
          .UNKNOWN_SCENARIO,
        `Unknown chaos scenario: ${scenario}`,
        {
          scenario,
        }
      );
    }
  }


  // ==========================================================================
  // ACTIVE FAILURE REGISTRY
  // ==========================================================================

  registerFailure(
    name,
    failureMode,
    options =
      {}
  ) {
    this.assertChaosAllowed(
      options
    );


    this.assertScenarioRegistered(
      name
    );


    if (
      this.activeFailures
        .has(
          name
        )
    ) {
      throw createChaosError(
        CHAOS_ERROR
          .ALREADY_ACTIVE,
        `Chaos scenario already active: ${name}`,
        {
          scenario:
            name,
        }
      );
    }


    const duration =
      normalizeDuration(
        options.duration ||
        10000,
        this.maxDurationMs
      );


    const entry = {
      name,

      failureMode,

      options: {
        ...options,

        authorizationToken:
          undefined,
      },

      startTime:
        Date.now(),

      duration,

      expiresAt:
        Date.now() +
        duration,

      restore:
        typeof options.restore ===
          "function"
          ? options.restore
          : null,

      timer:
        null,

      executionAuthorized:
        false,
    };


    this.activeFailures
      .set(
        name,
        entry
      );


    this.totalInjections +=
      1;


    this.state =
      CHAOS_STATE
        .ACTIVE;


    if (
      options.autoRestore !==
      false
    ) {
      entry.timer =
        setTimeout(
          () => {
            void this
              .deactivateFailure(
                name
              );
          },
          duration
        );


      if (
        typeof entry.timer
          .unref ===
        "function"
      ) {
        entry.timer
          .unref();
      }
    }


    return {
      active:
        true,

      scenario:
        name,

      duration,

      expiresAt:
        new Date(
          entry.expiresAt
        )
          .toISOString(),

      executionAuthorized:
        false,
    };
  }


  isFailureActive(
    failureName
  ) {
    const failure =
      this.activeFailures
        .get(
          failureName
        );


    if (
      !failure
    ) {
      return false;
    }


    if (
      Date.now() >=
      failure.expiresAt
    ) {
      void this
        .deactivateFailure(
          failureName
        );


      return false;
    }


    return true;
  }


  getFailureDetails(
    failureName
  ) {
    const failure =
      this.activeFailures
        .get(
          failureName
        );


    if (
      !failure
    ) {
      return null;
    }


    return {
      name:
        failure.name,

      failureMode:
        failure.failureMode,

      startTime:
        failure.startTime,

      duration:
        failure.duration,

      expiresAt:
        failure.expiresAt,

      executionAuthorized:
        false,
    };
  }


  async deactivateFailure(
    failureName
  ) {
    const failure =
      this.activeFailures
        .get(
          failureName
        );


    if (
      !failure
    ) {
      return {
        restored:
          false,

        reason:
          "NOT_ACTIVE",

        executionAuthorized:
          false,
      };
    }


    this.state =
      CHAOS_STATE
        .RESTORING;


    try {
      if (
        failure.timer
      ) {
        clearTimeout(
          failure.timer
        );
      }


      if (
        failure.restore
      ) {
        await failure
          .restore();
      }


      this.activeFailures
        .delete(
          failureName
        );


      this.totalRestorations +=
        1;


      this.state =
        this.activeFailures
          .size >
        0
          ? CHAOS_STATE
              .ACTIVE
          : CHAOS_STATE
              .READY;


      return {
        restored:
          true,

        scenario:
          failureName,

        executionAuthorized:
          false,
      };
    } catch (
      error
    ) {
      this.state =
        CHAOS_STATE
          .FAILED;


      this.lastError =
        error.message;


      throw createChaosError(
        error.code ||
        "CHAOS_RESTORE_FAILED",
        `Failed to restore chaos scenario ${failureName}: ${error.message}`,
        {
          cause:
            error,

          scenario:
            failureName,
        }
      );
    }
  }


  async restoreAll() {
    const failures =
      Array.from(
        this.activeFailures
          .keys()
      );


    const results =
      [];


    for (
      const failure
      of failures
    ) {
      try {
        results.push(
          await this
            .deactivateFailure(
              failure
            )
        );
      } catch (
        error
      ) {
        results.push({
          restored:
            false,

          scenario:
            failure,

          error:
            error.message,

          executionAuthorized:
            false,
        });
      }
    }


    return {
      restored:
        results.filter(
          (
            item
          ) =>
            item.restored
        )
          .length,

      failed:
        results.filter(
          (
            item
          ) =>
            !item.restored
        )
          .length,

      results,

      executionAuthorized:
        false,
    };
  }


  // ==========================================================================
  // TEST REPORTING
  // ==========================================================================

  recordResult(
    testName,
    result =
      {}
  ) {
    const record = {
      timestamp:
        new Date(),

      testName,

      passed:
        result.passed ===
        true,

      duration:
        Number(
          result.duration ||
          0
        ),

      message:
        result.message ||
        null,

      details:
        result.details ||
        null,

      executionAuthorized:
        false,
    };


    this.testResults
      .push(
        record
      );


    return record;
  }


  getReport() {
    const total =
      this.testResults
        .length;


    const passed =
      this.testResults
        .filter(
          (
            result
          ) =>
            result.passed
        )
        .length;


    const failed =
      total -
      passed;


    return {
      timestamp:
        new Date()
          .toISOString(),

      state:
        this.state,

      activeFailures:
        Array.from(
          this.activeFailures
            .keys()
        ),

      summary: {
        total,

        passed,

        failed,

        passRate:
          total >
          0
            ? Number(
                (
                  passed /
                  total *
                  100
                )
                  .toFixed(
                    1
                  )
              )
            : null,
      },

      tests:
        this.testResults,

      totalInjections:
        this.totalInjections,

      totalRestorations:
        this.totalRestorations,

      totalRejected:
        this.totalRejected,

      lastError:
        this.lastError,

      executionAuthorized:
        false,
    };
  }


  clearResults() {
    this.testResults =
      [];


    return {
      cleared:
        true,

      executionAuthorized:
        false,
    };
  }


  getStatus() {
    return {
      state:
        this.state,

      enabled:
        this.enabled,

      productionAllowed:
        this.productionAllowed,

      environment:
        this.nodeEnv,

      activeFailures:
        Array.from(
          this.activeFailures
            .keys()
        ),

      registeredScenarios:
        Array.from(
          this.registeredScenarios
            .keys()
        ),

      totalInjections:
        this.totalInjections,

      totalRestorations:
        this.totalRestorations,

      totalRejected:
        this.totalRejected,

      lastError:
        this.lastError,

      executionAuthorized:
        false,
    };
  }
}


// ============================================================================
// BASE PATCH INJECTOR
// ============================================================================

class BaseChaosInjector {
  constructor(
    target,
    framework =
      null
  ) {
    this.target =
      target;


    this.framework =
      framework;


    this.originalMethods =
      new Map();


    this.timers =
      new Set();


    this.restored =
      false;
  }


  assertTargetMethod(
    method
  ) {
    if (
      !this.target ||
      typeof this.target[
        method
      ] !==
        "function"
    ) {
      throw createChaosError(
        CHAOS_ERROR
          .INVALID_TARGET,
        `Chaos target does not expose method ${method}`
      );
    }
  }


  saveMethod(
    method
  ) {
    this.assertTargetMethod(
      method
    );


    if (
      !this.originalMethods
        .has(
          method
        )
    ) {
      this.originalMethods
        .set(
          method,
          this.target[
            method
          ]
      );
    }


    return this.originalMethods
      .get(
        method
      );
  }


  trackTimer(
    timer
  ) {
    this.timers
      .add(
        timer
      );


    if (
      typeof timer.unref ===
      "function"
    ) {
      timer.unref();
    }


    return timer;
  }


  scheduleRestore(
    duration
  ) {
    const timer =
      setTimeout(
        () => {
          void this
            .restore();
        },
        duration
      );


    this.trackTimer(
      timer
    );


    return timer;
  }


  async restore() {
    for (
      const timer
      of this.timers
    ) {
      clearTimeout(
        timer
      );
    }


    this.timers
      .clear();


    for (
      const [
        method,
        original,
      ]
      of this.originalMethods
        .entries()
    ) {
      this.target[
        method
      ] =
        original;
    }


    this.originalMethods
      .clear();


    this.restored =
      true;


    return {
      restored:
        true,

      executionAuthorized:
        false,
    };
  }
}


// ============================================================================
// DATABASE CHAOS
// ============================================================================

class DatabaseChaosInjector
  extends BaseChaosInjector {
  injectUnavailability(
    duration =
      5000
  ) {
    const originalFind =
      this.saveMethod(
        "find"
      );


    this.target.find =
      async () => {
        throw Object.assign(
          new Error(
            "DATABASE_UNAVAILABLE: Connection refused"
          ),
          {
            code:
              "DATABASE_UNAVAILABLE",
          }
        );
      };


    this.scheduleRestore(
      duration
    );


    return {
      injected:
        true,

      type:
        "database-unavailable",

      duration,

      executionAuthorized:
        false,
    };
  }


  injectLatency(
    delayMs =
      1000,
    duration =
      5000
  ) {
    const originalFind =
      this.saveMethod(
        "find"
      );


    this.target.find =
      async (
        ...args
      ) => {
        await sleep(
          delayMs
        );


        return originalFind
          .apply(
            this.target,
            args
          );
      };


    this.scheduleRestore(
      duration
    );


    return {
      injected:
        true,

      type:
        "database-latency",

      duration,

      delayMs,

      executionAuthorized:
        false,
    };
  }


  injectIntermittent(
    failureRate =
      0.5,
    duration =
      5000,
    randomFn =
      Math.random
  ) {
    const originalFind =
      this.saveMethod(
        "find"
      );


    const boundedRate =
      Math.max(
        0,
        Math.min(
          1,
          Number(
            failureRate
          ) ||
          0
        )
      );


    this.target.find =
      async (
        ...args
      ) => {
        if (
          randomFn() <
          boundedRate
        ) {
          throw Object.assign(
            new Error(
              "DATABASE_ERROR: Intermittent failure"
            ),
            {
              code:
                "DATABASE_INTERMITTENT_FAILURE",
            }
          );
        }


        return originalFind
          .apply(
            this.target,
            args
          );
      };


    this.scheduleRestore(
      duration
    );


    return {
      injected:
        true,

      type:
        "database-intermittent",

      failureRate:
        boundedRate,

      duration,

      executionAuthorized:
        false,
    };
  }
}


// ============================================================================
// QUEUE / RABBITMQ CHAOS
// ============================================================================

class QueueChaosInjector
  extends BaseChaosInjector {
  constructor(
    queueService,
    framework =
      null
  ) {
    super(
      queueService,
      framework
    );


    this.delayedMessages =
      [];
  }


  injectUnavailability(
    duration =
      5000
  ) {
    this.saveMethod(
      "publishEvent"
    );


    this.target.publishEvent =
      async () => {
        throw Object.assign(
          new Error(
            "RABBITMQ_UNAVAILABLE: Broker unavailable"
          ),
          {
            code:
              "ECONNREFUSED",

            dependency:
              "rabbitmq",

            executionAuthorized:
              false,
          }
        );
      };


    this.scheduleRestore(
      duration
    );


    return {
      injected:
        true,

      type:
        "rabbitmq-unavailable",

      duration,

      executionAuthorized:
        false,
    };
  }


  injectSaturation(
    backlogSize =
      1000,
    duration =
      5000
  ) {
    const originalPublish =
      this.saveMethod(
        "publishEvent"
      );


    let messageCount =
      0;


    const maxMessages =
      Math.max(
        1,
        Number(
          backlogSize
        ) ||
        1
      );


    this.target.publishEvent =
      async (
        topic,
        message
      ) => {
        if (
          messageCount >=
          maxMessages
        ) {
          throw Object.assign(
            new Error(
              "QUEUE_FULL: Backpressure exceeded"
            ),
            {
              code:
                "QUEUE_SATURATED",

              retryable:
                true,

              executionAuthorized:
                false,
            }
          );
        }


        messageCount +=
          1;


        return originalPublish
          .call(
            this.target,
            topic,
            message
          );
      };


    this.scheduleRestore(
      duration
    );


    return {
      injected:
        true,

      type:
        "queue-saturation",

      backlogSize:
        maxMessages,

      duration,

      executionAuthorized:
        false,
    };
  }


  injectMessageDelay(
    delayMs =
      1000,
    duration =
      5000
  ) {
    const originalPublish =
      this.saveMethod(
        "publishEvent"
      );


    this.target.publishEvent =
      async (
        topic,
        message
      ) => {
        await sleep(
          delayMs
        );


        return originalPublish
          .call(
            this.target,
            topic,
            message
          );
      };


    this.scheduleRestore(
      duration
    );


    return {
      injected:
        true,

      type:
        "queue-latency",

      delayMs,

      duration,

      executionAuthorized:
        false,
    };
  }


  injectReordering(
    duration =
      5000
  ) {
    const originalPublish =
      this.saveMethod(
        "publishEvent"
      );


    const pending =
      [];


    this.target.publishEvent =
      async (
        topic,
        message
      ) => {
        pending.push({
          topic,
          message,
        });


        if (
          pending.length <
          2
        ) {
          return {
            queued:
              true,

            executionAuthorized:
              false,
          };
        }


        const second =
          pending.pop();


        const first =
          pending.pop();


        await originalPublish
          .call(
            this.target,
            second.topic,
            second.message
          );


        await originalPublish
          .call(
            this.target,
            first.topic,
            first.message
          );


        return {
          reordered:
            true,

          executionAuthorized:
            false,
        };
      };


    this.scheduleRestore(
      duration
    );


    return {
      injected:
        true,

      type:
        "queue-reordering",

      duration,

      executionAuthorized:
        false,
    };
  }


  async restore() {
    this.delayedMessages =
      [];


    return super
      .restore();
  }
}


// ============================================================================
// GENERIC DEPENDENCY CHAOS
// ============================================================================

class DependencyChaosInjector
  extends BaseChaosInjector {
  injectUnavailability(
    method,
    {
      dependency =
        "unknown",
      duration =
        5000,
      code =
        "DEPENDENCY_UNAVAILABLE",
    } = {}
  ) {
    this.saveMethod(
      method
    );


    this.target[
      method
    ] =
      async () => {
        throw Object.assign(
          new Error(
            `${dependency} unavailable`
          ),
          {
            code,

            dependency,

            executionAuthorized:
              false,
          }
        );
      };


    this.scheduleRestore(
      duration
    );


    return {
      injected:
        true,

      dependency,

      method,

      duration,

      executionAuthorized:
        false,
    };
  }


  injectTimeout(
    method,
    {
      dependency =
        "unknown",
      duration =
        5000,
      timeoutMs =
        1000,
    } = {}
  ) {
    this.saveMethod(
      method
    );


    this.target[
      method
    ] =
      async () => {
        await sleep(
          timeoutMs
        );


        throw Object.assign(
          new Error(
            `${dependency} operation timeout`
          ),
          {
            code:
              "DEPENDENCY_TIMEOUT",

            dependency,

            executionOutcome:
              "UNKNOWN",

            requiresReconciliation:
              true,

            executionAuthorized:
              false,
          }
        );
      };


    this.scheduleRestore(
      duration
    );


    return {
      injected:
        true,

      dependency,

      method,

      duration,

      timeoutMs,

      executionAuthorized:
        false,
    };
  }
}


// ============================================================================
// EXTERNAL SERVICE CHAOS
// ============================================================================

class ExternalServiceChaosInjector {
  constructor(
    options =
      {}
  ) {
    this.fetchTarget =
      options.fetchTarget ||
      global;


    this.originalFetch =
      null;


    this.timer =
      null;
  }


  saveFetch() {
    if (
      !this.originalFetch
    ) {
      this.originalFetch =
        this.fetchTarget
          .fetch;
    }


    if (
      typeof this.originalFetch !==
      "function"
    ) {
      throw createChaosError(
        CHAOS_ERROR
          .INVALID_TARGET,
        "global.fetch is unavailable"
      );
    }


    return this.originalFetch;
  }


  scheduleRestore(
    duration
  ) {
    this.timer =
      setTimeout(
        () => {
          this.restore();
        },
        duration
      );


    if (
      typeof this.timer.unref ===
      "function"
    ) {
      this.timer.unref();
    }
  }


  injectLatency(
    delayMs =
      2000,
    duration =
      5000
  ) {
    const originalFetch =
      this.saveFetch();


    this.fetchTarget.fetch =
      async (
        ...args
      ) => {
        await sleep(
          delayMs
        );


        return originalFetch
          .apply(
            this.fetchTarget,
            args
          );
      };


    this.scheduleRestore(
      duration
    );


    return {
      injected:
        true,

      type:
        "external-service-latency",

      delayMs,

      duration,

      executionAuthorized:
        false,
    };
  }


  injectTimeout(
    duration =
      5000
  ) {
    this.saveFetch();


    this.fetchTarget.fetch =
      async () => {
        throw Object.assign(
          new Error(
            "EXTERNAL_SERVICE_TIMEOUT"
          ),
          {
            code:
              "EXTERNAL_SERVICE_TIMEOUT",

            retryable:
              true,

            executionAuthorized:
              false,
          }
        );
      };


    this.scheduleRestore(
      duration
    );


    return {
      injected:
        true,

      type:
        "external-service-timeout",

      duration,

      executionAuthorized:
        false,
    };
  }


  injectUnavailability(
    duration =
      5000
  ) {
    this.saveFetch();


    this.fetchTarget.fetch =
      async () => {
        throw Object.assign(
          new Error(
            "EXTERNAL_SERVICE_UNAVAILABLE"
          ),
          {
            code:
              "EXTERNAL_SERVICE_UNAVAILABLE",

            retryable:
              true,

            executionAuthorized:
              false,
          }
        );
      };


    this.scheduleRestore(
      duration
    );


    return {
      injected:
        true,

      type:
        "external-service-unavailable",

      duration,

      executionAuthorized:
        false,
    };
  }


  restore() {
    if (
      this.timer
    ) {
      clearTimeout(
        this.timer
      );


      this.timer =
        null;
    }


    if (
      this.originalFetch
    ) {
      this.fetchTarget.fetch =
        this.originalFetch;


      this.originalFetch =
        null;
    }


    return {
      restored:
        true,

      executionAuthorized:
        false,
    };
  }
}


// ============================================================================
// LOAD CHAOS
// ============================================================================

class LoadChaosInjector {
  static async injectIncidentStorm(
    incidentCount,
    incidentGenerator =
      null
  ) {
    const boundedCount =
      Math.max(
        1,
        Math.min(
          Number(
            incidentCount
          ) ||
          1,
          10000
        )
      );


    const incidents =
      [];


    for (
      let index =
        0;
      index <
      boundedCount;
      index++
    ) {
      if (
        typeof incidentGenerator ===
        "function"
      ) {
        incidents.push(
          await incidentGenerator(
            index
          )
        );


        continue;
      }


      incidents.push({
        id:
          `incident-${index}`,

        timestamp:
          Date.now(),

                  severity:
          [
            "LOW",
            "MEDIUM",
            "HIGH",
            "CRITICAL",
          ][
            Math.floor(
              Math.random() *
              4
            )
          ],

        pattern:
          [
            "HIGH_LATENCY",
            "HIGH_ERROR_RATE",
            "MEMORY_LEAK",
            "CASCADE_FAILURE",
          ][
            Math.floor(
              Math.random() *
              4
            )
          ],

        chaosGenerated:
          true,

        executionAuthorized:
          false,
      });
    }


    return incidents;
  }


  // ==========================================================================
  // LOAD RESPONSE MEASUREMENT
  // ==========================================================================

  static async measureLoadResponse(
    incidents,
    decisionEngine,
    options =
      {}
  ) {
    if (
      !Array.isArray(
        incidents
      )
    ) {
      throw createChaosError(
        CHAOS_ERROR
          .INVALID_TARGET,
        "Incidents must be an array"
      );
    }


    if (
      !decisionEngine ||
      typeof decisionEngine
        .makeDecision !==
      "function"
    ) {
      throw createChaosError(
        CHAOS_ERROR
          .INVALID_TARGET,
        "Decision engine must expose makeDecision()"
      );
    }


    const concurrency =
      Math.max(
        1,
        Math.min(
          Number(
            options.concurrency ||
            10
          ) ||
          10,
          100
        )
      );


    const startedAt =
      Date.now();


    const results =
      [];


    let cursor =
      0;


    async function worker() {
      while (
        cursor <
        incidents.length
      ) {
        const index =
          cursor++;


        const incident =
          incidents[
            index
          ];


        const decisionStartedAt =
          Date.now();


        try {
          const decision =
            await decisionEngine
              .makeDecision(
                incident
              );


          results[
            index
          ] = {
            incidentId:
              incident.id,

            success:
              true,

            duration:
              Date.now() -
              decisionStartedAt,

            decision,

            executionAuthorized:
              false,
          };
        } catch (
          error
        ) {
          results[
            index
          ] = {
            incidentId:
              incident.id,

            success:
              false,

            duration:
              Date.now() -
              decisionStartedAt,

            error:
              error.message,

            code:
              error.code ||
              "CHAOS_DECISION_FAILED",

            executionAuthorized:
              false,
          };
        }
      }
    }


    await Promise.all(
      Array.from(
        {
          length:
            Math.min(
              concurrency,
              Math.max(
                incidents.length,
                1
              )
            ),
        },
        () =>
          worker()
      )
    );


    const totalDuration =
      Date.now() -
      startedAt;


    const successfulDecisions =
      results
        .filter(
          (
            result
          ) =>
            result &&
            result.success
        )
        .length;


    const failedDecisions =
      results
        .filter(
          (
            result
          ) =>
            result &&
            !result.success
        )
        .length;


    const durations =
      results
        .filter(
          Boolean
        )
        .map(
          (
            result
          ) =>
            Number(
              result.duration ||
              0
            )
        );


    const totalDecisionDuration =
      durations
        .reduce(
          (
            total,
            duration
          ) =>
            total +
            duration,
          0
        );


    const averageLatencyMs =
      durations.length >
      0
        ? totalDecisionDuration /
          durations.length
        : 0;


    const maxLatencyMs =
      durations.length >
      0
        ? Math.max(
            ...durations
          )
        : 0;


    const minLatencyMs =
      durations.length >
      0
        ? Math.min(
            ...durations
          )
        : 0;


    const throughputIncidentsPerSecond =
      totalDuration >
      0
        ? incidents.length /
          (
            totalDuration /
            1000
          )
        : incidents.length;


    return {
      totalIncidents:
        incidents.length,

      successfulDecisions,

      failedDecisions,

      successRate:
        incidents.length >
        0
          ? successfulDecisions /
            incidents.length
          : 1,

      totalDuration,

      averageLatencyMs,

      maxLatencyMs,

      minLatencyMs,

      throughputIncidentsPerSecond,

      concurrency,

      results,

      executionAuthorized:
        false,
    };
  }
}


// ============================================================================
// PHASE 11.15 — REDIS CHAOS HELPERS
// ============================================================================

class RedisChaosInjector
  extends DependencyChaosInjector {
  injectUnavailability(
    method =
      "get",
    duration =
      5000
  ) {
    return super
      .injectUnavailability(
        method,
        {
          dependency:
            "redis",

          duration,

          code:
            "REDIS_UNAVAILABLE",
        }
      );
  }


  injectTimeout(
    method =
      "get",
    {
      duration =
        5000,

      timeoutMs =
        1000,
    } = {}
  ) {
    return super
      .injectTimeout(
        method,
        {
          dependency:
            "redis",

          duration,

          timeoutMs,
        }
      );
  }
}


// ============================================================================
// PHASE 11.15 — KUBERNETES CHAOS HELPERS
// ============================================================================

class KubernetesChaosInjector
  extends DependencyChaosInjector {
  injectUnavailability(
    method,
    duration =
      5000
  ) {
    return super
      .injectUnavailability(
        method,
        {
          dependency:
            "kubernetes",

          duration,

          code:
            "KUBERNETES_UNAVAILABLE",
        }
      );
  }


  injectTimeout(
    method,
    {
      duration =
        5000,

      timeoutMs =
        1000,
    } = {}
  ) {
    return super
      .injectTimeout(
        method,
        {
          dependency:
            "kubernetes",

          duration,

          timeoutMs,
        }
      );
  }
}


// ============================================================================
// PHASE 11.15 — FAILURE SCENARIO CATALOG
// ============================================================================

const BUILT_IN_FAILURE_SCENARIOS =
  Object.freeze({
    DATABASE_UNAVAILABLE: {
      id:
        "database-unavailable",

      category:
        "database",

      expectedBehavior:
        "fail-or-degrade",

      reversible:
        true,
    },


    DATABASE_LATENCY: {
      id:
        "database-latency",

      category:
        "database",

      expectedBehavior:
        "timeout-or-degrade",

      reversible:
        true,
    },


    REDIS_UNAVAILABLE: {
      id:
        "redis-unavailable",

      category:
        "dependency",

      expectedBehavior:
        "safe-mode-or-approved-fallback",

      reversible:
        true,
    },


    RABBITMQ_UNAVAILABLE: {
      id:
        "rabbitmq-unavailable",

      category:
        "queue",

      expectedBehavior:
        "durable-retry",

      reversible:
        true,
    },


    QUEUE_SATURATION: {
      id:
        "queue-saturation",

      category:
        "queue",

      expectedBehavior:
        "backpressure",

      reversible:
        true,
    },


    KUBERNETES_UNAVAILABLE: {
      id:
        "kubernetes-unavailable",

      category:
        "execution",

      expectedBehavior:
        "fail-closed",

      reversible:
        true,
    },


    KUBERNETES_TIMEOUT: {
      id:
        "kubernetes-timeout",

      category:
        "execution",

      expectedBehavior:
        "unknown-outcome-reconciliation",

      reversible:
        true,
    },


    EXTERNAL_SERVICE_TIMEOUT: {
      id:
        "external-service-timeout",

      category:
        "dependency",

      expectedBehavior:
        "retry-or-degrade",

      reversible:
        true,
    },


    INCIDENT_STORM: {
      id:
        "incident-storm",

      category:
        "load",

      expectedBehavior:
        "bounded-processing",

      reversible:
        true,
    },
  });


// ============================================================================
// CHAOS CERTIFICATION HELPER
// ============================================================================

async function runChaosScenario({
  framework,
  scenario,
  inject,
  verify,
  restore,
  authorizationToken =
    null,
}) {
  if (
    !framework ||
    !(framework instanceof
      ChaosTestFramework)
  ) {
    throw createChaosError(
      CHAOS_ERROR
        .INVALID_TARGET,
      "Chaos framework instance is required"
    );
  }


  framework
    .assertChaosAllowed({
      authorizationToken,
    });


  framework
    .assertScenarioRegistered(
      scenario
    );


  const startedAt =
    Date.now();


  let injected =
    false;


  try {
    await inject();


    injected =
      true;


    const verification =
      await verify();


    const passed =
      verification
        ?.passed ===
      true;


    const result =
      framework
        .recordResult(
          scenario,
          {
            passed,

            duration:
              Date.now() -
              startedAt,

            message:
              verification
                ?.message ||
              null,

            details: {
              ...(
                verification ||
                {}
              ),

              executionAuthorized:
                false,
            },
          }
        );


    return {
      passed,

      scenario,

      result,

      executionAuthorized:
        false,
    };
  } catch (
    error
  ) {
    framework
      .recordResult(
        scenario,
        {
          passed:
            false,

          duration:
            Date.now() -
            startedAt,

          message:
            error.message,

          details: {
            code:
              error.code ||
              "CHAOS_SCENARIO_FAILED",

            executionAuthorized:
              false,
          },
        }
      );


    throw Object.assign(
      error,
      {
        executionAuthorized:
          false,
      }
    );
  } finally {
    if (
      injected &&
      typeof restore ===
        "function"
    ) {
      try {
        await restore();
      } catch (
        error
      ) {
        framework.state =
          CHAOS_STATE
            .FAILED;


        framework.lastError =
          error.message;
      }
    }
  }
}


// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  ChaosTestFramework,

  BaseChaosInjector,

  DatabaseChaosInjector,

  QueueChaosInjector,

  DependencyChaosInjector,

  RedisChaosInjector,

  KubernetesChaosInjector,

  ExternalServiceChaosInjector,

  LoadChaosInjector,

  runChaosScenario,

  BUILT_IN_FAILURE_SCENARIOS,

  CHAOS_STATE,

  CHAOS_ERROR,

  DEFAULT_MAX_DURATION_MS,

  ABSOLUTE_MAX_DURATION_MS,
};