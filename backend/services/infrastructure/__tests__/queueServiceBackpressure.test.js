"use strict";

const {
  QueueService,
} =
  require(
    "../queueService"
  );


describe(
  "Phase 11.6 Queue Backpressure",
  () => {
    function createQueue(
      options = {}
    ) {
      const service =
        new QueueService(
          options
        );


      service.connected =
        true;


      service.channel = {
        assertExchange:
          jest.fn()
            .mockResolvedValue(),

        publish:
          jest.fn()
            .mockReturnValue(
              true
            ),

        once:
          jest.fn(),

        prefetch:
          jest.fn()
            .mockResolvedValue(),

        assertQueue:
          jest.fn()
            .mockResolvedValue(),

        bindQueue:
          jest.fn()
            .mockResolvedValue(),

        consume:
          jest.fn()
            .mockResolvedValue(),
      };


      return service;
    }


    test(
      "rejects publisher when max in-flight limit is reached",
      async () => {
        const service =
          createQueue({
            maxInFlightPublishes:
              1,
          });


        service.inFlightPublishes =
          1;


        await expect(
          service.publishEvent(
            "test.topic",
            {}
          )
        )
          .rejects
          .toMatchObject({
            code:
              "QUEUE_PUBLISH_SATURATED",

            retryable:
              true,

            executionAuthorized:
              false,
          });


        expect(
          service
            .channel
            .publish
        )
          .not
          .toHaveBeenCalled();
      }
    );


    test(
      "normal publish succeeds below saturation",
      async () => {
        const service =
          createQueue();


        const result =
          await service
            .publishEvent(
              "test.topic",
              {
                ok:
                  true,
              }
            );


        expect(
          result
        )
          .toMatchObject({
            topic:
              "test.topic",

            backpressured:
              false,

            executionAuthorized:
              false,
          });


        expect(
          service.inFlightPublishes
        )
          .toBe(
            0
          );
      }
    );


    test(
      "publish false waits for drain instead of republishing event",
      async () => {
        const service =
          createQueue();


        service
          .channel
          .publish
          .mockReturnValue(
            false
          );


        service
          .channel
          .once
          .mockImplementation(
            (
              event,
              callback
            ) => {
              expect(
                event
              )
                .toBe(
                  "drain"
                );

              callback();
            }
          );


        const result =
          await service
            .publishEvent(
              "test.topic",
              {}
            );


        expect(
          service
            .channel
            .publish
        )
          .toHaveBeenCalledTimes(
            1
          );


        expect(
          result.backpressured
        )
          .toBe(
            true
          );


        expect(
          service.publisherBlocked
        )
          .toBe(
            false
          );
      }
    );


    test(
      "active publisher backpressure rejects new publishes",
      async () => {
        const service =
          createQueue();


        service.publisherBlocked =
          true;

        service.publisherBlockedUntil =
          Date.now() +
          5000;


        await expect(
          service.publishEvent(
            "test.topic",
            {}
          )
        )
          .rejects
          .toMatchObject({
            code:
              "QUEUE_PUBLISH_BACKPRESSURE_ACTIVE",

            retryable:
              true,

            executionAuthorized:
              false,
          });


        expect(
          service
            .channel
            .publish
        )
          .not
          .toHaveBeenCalled();
      }
    );


    test(
      "consumer prefetch is capped by global maximum",
      async () => {
        const service =
          createQueue({
            maxConsumerPrefetch:
              10,
          });


        await service.consumeEvents(
          "test.topic",
          "test.queue",
          async () => {},
          {
            prefetch:
              9999,
          }
        );


        expect(
          service
            .channel
            .prefetch
        )
          .toHaveBeenCalledWith(
            10
          );
      }
    );


    test(
      "load status exposes saturation and backpressure telemetry",
      () => {
        const service =
          createQueue({
            maxInFlightPublishes:
              5,
          });


        service.inFlightPublishes =
          5;

        service.backpressureEvents =
          3;

        service.saturationRejects =
          2;


        const status =
          service
            .getLoadStatus();


        expect(
          status
        )
          .toMatchObject({
            inFlightPublishes:
              5,

            maxInFlightPublishes:
              5,

            saturated:
              true,

            backpressureEvents:
              3,

            saturationRejects:
              2,

            executionAuthorized:
              false,
          });
      }
    );
  }
);