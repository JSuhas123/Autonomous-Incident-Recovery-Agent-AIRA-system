"use strict";

const CircuitBreakerService =
  require(
    "../circuitBreakerService"
  );


describe(
  "Canonical CircuitBreakerService",
  () => {
    test(
      "opens after consecutive threshold failures",
      async () => {
        const breaker =
          new CircuitBreakerService(
            "api",
            {
              failureThreshold:
                2,
            }
          );

        for (
          let index =
            0;
          index <
            2;
          index++
        ) {
          await expect(
            breaker.execute(
              async () => {
                throw new Error(
                  "down"
                );
              }
            )
          )
            .rejects
            .toThrow(
              "down"
            );
        }

        expect(
          breaker
            .getState()
            .state
        )
          .toBe(
            "OPEN"
          );
      }
    );


    test(
      "open circuit fails fast without calling dependency",
      async () => {
        const breaker =
          new CircuitBreakerService(
            "api",
            {
              failureThreshold:
                1,

              timeout:
                60000,
            }
          );

        await expect(
          breaker.execute(
            async () => {
              throw new Error(
                "first failure"
              );
            }
          )
        )
          .rejects
          .toThrow(
            "first failure"
          );

        const dependency =
          jest.fn(
            async () =>
              "should-not-run"
          );

        await expect(
          breaker.execute(
            dependency
          )
        )
          .rejects
          .toMatchObject({
            code:
              "DEPENDENCY_CIRCUIT_OPEN",

            state:
              "OPEN",
          });

        expect(
          dependency
        )
          .not
          .toHaveBeenCalled();
      }
    );


    test(
      "half-open probe closes recovered circuit",
      async () => {
        let now =
          1000;

        const breaker =
          new CircuitBreakerService(
            "api",
            {
              failureThreshold:
                1,

              successThreshold:
                1,

              timeout:
                100,

              now:
                () =>
                  now,
            }
          );

        await expect(
          breaker.execute(
            async () => {
              throw new Error(
                "down"
              );
            }
          )
        )
          .rejects
          .toThrow();

        expect(
          breaker
            .getState()
            .state
        )
          .toBe(
            "OPEN"
          );

        now =
          1101;

        const result =
          await breaker
            .execute(
              async () =>
                "recovered"
            );

        expect(
          result
        )
          .toBe(
            "recovered"
          );

        expect(
          breaker
            .getState()
            .state
        )
          .toBe(
            "CLOSED"
          );
      }
    );


    test(
      "half-open failure immediately reopens",
      async () => {
        let now =
          1000;

        const breaker =
          new CircuitBreakerService(
            "api",
            {
              failureThreshold:
                1,

              timeout:
                100,

              now:
                () =>
                  now,
            }
          );

        await expect(
          breaker.execute(
            async () => {
              throw new Error(
                "down"
              );
            }
          )
        )
          .rejects
          .toThrow();

        now =
          1101;

        await expect(
          breaker.execute(
            async () => {
              throw new Error(
                "still-down"
              );
            }
          )
        )
          .rejects
          .toThrow(
            "still-down"
          );

        expect(
          breaker
            .getState()
            .state
        )
          .toBe(
            "OPEN"
          );
      }
    );


    test(
      "failure classifier can ignore caller errors",
      async () => {
        const breaker =
          new CircuitBreakerService(
            "api",
            {
              failureThreshold:
                1,

              shouldCountFailure:
                (
                  error
                ) =>
                  error.code !==
                  "VALIDATION_ERROR",
            }
          );

        await expect(
          breaker.execute(
            async () => {
              throw Object.assign(
                new Error(
                  "bad request"
                ),
                {
                  code:
                    "VALIDATION_ERROR",
                }
              );
            }
          )
        )
          .rejects
          .toThrow(
            "bad request"
          );

        expect(
          breaker
            .getState()
            .state
        )
          .toBe(
            "CLOSED"
          );
      }
    );
  }
);