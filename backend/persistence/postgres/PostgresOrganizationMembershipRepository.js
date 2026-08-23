"use strict";

const OrganizationMembershipRepository = require("../repositories/OrganizationMembershipRepository");
const Base = require("./PostgresIdentityRepositoryBase");

class PostgresOrganizationMembershipRepository extends OrganizationMembershipRepository {
  constructor(options = {}) {
    super();
    this.repository = new Base(options, {
      table: "identity.organization_memberships",
      columns: ["public_id", "legacy_mongo_id", "user_id", "organization_id", "role", "status", "project_ids", "invited_by_user_id", "joined_at", "suspended_at", "metadata", "created_at", "updated_at"],
      jsonColumns: ["project_ids", "metadata"],
      foreignKeyColumns: {
        user_id: "identity.users",
        organization_id: "tenancy.organizations",
        invited_by_user_id: "identity.users",
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
}

module.exports = PostgresOrganizationMembershipRepository;
