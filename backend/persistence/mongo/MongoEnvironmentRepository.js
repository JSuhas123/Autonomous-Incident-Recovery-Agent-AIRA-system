"use strict";

const EnvironmentRepository = require("../repositories/EnvironmentRepository");
const Environment = require("../../models/Environment");
const support = require("./MongoIdentityRepositorySupport");

class MongoEnvironmentRepository extends EnvironmentRepository {
  findOne(filter = {}, options = {}, transaction = null) {
    const parsed = support.mutationOptions(options, transaction);
    return support.applySession(Environment.findOne(filter, parsed.options), parsed.transaction);
  }
  findById(id, options = {}, transaction = null) {
    const parsed = support.mutationOptions(options, transaction);
    return support.applySession(Environment.findById(id, parsed.options), parsed.transaction);
  }
  findMany(filter = {}, options = {}, transaction = null) {
    const parsed = support.mutationOptions(options, transaction);
    return support.applySession(Environment.find(filter, parsed.options), parsed.transaction);
  }
  create(data, transaction = null) { return support.create(Environment, data, transaction); }
  updateOne(filter, update, options = {}, transaction = null) {
    return support.updateOne(Environment, filter, update, options, transaction);
  }
  save(environment, transaction = null) {
    return support.save(environment, transaction, "MongoEnvironmentRepository");
  }
}

module.exports = MongoEnvironmentRepository;