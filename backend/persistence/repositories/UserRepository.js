"use strict";

class UserRepository {
  async findOne() { throw new Error("UserRepository.findOne() is not implemented"); }
  async findById() { throw new Error("UserRepository.findById() is not implemented"); }
  async findMany() { throw new Error("UserRepository.findMany() is not implemented"); }
  async create() { throw new Error("UserRepository.create() is not implemented"); }
  async updateOne() { throw new Error("UserRepository.updateOne() is not implemented"); }
  async updateMany() { throw new Error("UserRepository.updateMany() is not implemented"); }
  async save() { throw new Error("UserRepository.save() is not implemented"); }
}

module.exports = UserRepository;