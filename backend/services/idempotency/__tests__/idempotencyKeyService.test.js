"use strict";

const {
  IdempotencyKeyService,
  KEY_VERSION,
} =
  require(
    "../idempotencyKeyService"
  );

const {
  IDEMPOTENCY_OPERATION,
} =
  require(
    "../idempotencyContracts"
  );

function executionInput(
  overrides = {}
) {
  return {
    organizationId:
      "org-1",

    environmentId:
      "prod",

    operation:
      IDEMPOTENCY_OPERATION
        .EXECUTION,

    executionRequestId:
      "execution-1",

    executionPlanId:
      "plan-1",

    executionPlanHash:
      "hash-1",

    executionAuthorized:
      false,

    ...overrides,
  };
}

describe(
  "IdempotencyKeyService",
  () => {
    test(
      "same execution identity generates same key",
      () => {
        const service =
          new IdempotencyKeyService();

        const first =
          service.generate(
            executionInput()
          );

        const second =
          service.generate(
            executionInput()
          );

        expect(
          first.idempotencyKey
        )
          .toBe(
            second.idempotencyKey
          );
      }
    );

    test(
      "execution key includes version",
      () => {
        const service =
          new IdempotencyKeyService();

        const result =
          service.generate(
            executionInput()
          );

        expect(
          result.idempotencyKey
        )
          .toMatch(
            new RegExp(
              `^idem_${KEY_VERSION}_[a-f0-9]{64}$`
            )
          );
      }
    );

    test(
      "different execution plan hash produces different key",
      () => {
        const service =
          new IdempotencyKeyService();

        const first =
          service.generate(
            executionInput()
          );

        const second =
          service.generate(
            executionInput({
              executionPlanHash:
                "hash-2",
            })
          );

        expect(
          first.idempotencyKey
        )
          .not
          .toBe(
            second.idempotencyKey
          );
      }
    );

    test(
      "different tenant produces different key",
      () => {
        const service =
          new IdempotencyKeyService();

        const first =
          service.generate(
            executionInput()
          );

        const second =
          service.generate(
            executionInput({
              organizationId:
                "org-2",
            })
          );

        expect(
          first.idempotencyKey
        )
          .not
          .toBe(
            second.idempotencyKey
          );
      }
    );

    test(
      "different environment produces different key",
      () => {
        const service =
          new IdempotencyKeyService();

        const first =
          service.generate(
            executionInput()
          );

        const second =
          service.generate(
            executionInput({
              environmentId:
                "staging",
            })
          );

        expect(
          first.idempotencyKey
        )
          .not
          .toBe(
            second.idempotencyKey
          );
      }
    );

    test(
      "recovery decision identity is deterministic",
      () => {
        const service =
          new IdempotencyKeyService();

        const input = {
          organizationId:
            "org-1",

          environmentId:
            "prod",

          operation:
            IDEMPOTENCY_OPERATION
              .RECOVERY_DECISION,

          incidentId:
            "incident-1",

          diagnosisId:
            "diagnosis-1",

          diagnosisRevision:
            4,
        };

        expect(
          service
            .generate(
              input
            )
            .idempotencyKey
        )
          .toBe(
            service
              .generate(
                input
              )
              .idempotencyKey
          );
      }
    );

    test(
      "verification identity uses verification plan hash",
      () => {
        const service =
          new IdempotencyKeyService();

        const first =
          service.generate({
            organizationId:
              "org-1",

            environmentId:
              "prod",

            operation:
              IDEMPOTENCY_OPERATION
                .VERIFICATION,

            executionRequestId:
              "execution-1",

            verificationPlanId:
              "verify-plan-1",

            verificationPlanHash:
              "verify-hash-1",
          });

        const second =
          service.generate({
            organizationId:
              "org-1",

            environmentId:
              "prod",

            operation:
              IDEMPOTENCY_OPERATION
                .VERIFICATION,

            executionRequestId:
              "execution-1",

            verificationPlanId:
              "verify-plan-1",

            verificationPlanHash:
              "verify-hash-2",
          });

        expect(
          first.idempotencyKey
        )
          .not
          .toBe(
            second.idempotencyKey
          );
      }
    );

    test(
      "lifecycle intent participates in identity",
      () => {
        const service =
          new IdempotencyKeyService();

        const base = {
          organizationId:
            "org-1",

          environmentId:
            "prod",

          operation:
            IDEMPOTENCY_OPERATION
              .LIFECYCLE,

          incidentId:
            "incident-1",

          verificationId:
            "verification-1",
        };

        const first =
          service.generate({
            ...base,

            lifecycleIntent:
              "BEGIN_STABILITY",
          });

        const second =
          service.generate({
            ...base,

            lifecycleIntent:
              "CLOSE_INCIDENT",
          });

        expect(
          first.idempotencyKey
        )
          .not
          .toBe(
            second.idempotencyKey
          );
      }
    );

    test(
      "queue event identity uses event id",
      () => {
        const service =
          new IdempotencyKeyService();

        const result =
          service.generate({
            organizationId:
              "org-1",

            environmentId:
              "prod",

            operation:
              IDEMPOTENCY_OPERATION
                .QUEUE_EVENT,

            eventId:
              "event-123",

            eventType:
              "verification.requested",
          });

        expect(
          result.idempotencyKey
        )
          .toMatch(
            /^idem_v1_/
          );
      }
    );

    test(
      "webhook identity includes provider",
      () => {
        const service =
          new IdempotencyKeyService();

        const first =
          service.generate({
            organizationId:
              "org-1",

            environmentId:
              "prod",

            operation:
              IDEMPOTENCY_OPERATION
                .WEBHOOK,

            provider:
              "datadog",

            webhookEventId:
              "evt-1",
          });

        const second =
          service.generate({
            organizationId:
              "org-1",

            environmentId:
              "prod",

            operation:
              IDEMPOTENCY_OPERATION
                .WEBHOOK,

            provider:
              "prometheus",

            webhookEventId:
              "evt-1",
          });

        expect(
          first.idempotencyKey
        )
          .not
          .toBe(
            second.idempotencyKey
          );
      }
    );

    test(
      "fingerprint is deterministic regardless of object property order",
      () => {
        const service =
          new IdempotencyKeyService();

        const first =
          service.fingerprint({
            b:
              2,

            a:
              1,

            nested: {
              y:
                true,

              x:
                "value",
            },
          });

        const second =
          service.fingerprint({
            nested: {
              x:
                "value",

              y:
                true,
            },

            a:
              1,

            b:
              2,
          });

        expect(
          first
        )
          .toBe(
            second
          );
      }
    );

    test(
      "materially different payload produces different fingerprint",
      () => {
        const service =
          new IdempotencyKeyService();

        const first =
          service.fingerprint({
            replicas:
              3,
          });

        const second =
          service.fingerprint({
            replicas:
              4,
          });

        expect(
          first
        )
          .not
          .toBe(
            second
          );
      }
    );

    test(
      "requires operation-specific execution fields",
      () => {
        const service =
          new IdempotencyKeyService();

        expect(
          () =>
            service.generate(
              executionInput({
                executionPlanHash:
                  null,
              })
            )
        )
          .toThrow(
            "executionPlanHash"
          );
      }
    );

    test(
      "requires tenant and environment scope",
      () => {
        const service =
          new IdempotencyKeyService();

        expect(
          () =>
            service.generate(
              executionInput({
                organizationId:
                  null,
              })
            )
        )
          .toThrow(
            "organization and environment scope"
          );
      }
    );

    test(
      "rejects invalid operation",
      () => {
        const service =
          new IdempotencyKeyService();

        expect(
          () =>
            service.generate({
              organizationId:
                "org-1",

              environmentId:
                "prod",

              operation:
                "RAW_COMMAND",
            })
        )
          .toThrow(
            "Invalid idempotency operation"
          );
      }
    );

    test(
      "never authorizes execution",
      () => {
        const service =
          new IdempotencyKeyService();

        const result =
          service.generate(
            executionInput()
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
      "rejects execution authorization input",
      () => {
        const service =
          new IdempotencyKeyService();

        expect(
          () =>
            service.generate(
              executionInput({
                executionAuthorized:
                  true,
              })
            )
        )
          .toThrow(
            "cannot authorize execution"
          );
      }
    );
  }
);