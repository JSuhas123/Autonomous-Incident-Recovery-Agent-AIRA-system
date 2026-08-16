"use strict";

const crypto =
  require(
    "crypto"
  );


// ============================================================================
// ENVIRONMENT
// ============================================================================

const ORIGINAL_ENV = {
  NODE_ENV:
    process.env.NODE_ENV,

  SESSION_FINGERPRINT_KEY:
    process.env
      .SESSION_FINGERPRINT_KEY,

  INTEGRATION_SECRET_KEY:
    process.env
      .INTEGRATION_SECRET_KEY,
};


process.env.NODE_ENV =
  "test";

process.env
  .SESSION_FINGERPRINT_KEY =
  "phase-11-8-test-fingerprint-key";

process.env
  .INTEGRATION_SECRET_KEY =
  "phase-11-8-test-integration-secret-key";


// ============================================================================
// SESSION MODEL MOCK
// ============================================================================

jest.mock(
  "../../../models/UserSession",
  () => ({
    create:
      jest.fn(),

    findOne:
      jest.fn(),

    updateOne:
      jest.fn(),

    updateMany:
      jest.fn(),
  })
);


// ============================================================================
// CSRF MOCK
// ============================================================================

jest.mock(
  "../csrfHelper",
  () => ({
    attachCsrfSecret:
      jest.fn(
        async () =>
          "csrf-test-token"
      ),
  })
);


const UserSession =
  require(
    "../../../models/UserSession"
  );


const {
  createSession,
  hashToken,
  hashIp,
  hashUserAgent,
  buildCookieOptions,
} =
  require(
    "../sessionService"
  );


const {
  encryptSecret,
  decryptSecret,
  isEncryptedSecret,
  maskSecret,
} =
  require(
    "../../integrations/secretStorage"
  );


describe(
  "Phase 11.8 Credential Boundary Certification",
  () => {
    beforeEach(
      () => {
        jest
          .clearAllMocks();

        process.env
          .SESSION_FINGERPRINT_KEY =
          "phase-11-8-test-fingerprint-key";

        process.env
          .INTEGRATION_SECRET_KEY =
          "phase-11-8-test-integration-secret-key";
      }
    );


    afterAll(
      () => {
        if (
          ORIGINAL_ENV.NODE_ENV ===
          undefined
        ) {
          delete process.env
            .NODE_ENV;
        } else {
          process.env.NODE_ENV =
            ORIGINAL_ENV.NODE_ENV;
        }


        if (
          ORIGINAL_ENV
            .SESSION_FINGERPRINT_KEY ===
          undefined
        ) {
          delete process.env
            .SESSION_FINGERPRINT_KEY;
        } else {
          process.env
            .SESSION_FINGERPRINT_KEY =
            ORIGINAL_ENV
              .SESSION_FINGERPRINT_KEY;
        }


        if (
          ORIGINAL_ENV
            .INTEGRATION_SECRET_KEY ===
          undefined
        ) {
          delete process.env
            .INTEGRATION_SECRET_KEY;
        } else {
          process.env
            .INTEGRATION_SECRET_KEY =
            ORIGINAL_ENV
              .INTEGRATION_SECRET_KEY;
        }
      }
    );


    // ========================================================================
    // SESSION TOKEN STORAGE
    // ========================================================================

    test(
      "session creation persists only token hash and never raw token",
      async () => {
        UserSession
          .create
          .mockImplementation(
            async (
              payload
            ) => ({
              _id:
                "session-1",

              ...payload,
            })
          );


        const result =
          await createSession({
            userId:
              "user-1",

            organizationId:
              "org-1",

            ip:
              "127.0.0.1",

            userAgent:
              "jest-agent",
          });


        expect(
          result.rawToken
        )
          .toEqual(
            expect.any(
              String
            )
          );


        expect(
          result.rawToken
        )
          .toHaveLength(
            64
          );


        const persisted =
          UserSession
            .create
            .mock
            .calls[0][0];


        expect(
          persisted.tokenHash
        )
          .toBe(
            hashToken(
              result.rawToken
            )
          );


        expect(
          persisted.tokenHash
        )
          .not
          .toBe(
            result.rawToken
          );


        expect(
          persisted
        )
          .not
          .toHaveProperty(
            "rawToken"
          );


        expect(
          persisted
        )
          .not
          .toHaveProperty(
            "sessionToken"
          );


        expect(
          result.executionAuthorized
        )
          .toBe(
            false
          );
      }
    );


    // ========================================================================
    // TOKEN HASHING
    // ========================================================================

    test(
      "session token hashing is deterministic but irreversible storage boundary",
      () => {
        const token =
          crypto
            .randomBytes(
              32
            )
            .toString(
              "hex"
            );


        const first =
          hashToken(
            token
          );

        const second =
          hashToken(
            token
          );


        expect(
          first
        )
          .toBe(
            second
          );


        expect(
          first
        )
          .not
          .toBe(
            token
          );


        expect(
          first
        )
          .toMatch(
            /^[a-f0-9]{64}$/
          );
      }
    );


    // ========================================================================
    // PRIVACY-SENSITIVE FINGERPRINTS
    // ========================================================================

    test(
      "IP addresses are stored as keyed fingerprints",
      () => {
        const ip =
          "203.0.113.10";


        const result =
          hashIp(
            ip
          );


        expect(
          result
        )
          .not
          .toBe(
            ip
          );


        expect(
          result
        )
          .toMatch(
            /^[a-f0-9]{64}$/
          );


        expect(
          result
        )
          .toBe(
            hashIp(
              ip
            )
          );
      }
    );


    test(
      "user agents are stored as keyed fingerprints",
      () => {
        const userAgent =
          "Mozilla/5.0 Phase11.8";


        const result =
          hashUserAgent(
            userAgent
          );


        expect(
          result
        )
          .not
          .toBe(
            userAgent
          );


        expect(
          result
        )
          .toMatch(
            /^[a-f0-9]{64}$/
          );
      }
    );


    test(
      "changing fingerprint key changes resulting fingerprint",
      () => {
        const ip =
          "198.51.100.20";


        process.env
          .SESSION_FINGERPRINT_KEY =
          "fingerprint-key-one";


        const first =
          hashIp(
            ip
          );


        process.env
          .SESSION_FINGERPRINT_KEY =
          "fingerprint-key-two";


        const second =
          hashIp(
            ip
          );


        expect(
          first
        )
          .not
          .toBe(
            second
          );
      }
    );


    // ========================================================================
    // INTEGRATION SECRET ENCRYPTION
    // ========================================================================

    test(
      "integration secret is encrypted at rest",
      () => {
        const plaintext =
          "super-secret-api-token";


        const encrypted =
          encryptSecret(
            plaintext
          );


        expect(
          encrypted
        )
          .not
          .toBe(
            plaintext
          );


        expect(
          encrypted
        )
          .not
          .toContain(
            plaintext
          );


        expect(
          isEncryptedSecret(
            encrypted
          )
        )
          .toBe(
            true
          );


        expect(
          decryptSecret(
            encrypted
          )
        )
          .toBe(
            plaintext
          );
      }
    );


    test(
      "same integration secret encrypts differently each time",
      () => {
        const plaintext =
          "same-secret";


        const first =
          encryptSecret(
            plaintext
          );


        const second =
          encryptSecret(
            plaintext
          );


        /*
         * AES-GCM uses a fresh random IV.
         */
        expect(
          first
        )
          .not
          .toBe(
            second
          );


        expect(
          decryptSecret(
            first
          )
        )
          .toBe(
            plaintext
          );


        expect(
          decryptSecret(
            second
          )
        )
          .toBe(
            plaintext
          );
      }
    );


    test(
      "tampered encrypted integration secret fails closed",
      () => {
        const encrypted =
          encryptSecret(
            "production-secret"
          );


        const lastCharacter =
          encrypted.slice(
            -1
          );


        const replacement =
          lastCharacter ===
          "A"
            ? "B"
            : "A";


        const tampered =
          encrypted.slice(
            0,
            -1
          ) +
          replacement;


        expect(
          () =>
            decryptSecret(
              tampered
            )
        )
          .toThrow(
            "Unable to decrypt integration secret"
          );
      }
    );


    // ========================================================================
    // SECRET MASKING
    // ========================================================================

    test(
      "secret masking never returns complete plaintext",
      () => {
        const secret =
          "abcd-super-secret-value";


        const masked =
          maskSecret(
            secret
          );


        expect(
          masked
        )
          .not
          .toBe(
            secret
          );


        expect(
          masked
        )
          .toMatch(
            /^abcd\*+$/
          );
      }
    );


    // ========================================================================
    // COOKIE SECURITY
    // ========================================================================

    test(
      "production session cookie policy is hardened",
      () => {
        const previous =
          process.env
            .NODE_ENV;


        process.env.NODE_ENV =
          "production";


        const options =
          buildCookieOptions(
            60000
          );


        expect(
          options
        )
          .toMatchObject({
            httpOnly:
              true,

            secure:
              true,

            sameSite:
              "none",

            path:
              "/",

            maxAge:
              60000,
          });


        expect(
          options
        )
          .not
          .toHaveProperty(
            "domain"
          );


        process.env.NODE_ENV =
          previous;
      }
    );


    // ========================================================================
    // EXECUTION AUTHORITY
    // ========================================================================

    test(
      "credential boundary never grants infrastructure execution authority",
      async () => {
        UserSession
          .create
          .mockImplementation(
            async (
              payload
            ) => ({
              _id:
                "session-2",

              ...payload,
            })
          );


        const result =
          await createSession({
            userId:
              "user-2",
          });


        expect(
          result
            .executionAuthorized
        )
          .toBe(
            false
          );
      }
    );
  }
);