"use strict";

require("dotenv").config();

const {
  getPostgresPool,
  closePostgresPool,
} =
  require(
    "../persistence/postgres/postgresPool"
  );

const TARGET_EMAIL =
  "suhasjanardhan10@gmail.com";


function normalizeEmail(
  value
) {
  return String(
    value || ""
  )
    .trim()
    .toLowerCase();
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
      "Development identity cleanup is prohibited in production"
    );
  }

  const confirmation =
    process.argv
      .find(
        (
          arg
        ) =>
          arg.startsWith(
            "--confirm="
          )
      )
      ?.slice(
        "--confirm=".length
      );

  if (
    normalizeEmail(
      confirmation
    ) !==
    normalizeEmail(
      TARGET_EMAIL
    )
  ) {
    throw new Error(
      `Explicit confirmation required. Run with --confirm=${TARGET_EMAIL}`
    );
  }

  const pool =
    getPostgresPool();

  const client =
    await pool.connect();

  try {
    await client.query(
      "BEGIN"
    );

    const userResult =
      await client.query(
        `
        SELECT
          id,
          public_id,
          full_name,
          email,
          normalized_email,
          status,
          primary_organization_id
        FROM identity.users
        WHERE normalized_email = LOWER($1)
        FOR UPDATE
        `,
        [
          TARGET_EMAIL,
        ]
      );

    if (
      userResult.rowCount ===
      0
    ) {
      await client.query(
        "ROLLBACK"
      );

      console.log(
        "=============================================================="
      );

      console.log(
        "AIRA DEVELOPMENT LOGIN CLEANUP"
      );

      console.log(
        "=============================================================="
      );

      console.log(
        `Target: ${TARGET_EMAIL}`
      );

      console.log(
        "Result: already absent"
      );

      console.log(
        "PASS"
      );

      return;
    }

    if (
      userResult.rowCount !==
      1
    ) {
      throw new Error(
        `Expected exactly one user, found ${userResult.rowCount}`
      );
    }

    const user =
      userResult.rows[0];

    console.log(
      "=============================================================="
    );

    console.log(
      "AIRA DEVELOPMENT LOGIN CLEANUP"
    );

    console.log(
      "=============================================================="
    );

    console.log(
      `Email: ${user.email}`
    );

    console.log(
      `User ID: ${user.id}`
    );

    console.log(
      `Public ID: ${user.public_id}`
    );

    console.log(
      `Primary organization: ${user.primary_organization_id || "NONE"}`
    );

    console.log(
      ""
    );

    /*
     * Authentication challenge material.
     */
    const resetTokens =
      await client.query(
        `
        DELETE FROM identity.password_reset_tokens
        WHERE user_id = $1
        `,
        [
          user.id,
        ]
      );

    const verificationTokens =
      await client.query(
        `
        DELETE FROM identity.email_verification_tokens
        WHERE user_id = $1
        `,
        [
          user.id,
        ]
      );

    /*
     * Browser sessions.
     */
    const sessions =
      await client.query(
        `
        DELETE FROM identity.user_sessions
        WHERE user_id = $1
        `,
        [
          user.id,
        ]
      );

    /*
     * Password credential.
     */
    const credentials =
      await client.query(
        `
        DELETE FROM identity.password_credentials
        WHERE user_id = $1
        `,
        [
          user.id,
        ]
      );

    /*
     * Organization membership.
     */
    const memberships =
      await client.query(
        `
        DELETE FROM identity.organization_memberships
        WHERE user_id = $1
        `,
        [
          user.id,
        ]
      );

    /*
     * DO NOT DELETE authentication_audit_events.
     *
     * They are append-only.
     *
     * PostgreSQL automatically sets user_id = NULL when the
     * identity record is deleted.
     */

    const deletedUser =
      await client.query(
        `
        DELETE FROM identity.users
        WHERE id = $1
        RETURNING id
        `,
        [
          user.id,
        ]
      );

    if (
      deletedUser.rowCount !==
      1
    ) {
      throw new Error(
        "User deletion did not affect exactly one row"
      );
    }

    await client.query(
      "COMMIT"
    );

    console.log(
      "Deleted:"
    );

    console.log(
      `  password reset tokens: ${resetTokens.rowCount}`
    );

    console.log(
      `  verification tokens: ${verificationTokens.rowCount}`
    );

    console.log(
      `  sessions: ${sessions.rowCount}`
    );

    console.log(
      `  password credentials: ${credentials.rowCount}`
    );

    console.log(
      `  memberships: ${memberships.rowCount}`
    );

    console.log(
      `  users: ${deletedUser.rowCount}`
    );

    console.log(
      ""
    );

    console.log(
      "Authentication audit chain: PRESERVED"
    );

    console.log(
      "Execution authority affected: NONE"
    );

    /*
     * Final certification.
     */
    const certification =
      await pool.query(
        `
        SELECT COUNT(*)::int AS count
        FROM identity.users
        WHERE normalized_email = LOWER($1)
        `,
        [
          TARGET_EMAIL,
        ]
      );

    if (
      certification.rows[0]
        .count !==
      0
    ) {
      throw new Error(
        "Cleanup certification failed: user still exists"
      );
    }

    console.log(
      ""
    );

    console.log(
      "PASS — old development login removed"
    );
  } catch (
    error
  ) {
    try {
      await client.query(
        "ROLLBACK"
      );
    } catch {
      // Ignore rollback failure during reporting.
    }

    throw error;
  } finally {
    client.release();
  }
}


main()
  .catch(
    (
      error
    ) => {
      console.error(
        "[old-login-cleanup] FAILED:",
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
        await closePostgresPool();
      } catch {
        // Nothing further to do.
      }
    }
  );