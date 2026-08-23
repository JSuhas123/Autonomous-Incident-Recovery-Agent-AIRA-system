"use strict";

const crypto = require("node:crypto");
const UserRepository = require("../repositories/UserRepository");
const Base = require("./PostgresIdentityRepositoryBase");

function normalizeData(data = {}) {
  const result = { ...data };
  result._id = result._id || result.publicId || crypto.randomUUID();
  if (result.email && !result.normalizedEmail) {
    result.normalizedEmail = result.email.trim().toLowerCase();
  }
  return result;
}

class PostgresUserRepository extends UserRepository {
  constructor(options = {}) {
    super();
    this.repository = new Base(options, {
      table: "identity.users",
      columns: ["public_id", "legacy_mongo_id", "full_name", "email", "normalized_email", "status", "email_verified_at", "primary_organization_id", "last_login_at", "metadata", "created_at", "updated_at"],
      jsonColumns: ["metadata"],
      foreignKeyColumns: { primary_organization_id: "tenancy.organizations" },
    });
  }
  findOne(...args) { return this.repository.findOne(...args); }
  findById(id, ...args) { return this.repository.findOne({ _id: id }, ...args); }
  findMany(...args) { return this.repository.findMany(...args); }
  create(data, ...args) { return this.repository.create(normalizeData(data), ...args); }
  updateOne(...args) { return this.repository.updateOne(...args); }
  updateMany(...args) { return this.repository.updateMany(...args); }
  save(...args) { return this.repository.save(...args); }
}

module.exports = PostgresUserRepository;
