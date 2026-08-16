"use strict";

const {
  createRateLimitService,
} =
  require(
    "../../../middleware/rateLimitingMiddleware"
  );

const {
  QueueService,
} =
  require(
    "../queueService"
  );


describe(
  "Phase 11.6 Load Protection Certification",
  () => {
    test(
      "tenant admission is bounded independently",
      async () => {
        const limiter =
          createRateLimitService({
            defaultLimits: {
              api:
                1,
            },
          });


        await limiter
          .checkLimit(
            "tenant-a",
            "api"
          );


        const blocked =
          await limiter
            .checkLimit(
              "tenant-a",
              "api"
            );


        const otherTenant =
          await limiter
            .checkLimit(
              "tenant-b",
              "api"
            );


        expect(
          blocked
        )
          .toMatchObject({
            allowed:
              false,

            decision:
              "RATE_LIMIT",

            executionAuthorized:
              false,
          });


        expect(
          otherTenant.allowed
        )
          .toBe(
            true
          );
      }
    );


    test(
      "Redis admission failure remains bounded by local fallback",
      async () => {
        const limiter =
          createRateLimitService({
            defaultLimits: {
              api:
                1,
            },
          });


        limiter.connected =
          false;


        await limiter
          .checkLimit(
            "tenant-a",
            "api"
          );


        const blocked =
          await limiter
            .checkLimit(
              "tenant-a",
              "api"
            );


        expect(
          blocked
        )
          .toMatchObject({
            allowed:
              false,

            source:
              "local",

            degraded:
              true,

            executionAuthorized:
              false,
          });
      }
    );


    test(
      "queue saturation rejects new publishers before RabbitMQ call",
      async () => {
        const queue =
          new QueueService({
            maxInFlightPublishes:
              1,
          });


        queue.connected =
          true;


        queue.channel = {
          assertExchange:
            jest.fn(),

          publish:
            jest.fn(),
        };


        queue.inFlightPublishes =
          1;


        await expect(
          queue.publishEvent(
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
          queue
            .channel
            .publish
        )
          .not
          .toHaveBeenCalled();
      }
    );


    test(
      "queue load status cannot grant execution authority",
      () => {
        const queue =
          new QueueService({
            maxInFlightPublishes:
              5,
          });


        const status =
          queue
            .getLoadStatus();


        expect(
          status
            .executionAuthorized
        )
          .toBe(
            false
          );
      }
    );


    test(
      "admission status cannot grant execution authority",
      () => {
        const limiter =
          createRateLimitService();


        const status =
          limiter
            .getStatus();


        expect(
          status
            .executionAuthorized
        )
          .toBe(
            false
          );
      }
    );

}
);