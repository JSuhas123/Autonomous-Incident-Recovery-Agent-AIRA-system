"use strict";

/*
 * ============================================================================
 * PHASE 11.10 — APPLICATION LIFECYCLE CERTIFICATION
 * ============================================================================
 *
 * Focus:
 *
 * - lifecycle states
 * - readiness contract
 * - recovery gating
 * - draining behavior
 * - shutdown idempotency
 * - execution-authority invariant
 *
 * This suite intentionally tests the lifecycle contract rather than
 * re-testing the lower-level outbox/replay implementations.
 */

describe(
  "Phase 11.10 Application Lifecycle",
  () => {
    let app;

    let originalNodeEnv;

    let originalAuditSecret;


    beforeAll(
      () => {
        originalNodeEnv =
          process.env
            .NODE_ENV;


        originalAuditSecret =
          process.env
            .AUDIT_SECRET;


        // ====================================================================
        // PHASE 11.14 COMPATIBLE TEST ENVIRONMENT
        // ====================================================================

        /*
         * server.js runs startup configuration validation while it is
         * imported.
         *
         * Phase 11.14 hardened AUDIT_SECRET to require at least
         * 48 characters, so this lifecycle suite must establish a valid
         * test configuration BEFORE requiring server.js.
         */
        process.env
          .NODE_ENV =
          "test";


        process.env
          .AUDIT_SECRET =
          "phase11-test-audit-secret-0123456789abcdef-0123456789abcdef";


        /*
         * Prevent process termination during lifecycle tests.
         */
        jest
          .spyOn(
            process,
            "exit"
          )
          .mockImplementation(
            () => {}
          );


        /*
         * server.js exposes the lifecycle helpers directly
         * on the Express application.
         */
        app =
          require(
            "../server"
          );
      }
    );


    afterAll(
      () => {
        // ====================================================================
        // RESTORE ENVIRONMENT
        // ====================================================================

        if (
          originalNodeEnv ===
          undefined
        ) {
          delete process.env
            .NODE_ENV;
        } else {
          process.env
            .NODE_ENV =
            originalNodeEnv;
        }


        if (
          originalAuditSecret ===
          undefined
        ) {
          delete process.env
            .AUDIT_SECRET;
        } else {
          process.env
            .AUDIT_SECRET =
            originalAuditSecret;
        }


        process
          .exit
          .mockRestore();
      }
    );


    beforeEach(
      () => {
        /*
         * Restore a deterministic lifecycle baseline.
         */
        app
          .applicationLifecycle
          .state =
          app
            .APPLICATION_STATE
            .STARTING;


        app
          .applicationLifecycle
          .startupRecoveryCompleted =
          false;


        app
          .applicationLifecycle
          .startupRecoveryFailed =
          false;


        app
          .applicationLifecycle
          .readyAt =
          null;


        app
          .applicationLifecycle
          .drainingAt =
          null;


        app
          .applicationLifecycle
          .shutdownStartedAt =
          null;


        app
          .applicationLifecycle
          .stoppedAt =
          null;


        app
          .applicationLifecycle
          .lastError =
          null;
      }
    );

    // ========================================================================
    // STATES
    // ========================================================================

    test(
      "defines canonical lifecycle states",
      () => {
        expect(
          app
            .APPLICATION_STATE
        )
          .toMatchObject({
            STARTING:
              "STARTING",

            RECOVERING:
              "RECOVERING",

            READY:
              "READY",

            DRAINING:
              "DRAINING",

            SHUTTING_DOWN:
              "SHUTTING_DOWN",

            STOPPED:
              "STOPPED",

            FAILED:
              "FAILED",
          });
      }
    );


    // ========================================================================
    // STARTUP NOT READY
    // ========================================================================

    test(
      "STARTING state is not ready",
      () => {
        app
          .applicationLifecycle
          .state =
          app
            .APPLICATION_STATE
            .STARTING;


        expect(
          app
            .isApplicationReady()
        )
          .toBe(
            false
          );
      }
    );


    test(
      "RECOVERING state is not ready",
      () => {
        app
          .applicationLifecycle
          .state =
          app
            .APPLICATION_STATE
            .RECOVERING;


        app
          .applicationLifecycle
          .startupRecoveryCompleted =
          false;


        expect(
          app
            .isApplicationReady()
        )
          .toBe(
            false
          );
      }
    );


    // ========================================================================
    // READY
    // ========================================================================

    test(
      "READY requires completed startup recovery",
      () => {
        app
          .applicationLifecycle
          .state =
          app
            .APPLICATION_STATE
            .READY;


        app
          .applicationLifecycle
          .startupRecoveryCompleted =
          false;


        expect(
          app
            .isApplicationReady()
        )
          .toBe(
            false
          );


        app
          .applicationLifecycle
          .startupRecoveryCompleted =
          true;


        expect(
          app
            .isApplicationReady()
        )
          .toBe(
            true
          );
      }
    );


    test(
      "failed startup recovery prevents readiness",
      () => {
        app
          .applicationLifecycle
          .state =
          app
            .APPLICATION_STATE
            .READY;


        app
          .applicationLifecycle
          .startupRecoveryCompleted =
          true;


        app
          .applicationLifecycle
          .startupRecoveryFailed =
          true;


        expect(
          app
            .isApplicationReady()
        )
          .toBe(
            false
          );
      }
    );


    // ========================================================================
    // DRAIN / SHUTDOWN
    // ========================================================================

    test(
      "DRAINING state rejects readiness",
      () => {
        app
          .applicationLifecycle
          .state =
          app
            .APPLICATION_STATE
            .DRAINING;


        app
          .applicationLifecycle
          .startupRecoveryCompleted =
          true;


        expect(
          app
            .isApplicationReady()
        )
          .toBe(
            false
          );
      }
    );


    test(
      "SHUTTING_DOWN state rejects readiness",
      () => {
        app
          .applicationLifecycle
          .state =
          app
            .APPLICATION_STATE
            .SHUTTING_DOWN;


        app
          .applicationLifecycle
          .startupRecoveryCompleted =
          true;


        expect(
          app
            .isApplicationReady()
        )
          .toBe(
            false
          );
      }
    );


    test(
      "STOPPED state rejects readiness",
      () => {
        app
          .applicationLifecycle
          .state =
          app
            .APPLICATION_STATE
            .STOPPED;


        app
          .applicationLifecycle
          .startupRecoveryCompleted =
          true;


        expect(
          app
            .isApplicationReady()
        )
          .toBe(
            false
          );
      }
    );


    // ========================================================================
    // FAILED
    // ========================================================================

    test(
      "FAILED state is never ready",
      () => {
        app
          .applicationLifecycle
          .state =
          app
            .APPLICATION_STATE
            .FAILED;


        app
          .applicationLifecycle
          .startupRecoveryCompleted =
          true;


        expect(
          app
            .isApplicationReady()
        )
          .toBe(
            false
          );
      }
    );


    // ========================================================================
    // STATUS CONTRACT
    // ========================================================================

    test(
      "lifecycle status exposes readiness without execution authority",
      () => {
        app
          .applicationLifecycle
          .state =
          app
            .APPLICATION_STATE
            .READY;


        app
          .applicationLifecycle
          .startupRecoveryCompleted =
          true;


        const status =
          app
            .getApplicationLifecycleStatus();


        expect(
          status
        )
          .toMatchObject({
            state:
              "READY",

            ready:
              true,

            startupRecoveryCompleted:
              true,

            executionAuthorized:
              false,
          });
      }
    );


    test(
      "lifecycle status never grants infrastructure execution authority",
      () => {
        const states = [
          app
            .APPLICATION_STATE
            .STARTING,

          app
            .APPLICATION_STATE
            .RECOVERING,

          app
            .APPLICATION_STATE
            .READY,

          app
            .APPLICATION_STATE
            .DRAINING,

          app
            .APPLICATION_STATE
            .SHUTTING_DOWN,

          app
            .APPLICATION_STATE
            .STOPPED,

          app
            .APPLICATION_STATE
            .FAILED,
        ];


        for (
          const state
          of states
        ) {
          app
            .applicationLifecycle
            .state =
            state;


          const status =
            app
              .getApplicationLifecycleStatus();


          expect(
            status
              .executionAuthorized
          )
            .toBe(
              false
            );
        }
      }
    );
  }
);