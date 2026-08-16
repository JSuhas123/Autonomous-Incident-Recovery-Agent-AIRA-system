"use strict";

const {
  WorkflowOutboxRuntimeController,
} =
  require(
    "../workflowOutboxRuntimeController"
  );


describe(
  "WorkflowOutboxRuntimeController",
  () => {
    let queueService;

    let worker;

    let logger;

    let timer;

    let setIntervalFn;

    let clearIntervalFn;


    beforeEach(
      () => {
        queueService = {
          connected:
            true,
        };

        worker = {
          processBatch:
            jest.fn()
              .mockResolvedValue({
                processed:
                  1,
              }),
        };

        logger = {
          info:
            jest.fn(),

          error:
            jest.fn(),
        };

        timer = {
          unref:
            jest.fn(),
        };

        setIntervalFn =
          jest.fn()
            .mockReturnValue(
              timer
            );

        clearIntervalFn =
          jest.fn();
      }
    );


    function createController(
      overrides = {}
    ) {
      return new WorkflowOutboxRuntimeController({
        worker,

        queueService,

        logger,

        setIntervalFn,

        clearIntervalFn,

        intervalMs:
          1000,

        workerId:
          "workflow-outbox-test",

        ...overrides,
      });
    }


    test(
      "requires worker",
      () => {
        expect(
          () =>
            new WorkflowOutboxRuntimeController({
              queueService,
            })
        )
          .toThrow(
            expect.objectContaining({
              code:
                "OUTBOX_RUNTIME_WORKER_REQUIRED",
            })
          );
      }
    );


    test(
      "requires queue service",
      () => {
        expect(
          () =>
            new WorkflowOutboxRuntimeController({
              worker,
            })
        )
          .toThrow(
            expect.objectContaining({
              code:
                "OUTBOX_RUNTIME_QUEUE_REQUIRED",
            })
          );
      }
    );


    test(
      "starts only when transport is ready",
      () => {
        const controller =
          createController();

        const result =
          controller.start();

        expect(
          result.started
        )
          .toBe(
            true
          );

        expect(
          setIntervalFn
        )
          .toHaveBeenCalledTimes(
            1
          );

        expect(
          timer.unref
        )
          .toHaveBeenCalledTimes(
            1
          );

        expect(
          controller
            .getStatus()
            .running
        )
          .toBe(
            true
          );
      }
    );


    test(
      "does not start against disconnected transport",
      () => {
        queueService.connected =
          false;

        const controller =
          createController();

        const result =
          controller.start();

        expect(
          result
        )
          .toMatchObject({
            started:
              false,

            reason:
              "TRANSPORT_NOT_READY",

            executionAuthorized:
              false,
          });

        expect(
          setIntervalFn
        )
          .not
          .toHaveBeenCalled();
      }
    );


    test(
      "missing transport health is fail closed",
      () => {
        delete queueService
          .connected;

        const controller =
          createController();

        expect(
          controller
            .isTransportReady()
        )
          .toBe(
            false
          );
      }
    );


    test(
      "supports explicit isConnected transport health",
      () => {
        delete queueService
          .connected;

        queueService
          .isConnected =
          jest.fn()
            .mockReturnValue(
              true
            );

        const controller =
          createController();

        expect(
          controller
            .isTransportReady()
        )
          .toBe(
            true
          );
      }
    );


    test(
      "tick processes worker batch",
      async () => {
        const controller =
          createController();

        controller.start();

        const result =
          await controller
            .tick();

        expect(
          worker.processBatch
        )
          .toHaveBeenCalledTimes(
            1
          );

        expect(
          result
        )
          .toMatchObject({
            processed:
              true,

            skipped:
              false,

            executionAuthorized:
              false,
          });

        expect(
          controller
            .getStatus()
            .totalRuns
        )
          .toBe(
            1
          );
      }
    );


    test(
      "tick refuses to drain after transport disconnects",
      async () => {
        const controller =
          createController();

        controller.start();

        queueService.connected =
          false;

        const result =
          await controller
            .tick();

        expect(
          worker.processBatch
        )
          .not
          .toHaveBeenCalled();

        expect(
          result
        )
          .toMatchObject({
            processed:
              false,

            skipped:
              true,

            reason:
              "TRANSPORT_NOT_READY",
          });
      }
    );


    test(
      "prevents overlapping drain cycles",
      async () => {
        let release;

        worker.processBatch =
          jest.fn(
            () =>
              new Promise(
                (
                  resolve
                ) => {
                  release =
                    resolve;
                }
              )
          );

        const controller =
          createController();

        controller.start();

        const first =
          controller.tick();

        await Promise.resolve();

        const second =
          await controller
            .tick();

        expect(
          second
        )
          .toMatchObject({
            processed:
              false,

            skipped:
              true,

            reason:
              "RUN_ALREADY_IN_PROGRESS",
          });

        expect(
          worker.processBatch
        )
          .toHaveBeenCalledTimes(
            1
          );

        release({
          processed:
            1,
        });

        await first;
      }
    );


    test(
      "worker failure is contained by runtime",
      async () => {
        worker.processBatch
          .mockRejectedValue(
            Object.assign(
              new Error(
                "database temporarily unavailable"
              ),
              {
                code:
                  "DATABASE_TEMPORARY_FAILURE",
              }
            )
          );

        const controller =
          createController();

        controller.start();

        const result =
          await controller
            .tick();

        expect(
          result
        )
          .toMatchObject({
            processed:
              false,

            failed:
              true,

            executionAuthorized:
              false,

            error: {
              code:
                "DATABASE_TEMPORARY_FAILURE",
            },
          });

        expect(
          controller
            .getStatus()
            .totalFailures
        )
          .toBe(
            1
          );

        expect(
          logger.error
        )
          .toHaveBeenCalled();
      }
    );


    test(
      "start is idempotent",
      () => {
        const controller =
          createController();

        const first =
          controller.start();

        const second =
          controller.start();

        expect(
          first.started
        )
          .toBe(
            true
          );

        expect(
          second
        )
          .toMatchObject({
            started:
              false,

            alreadyRunning:
              true,
          });

        expect(
          setIntervalFn
        )
          .toHaveBeenCalledTimes(
            1
          );
      }
    );


    test(
      "stop clears polling timer",
      async () => {
        const controller =
          createController();

        controller.start();

        const result =
          await controller
            .stop();

        expect(
          clearIntervalFn
        )
          .toHaveBeenCalledWith(
            timer
          );

        expect(
          result.stopped
        )
          .toBe(
            true
          );

        expect(
          controller
            .getStatus()
            .running
        )
          .toBe(
            false
          );
      }
    );


    test(
      "tick after stop does not process worker",
      async () => {
        const controller =
          createController();

        controller.start();

        await controller
          .stop();

        const result =
          await controller
            .tick();

        expect(
          result.reason
        )
          .toBe(
            "RUNTIME_NOT_RUNNING"
          );

        expect(
          worker.processBatch
        )
          .not
          .toHaveBeenCalled();
      }
    );


    test(
      "status never exposes execution authority",
      () => {
        const controller =
          createController();

        expect(
          controller
            .getStatus()
            .executionAuthorized
        )
          .toBe(
            false
          );
      }
    );
  }
);