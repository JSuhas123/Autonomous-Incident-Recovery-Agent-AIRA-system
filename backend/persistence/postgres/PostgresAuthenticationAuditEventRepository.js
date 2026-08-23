"use strict";

const Contract = require("../repositories/AuthenticationAuditEventRepository");
const Base = require("./PostgresIdentityRepositoryBase");

class PostgresAuthenticationAuditEventRepository extends Contract {
  constructor(options = {}) {
    super();
    this.repository = new Base(options, {
      table: "identity.authentication_audit_events",
      columns: ["event_id", "legacy_mongo_id", "user_id", "organization_id", "session_id", "event_type", "outcome", "reason_code", "request_id", "correlation_id", "ip_hash", "user_agent_hash", "chain_index", "previous_event_hash", "signature", "event_hash", "metadata", "created_at"],
      jsonColumns: ["metadata"],
      foreignKeyColumns: { user_id: "identity.users", organization_id: "tenancy.organizations", session_id: "identity.user_sessions" },
      identifierColumns: ["event_id", "legacy_mongo_id", "id::text"],
    });
  }
  async findLast(options = {}, transaction = null) {
    const result = await this.repository.support.query(transaction, "SELECT * FROM identity.authentication_audit_events ORDER BY chain_index DESC, created_at DESC LIMIT 1");
    return this.repository.mapRow(result.rows[0], options, transaction);
  }
  async findMany(options = {}, transaction = null) {
    const result = await this.repository.support.query(transaction, "SELECT * FROM identity.authentication_audit_events ORDER BY chain_index ASC, created_at ASC");
    return Promise.all(result.rows.map((row) => this.repository.mapRow(row, options, transaction)));
  }
  create(data, transaction = null) { return this.repository.create(data, transaction); }
  async updateOne() { throw Object.assign(new Error("Authentication audit events are append-only"), { code: "AUTH_AUDIT_EVENT_IMMUTABLE" }); }
  async deleteMany() { throw Object.assign(new Error("Authentication audit events are append-only"), { code: "AUTH_AUDIT_EVENT_IMMUTABLE" }); }
}

module.exports = PostgresAuthenticationAuditEventRepository;
