"use strict";

const OrganizationMembershipRepository = require("../repositories/OrganizationMembershipRepository");
const OrganizationMembership = require("../../models/OrganizationMembership");
const support = require("./MongoIdentityRepositorySupport");

class MongoOrganizationMembershipRepository extends OrganizationMembershipRepository {
  findOne(filter = {}, transaction = null) {
    return support.applySession(OrganizationMembership.findOne(filter), transaction);
  }

  findById(id, options = {}, transaction = null) {
    const parsed = support.mutationOptions(options, transaction);
    return support.applySession(OrganizationMembership.findById(id), parsed.transaction);
  }

  findMany(filter = {}, transaction = null) {
    return support.applySession(OrganizationMembership.find(filter), transaction);
  }

  create(data, transaction = null) {
    return support.create(OrganizationMembership, data, transaction);
  }

  updateOne(filter, update, options = {}, transaction = null) {
    return support.updateOne(OrganizationMembership, filter, update, options, transaction);
  }

  updateMany(filter, update, options = {}, transaction = null) {
    return support.updateMany(OrganizationMembership, filter, update, options, transaction);
  }

  save(membership, transaction = null) {
    return support.save(membership, transaction, "MongoOrganizationMembershipRepository");
  }
}

module.exports = MongoOrganizationMembershipRepository;
