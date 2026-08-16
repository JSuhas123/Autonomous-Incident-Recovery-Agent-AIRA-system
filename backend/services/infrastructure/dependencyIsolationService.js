"use strict";

/*
 * ============================================================================
 * AIRA PHASE 11.5
 * DEPENDENCY FAILURE ISOLATION
 * ============================================================================
 */

const CircuitBreakerService =
  require(
    "./circuitBreakerService"
  );

const {
  metricsService,
} =
  require(
    "./metricsService"
  );


const DEPENDENCY_CLASS =
  Object.freeze({
    CRITICAL:
      "CRITICAL",

    DURABLE_ASYNC:
      "DURABLE_ASYNC",

    DEGRADABLE:
      "DEGRADABLE",

    OPTIONAL:
      "OPTIONAL",
  });


const FAILURE_MODE =
  Object.freeze({
    FAIL_CLOSED:
      "FAIL_CLOSED",

    DURABLE_RETRY:
      "DURABLE_RETRY",

    DEGRADE:
      "DEGRADE",

    CONTINUE:
      "CONTINUE",
  });


const DEFAULT_DEPENDENCIES =
  Object.freeze({
    mongodb: {
      dependencyClass:
        DEPENDENCY_CLASS
          .CRITICAL,

      failureMode:
        FAILURE_MODE
          .FAIL_CLOSED,

      failureThreshold:
        3,

      timeout:
        30000,
    },

    kubernetes: {
      dependencyClass:
        DEPENDENCY_CLASS
          .CRITICAL,

      failureMode:
        FAILURE_MODE
          .FAIL_CLOSED,

      failureThreshold:
        3,

      timeout:
        30000,
    },

    rabbitmq: {
      dependencyClass:
        DEPENDENCY_CLASS
          .DURABLE_ASYNC,

      failureMode:
        FAILURE_MODE
          .DURABLE_RETRY,

      failureThreshold:
        5,

      timeout:
        15000,
    },

    redis: {
      dependencyClass:
        DEPENDENCY_CLASS
          .DEGRADABLE,

      failureMode:
        FAILURE_MODE
          .DEGRADE,

      failureThreshold:
        5,

      timeout:
        15000,
    },

    telemetry: {
      dependencyClass:
        DEPENDENCY_CLASS
          .DEGRADABLE,

      failureMode:
        FAILURE_MODE
          .DEGRADE,

      failureThreshold:
        5,

      timeout:
        30000,
    },

    notifications: {
      dependencyClass:
        DEPENDENCY_CLASS
          .OPTIONAL,

      failureMode:
        FAILURE_MODE
          .CONTINUE,

      failureThreshold:
        5,

      timeout:
        30000,
    },
  });


class DependencyIsolationService {
  constructor(
    options = {}
  ) {
    this.metrics =
      options.metrics ||
      metricsService ||
      null;

    this.definitions =
      new Map();

    this.breakers =
      new Map();

    for (
      const [
        name,
        definition,
      ]
      of Object.entries(
        DEFAULT_DEPENDENCIES
      )
    ) {
      this.register(
        name,
        definition
      );
    }

    for (
      const [
        name,
        definition,
      ]
      of Object.entries(
        options.dependencies ||
        {}
      )
    ) {
      this.register(
        name,
        definition
      );
    }
  }


  // ==========================================================================
  // REGISTRATION
  // ==========================================================================

  register(
    name,
    definition = {}
  ) {
    if (
      !name ||
      typeof name !==
        "string"
    ) {
      throw new Error(
        "Dependency name is required"
      );
    }

    const existing =
      this.definitions
        .get(
          name
        ) ||
      {};

    const resolved = {
      dependencyClass:
        definition
          .dependencyClass ||
        existing
          .dependencyClass ||
        DEPENDENCY_CLASS
          .DEGRADABLE,

      failureMode:
        definition
          .failureMode ||
        existing
          .failureMode ||
        FAILURE_MODE
          .DEGRADE,

      failureThreshold:
        Number(
          definition
            .failureThreshold ||
          existing
            .failureThreshold ||
          5
        ),

      successThreshold:
        Number(
          definition
            .successThreshold ||
          existing
            .successThreshold ||
          1
        ),

      timeout:
        Number(
          definition
            .timeout ||
          existing
            .timeout ||
          30000
        ),

      shouldCountFailure:
        definition
          .shouldCountFailure ||
        existing
          .shouldCountFailure ||
        null,
    };

    this.definitions
      .set(
        name,
        resolved
      );

    /*
     * If policy changes, recreate the breaker so stale thresholds are
     * not accidentally retained.
     */
    this.breakers
      .delete(
        name
      );

    return {
      name,
      ...resolved,
    };
  }


  // ==========================================================================
  // EXECUTE
  // ==========================================================================

  async execute(
    name,
    operation,
    context = {}
  ) {
    const definition =
      this.getDefinition(
        name
      );

    const breaker =
      this.getBreaker(
        name
      );

    try {
      const result =
        await breaker
          .execute(
            operation
          );

      this.recordMetrics(
        context,
        name,
        breaker
      );

      return {
        ok:
          true,

        degraded:
          false,

        dependency:
          name,

        result,

        circuit:
          breaker
            .getState(),

        executionAuthorized:
          false,
      };
    } catch (
      error
    ) {
      this.recordMetrics(
        context,
        name,
        breaker
      );

      return this.handleFailure({
        name,

        definition,

        breaker,

        error,

        context,
      });
    }
  }


  // ==========================================================================
  // FAILURE POLICY
  // ==========================================================================

  handleFailure({
    name,
    definition,
    breaker,
    error,
  }) {
    const circuit =
      breaker
        .getState();


    if (
      definition
        .failureMode ===
      FAILURE_MODE
        .FAIL_CLOSED
    ) {
      const wrapped =
        Object.assign(
          new Error(
            `Critical dependency ${name} unavailable: ${error.message}`
          ),
          {
            code:
              error.code ||
              "CRITICAL_DEPENDENCY_UNAVAILABLE",

            dependency:
              name,

            dependencyClass:
              definition
                .dependencyClass,

            failureMode:
              definition
                .failureMode,

            circuitState:
              circuit.state,

            retryable:
              error.retryable !==
              false,

            executionAuthorized:
              false,

            cause:
              error,
          }
        );

      throw wrapped;
    }


    if (
      definition
        .failureMode ===
      FAILURE_MODE
        .DURABLE_RETRY
    ) {
      return {
        ok:
          false,

        degraded:
          true,

        dependency:
          name,

        decision:
          "DURABLE_RETRY",

        retryable:
          true,

        error:
          this.serializeError(
            error
          ),

        circuit,

        executionAuthorized:
          false,
      };
    }


    if (
      definition
        .failureMode ===
      FAILURE_MODE
        .DEGRADE
    ) {
      return {
        ok:
          false,

        degraded:
          true,

        dependency:
          name,

        decision:
          "DEGRADED",

        retryable:
          true,

        error:
          this.serializeError(
            error
          ),

        circuit,

        executionAuthorized:
          false,
      };
    }


    /*
     * OPTIONAL dependencies should never terminate the protected workflow
     * solely because that optional dependency failed.
     */
    return {
      ok:
        false,

      degraded:
        true,

      dependency:
        name,

      decision:
        "CONTINUE",

      retryable:
        true,

      error:
        this.serializeError(
          error
        ),

      circuit,

      executionAuthorized:
        false,
    };
  }


  // ==========================================================================
  // BREAKERS
  // ==========================================================================

  getBreaker(
    name
  ) {
    if (
      this.breakers
        .has(
          name
        )
    ) {
      return this.breakers
        .get(
          name
        );
    }

    const definition =
      this.getDefinition(
        name
      );

    const breaker =
      new CircuitBreakerService(
        name,
        {
          failureThreshold:
            definition
              .failureThreshold,

          successThreshold:
            definition
              .successThreshold,

          timeout:
            definition
              .timeout,

          shouldCountFailure:
            definition
              .shouldCountFailure,

          onStateChange:
            ({
              to,
            }) => {
              this.recordState(
                "system",
                name,
                to
              );
            },
        }
      );

    this.breakers
      .set(
        name,
        breaker
      );

    return breaker;
  }


  getDefinition(
    name
  ) {
    const definition =
      this.definitions
        .get(
          name
        );

   if (
  !definition
) {
  /*
   * Phase 11.5 safety boundary:
   *
   * Unknown dependencies must fail closed.
   *
   * The isolation layer must never invent a dependency policy,
   * assume retry safety, or grant execution authority.
   */
  throw Object.assign(
    new Error(
      `Unknown dependency: ${name}`
    ),
    {
      code:
        "DEPENDENCY_NOT_REGISTERED",

      dependency:
        name,

      retryable:
        false,

      executionAuthorized:
        false,
    }
  );
}

    return definition;
  }


  // ==========================================================================
  // STATUS
  // ==========================================================================

  getStatus(
    name
  ) {
    const definition =
      this.getDefinition(
        name
      );

    const breaker =
      this.getBreaker(
        name
      );

    return {
      name,

      ...definition,

      circuit:
        breaker
          .getState(),

      executionAuthorized:
        false,
    };
  }


  getAllStatuses() {
    return Array
      .from(
        this.definitions
          .keys()
      )
      .map(
        (
          name
        ) =>
          this.getStatus(
            name
          )
      );
  }

    // ==========================================================================
  // PHASE 11.5.2 — DEPENDENCY HEALTH SUMMARY
  // ==========================================================================

  getSummary() {
    const dependencies =
      this.getAllStatuses();


    const open =
      dependencies
        .filter(
          (
            dependency
          ) =>
            dependency
              .circuit
              .state ===
            "OPEN"
        );


    const halfOpen =
      dependencies
        .filter(
          (
            dependency
          ) =>
            dependency
              .circuit
              .state ===
            "HALF_OPEN"
        );


    const degraded =
      dependencies
        .filter(
          (
            dependency
          ) =>
            dependency
              .circuit
              .state !==
            "CLOSED"
        );


    /*
     * Only CRITICAL dependencies make the dependency
     * isolation layer itself unhealthy.
     *
     * Examples:
     *
     * Kubernetes / MongoDB
     *      ↓
     * CRITICAL
     *      ↓
     * circuit unavailable
     *      ↓
     * unhealthy / fail closed
     *
     *
     * Redis
     *      ↓
     * DEGRADABLE
     *      ↓
     * circuit unavailable
     *      ↓
     * degraded operation
     *
     *
     * RabbitMQ
     *      ↓
     * DURABLE_ASYNC
     *      ↓
     * durable retry
     *
     * RabbitMQ therefore does not become a CRITICAL
     * unavailable dependency here.
     *
     * systemHealthService remains responsible for
     * deciding whether a degradable dependency such as
     * Redis affects the safety of the current deployment
     * mode.
     */
    const criticalUnavailable =
      degraded
        .filter(
          (
            dependency
          ) =>
            dependency
              .dependencyClass ===
            DEPENDENCY_CLASS
              .CRITICAL
        )
        .map(
          (
            dependency
          ) =>
            dependency.name
        );


    const closed =
      dependencies
        .filter(
          (
            dependency
          ) =>
            dependency
              .circuit
              .state ===
            "CLOSED"
        );


    return {
      total:
        dependencies.length,

      closed:
        closed.length,

      open:
        open.length,

      halfOpen:
        halfOpen.length,

      degraded:
        degraded.length,

      criticalUnavailable,

      healthy:
        criticalUnavailable
          .length ===
        0,

      /*
       * Dependency isolation is a safety/availability
       * boundary only.
       *
       * It must NEVER grant permission to execute an
       * infrastructure mutation.
       */
      executionAuthorized:
        false,
    };
  }

  reset(
    name
  ) {
    const breaker =
      this.getBreaker(
        name
      );

    breaker.reset();

    this.recordState(
      "system",
      name,
      "CLOSED"
    );

    return this.getStatus(
      name
    );
  }


  // ==========================================================================
  // METRICS
  // ==========================================================================

  recordMetrics(
    context,
    name,
    breaker
  ) {
    const tenantId =
      context
        ?.tenantId ||
      context
        ?.organizationId ||
      "system";

    this.recordState(
      tenantId,
      name,
      breaker
        .getState()
        .state
    );
  }


  recordState(
    tenantId,
    name,
    state
  ) {
    if (
      this.metrics &&
      typeof this.metrics
        .recordCircuitBreakerState ===
      "function"
    ) {
      this.metrics
        .recordCircuitBreakerState(
          String(
            tenantId ||
            "system"
          ),

          name,

          state
        );
    }
  }


  // ==========================================================================
  // HELPERS
  // ==========================================================================

  serializeError(
    error
  ) {
    return {
      code:
        error
          ?.code ||
        null,

      message:
        String(
          error
            ?.message ||
          "Dependency failure"
        )
          .slice(
            0,
            1024
          ),
    };
  }
}


module.exports =
  new DependencyIsolationService();

module.exports
  .DependencyIsolationService =
  DependencyIsolationService;

module.exports
  .DEPENDENCY_CLASS =
  DEPENDENCY_CLASS;

module.exports
  .FAILURE_MODE =
  FAILURE_MODE;

module.exports
  .DEFAULT_DEPENDENCIES =
  DEFAULT_DEPENDENCIES;