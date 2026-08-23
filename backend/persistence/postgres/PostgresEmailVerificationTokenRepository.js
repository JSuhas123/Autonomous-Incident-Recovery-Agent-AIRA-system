"use strict";

const Contract = require("../repositories/EmailVerificationTokenRepository");
const Base = require("./PostgresIdentityRepositoryBase");

class PostgresEmailVerificationTokenRepository extends Contract {
  constructor(options = {}) {
    super();
    this.repository = new Base(options, {
      table: "identity.email_verification_tokens",
      columns: ["legacy_mongo_id", "user_id", "token_hash", "expires_at", "used_at", "revoked_at", "created_at"],
      hiddenColumns: ["token_hash"],
      secretOptions: { token_hash: "includeTokenHash" },
      foreignKeyColumns: { user_id: "identity.users" },
      identifierColumns: ["legacy_mongo_id", "id::text"],
    });
  }
  findOne(...args) { return this.repository.findOne(...args); }
  findMany(...args) { return this.repository.findMany(...args); }
  create(...args) { return this.repository.create(...args); }
  async updateOne() { throw Object.assign(new Error("Token records are append-only"), { code: "TOKEN_APPEND_ONLY" }); }
}

module.exports = PostgresEmailVerificationTokenRepository;
