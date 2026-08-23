"use strict";

const UserSessionRepository = require("../repositories/UserSessionRepository");
const Base = require("./PostgresIdentityRepositoryBase");

class PostgresUserSessionRepository extends UserSessionRepository {
  constructor(options = {}) {
    super();
    this.repository = new Base(options, {
      table: "identity.user_sessions",
      columns: ["public_id", "legacy_mongo_id", "user_id", "active_organization_id", "token_hash", "status", "last_activity_at", "idle_expires_at", "absolute_expires_at", "revoked_at", "revocation_reason", "ip_hash", "user_agent_hash", "device_id", "device_label", "authentication_methods", "assurance_level", "remember_me", "csrf_secret", "metadata", "created_at", "updated_at"],
      jsonColumns: ["authentication_methods", "metadata"],
      hiddenColumns: ["token_hash", "ip_hash", "user_agent_hash", "csrf_secret"],
      secretOptions: {
        token_hash: "includeTokenHash",
        csrf_secret: "includeCsrfSecret",
        ip_hash: "includeNetworkHashes",
        user_agent_hash: "includeNetworkHashes",
      },
      foreignKeyColumns: {
        user_id: "identity.users",
        active_organization_id: "tenancy.organizations",
      },
    });
  }
  findOne(...args) { return this.repository.findOne(...args); }
  findById(id, ...args) { return this.repository.findOne({ _id: id }, ...args); }
  findMany(...args) { return this.repository.findMany(...args); }
  create(...args) { return this.repository.create(...args); }
  updateOne(...args) { return this.repository.updateOne(...args); }
  updateMany(...args) { return this.repository.updateMany(...args); }
  save(...args) { return this.repository.save(...args); }
  deleteMany(filter = {}, options = {}, transaction = null) {
    if (options?.kind === "postgres" || options?.client) {
      transaction = options;
    }
    return this.repository.buildFilter(filter, transaction).then((where) =>
      this.repository.support.query(transaction, `DELETE FROM identity.user_sessions WHERE ${where.text}`, where.values)
    );
  }
}

module.exports = PostgresUserSessionRepository;
