"use strict";

const crypto =
  require(
    "node:crypto"
  );

const {
  getPostgresPool,
} =
  require(
    "../postgres/postgresPool"
  );

class MigrationLock {
  constructor(
    options = {}
  ) {
    this.pool =
      options.pool ||
      null;
  }

  getPool() {
    return (
      this.pool ||
      getPostgresPool()
    );
  }

  createKey({
    organizationId,
    environmentId,
    domain,
  }) {
    const identity =
      [
        String(
          organizationId ||
          ""
        ),

        String(
          environmentId ||
          ""
        ),

        String(
          domain ||
          ""
        ),
      ]
        .join(
          "::"
        );

    const digest =
      crypto
        .createHash(
          "sha256"
        )
        .update(
          identity
        )
        .digest();

    /*
     * PostgreSQL advisory locks accept signed BIGINT.
     */
    return digest
      .readBigInt64BE(
        0
      );
  }

  async acquire(
    identity
  ) {
    const client =
      await this
        .getPool()
        .connect();

    const key =
      this.createKey(
        identity
      );

    try {
      const result =
        await client.query(
          `
            SELECT pg_try_advisory_lock(
              $1::bigint
            ) AS acquired
          `,
          [
            key.toString(),
          ]
        );

      const acquired =
        result.rows[0]
          ?.acquired ===
        true;

      if (
        !acquired
      ) {
        client.release();

        throw Object.assign(
          new Error(
            `Migration domain is already locked: ${identity.domain}`
          ),
          {
            code:
              "MIGRATION_DOMAIN_LOCKED",

            domain:
              identity.domain,
          }
        );
      }

      return {
        client,
        key,
      };
    } catch (
      error
    ) {
      if (
        !error ||
        error.code !==
          "MIGRATION_DOMAIN_LOCKED"
      ) {
        client.release();
      }

      throw error;
    }
  }

  async release(
    lock
  ) {
    if (
      !lock?.client
    ) {
      return;
    }

    try {
      await lock
        .client
        .query(
          `
            SELECT pg_advisory_unlock(
              $1::bigint
            )
          `,
          [
            lock.key
              .toString(),
          ]
        );
    } finally {
      lock.client
        .release();
    }
  }

  async run(
    identity,
    work
  ) {
    const lock =
      await this.acquire(
        identity
      );

    try {
      return await work();
    } finally {
      await this.release(
        lock
      );
    }
  }
}

module.exports =
  MigrationLock;