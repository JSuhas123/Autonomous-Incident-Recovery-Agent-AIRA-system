"use strict";

const PasswordCredentialRepository = require("../repositories/PasswordCredentialRepository");
const PasswordCredential = require("../../models/PasswordCredential");
const support = require("./MongoIdentityRepositorySupport");

function includeSecrets(options = {}) {
  return options.includeSecrets === true ||
    options.includePasswordHash === true ||
    options.includeTokenHash === true;
}

class MongoPasswordCredentialRepository extends PasswordCredentialRepository {
  findOne(filter = {}, options = {}, transaction = null) {
    if (options?.kind === "mongo" || options?.clientSession) {
      transaction = options;
      options = {};
    }

    let query = PasswordCredential.findOne(filter);
    if (includeSecrets(options)) query = query.select("+passwordHash");
    query = support.projection(query, options);
    return support.applySession(query, transaction);
  }

  findById(id, options = {}, transaction = null) {
    const parsed = support.mutationOptions(options, transaction);
    let query = PasswordCredential.findById(id);
    if (includeSecrets(parsed.options)) query = query.select("+passwordHash");
    query = support.projection(query, parsed.options);
    return support.applySession(query, parsed.transaction);
  }

  create(data, transaction = null) {
    return support.create(PasswordCredential, data, transaction);
  }

  updateOne(filter, update, options = {}, transaction = null) {
    return support.updateOne(PasswordCredential, filter, update, options, transaction);
  }

  updateMany(filter, update, options = {}, transaction = null) {
    return support.updateMany(PasswordCredential, filter, update, options, transaction);
  }

  save(credential, transaction = null) {
    return support.save(credential, transaction, "MongoPasswordCredentialRepository");
  }
}

module.exports = MongoPasswordCredentialRepository;
