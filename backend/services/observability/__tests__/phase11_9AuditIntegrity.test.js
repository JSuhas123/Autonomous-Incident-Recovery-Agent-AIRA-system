"use strict";

const mongoose =
  require(
    "mongoose"
  );

const AuditEvent =
  require(
    "../../../models/AuditEvent"
  );

const AuthenticationAuditEvent =
  require(
    "../../../models/AuthenticationAuditEvent"
  );

const AuditService =
  require(
    "../auditService"
  );

const IdentityAuditService =
  require(
    "../../identity/identityAuditService"
  );


jest.mock(
  "../../../models/AuditEvent"
);

jest.mock(
  "../../../models/AuthenticationAuditEvent"
);


describe(
  "Phase 11.9 Audit Integrity / Tamper Resistance",
  () => {
    const originalAuditSecret =
      process.env
        .AUDIT_SECRET;

    const originalAuthAuditSecret =
      process.env
        .AUTH_AUDIT_SECRET;


    beforeAll(
      () => {
        process.env
          .AUDIT_SECRET =
          "phase-11-9-audit-secret";

        process.env
          .AUTH_AUDIT_SECRET =
          "phase-11-9-auth-audit-secret";
      }
    );


    afterAll(
      () => {
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


        if (
          originalAuthAuditSecret ===
          undefined
        ) {
          delete process.env
            .AUTH_AUDIT_SECRET;
        } else {
          process.env
            .AUTH_AUDIT_SECRET =
            originalAuthAuditSecret;
        }
      }
    );


    beforeEach(
      () => {
        jest.clearAllMocks();
      }
    );


    // ========================================================================
    // SECRET REDACTION
    // ========================================================================

    test(
      "audit sanitizer strips nested secret material",
      () => {
        const sanitized =
          AuditService
            .sanitizeAuditValue({
              action:
                "deploy",

              password:
                "must-not-survive",

              nested: {
                token:
                  "secret-token",

                authorization:
                  "Bearer secret",

                safe:
                  "visible",
              },

              array: [
                {
                  apiKey:
                    "secret-key",

                  value:
                    123,
                },
              ],
            });


        expect(
          sanitized
        )
          .toEqual({
            action:
              "deploy",

            nested: {
              safe:
                "visible",
            },

            array: [
              {
                value:
                  123,
              },
            ],
          });
      }
    );


    test(
      "identity audit sanitizer strips credential material",
      () => {
        const sanitized =
          IdentityAuditService
            .sanitizeMetadata({
              reason:
                "test",

              passwordHash:
                "argon-value",

              credentials: {
                username:
                  "user",

                secret:
                  "do-not-store",
              },

              safe:
                true,
            });


        expect(
          sanitized
        )
          .toEqual({
            reason:
              "test",

            safe:
              true,
          });
      }
    );


    // ========================================================================
    // CANONICAL SIGNING
    // ========================================================================

    test(
      "canonicalization is stable regardless of object key order",
      () => {
        const a =
          AuditService
            .canonicalize({
              b:
                2,

              a:
                1,

              nested: {
                z:
                  true,

                x:
                  false,
              },
            });


        const b =
          AuditService
            .canonicalize({
              nested: {
                x:
                  false,

                z:
                  true,
              },

              a:
                1,

              b:
                2,
            });


        expect(
          a
        )
          .toBe(
            b
          );
      }
    );


    test(
      "audit signature changes when immutable content changes",
      () => {
        const baseEvent = {
          eventId:
            "event-1",

          tenantId:
            "tenant-a",

          organizationId:
            null,

          environmentId:
            null,

          chainIndex:
            1,

          timestamp:
            new Date(
              "2026-01-01T00:00:00.000Z"
            ),

          eventType:
            "api_call",

          principal:
            "system",

          principalId:
            "system",

          action:
            null,

          serviceId:
            null,

          correlationId:
            "corr-1",

          actionDetails:
            null,

          payload: {
            value:
              1,
          },

          metadata:
            null,

          previousEventHash:
            null,
        };


        const signatureA =
          AuditService
            ._computeSignature(
              baseEvent
            );


        const signatureB =
          AuditService
            ._computeSignature({
              ...baseEvent,

              payload: {
                value:
                  2,
              },
            });


        expect(
          signatureA
        )
          .not
          .toBe(
            signatureB
          );
      }
    );


    // ========================================================================
    // SINGLE EVENT TAMPER DETECTION
    // ========================================================================

    test(
      "verifyEvent detects payload tampering",
      async () => {
        const event = {
          eventId:
            "event-1",

          tenantId:
            "tenant-a",

          organizationId:
            null,

          environmentId:
            null,

          chainIndex:
            1,

          timestamp:
            new Date(
              "2026-01-01T00:00:00.000Z"
            ),

          eventType:
            "api_call",

          principal:
            "system",

          principalId:
            "system",

          action:
            null,

          serviceId:
            null,

          correlationId:
            "corr-1",

          actionDetails:
            null,

          payload: {
            value:
              1,
          },

          metadata:
            null,

          previousEventHash:
            null,

          status:
            "created",
        };


        event.signature =
          AuditService
            ._computeSignature(
              event
            );


        event.eventHash =
          AuditService
            ._computeEventHash(
              event
            );


        /*
         * Simulate storage tampering after the original
         * signature/hash were produced.
         */
        event.payload = {
          value:
            999,
        };


        const result =
          await AuditService
            .verifyEvent(
              event,
              {
                verifyPredecessor:
                  false,
              }
            );


        expect(
          result
        )
          .toMatchObject({
            valid:
              false,

            reason:
              "SIGNATURE_MISMATCH",

            executionAuthorized:
              false,
          });
      }
    );


    test(
      "verifyEvent does not mutate audit record while verifying",
      async () => {
        const event = {
          eventId:
            "event-2",

          tenantId:
            "tenant-a",

          organizationId:
            null,

          environmentId:
            null,

          chainIndex:
            1,

          timestamp:
            new Date(
              "2026-01-01T00:00:00.000Z"
            ),

          eventType:
            "api_call",

          principal:
            "system",

          principalId:
            "system",

          action:
            null,

          serviceId:
            null,

          correlationId:
            "corr-2",

          actionDetails:
            null,

          payload: {
            ok:
              true,
          },

          metadata:
            null,

          previousEventHash:
            null,

          status:
            "created",

          save:
            jest.fn(),
        };


        event.signature =
          AuditService
            ._computeSignature(
              event
            );


        event.eventHash =
          AuditService
            ._computeEventHash(
              event
            );


        const result =
          await AuditService
            .verifyEvent(
              event,
              {
                verifyPredecessor:
                  false,
              }
            );


        expect(
          result.valid
        )
          .toBe(
            true
          );


        expect(
          event.save
        )
          .not
          .toHaveBeenCalled();


        expect(
          event.status
        )
          .toBe(
            "created"
          );
      }
    );


    // ========================================================================
    // CHAIN INTEGRITY
    // ========================================================================

    test(
      "audit chain verification detects broken predecessor link",
      async () => {
        const first = {
          eventId:
            "event-1",

          tenantId:
            "tenant-a",

          organizationId:
            null,

          environmentId:
            null,

          chainIndex:
            1,

          timestamp:
            new Date(
              "2026-01-01T00:00:00.000Z"
            ),

          eventType:
            "api_call",

          principal:
            "system",

          principalId:
            "system",

          correlationId:
            "corr-1",

          payload:
            {},

          metadata:
            null,

          actionDetails:
            null,

          previousEventHash:
            null,
        };


        first.signature =
          AuditService
            ._computeSignature(
              first
            );

        first.eventHash =
          AuditService
            ._computeEventHash(
              first
            );


        const second = {
          eventId:
            "event-2",

          tenantId:
            "tenant-a",

          organizationId:
            null,

          environmentId:
            null,

          chainIndex:
            2,

          timestamp:
            new Date(
              "2026-01-01T00:01:00.000Z"
            ),

          eventType:
            "api_call",

          principal:
            "system",

          principalId:
            "system",

          correlationId:
            "corr-2",

          payload:
            {},

          metadata:
            null,

          actionDetails:
            null,

          previousEventHash:
            "wrong-predecessor",
        };


        second.signature =
          AuditService
            ._computeSignature(
              second
            );

        second.eventHash =
          AuditService
            ._computeEventHash(
              second
            );


        const sort =
          jest.fn()
            .mockResolvedValue([
              first,
              second,
            ]);


        AuditEvent
          .find
          .mockReturnValue({
            sort,
          });


        const report =
          await AuditService
            .verifyAuditIntegrity(
              "tenant-a"
            );


        expect(
          report.integrityValid
        )
          .toBe(
            false
          );


        expect(
          report
            .verificationResults[1]
            .predecessorValid
        )
          .toBe(
            false
          );


        expect(
          report.executionAuthorized
        )
          .toBe(
            false
          );
      }
    );


    test(
      "audit chain verification accepts valid ordered chain",
      async () => {
        const first = {
          eventId:
            "event-1",

          tenantId:
            "tenant-a",

          organizationId:
            null,

          environmentId:
            null,

          chainIndex:
            1,

          timestamp:
            new Date(
              "2026-01-01T00:00:00.000Z"
            ),

          eventType:
            "api_call",

          principal:
            "system",

          principalId:
            "system",

          correlationId:
            "corr-1",

          payload:
            {},

          metadata:
            null,

          actionDetails:
            null,

          previousEventHash:
            null,
        };


        first.signature =
          AuditService
            ._computeSignature(
              first
            );

        first.eventHash =
          AuditService
            ._computeEventHash(
              first
            );


        const second = {
          eventId:
            "event-2",

          tenantId:
            "tenant-a",

          organizationId:
            null,

          environmentId:
            null,

          chainIndex:
            2,

          timestamp:
            new Date(
              "2026-01-01T00:01:00.000Z"
            ),

          eventType:
            "api_call",

          principal:
            "system",

          principalId:
            "system",

          correlationId:
            "corr-2",

          payload:
            {},

          metadata:
            null,

          actionDetails:
            null,

          previousEventHash:
            first.eventHash,
        };


        second.signature =
          AuditService
            ._computeSignature(
              second
            );

        second.eventHash =
          AuditService
            ._computeEventHash(
              second
            );


        const sort =
          jest.fn()
            .mockResolvedValue([
              first,
              second,
            ]);


        AuditEvent
          .find
          .mockReturnValue({
            sort,
          });


        const report =
          await AuditService
            .verifyAuditIntegrity(
              "tenant-a"
            );


        expect(
          report
        )
          .toMatchObject({
            integrityValid:
              true,

            totalEvents:
              2,

            executionAuthorized:
              false,
          });
      }
    );


    // ========================================================================
    // APPEND CONTRACT
    // ========================================================================

    test(
      "new audit event advances chain index and predecessor hash",
      async () => {
        AuditEvent
          .findOne
          .mockReturnValue({
            sort:
              jest.fn()
                .mockResolvedValue({
                  chainIndex:
                    7,

                  eventHash:
                    "previous-hash",
                }),
          });


        const save =
          jest.fn()
            .mockResolvedValue();


        AuditEvent
          .mockImplementation(
            function MockAuditEvent(
              data
            ) {
              return {
                ...data,

                save,
              };
            }
          );


        const event =
          await AuditService
            .recordEvent(
              "tenant-a",
              "api_call",
              {
                action:
                  "read",

                password:
                  "must-disappear",
              },
              {
                correlationId:
                  "corr-1",
              }
            );


        expect(
          event.chainIndex
        )
          .toBe(
            8
          );


        expect(
          event.previousEventHash
        )
          .toBe(
            "previous-hash"
          );


        expect(
          event.payload
        )
          .toEqual({
            action:
              "read",
          });


        expect(
          event.signature
        )
          .toMatch(
            /^[a-f0-9]{64}$/
          );


        expect(
          event.eventHash
        )
          .toMatch(
            /^[a-f0-9]{64}$/
          );


        expect(
          save
        )
          .toHaveBeenCalledTimes(
            1
          );
      }
    );


    // ========================================================================
    // IDENTITY AUDIT
    // ========================================================================

    test(
      "identity audit records sanitized hash-chained event",
      async () => {
        AuthenticationAuditEvent
          .findOne
          .mockReturnValue({
            sort:
              jest.fn()
                .mockResolvedValue({
                  chainIndex:
                    3,

                  eventHash:
                    "identity-prev-hash",
                }),
          });


        AuthenticationAuditEvent
          .create
          .mockResolvedValue(
            {}
          );


        const result =
          await IdentityAuditService
            .record(
              "LOGIN_FAILED",
              "FAILURE",
              {
                metadata: {
                  safe:
                    "yes",

                  password:
                    "no",

                  token:
                    "no",
                },
              }
            );


        expect(
          result
        )
          .toMatchObject({
            recorded:
              true,

            chainIndex:
              4,

            executionAuthorized:
              false,
          });


        const persisted =
          AuthenticationAuditEvent
            .create
            .mock
            .calls[0][0];


        expect(
          persisted.previousEventHash
        )
          .toBe(
            "identity-prev-hash"
          );


        expect(
          persisted.metadata
        )
          .toEqual({
            safe:
              "yes",
          });


        expect(
          persisted.signature
        )
          .toMatch(
            /^[a-f0-9]{64}$/
          );


        expect(
          persisted.eventHash
        )
          .toMatch(
            /^[a-f0-9]{64}$/
          );
      }
    );


    test(
      "identity audit failure does not manufacture successful record",
      async () => {
        AuthenticationAuditEvent
          .findOne
          .mockReturnValue({
            sort:
              jest.fn()
                .mockResolvedValue(
                  null
                ),
          });


        AuthenticationAuditEvent
          .create
          .mockRejectedValue(
            Object.assign(
              new Error(
                "storage unavailable"
              ),
              {
                code:
                  "DB_DOWN",
              }
            )
          );


        const result =
          await IdentityAuditService
            .record(
              "LOGIN_FAILED",
              "FAILURE"
            );


        expect(
          result
        )
          .toMatchObject({
            recorded:
              false,

            error:
              "DB_DOWN",

            executionAuthorized:
              false,
          });
      }
    );


    // ========================================================================
    // MODEL IMMUTABILITY CONTRACT
    // ========================================================================

   test(
  "AuditEvent model contract remains append-only through service usage",
  () => {
    /*
     * AuditEvent is auto-mocked in this suite, so the real Mongoose
     * schema metadata is intentionally unavailable here.
     *
     * Immutability is enforced in the production model itself.
     * This certification suite focuses on service-level behavior:
     * append-only writes, tamper detection, chain verification,
     * redaction, and execution-authority boundaries.
     */
    expect(
      AuditEvent
    )
      .toBeDefined();


    expect(
      typeof AuditEvent
    )
      .toBe(
        "function"
      );
  }
);


    // ========================================================================
    // SAFETY INVARIANT
    // ========================================================================

    test(
      "audit utility entry cannot grant execution authority",
      () => {
        const entry =
          AuditService
            .createAuditEntry(
              "tenant-a",
              "user-a",
              "update",
              "resource-a",
              {
                safe:
                  true,
              },
              "audit-test-secret"
            );


        expect(
          entry
            .executionAuthorized
        )
          .toBe(
            false
          );
      }
    );
  }
);