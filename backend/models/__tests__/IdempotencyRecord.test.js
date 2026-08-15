"use strict";

const mongoose =
  require(
    "mongoose"
  );

const IdempotencyRecord =
  require(
    "../IdempotencyRecord"
  );

const {
  IDEMPOTENCY_STATUS,
  IDEMPOTENCY_OPERATION,
} =
  require(
    "../../services/idempotency/idempotencyContracts"
  );

describe(
  "IdempotencyRecord Model",
  () => {
    test(
      "exports mongoose model",
      () => {
        expect(
          IdempotencyRecord
            .modelName
        )
          .toBe(
            "IdempotencyRecord"
          );
      }
    );

    test(
      "uses dedicated collection",
      () => {
        expect(
          IdempotencyRecord
            .collection
            .collectionName
        )
          .toBe(
            "idempotency_records"
          );
      }
    );

    test(
      "defaults to PROCESSING",
      () => {
        const record =
          new IdempotencyRecord({
            organizationId:
              "org-1",

            environmentId:
              "prod",

            operation:
              IDEMPOTENCY_OPERATION
                .EXECUTION,

            idempotencyKey:
              "execution-123",
          });

        expect(
          record.status
        )
          .toBe(
            IDEMPOTENCY_STATUS
              .PROCESSING
          );
      }
    );

    test(
      "defaults counters to zero",
      () => {
        const record =
          new IdempotencyRecord({
            organizationId:
              "org-1",

            environmentId:
              "prod",

            operation:
              IDEMPOTENCY_OPERATION
                .EXECUTION,

            idempotencyKey:
              "execution-123",
          });

        expect(
          record.attemptCount
        )
          .toBe(
            0
          );

        expect(
          record.duplicateCount
        )
          .toBe(
            0
          );
      }
    );

    test(
      "does not contain execution authorization field",
      () => {
        const record =
          new IdempotencyRecord({
            organizationId:
              "org-1",

            environmentId:
              "prod",

            operation:
              IDEMPOTENCY_OPERATION
                .EXECUTION,

            idempotencyKey:
              "execution-123",
          });

        expect(
          record.executionAuthorized
        )
          .toBeUndefined();

        expect(
          record.authorizationGranted
        )
          .toBeUndefined();
      }
    );

    test(
      "rejects invalid operation",
      async () => {
        const record =
          new IdempotencyRecord({
            organizationId:
              "org-1",

            environmentId:
              "prod",

            operation:
              "RAW_COMMAND",

            idempotencyKey:
              "bad-1",
          });

        await expect(
          record.validate()
        )
          .rejects
          .toThrow();
      }
    );

    test(
      "rejects invalid status",
      async () => {
        const record =
          new IdempotencyRecord({
            organizationId:
              "org-1",

            environmentId:
              "prod",

            operation:
              IDEMPOTENCY_OPERATION
                .EXECUTION,

            idempotencyKey:
              "execution-123",

            status:
              "AUTHORIZED",
          });

        await expect(
          record.validate()
        )
          .rejects
          .toThrow();
      }
    );

    test(
      "requires organization scope",
      async () => {
        const record =
          new IdempotencyRecord({
            environmentId:
              "prod",

            operation:
              IDEMPOTENCY_OPERATION
                .EXECUTION,

            idempotencyKey:
              "execution-123",
          });

        await expect(
          record.validate()
        )
          .rejects
          .toThrow();
      }
    );

    test(
      "requires environment scope",
      async () => {
        const record =
          new IdempotencyRecord({
            organizationId:
              "org-1",

            operation:
              IDEMPOTENCY_OPERATION
                .EXECUTION,

            idempotencyKey:
              "execution-123",
          });

        await expect(
          record.validate()
        )
          .rejects
          .toThrow();
      }
    );

    test(
      "requires idempotency key",
      async () => {
        const record =
          new IdempotencyRecord({
            organizationId:
              "org-1",

            environmentId:
              "prod",

            operation:
              IDEMPOTENCY_OPERATION
                .EXECUTION,
          });

        await expect(
          record.validate()
        )
          .rejects
          .toThrow();
      }
    );

    test(
      "defines compound unique idempotency index",
      () => {
        const indexes =
          IdempotencyRecord
            .schema
            .indexes();

        const index =
          indexes.find(
            ([fields, options]) =>
              fields.organizationId ===
                1 &&
              fields.environmentId ===
                1 &&
              fields.operation ===
                1 &&
              fields.idempotencyKey ===
                1 &&
              options.unique ===
                true
          );

        expect(
          index
        )
          .toBeDefined();

        expect(
          index[1].name
        )
          .toBe(
            "uniq_idempotency_scope_operation_key"
          );
      }
    );

    test(
      "defines stale claim lookup index",
      () => {
        const indexes =
          IdempotencyRecord
            .schema
            .indexes();

        const index =
          indexes.find(
            ([fields]) =>
              fields.status ===
                1 &&
              fields.leaseExpiresAt ===
                1
          );

        expect(
          index
        )
          .toBeDefined();
      }
    );

    test(
      "schema does not define unsafe authorization properties",
      () => {
        const paths =
          IdempotencyRecord
            .schema
            .paths;

        expect(
          paths
            .executionAuthorized
        )
          .toBeUndefined();

        expect(
          paths
            .authorizationGranted
        )
          .toBeUndefined();

        expect(
          paths
            .approved
        )
          .toBeUndefined();
      }
    );
  }
);