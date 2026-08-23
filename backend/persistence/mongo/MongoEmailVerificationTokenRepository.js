"use strict";

const Contract = require("../repositories/EmailVerificationTokenRepository");
const Model = require("../../models/EmailVerificationToken");
const support = require("./MongoIdentityRepositorySupport");

class MongoEmailVerificationTokenRepository extends Contract {
  findOne(filter = {}, options = {}, transaction = null) {
    const parsed = support.mutationOptions(options, transaction);
    let query = Model.findOne(filter);
    if (parsed.options.includeTokenHash === true) query = query.select("+tokenHash");
    return support.applySession(query, parsed.transaction);
  }
  findMany(filter = {}, options = {}, transaction = null) {
    const parsed = support.mutationOptions(options, transaction);
    let query = Model.find(filter);
    if (parsed.options.includeTokenHash === true) query = query.select("+tokenHash");
    return support.applySession(query, parsed.transaction);
  }
  create(data, transaction = null) { return support.create(Model, data, transaction); }
  updateOne() { throw Object.assign(new Error("Token records are append-only"), { code: "TOKEN_APPEND_ONLY" }); }
}

module.exports = MongoEmailVerificationTokenRepository;
