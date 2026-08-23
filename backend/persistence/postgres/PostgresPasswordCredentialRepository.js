"use strict";

const PasswordCredentialRepository = require("../repositories/PasswordCredentialRepository");
const Base = require("./PostgresIdentityRepositoryBase");

class PostgresPasswordCredentialRepository extends PasswordCredentialRepository {
  constructor(options = {}) {
    super();
    this.repository = new Base(options, {
      table: "identity.password_credentials",
      columns: ["legacy_mongo_id", "user_id", "password_hash", "algorithm", "hash_version", "password_changed_at", "failed_attempts", "locked_until", "last_failed_at", "created_at", "updated_at"],
      hiddenColumns: ["password_hash"],
      secretOptions: { password_hash: "includePasswordHash" },
      foreignKeyColumns: { user_id: "identity.users" },
      identifierColumns: ["legacy_mongo_id", "id::text"],
    });
  }
  findOne(...args) { return this.repository.findOne(...args); }
  findById(id, ...args) { return this.repository.findOne({ _id: id }, ...args); }
  create(...args) { return this.repository.create(...args); }
  updateOne(...args) { return this.repository.updateOne(...args); }
  updateMany(...args) { return this.repository.updateMany(...args); }
  save(...args) { return this.repository.save(...args); }
}

module.exports = PostgresPasswordCredentialRepository;
