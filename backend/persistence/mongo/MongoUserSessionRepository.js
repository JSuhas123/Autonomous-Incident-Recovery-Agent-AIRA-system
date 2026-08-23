"use strict";

const UserSessionRepository = require("../repositories/UserSessionRepository");
const UserSession = require("../../models/UserSession");
const support = require("./MongoIdentityRepositorySupport");

function includeSecrets(options = {}) {
  return options.includeSecrets === true || options.includeTokenHash === true ||
    options.includeNetworkHashes === true || options.includeCsrfSecret === true;
}

class MongoUserSessionRepository extends UserSessionRepository {
  findOne(filter = {}, options = {}, transaction = null) {
    if (options?.kind === "mongo" || options?.clientSession) {
      transaction = options;
      options = {};
    }

    let query = UserSession.findOne(filter);
    if (includeSecrets(options)) {
      query = query.select("+tokenHash +ipHash +userAgentHash +csrfSecret");
    }
    query = support.projection(query, options);
    return support.applySession(query, transaction);
  }

  findById(id, options = {}, transaction = null) {
    const parsed = support.mutationOptions(options, transaction);
    let query = UserSession.findById(id);
    if (includeSecrets(parsed.options)) {
      query = query.select("+tokenHash +ipHash +userAgentHash +csrfSecret");
    }
    query = support.projection(query, parsed.options);
    return support.applySession(query, parsed.transaction);
  }

  findMany(filter = {}, options = {}, transaction = null) {
    if (options?.kind === "mongo" || options?.clientSession) {
      transaction = options;
      options = {};
    }

    let query = UserSession.find(filter);
    if (includeSecrets(options)) {
      query = query.select("+tokenHash +ipHash +userAgentHash +csrfSecret");
    }
    query = support.projection(query, options);
    return support.applySession(query, transaction);
  }

  create(data, transaction = null) {
    return support.create(UserSession, data, transaction);
  }

  updateOne(filter, update, options = {}, transaction = null) {
    return support.updateOne(UserSession, filter, update, options, transaction);
  }

  updateMany(filter, update, options = {}, transaction = null) {
    return support.updateMany(UserSession, filter, update, options, transaction);
  }

  save(sessionDocument, transaction = null) {
    return support.save(sessionDocument, transaction, "MongoUserSessionRepository");
  }

  async deleteMany(filter = {}, transaction = null) {
    const query = support.applySession(UserSession.deleteMany(filter), transaction);
    return query.exec ? query.exec() : query;
  }
}

module.exports = MongoUserSessionRepository;
