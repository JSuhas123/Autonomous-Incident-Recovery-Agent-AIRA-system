"use strict";

const OrganizationRepository = require("../repositories/OrganizationRepository");
const Organization = require("../../models/Organization");
const support = require("./MongoIdentityRepositorySupport");

class MongoOrganizationRepository extends OrganizationRepository {
  findOne(filter = {}, options = {}, transaction = null) {
    const parsed = support.mutationOptions(options, transaction);
    return support.applySession(Organization.findOne(filter, parsed.options), parsed.transaction);
  }
  findById(id, options = {}, transaction = null) {
    const parsed = support.mutationOptions(options, transaction);
    return support.applySession(Organization.findById(id, parsed.options), parsed.transaction);
  }
  findMany(filter = {}, options = {}, transaction = null) {
    const parsed = support.mutationOptions(options, transaction);
    return support.applySession(Organization.find(filter, parsed.options), parsed.transaction);
  }
  create(data, transaction = null) { return support.create(Organization, data, transaction); }
  updateOne(filter, update, options = {}, transaction = null) {
    return support.updateOne(Organization, filter, update, options, transaction);
  }
  save(organization, transaction = null) {
    return support.save(organization, transaction, "MongoOrganizationRepository");
  }
}

module.exports = MongoOrganizationRepository;