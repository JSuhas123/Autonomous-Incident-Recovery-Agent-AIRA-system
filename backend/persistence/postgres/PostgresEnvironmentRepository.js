"use strict";

const crypto = require("crypto");
const EnvironmentRepository = require("../repositories/EnvironmentRepository");
const Base = require("./PostgresIdentityRepositoryBase");

function normalizeFilter(filter = {}) {
  const result = { ...filter };
  if (result.type !== undefined) {
    result.environmentType = result.type;
    delete result.type;
  }
  return result;
}

function normalizeData(data = {}) {
  const result = { ...data };
  result._id = result._id || result.publicId || crypto.randomUUID();
  if (result.type !== undefined) {
    result.environmentType = result.type;
    delete result.type;
  }
  return result;
}

function expose(row) {
  if (!row) return row;
  const result = { ...row, type: row.environmentType };
  delete result.environmentType;
  return result;
}

class PostgresEnvironmentRepository extends EnvironmentRepository {
  constructor(options = {}) {
    super();
    this.repository = new Base(options, {
      table: "tenancy.environments",
      columns: ["public_id", "legacy_mongo_id", "organization_id", "tenant_id", "name", "environment_type", "status", "criticality", "description", "settings", "created_by_user_id", "created_by_user_legacy_id", "maintenance_reason", "maintenance_started_at", "archived_at", "archived_by_user_id", "archive_reason", "metadata", "created_at", "updated_at"],
      jsonColumns: ["settings", "metadata"],
      foreignKeyColumns: { organization_id: "tenancy.organizations", tenant_id: "tenancy.tenants", created_by_user_id: "identity.users", archived_by_user_id: "identity.users" },
    });
  }
  findOne(filter = {}, ...args) { return this.repository.findOne(normalizeFilter(filter), ...args).then(expose); }
  findById(id, ...args) { return this.findOne({ _id: id }, ...args); }
  findMany(filter = {}, ...args) { return this.repository.findMany(normalizeFilter(filter), ...args).then((rows) => rows.map(expose)); }
  create(data, ...args) { return this.repository.create(normalizeData(data), ...args).then(expose); }
  updateOne(filter, update, ...args) { return this.repository.updateOne(normalizeFilter(filter), normalizeData(update), ...args); }
  save(environment, ...args) { return this.repository.save(normalizeData(environment), ...args).then(expose); }
}

module.exports = PostgresEnvironmentRepository;