"use strict";


const {
  LiveTenantIsolationProbe,
  PROBE_VERSION,
} =
  require(
    "../../services/reliability/chaos/liveTenantIsolationProbe"
  );


describe(
  "Phase 21.10C live tenant isolation probe",

  () => {
    test(
      "probe remains explicitly non-authorizing",

      () => {
        expect(
          PROBE_VERSION
        )
          .toBe(
            "21.10C-live-v3"
          );
      }
    );


    test(
      "same scope cannot be used for isolation test",

      async () => {
        const scope = {
          tenantId:
            "tenant-a",

          organizationId:
            "org-a",

          environmentId:
            "env-a",
        };


        const probe =
          new LiveTenantIsolationProbe({
            scope: {
              run:
                jest.fn(),
            },
          });


        await expect(
          probe.verifyPostgresRlsIsolation(
            scope,
            scope
          )
        )
          .rejects
          .toMatchObject({
            code:
              "PHASE21_DISTINCT_TENANT_SCOPES_REQUIRED",

            executionAuthorized:
              false,
          });
      }
    );


    test(
      "idempotency requires explicit tenant scope",

      async () => {
        const probe =
          new LiveTenantIsolationProbe({
            idempotencyService: {
              recordRequest:
                jest.fn(),

              getCachedResult:
                jest.fn(),
            },
          });


        await expect(
          probe.verifyIdempotencyIsolation(
            {},
            {}
          )
        )
          .rejects
          .toMatchObject({
            code:
              "PHASE21_TENANT_SCOPE_REQUIRED",
          });
      }
    );


    test(
      "same idempotency key remains tenant isolated",

      async () => {
        const store =
          new Map();


        const service = {
          async recordRequest(
            tenantId,
            key,
            operation,
            value
          ) {
            store.set(
              `${tenantId}:${key}:${operation}`,
              value
            );


            return true;
          },


          async getCachedResult(
            tenantId,
            key,
            operation
          ) {
            return (
              store.get(
                `${tenantId}:${key}:${operation}`
              ) ||
              null
            );
          },
        };


        const probe =
          new LiveTenantIsolationProbe({
            idempotencyService:
              service,
          });


        const left = {
          tenantId:
            "tenant-left",

          organizationId:
            "org-left",

          environmentId:
            "env-left",
        };


        const right = {
          tenantId:
            "tenant-right",

          organizationId:
            "org-right",

          environmentId:
            "env-right",
        };


        const result =
          await probe
            .verifyIdempotencyIsolation(
              left,
              right
            );


        expect(
          result.pass
        )
          .toBe(
            true
          );


        expect(
          result.rightBeforeWriteOwner
        )
          .toBeNull();


        expect(
          result.leftReadOwner
        )
          .toBe(
            "tenant-left"
          );


        expect(
          result.rightReadOwner
        )
          .toBe(
            "tenant-right"
          );


        expect(
          result.executionAuthorized
        )
          .toBe(
            false
          );
      }
    );


    test(
      "RabbitMQ publish envelopes remain distinct",

      async () => {
        let index =
          0;


        const queueService = {
          async publishEvent(
            _topic,
            _payload,
            options
          ) {
            index +=
              1;


            return {
              eventId:
                `event-${index}`,

              correlationId:
                options.correlationId,

              executionAuthorized:
                false,
            };
          },
        };


        const probe =
          new LiveTenantIsolationProbe({
            queueService,
          });


        const result =
          await probe
            .verifyRabbitMqEnvelopeIsolation(
              {
                tenantId:
                  "tenant-a",

                organizationId:
                  "org-a",

                environmentId:
                  "env-a",
              },

              {
                tenantId:
                  "tenant-b",

                organizationId:
                  "org-b",

                environmentId:
                  "env-b",
              }
            );


        expect(
          result.pass
        )
          .toBe(
            true
          );


        expect(
          result.distinctEvents
        )
          .toBe(
            true
          );


        expect(
          result.distinctCorrelations
        )
          .toBe(
            true
          );


        expect(
          result.executionAuthorized
        )
          .toBe(
            false
          );
      }
    );
  }
);