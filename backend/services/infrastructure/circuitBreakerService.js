"use strict";

/*
 * ============================================================================
 * AIRA PHASE 11.5
 * CANONICAL DEPENDENCY CIRCUIT BREAKER
 * ============================================================================
 *
 * This breaker protects AIRA from repeatedly calling unhealthy dependencies.
 *
 * STATES
 *
 * CLOSED
 *    ↓ failures reach threshold
 * OPEN
 *    ↓ cooldown expires
 * HALF_OPEN
 *    ↓ successful probes
 * CLOSED
 *
 * HALF_OPEN failure:
 *
 * HALF_OPEN
 *    ↓ failure
 * OPEN
 *
 * IMPORTANT:
 *
 * A circuit breaker prevents dependency pressure.
 *
 * It does NOT:
 *
 * - authorize execution
 * - retry infrastructure mutations blindly
 * - mark an unknown external mutation as failed/succeeded
 * - replace Phase 11.1 idempotency
 * - replace Phase 11.4 reconciliation
 *
 * ============================================================================
 */


class CircuitBreakerOpenError
  extends Error {
  constructor({
    name,
    retryAt,
    state,
  }) {
    super(
      `Circuit breaker [${name}] is ${state}. Retry after ${retryAt.toISOString()}`
    );

    this.name =
      "CircuitBreakerOpenError";

    this.code =
      "DEPENDENCY_CIRCUIT_OPEN";

    this.circuit =
      name;

    this.state =
      state;

    this.retryAt =
      retryAt;

    this.retryable =
      true;
  }
}


class CircuitBreakerService {
  static STATES =
    Object.freeze({
      CLOSED:
        "CLOSED",

      OPEN:
        "OPEN",

      HALF_OPEN:
        "HALF_OPEN",
    });


  static DEFAULTS =
    Object.freeze({
      failureThreshold:
        5,

      successThreshold:
        2,

      timeout:
        30000,

      halfOpenMaxConcurrent:
        1,
    });


  constructor(
    name,
    options = {}
  ) {
    if (
      !name ||
      typeof name !==
        "string"
    ) {
      throw new Error(
        "Circuit breaker name is required"
      );
    }

    this.name =
      name;

    this.failureThreshold =
      this.positiveInteger(
        options.failureThreshold,
        this.constructor
          .DEFAULTS
          .failureThreshold
      );

    this.successThreshold =
      this.positiveInteger(
        options.successThreshold,
        this.constructor
          .DEFAULTS
          .successThreshold
      );

    this.timeout =
      this.positiveInteger(
        options.timeout,
        this.constructor
          .DEFAULTS
          .timeout
      );

    this.halfOpenMaxConcurrent =
      this.positiveInteger(
        options.halfOpenMaxConcurrent,
        this.constructor
          .DEFAULTS
          .halfOpenMaxConcurrent
      );

    this.now =
      options.now ||
      (() =>
        Date.now());

    this.shouldCountFailure =
      typeof options
        .shouldCountFailure ===
      "function"
        ? options
            .shouldCountFailure
        : () =>
            true;

    this.onStateChange =
      typeof options
        .onStateChange ===
      "function"
        ? options
            .onStateChange
        : null;

    this.reset();
  }


  // ==========================================================================
  // EXECUTION
  // ==========================================================================

  async execute(
    operation
  ) {
    if (
      typeof operation !==
      "function"
    ) {
      throw new TypeError(
        "Circuit breaker operation must be a function"
      );
    }

    this.refreshState();

    if (
      this.state ===
      this.constructor
        .STATES
        .OPEN
    ) {
      throw new CircuitBreakerOpenError({
        name:
          this.name,

        retryAt:
          new Date(
            this.nextAttemptTime
          ),

        state:
          this.state,
      });
    }


    if (
      this.state ===
        this.constructor
          .STATES
          .HALF_OPEN &&
      this.halfOpenInFlight >=
        this.halfOpenMaxConcurrent
    ) {
      const error =
        new CircuitBreakerOpenError({
          name:
            this.name,

          retryAt:
            new Date(
              this.nextAttemptTime ||
              this.now()
            ),

          state:
            this.state,
        });

      error.code =
        "DEPENDENCY_HALF_OPEN_PROBE_LIMIT";

      throw error;
    }


    const isHalfOpen =
      this.state ===
      this.constructor
        .STATES
        .HALF_OPEN;

    if (
      isHalfOpen
    ) {
      this.halfOpenInFlight +=
        1;
    }


    this.totalCalls +=
      1;

    try {
      const result =
        await operation();

      this.onSuccess();

      return result;
    } catch (
      error
    ) {
      if (
        this.shouldCountFailure(
          error
        )
      ) {
        this.onFailure(
          error
        );
      }

      throw error;
    } finally {
      if (
        isHalfOpen
      ) {
        this.halfOpenInFlight =
          Math.max(
            0,
            this.halfOpenInFlight -
              1
          );
      }
    }
  }


  // ==========================================================================
  // STATE
  // ==========================================================================

  refreshState() {
    if (
      this.state !==
      this.constructor
        .STATES
        .OPEN
    ) {
      return;
    }

    if (
      this.now() <
      this.nextAttemptTime
    ) {
      return;
    }

    this.transitionTo(
      this.constructor
        .STATES
        .HALF_OPEN,
      "cooldown_elapsed"
    );

    this.successCount =
      0;

    this.halfOpenInFlight =
      0;
  }


  onSuccess() {
    this.successfulCalls +=
      1;

    if (
      this.state ===
      this.constructor
        .STATES
        .HALF_OPEN
    ) {
      this.successCount +=
        1;

      if (
        this.successCount >=
        this.successThreshold
      ) {
        this.failureCount =
          0;

        this.successCount =
          0;

        this.nextAttemptTime =
          null;

        this.transitionTo(
          this.constructor
            .STATES
            .CLOSED,
          "recovery_threshold_met"
        );
      }

      return;
    }

    /*
     * A successful call while CLOSED indicates the dependency is healthy.
     *
     * Reset consecutive failure count.
     */
    this.failureCount =
      0;
  }


  onFailure(
    error
  ) {
    this.failedCalls +=
      1;

    this.failureCount +=
      1;

    this.lastFailureTime =
      this.now();

    this.lastFailure = {
      code:
        error
          ?.code ||
        null,

      message:
        String(
          error
            ?.message ||
          "Dependency operation failed"
        )
          .slice(
            0,
            1024
          ),

      occurredAt:
        new Date(
          this.lastFailureTime
        ),
    };


    if (
      this.state ===
      this.constructor
        .STATES
        .HALF_OPEN
    ) {
      this.open(
        "half_open_probe_failed"
      );

      return;
    }


    if (
      this.failureCount >=
      this.failureThreshold
    ) {
      this.open(
        "failure_threshold_reached"
      );
    }
  }


  open(
    reason
  ) {
    this.nextAttemptTime =
      this.now() +
      this.timeout;

    this.successCount =
      0;

    this.transitionTo(
      this.constructor
        .STATES
        .OPEN,
      reason
    );
  }


  transitionTo(
    state,
    reason
  ) {
    const previous =
      this.state;

    if (
      previous ===
      state
    ) {
      return;
    }

    this.state =
      state;

    this.lastStateChangeAt =
      new Date(
        this.now()
      );

    this.lastStateChangeReason =
      reason ||
      null;

    if (
      this.onStateChange
    ) {
      this.onStateChange({
        name:
          this.name,

        from:
          previous,

        to:
          state,

        reason:
          reason ||
          null,

        at:
          this.lastStateChangeAt,
      });
    }
  }


  // ==========================================================================
  // INTROSPECTION
  // ==========================================================================

  getState() {
    this.refreshState();

    return {
      name:
        this.name,

      state:
        this.state,

      failureCount:
        this.failureCount,

      successCount:
        this.successCount,

      totalCalls:
        this.totalCalls,

      successfulCalls:
        this.successfulCalls,

      failedCalls:
        this.failedCalls,

      halfOpenInFlight:
        this.halfOpenInFlight,

      lastFailureTime:
        this.lastFailureTime,

      lastFailure:
        this.lastFailure,

      nextAttemptTime:
        this.nextAttemptTime,

      lastStateChangeAt:
        this.lastStateChangeAt,

      lastStateChangeReason:
        this.lastStateChangeReason,

      failureThreshold:
        this.failureThreshold,

      successThreshold:
        this.successThreshold,

      timeout:
        this.timeout,

      open:
        this.state ===
        this.constructor
          .STATES
          .OPEN,

      executionAuthorized:
        false,
    };
  }


  // ==========================================================================
  // RESET
  // ==========================================================================

  reset() {
    this.state =
      this.constructor
        .STATES
        .CLOSED;

    this.failureCount =
      0;

    this.successCount =
      0;

    this.totalCalls =
      0;

    this.successfulCalls =
      0;

    this.failedCalls =
      0;

    this.halfOpenInFlight =
      0;

    this.lastFailureTime =
      null;

    this.lastFailure =
      null;

    this.nextAttemptTime =
      null;

    this.lastStateChangeAt =
      null;

    this.lastStateChangeReason =
      null;
  }


  positiveInteger(
    value,
    fallback
  ) {
    const parsed =
      Number(
        value
      );

    return Number.isFinite(
      parsed
    ) &&
      parsed >
        0
      ? Math.floor(
          parsed
        )
      : fallback;
  }
}


module.exports =
  CircuitBreakerService;

module.exports
  .CircuitBreakerService =
  CircuitBreakerService;

module.exports
  .CircuitBreakerOpenError =
  CircuitBreakerOpenError;