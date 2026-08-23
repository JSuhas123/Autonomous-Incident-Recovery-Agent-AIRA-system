"use strict";

const crypto = require("crypto");
const OrganizationRepository = require("../repositories/OrganizationRepository");
const Base = require("./PostgresIdentityRepositoryBase");

function normalizeFilter(filter = {}) {
  const result = { ...filter };
  if (result.tenantId !== undefined) {
    result.tenantPublicId = result.tenantId;
    delete result.tenantId;
  }
  return result;
}

function normalizeData(data = {}, { create = false } = {}) {
  const result = { ...data };
  if (create) result._id = result._id || result.publicId || crypto.randomUUID();
  if (result.tenantId !== undefined) {
    result.tenantPublicId = result.tenantId;
    delete result.tenantId;
  }
  return result;
}

class PostgresOrganizationRepository extends OrganizationRepository {
  constructor(options = {}) {
    super();
    this.repository = new Base(options, {
      table: "tenancy.organizations",
      columns: ["public_id", "legacy_mongo_id", "tenant_public_id", "name", "slug", "status", "settings", "metadata", "created_by_user_id", "created_by_user_legacy_id", "created_at", "updated_at"],
      jsonColumns: ["settings", "metadata"],
      foreignKeyColumns: { created_by_user_id: "identity.users" },
    });
  }
  findOne(filter = {}, ...args) { return this.repository.findOne(normalizeFilter(filter), ...args).then((row) => row && { ...row, tenantId: row.tenantPublicId }); }
  findById(id, ...args) { return this.findOne({ _id: id }, ...args); }
  findMany(filter = {}, ...args) { return this.repository.findMany(normalizeFilter(filter), ...args).then((rows) => rows.map((row) => ({ ...row, tenantId: row.tenantPublicId }))); }
  create(data, ...args) { return this.repository.create(normalizeData(data, { create: true }), ...args).then((row) => row && { ...row, tenantId: row.tenantPublicId }); }
  updateOne(filter, update, ...args) { return this.repository.updateOne(normalizeFilter(filter), normalizeData(update), ...args); }
  save(organization, ...args) { return this.repository.save(normalizeData(organization), ...args); }
}

module.exports = PostgresOrganizationRepository;