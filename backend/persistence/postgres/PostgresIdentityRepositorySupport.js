"use strict";

const { getPostgresPool } = require("./postgresPool");
const { translatePostgresError } = require("./postgresDomainMapper");

class PostgresIdentityRepositorySupport {
  constructor(options = {}) {
    this.pool = options.pool || null;
  }

  async run(transaction, work) {
    if (transaction?.kind === "postgres") {
      return work(transaction.client);
    }

    const client = await (this.pool || getPostgresPool()).connect();
    try {
      return await work(client);
    } finally {
      client.release();
    }
  }

  async query(transaction, text, values = []) {
    return this.run(transaction, async (client) => {
      try {
        return await client.query(text, values);
      } catch (error) {
        throw translatePostgresError(error);
      }
    });
  }

  static identifier(value) {
    if (value === null || value === undefined) return null;
    if (typeof value.toHexString === "function") return value.toHexString();
    return String(value);
  }

  static where(filter = {}, columns = {}, identifierColumns = ["public_id", "legacy_mongo_id", "id::text"]) {
    const clauses = [];
    const values = [];
    let index = 1;

    for (const [key, column] of Object.entries(columns)) {
      if (filter[key] !== undefined) {
        clauses.push(`${column} = $${index++}`);
        values.push(filter[key]);
      }
    }

    const identifier = filter._id ?? filter.id ?? filter.publicId ?? filter.legacyMongoId;
    if (identifier !== undefined) {
      const identifierClauses = identifierColumns
        .map((column) => `${column} = $${index}`)
        .join(" OR ");
      clauses.push(`(${identifierClauses})`);
      values.push(PostgresIdentityRepositorySupport.identifier(identifier));
    }

    return {
      text: clauses.length ? clauses.join(" AND ") : "TRUE",
      values,
    };
  }
}

module.exports = PostgresIdentityRepositorySupport;
