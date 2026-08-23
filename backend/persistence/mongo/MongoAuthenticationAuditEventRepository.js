"use strict";

const Contract = require("../repositories/AuthenticationAuditEventRepository");
const Model = require("../../models/AuthenticationAuditEvent");

class MongoAuthenticationAuditEventRepository extends Contract {
  async findLast() { return Model.findOne({}).sort({ chainIndex: -1, createdAt: -1 }); }
  async findMany() { return Model.find({}).sort({ chainIndex: 1, createdAt: 1 }); }
  async create(data, transaction = null) {
    const support = require("./MongoIdentityRepositorySupport");
    return support.create(Model, data, transaction);
  }
}

module.exports = MongoAuthenticationAuditEventRepository;
