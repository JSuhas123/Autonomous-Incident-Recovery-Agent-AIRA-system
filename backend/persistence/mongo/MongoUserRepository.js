"use strict";

const UserRepository = require("../repositories/UserRepository");
const User = require("../../models/User");
const support = require("./MongoIdentityRepositorySupport");

class MongoUserRepository extends UserRepository {
  findOne(filter = {}, transaction = null) {
    return support.applySession(User.findOne(filter), transaction);
  }

  findById(id, options = {}, transaction = null) {
    const parsed = support.mutationOptions(options, transaction);
    return support.applySession(User.findById(id), parsed.transaction);
  }

  findMany(filter = {}, transaction = null) {
    return support.applySession(User.find(filter), transaction);
  }

  create(data, transaction = null) {
    return support.create(User, data, transaction);
  }

  updateOne(filter, update, options = {}, transaction = null) {
    return support.updateOne(User, filter, update, options, transaction);
  }

  updateMany(filter, update, options = {}, transaction = null) {
    return support.updateMany(User, filter, update, options, transaction);
  }

  save(user, transaction = null) {
    return support.save(user, transaction, "MongoUserRepository");
  }
}

module.exports = MongoUserRepository;
