"use strict";

const TenantConfigRepository = require("../repositories/TenantConfigRepository");
const TenantConfig = require("../../models/TenantConfig");
const support = require("./MongoIdentityRepositorySupport");

class MongoTenantConfigRepository extends TenantConfigRepository {
  findOne(filter = {}, options = {}, transaction = null) {
    const parsed = support.mutationOptions(options, transaction);
    const query = TenantConfig.findOne(filter, parsed.options);
    if (options?.includeSecrets !== true) query.select("-apiKeys -admins -document -secretKey");
    return support.applySession(query, parsed.transaction);
  }
  findMany(filter = {}, options = {}, transaction = null) {
    const parsed = support.mutationOptions(options, transaction);
    const query = TenantConfig.find(filter, parsed.options);
    if (options?.includeSecrets !== true) query.select("-apiKeys -admins -document -secretKey");
    return support.applySession(query, parsed.transaction);
  }
  create(data, transaction = null) { return support.create(TenantConfig, data, transaction); }
  updateOne(filter, update, options = {}, transaction = null) {
    return support.updateOne(TenantConfig, filter, update, options, transaction);
  }
  save(config, transaction = null) {
    if (config && typeof config.save === "function") {
      return support.save(config, transaction, "MongoTenantConfigRepository");
    }
    if (!config?._id) {
      throw Object.assign(new Error("MongoTenantConfigRepository.save() requires a persisted document"), { code: "INVALID_MONGO_DOCUMENT" });
    }
    return support.updateOne(TenantConfig, { _id: config._id }, config, {}, transaction).then(() => config);
  }
}

module.exports = MongoTenantConfigRepository;