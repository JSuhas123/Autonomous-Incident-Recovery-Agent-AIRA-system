"use strict";

class OperationalDocumentRepository {
  async findMany(
    _domain,
    _filter = {},
    _options = {},
    _transaction = null
  ) {
    throw new Error(
      "OperationalDocumentRepository.findMany() is not implemented"
    );
  }

  async findOne(
    _domain,
    _filter = {},
    _options = {},
    _transaction = null
  ) {
    throw new Error(
      "OperationalDocumentRepository.findOne() is not implemented"
    );
  }

  async create(
    _domain,
    _data,
    _transaction = null
  ) {
    throw new Error(
      "OperationalDocumentRepository.create() is not implemented"
    );
  }

  async replace(
    _domain,
    _filter,
    _document,
    _transaction = null
  ) {
    throw new Error(
      "OperationalDocumentRepository.replace() is not implemented"
    );
  }

  async updateOne(
    _domain,
    _filter,
    _update,
    _options = {},
    _transaction = null
  ) {
    throw new Error(
      "OperationalDocumentRepository.updateOne() is not implemented"
    );
  }

  async updateMany(
    _domain,
    _filter,
    _update,
    _options = {},
    _transaction = null
  ) {
    throw new Error(
      "OperationalDocumentRepository.updateMany() is not implemented"
    );
  }

  async deleteOne(
    _domain,
    _filter,
    _transaction = null
  ) {
    throw new Error(
      "OperationalDocumentRepository.deleteOne() is not implemented"
    );
  }

  async deleteMany(
    _domain,
    _filter,
    _transaction = null
  ) {
    throw new Error(
      "OperationalDocumentRepository.deleteMany() is not implemented"
    );
  }

  async countDocuments(
    _domain,
    _filter = {},
    _transaction = null
  ) {
    throw new Error(
      "OperationalDocumentRepository.countDocuments() is not implemented"
    );
  }
}

module.exports =
  OperationalDocumentRepository;