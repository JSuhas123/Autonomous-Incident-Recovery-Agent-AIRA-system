"use strict";

require("dotenv").config();

const axios =
  require("axios");

const crypto =
  require("node:crypto");

const {
  userRepository,
  passwordCredentialRepository,
  organizationMembershipRepository,
  persistenceTransactionManager,
} =
  require(
    "../persistence/repositories"
  );

const {
  hashPassword,
} =
  require(
    "../services/identity/passwordService"
  );

const {
  requestPasswordReset,
} =
  require(
    "../services/identity/passwordResetService"
  );

const {
  requestEmailVerification,
} =
  require(
    "../services/identity/emailVerificationService"
  );

const {
  getPostgresPool,
  closePostgresPool,
} =
  require(
    "../persistence/postgres/postgresPool"
  );


const BASE_URL =
  String(
    process.env
      .AIRA_API_URL ||
      "http://127.0.0.1:5000"
  ).replace(
    /\/$/,
    ""
  );


const SANDBOX_OWNER_EMAIL =
  "owner@aira-sandbox.local";


const TEST_EMAIL =
  `phase25-cert-${Date.now()}@aira-sandbox.local`;


const PASSWORD_1 =
  "Phase25Cert@2026!";

const PASSWORD_2 =
  "Phase25Reset@2026!";

const PASSWORD_3 =
  "Phase25Final@2026!";


let temporaryUserId =
  null;


const checks =
  [];


function record(
  ok,
  name,
  detail =
    null
) {
  checks.push({
    ok,
    name,
    detail,
  });

  console.log(
    `${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`
  );

  if (!ok) {
    throw new Error(
      `Certification failed: ${name}${detail ? ` — ${detail}` : ""}`
    );
  }
}


function assertNoAuthority(
  body,
  name
) {
  record(
    body?.executionAuthorized !==
      true,

    `${name}: execution authority not granted`
  );
}


function tokenFromUrl(
  value
) {
  if (!value) {
    return null;
  }

  try {
    return new URL(
      value
    ).searchParams.get(
      "token"
    );
  } catch {
    return null;
  }
}


class BrowserSession {
  constructor() {
    this.cookies =
      new Map();

    this.csrfToken =
      null;
  }


  cookieHeader() {
    return Array.from(
      this.cookies.entries()
    )
      .map(
        (
          [
            key,
            value,
          ]
        ) =>
          `${key}=${value}`
      )
      .join(
        "; "
      );
  }


  captureCookies(
    response
  ) {
    const values =
      response.headers[
        "set-cookie"
      ];

    if (!values) {
      return;
    }

    const list =
      Array.isArray(
        values
      )
        ? values
        : [
            values,
          ];

    for (
      const raw
      of list
    ) {
      const pair =
        String(
          raw
        )
          .split(
            ";"
          )[0];

      const separator =
        pair.indexOf(
          "="
        );

      if (
        separator <=
        0
      ) {
        continue;
      }

      const name =
        pair.slice(
          0,
          separator
        );

      const value =
        pair.slice(
          separator +
            1
        );

      if (!value) {
        this.cookies.delete(
          name
        );
      } else {
        this.cookies.set(
          name,
          value
        );
      }
    }
  }


  async request(
    method,
    path,
    {
      data =
        undefined,

      csrf =
        false,

      origin =
        "http://localhost:5173",
    } = {}
  ) {
    const headers = {
      "User-Agent":
        "AIRA-PHASE25-2H-CERTIFICATION",
    };

    const cookie =
      this.cookieHeader();

    if (cookie) {
      headers.Cookie =
        cookie;
    }

    if (origin) {
      headers.Origin =
        origin;
    }

    if (
      csrf &&
      this.csrfToken
    ) {
      headers[
        "X-CSRF-Token"
      ] =
        this.csrfToken;
    }

    const response =
      await axios({
        method,

        url:
          `${BASE_URL}${path}`,

        data,

        headers,

        validateStatus:
          () => true,
      });

    this.captureCookies(
      response
    );

    if (
      response.data
        ?.csrfToken
    ) {
      this.csrfToken =
        response.data
          .csrfToken;
    }

    return response;
  }
}


async function createTemporarySandboxUser() {
  const owner =
    await userRepository
      .findOne({
        normalizedEmail:
          SANDBOX_OWNER_EMAIL,
      });

  if (
    !owner ||
    !owner.primaryOrganizationId
  ) {
    throw new Error(
      "AIRA Labs Sandbox owner is missing"
    );
  }

  const existing =
    await userRepository
      .findOne({
        normalizedEmail:
          TEST_EMAIL.toLowerCase(),
      });

  if (existing) {
    throw new Error(
      "Temporary certification user unexpectedly already exists"
    );
  }

  const passwordHash =
    await hashPassword(
      PASSWORD_1
    );

  const created =
    await persistenceTransactionManager
      .run(
        async (
          transaction
        ) => {
          const user =
            await userRepository
              .create(
                {
                  fullName:
                    "AIRA Phase 25.2H Certification User",

                  email:
                    TEST_EMAIL,

                  normalizedEmail:
                    TEST_EMAIL.toLowerCase(),

                  status:
                    "active",

                  emailVerifiedAt:
                    null,

                  primaryOrganizationId:
                    owner.primaryOrganizationId,

                  metadata: {
                    phase:
                      "25.2H",

                    temporaryCertificationUser:
                      true,

                    executionAuthorized:
                      false,
                  },
                },
                transaction
              );

          await passwordCredentialRepository
            .create(
              {
                userId:
                  user._id,

                passwordHash,

                algorithm:
                  "argon2id",

                hashVersion:
                  1,

                passwordChangedAt:
                  new Date(),
              },
              transaction
            );

          await organizationMembershipRepository
            .create(
              {
                _id:
                  crypto.randomUUID(),

                userId:
                  user._id,

                organizationId:
                  owner.primaryOrganizationId,

                role:
                  "developer",

                status:
                  "active",

                projectIds:
                  [],

                invitedByUserId:
                  owner._id,

                joinedAt:
                  new Date(),

                metadata: {
                  phase:
                    "25.2H",

                  temporaryCertificationUser:
                    true,
                },
              },
              transaction
            );

          return user;
        }
      );

  temporaryUserId =
    created._id;

  return created;
}


async function cleanupTemporaryUser() {
  if (
    !temporaryUserId
  ) {
    return;
  }

  const pool =
    getPostgresPool();

  const userResult =
    await pool.query(
      `
      SELECT id
      FROM identity.users
      WHERE
        public_id = $1
        OR legacy_mongo_id = $1
        OR id::text = $1
      LIMIT 1
      `,
      [
        String(
          temporaryUserId
        ),
      ]
    );

  if (
    !userResult.rows[0]
  ) {
    return;
  }

  const internalId =
    userResult.rows[0].id;

  const client =
    await pool.connect();

  try {
    await client.query(
      "BEGIN"
    );

    await client.query(
      `
      DELETE FROM identity.password_reset_tokens
      WHERE user_id = $1
      `,
      [
        internalId,
      ]
    );

    await client.query(
      `
      DELETE FROM identity.email_verification_tokens
      WHERE user_id = $1
      `,
      [
        internalId,
      ]
    );

    await client.query(
      `
      DELETE FROM identity.user_sessions
      WHERE user_id = $1
      `,
      [
        internalId,
      ]
    );

    await client.query(
      `
      DELETE FROM identity.password_credentials
      WHERE user_id = $1
      `,
      [
        internalId,
      ]
    );

    await client.query(
      `
      DELETE FROM identity.organization_memberships
      WHERE user_id = $1
      `,
      [
        internalId,
      ]
    );

    /*
     * Authentication audit evidence remains append-only.
     *
     * FK user_id becomes NULL automatically.
     */
    await client.query(
      `
      DELETE FROM identity.users
      WHERE id = $1
      `,
      [
        internalId,
      ]
    );

    await client.query(
      "COMMIT"
    );
  } catch (
    error
  ) {
    try {
      await client.query(
        "ROLLBACK"
      );
    } catch {
      // Ignore.
    }

    throw error;
  } finally {
    client.release();
  }
}


async function main() {
  if (
    String(
      process.env.NODE_ENV ||
      "development"
    )
      .trim()
      .toLowerCase() ===
    "production"
  ) {
    throw new Error(
      "Phase 25.2H live certification must run against development/lab"
    );
  }

  console.log(
    "=============================================================="
  );

  console.log(
    "AIRA PHASE 25.2H — AUTHENTICATION LIVE CERTIFICATION"
  );

  console.log(
    "=============================================================="
  );

  console.log(
    `API: ${BASE_URL}`
  );

  console.log(
    `Temporary user: ${TEST_EMAIL}`
  );

  console.log(
    "Production authority: NONE"
  );

  console.log(
    "Execution authority: NONE"
  );

  console.log(
    ""
  );


  /*
   * ------------------------------------------------------------------------
   * SERVER HEALTH / ANONYMOUS SESSION
   * ------------------------------------------------------------------------
   */

  const anonymous =
    new BrowserSession();

  const anonymousSession =
    await anonymous.request(
      "GET",
      "/api/v1/auth/session"
    );

  record(
    anonymousSession.status ===
      401,

    "anonymous protected session denied",

    `HTTP ${anonymousSession.status}`
  );


  /*
   * ------------------------------------------------------------------------
   * TEMPORARY REAL SANDBOX IDENTITY
   * ------------------------------------------------------------------------
   */

  await createTemporarySandboxUser();

  record(
    true,
    "temporary sandbox certification identity created"
  );


  /*
   * ------------------------------------------------------------------------
   * ENUMERATION RESISTANCE — UNKNOWN EMAIL
   * ------------------------------------------------------------------------
   */

  const unknownEmail =
    `does-not-exist-${Date.now()}@aira-sandbox.local`;

  const unknownVerification =
    await anonymous.request(
      "POST",
      "/api/v1/auth/email-verification/request",
      {
        data: {
          email:
            unknownEmail,
        },
      }
    );

  record(
    unknownVerification.status ===
      202,

    "unknown-email verification request remains generic",

    `HTTP ${unknownVerification.status}`
  );

  record(
    !unknownVerification
      .data
      ?.developmentVerificationUrl,

    "unknown-email verification does not expose token"
  );

  assertNoAuthority(
    unknownVerification.data,
    "unknown-email verification"
  );


  const unknownReset =
    await anonymous.request(
      "POST",
      "/api/v1/auth/forgot-password",
      {
        data: {
          email:
            unknownEmail,
        },
      }
    );

  record(
    unknownReset.status ===
      202,

    "unknown-email password recovery remains generic",

    `HTTP ${unknownReset.status}`
  );

  record(
    !unknownReset
      .data
      ?.developmentResetUrl,

    "unknown-email recovery does not expose token"
  );

  assertNoAuthority(
    unknownReset.data,
    "unknown-email recovery"
  );


  /*
   * ------------------------------------------------------------------------
   * EMAIL VERIFICATION — CONCURRENT ONE-TIME TOKEN
   * ------------------------------------------------------------------------
   */

  const verificationRequest =
    await anonymous.request(
      "POST",
      "/api/v1/auth/email-verification/request",
      {
        data: {
          email:
            TEST_EMAIL,
        },
      }
    );

  record(
    verificationRequest.status ===
      202,

    "verification request accepted"
  );

  const verificationToken =
    tokenFromUrl(
      verificationRequest
        .data
        ?.developmentVerificationUrl
    );

  record(
    Boolean(
      verificationToken
    ),

    "development verification token available in non-production"
  );

  const concurrentVerification =
    await Promise.all(
      [
        anonymous.request(
          "POST",
          "/api/v1/auth/email-verification/verify",
          {
            data: {
              token:
                verificationToken,
            },
          }
        ),

        anonymous.request(
          "POST",
          "/api/v1/auth/email-verification/verify",
          {
            data: {
              token:
                verificationToken,
            },
          }
        ),
      ]
    );

  const verificationSuccesses =
    concurrentVerification
      .filter(
        (
          response
        ) =>
          response.status ===
          200
      );

  const verificationFailures =
    concurrentVerification
      .filter(
        (
          response
        ) =>
          response.status ===
          400
      );

  record(
    verificationSuccesses.length ===
      1 &&
      verificationFailures.length ===
        1,

    "email verification token has exactly one concurrent winner"
  );

  assertNoAuthority(
    verificationSuccesses[0]
      .data,

    "email verification"
  );


  const verificationReplay =
    await anonymous.request(
      "POST",
      "/api/v1/auth/email-verification/verify",
      {
        data: {
          token:
            verificationToken,
        },
      }
    );

  record(
    verificationReplay.status ===
      400,

    "verification replay rejected"
  );


  /*
   * ------------------------------------------------------------------------
   * LOGIN / SESSION
   * ------------------------------------------------------------------------
   */

  const browser =
    new BrowserSession();

  const login =
    await browser.request(
      "POST",
      "/api/v1/auth/login",
      {
        data: {
          email:
            TEST_EMAIL,

          password:
            PASSWORD_1,

          rememberMe:
            false,
        },
      }
    );

  record(
    login.status ===
      200,

    "valid login succeeds",

    `HTTP ${login.status}`
  );

  record(
    login.data
      ?.membership
      ?.role ===
      "developer",

    "canonical developer role restored from backend"
  );

  assertNoAuthority(
    login.data,
    "login"
  );


  const authenticatedSession =
    await browser.request(
      "GET",
      "/api/v1/auth/session"
    );

  record(
    authenticatedSession.status ===
      200 &&
      authenticatedSession
        .data
        ?.authenticated ===
        true,

    "authenticated session bootstrap succeeds"
  );


  /*
   * ------------------------------------------------------------------------
   * CSRF
   * ------------------------------------------------------------------------
   */

  const missingCsrf =
    await browser.request(
      "POST",
      "/api/v1/auth/logout",
      {
        csrf:
          false,
      }
    );

  record(
    missingCsrf.status ===
      403 &&
      missingCsrf.data
        ?.code ===
        "CSRF_MISSING_TOKEN",

    "cookie mutation without CSRF rejected"
  );


  const invalidOrigin =
    await browser.request(
      "POST",
      "/api/v1/auth/logout",
      {
        csrf:
          true,

        origin:
          "https://evil.example",
      }
    );

  record(
    invalidOrigin.status ===
      403 &&
      invalidOrigin.data
        ?.code ===
        "CSRF_INVALID_ORIGIN",

    "unexpected mutation origin rejected"
  );


  /*
   * ------------------------------------------------------------------------
   * SESSION OWNERSHIP
   * ------------------------------------------------------------------------
   */

  const sessions =
    await browser.request(
      "GET",
      "/api/v1/auth/sessions"
    );

  record(
    sessions.status ===
      200 &&
      Array.isArray(
        sessions.data
          ?.sessions
      ),

    "user can list own sessions"
  );

  assertNoAuthority(
    sessions.data,
    "session listing"
  );


  const foreignSession =
    await browser.request(
      "DELETE",
      `/api/v1/auth/sessions/${crypto.randomUUID()}`,
      {
        csrf:
          true,
      }
    );

  record(
    foreignSession.status ===
      404,

    "unknown/foreign session identifier does not reveal ownership"
  );


  /*
   * ------------------------------------------------------------------------
   * PASSWORD RESET — CONCURRENT ONE-TIME TOKEN
   * ------------------------------------------------------------------------
   */

  const resetRequest =
    await anonymous.request(
      "POST",
      "/api/v1/auth/forgot-password",
      {
        data: {
          email:
            TEST_EMAIL,
        },
      }
    );

  record(
    resetRequest.status ===
      202,

    "password reset request accepted"
  );

  const resetToken =
    tokenFromUrl(
      resetRequest
        .data
        ?.developmentResetUrl
    );

  record(
    Boolean(
      resetToken
    ),

    "development reset token available in non-production"
  );


  const concurrentReset =
    await Promise.all(
      [
        anonymous.request(
          "POST",
          "/api/v1/auth/reset-password",
          {
            data: {
              token:
                resetToken,

              password:
                PASSWORD_2,
            },
          }
        ),

        anonymous.request(
          "POST",
          "/api/v1/auth/reset-password",
          {
            data: {
              token:
                resetToken,

              password:
                PASSWORD_2,
            },
          }
        ),
      ]
    );

  const resetSuccesses =
    concurrentReset.filter(
      (
        response
      ) =>
        response.status ===
        200
    );

  const resetFailures =
    concurrentReset.filter(
      (
        response
      ) =>
        response.status ===
        400
    );

  record(
    resetSuccesses.length ===
      1 &&
      resetFailures.length ===
        1,

    "password reset token has exactly one concurrent winner"
  );

  assertNoAuthority(
    resetSuccesses[0]
      .data,

    "password reset"
  );


  const staleSession =
    await browser.request(
      "GET",
      "/api/v1/auth/session"
    );

  record(
    staleSession.status ===
      401,

    "password reset revokes pre-existing browser session"
  );


  const resetReplay =
    await anonymous.request(
      "POST",
      "/api/v1/auth/reset-password",
      {
        data: {
          token:
            resetToken,

          password:
            PASSWORD_2,
        },
      }
    );

  record(
    resetReplay.status ===
      400,

    "password-reset replay rejected"
  );


  /*
   * ------------------------------------------------------------------------
   * OLD PASSWORD FAILS / NEW PASSWORD WORKS
   * ------------------------------------------------------------------------
   */

  const oldPasswordBrowser =
    new BrowserSession();

  const oldPasswordLogin =
    await oldPasswordBrowser.request(
      "POST",
      "/api/v1/auth/login",
      {
        data: {
          email:
            TEST_EMAIL,

          password:
            PASSWORD_1,
        },
      }
    );

  record(
    oldPasswordLogin.status ===
      401,

    "old password rejected after reset",

    `HTTP ${oldPasswordLogin.status}`
  );


  const resetBrowser =
    new BrowserSession();

  const newPasswordLogin =
    await resetBrowser.request(
      "POST",
      "/api/v1/auth/login",
      {
        data: {
          email:
            TEST_EMAIL,

          password:
            PASSWORD_2,
        },
      }
    );

  record(
    newPasswordLogin.status ===
      200,

    "new password accepted after reset"
  );


  /*
   * ------------------------------------------------------------------------
   * AUTHENTICATED PASSWORD CHANGE
   * ------------------------------------------------------------------------
   */

  const changePassword =
    await resetBrowser.request(
      "POST",
      "/api/v1/auth/change-password",
      {
        csrf:
          true,

        data: {
          currentPassword:
            PASSWORD_2,

          newPassword:
            PASSWORD_3,
        },
      }
    );

  record(
    changePassword.status ===
      200 &&
      changePassword
        .data
        ?.changed ===
        true,

    "authenticated password change succeeds"
  );

  assertNoAuthority(
    changePassword.data,
    "password change"
  );


  /*
   * ------------------------------------------------------------------------
   * SECURITY HISTORY
   * ------------------------------------------------------------------------
   */

  const events =
    await resetBrowser.request(
      "GET",
      "/api/v1/auth/security-events"
    );

  record(
    events.status ===
      200 &&
      Array.isArray(
        events.data
          ?.events
      ),

    "security event history available"
  );

  assertNoAuthority(
    events.data,
    "security history"
  );


  /*
   * ------------------------------------------------------------------------
   * PRODUCTION TOKEN NON-DISCLOSURE — SERVICE CONTRACT
   * ------------------------------------------------------------------------
   *
   * Temporarily flip NODE_ENV only for direct service-contract evaluation.
   *
   * The live HTTP server remains development mode.
   */

  const previousNodeEnv =
    process.env.NODE_ENV;

  process.env.NODE_ENV =
    "production";

  try {
    const productionReset =
      await requestPasswordReset(
        {
          email:
            TEST_EMAIL,
        }
      );

    record(
      !productionReset
        .developmentResetUrl,

      "production password-reset contract does not expose bearer token"
    );

    assertNoAuthority(
      productionReset,
      "production reset request"
    );


    const productionVerification =
      await requestEmailVerification(
        {
          email:
            TEST_EMAIL,
        }
      );

    record(
      !productionVerification
        .developmentVerificationUrl,

      "production verification contract does not expose bearer token"
    );

    assertNoAuthority(
      productionVerification,
      "production verification request"
    );
  } finally {
    process.env.NODE_ENV =
      previousNodeEnv;
  }


  /*
   * ------------------------------------------------------------------------
   * FINAL PASSWORD LOGIN
   * ------------------------------------------------------------------------
   */

  const finalBrowser =
    new BrowserSession();

  const finalLogin =
    await finalBrowser.request(
      "POST",
      "/api/v1/auth/login",
      {
        data: {
          email:
            TEST_EMAIL,

          password:
            PASSWORD_3,
        },
      }
    );

  record(
    finalLogin.status ===
      200,

    "final changed password authenticates"
  );


  /*
   * ------------------------------------------------------------------------
   * LOGOUT ALL
   * ------------------------------------------------------------------------
   */

  const logoutAll =
    await finalBrowser.request(
      "POST",
      "/api/v1/auth/logout-all",
      {
        csrf:
          true,
      }
    );

  record(
    logoutAll.status ===
      204,

    "logout-all succeeds with valid CSRF"
  );


  const afterLogoutAll =
    await finalBrowser.request(
      "GET",
      "/api/v1/auth/session"
    );

  record(
    afterLogoutAll.status ===
      401,

    "revoked session denied after logout-all"
  );


  /*
   * ------------------------------------------------------------------------
   * FINAL RESULT
   * ------------------------------------------------------------------------
   */

  console.log(
    ""
  );

  console.log(
    "--------------------------------------------------------------"
  );

  console.log(
    "PHASE 25.2H CERTIFICATION RESULT"
  );

  console.log(
    "--------------------------------------------------------------"
  );

  console.log(
    `Checks: ${checks.length}`
  );

  console.log(
    `Passed: ${checks.filter((check) => check.ok).length}`
  );

  console.log(
    "Capability != certification != authorization"
  );

  console.log(
    "Authentication != execution authority"
  );

  console.log(
    "Email verification != execution authority"
  );

  console.log(
    "Password reset != execution authority"
  );

  console.log(
    "Product persona != backend permission"
  );

  console.log(
    "Production unrestricted autonomy: prohibited"
  );

  console.log(
    "executionAuthorized=false"
  );

  console.log(
    ""
  );

  console.log(
    "PASS — PHASE 25.2 AUTHENTICATION CERTIFIED"
  );
}


main()
  .catch(
    (
      error
    ) => {
      console.error(
        ""
      );

      console.error(
        "[phase25.2H] FAILED:",
        {
          code:
            error.code ||
            null,

          message:
            error.message,
        }
      );

      process.exitCode =
        1;
    }
  )
  .finally(
    async () => {
      try {
        await cleanupTemporaryUser();
      } catch (
        error
      ) {
        console.error(
          "[phase25.2H] Temporary-user cleanup failed:",
          error.message
        );

        process.exitCode =
          1;
      }

      try {
        await closePostgresPool();
      } catch {
        // Nothing further.
      }
    }
  );