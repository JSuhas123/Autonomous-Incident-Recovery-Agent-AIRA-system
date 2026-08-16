"use strict";

const {
  createRateLimitService,
  rateLimitingMiddleware,
} =
  require(
    "../rateLimitingMiddleware"
  );


describe(
  "Phase 11.6 Rate Limiting / Admission Control",
  () => {
    test(
      "allows requests below tenant limit",
      async () => {
        const service =
          createRateLimitService({
            connected:
              false,

            defaultLimits: {
              api:
                2,
            },
          });


        const first =
          await service
            .checkLimit(
              "tenant-a",
              "api"
            );


        expect(
          first
        )
          .toMatchObject({
            allowed:
              true,

            decision:
              "ACCEPT",

            remaining:
              1,

            executionAuthorized:
              false,
          });
      }
    );


    test(
      "rejects requests above tenant limit",
      async () => {
        const service =
          createRateLimitService({
            defaultLimits: {
              api:
                2,
            },
          });


        await service.checkLimit(
          "tenant-a",
          "api"
        );

        await service.checkLimit(
          "tenant-a",
          "api"
        );


        const third =
          await service
            .checkLimit(
              "tenant-a",
              "api"
            );


        expect(
          third
        )
          .toMatchObject({
            allowed:
              false,

            decision:
              "RATE_LIMIT",

            remaining:
              0,

            executionAuthorized:
              false,
          });


        expect(
          third.retryAfterMs
        )
          .toBeGreaterThan(
            0
          );
      }
    );


    test(
      "tenant counters remain isolated",
      async () => {
        const service =
          createRateLimitService({
            defaultLimits: {
              api:
                1,
            },
          });


        await service.checkLimit(
          "tenant-a",
          "api"
        );


        const tenantA =
          await service
            .checkLimit(
              "tenant-a",
              "api"
            );


        const tenantB =
          await service
            .checkLimit(
              "tenant-b",
              "api"
            );


        expect(
          tenantA.allowed
        )
          .toBe(
            false
          );


        expect(
          tenantB.allowed
        )
          .toBe(
            true
          );
      }
    );


    test(
      "operation counters remain isolated",
      async () => {
        const service =
          createRateLimitService({
            defaultLimits: {
              action:
                1,

              policy:
                1,
            },
          });


        await service.checkLimit(
          "tenant-a",
          "action"
        );


        const action =
          await service
            .checkLimit(
              "tenant-a",
              "action"
            );


        const policy =
          await service
            .checkLimit(
              "tenant-a",
              "policy"
            );


        expect(
          action.allowed
        )
          .toBe(
            false
          );


        expect(
          policy.allowed
        )
          .toBe(
            true
          );
      }
    );


    test(
      "local fallback remains bounded when Redis is unavailable",
      async () => {
        const service =
          createRateLimitService({
            maxLocalEntries:
              2,

            defaultLimits: {
              api:
                10,
            },
          });


        await service.checkLimit(
          "tenant-a",
          "api"
        );

        await service.checkLimit(
          "tenant-b",
          "api"
        );

        await service.checkLimit(
          "tenant-c",
          "api"
        );


        expect(
          service
            .localCounters
            .size
        )
          .toBeLessThanOrEqual(
            2
          );
      }
    );


    test(
      "middleware returns 429 and Retry-After when admission is rejected",
      async () => {
        const service =
          createRateLimitService({
            defaultLimits: {
              api:
                1,
            },
          });


        await service.checkLimit(
          "tenant-a",
          "api"
        );


        const middleware =
          rateLimitingMiddleware(
            "api",
            {
              service,
            }
          );


        const req = {
          organizationId:
            "tenant-a",

          params:
            {},

          get:
            jest.fn(
              () =>
                null
            ),
        };


        const headers =
          {};


        const res = {
          set:
            jest.fn(
              (
                name,
                value
              ) => {
                headers[
                  name
                ] =
                  value;

                return res;
              }
            ),

          status:
            jest.fn(
              () =>
                res
            ),

          json:
            jest.fn(
              () =>
                res
            ),
        };


        const next =
          jest.fn();


        await middleware(
          req,
          res,
          next
        );


        expect(
          res.status
        )
          .toHaveBeenCalledWith(
            429
          );


        expect(
          headers[
            "Retry-After"
          ]
        )
          .toBeDefined();


        expect(
          next
        )
          .not
          .toHaveBeenCalled();


        expect(
          res.json
        )
          .toHaveBeenCalledWith(
            expect
              .objectContaining({
                code:
                  "RATE_LIMIT_EXCEEDED",

                executionAuthorized:
                  false,
              })
          );
      }
    );


    test(
      "client supplied x-rate-limit header cannot raise its own limit",
      async () => {
        const service =
          createRateLimitService({
            defaultLimits: {
              api:
                1,
            },
          });


        const middleware =
          rateLimitingMiddleware(
            "api",
            {
              service,
            }
          );


        const makeRequest =
          () => ({
            organizationId:
              "tenant-a",

            params:
              {},

            get:
              jest.fn(
                (
                  name
                ) => {
                  if (
                    name ===
                    "x-rate-limit"
                  ) {
                    return "999999999";
                  }

                  return null;
                }
              ),
          });


        function makeResponse() {
          const res = {
            set:
              jest.fn(
                () =>
                  res
              ),

            status:
              jest.fn(
                () =>
                  res
              ),

            json:
              jest.fn(
                () =>
                  res
              ),
          };

          return res;
        }


        const firstNext =
          jest.fn();

        await middleware(
          makeRequest(),
          makeResponse(),
          firstNext
        );


        expect(
          firstNext
        )
          .toHaveBeenCalledTimes(
            1
          );


        const secondResponse =
          makeResponse();

        const secondNext =
          jest.fn();


        await middleware(
          makeRequest(),
          secondResponse,
          secondNext
        );


        expect(
          secondResponse
            .status
        )
          .toHaveBeenCalledWith(
            429
          );


        expect(
          secondNext
        )
          .not
          .toHaveBeenCalled();
      }
    );
  }
);