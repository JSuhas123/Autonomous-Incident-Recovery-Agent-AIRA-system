"use strict";

const TenantConfigRepository = require("../repositories/TenantConfigRepository");
const Base = require("./PostgresIdentityRepositoryBase");

function normalizeFilter(filter = {}) {
  const result = { ...filter };
  if (result.tenantId !== undefined) {
    result.tenantPublicId = result.tenantId;
    delete result.tenantId;
  }
  return result;
}

function normalizeData(data = {}) {
  const result = { ...data };
  if (result.tenantId !== undefined) {
    result.tenantPublicId = result.tenantId;
    delete result.tenantId;
  }
  return result;
}

class PostgresTenantConfigRepository extends TenantConfigRepository {
  constructor(options = {}) {
    super();
    this.repository = new Base(options, {
      table: "tenancy.tenant_configs",
      columns: ["legacy_mongo_id", "tenant_public_id", "name", "status", "policy_version", "settings", "api_keys", "admins", "retention", "document", "created_at", "updated_at"],
      jsonColumns: ["settings", "api_keys", "admins", "retention", "document"],
      hiddenColumns: ["api_keys", "admins", "document"],
    });
  }
  findOne(filter = {}, options = {}, transaction = null) {
    return this.repository.findOne(normalizeFilter(filter), options, transaction).then((row) => row && { ...row, tenantId: row.tenantPublicId });
  }
  findMany(filter = {}, options = {}, transaction = null) {
    return this.repository.findMany(normalizeFilter(filter), options, transaction).then((rows) => rows.map((row) => ({ ...row, tenantId: row.tenantPublicId })));
  }
  create(data, ...args) { return this.repository.create(normalizeData(data), ...args).then((row) => row && { ...row, tenantId: row.tenantPublicId }); }
  updateOne(filter, update, ...args) { return this.repository.updateOne(normalizeFilter(filter), normalizeData(update), ...args); }
  save(config, ...args) { return this.repository.save(normalizeData(config), ...args).then((row) => row && { ...row, tenantId: row.tenantPublicId }); }
}

module.exports = PostgresTenantConfigRepository;