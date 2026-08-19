'use strict';

/**
 * Database Diagnostic Service
 *
 * Phase 13.11
 *
 * Provides the execution boundary between AIRA Runbooks and
 * externally registered database targets.
 *
 * SAFETY:
 * - Does NOT use AIRA's internal Mongoose connection.
 * - Does NOT read MONGODB_URI.
 * - Does NOT execute mutation/remediation operations.
 * - Database clients must be explicitly registered/injected.
 * - Credentials are never returned.
 */

const SUPPORTED_DATABASE_TYPES = Object.freeze({
  POSTGRESQL: 'postgresql',
  MYSQL: 'mysql',
  MONGODB: 'mongodb',
  REDIS: 'redis',
});

class DatabaseDiagnosticService {
  constructor(options = {}) {
    this.clients = new Map();

    if (options.clients) {
      for (const [targetId, client] of Object.entries(options.clients)) {
        this.registerClient(targetId, client);
      }
    }
  }

  registerClient(targetId, client) {
    if (!targetId || typeof targetId !== 'string') {
      throw new Error('Database targetId is required');
    }

    if (!client || typeof client !== 'object') {
      throw new Error(
        `Database client is required for target ${targetId}`
      );
    }

    this.clients.set(targetId, client);
  }

  unregisterClient(targetId) {
    return this.clients.delete(targetId);
  }

  hasClient(targetId) {
    return this.clients.has(targetId);
  }

  getRegisteredTargets() {
    return Array.from(this.clients.keys());
  }

  _client(targetId) {
    if (!targetId) {
      throw new Error(
        'Database targetId is required'
      );
    }

    const client =
      this.clients.get(targetId);

    if (!client) {
      throw new Error(
        `No database diagnostic client registered for target ${targetId}`
      );
    }

    return client;
  }

  async _invoke(targetId, method, params = {}) {
    const client =
      this._client(targetId);

    if (typeof client[method] !== 'function') {
      throw new Error(
        `Database target ${targetId} does not support diagnostic method ${method}`
      );
    }

    return client[method](params);
  }

  async checkConnectivity(targetId, params = {}) {
    return this._invoke(
      targetId,
      'checkConnectivity',
      params
    );
  }

  async getHealth(targetId, params = {}) {
    return this._invoke(
      targetId,
      'getHealth',
      params
    );
  }

  async getConnections(targetId, params = {}) {
    return this._invoke(
      targetId,
      'getConnections',
      params
    );
  }

  async checkConnectionPool(targetId, params = {}) {
    return this._invoke(
      targetId,
      'checkConnectionPool',
      params
    );
  }

  async getStorage(targetId, params = {}) {
    return this._invoke(
      targetId,
      'getStorage',
      params
    );
  }

  async checkStoragePressure(targetId, params = {}) {
    return this._invoke(
      targetId,
      'checkStoragePressure',
      params
    );
  }

  async getReplicationStatus(targetId, params = {}) {
    return this._invoke(
      targetId,
      'getReplicationStatus',
      params
    );
  }

  async checkReplicationLag(targetId, params = {}) {
    return this._invoke(
      targetId,
      'checkReplicationLag',
      params
    );
  }

  async getSlowQueries(targetId, params = {}) {
    return this._invoke(
      targetId,
      'getSlowQueries',
      params
    );
  }

  async getLongTransactions(targetId, params = {}) {
    return this._invoke(
      targetId,
      'getLongTransactions',
      params
    );
  }

  async getLocks(targetId, params = {}) {
    return this._invoke(
      targetId,
      'getLocks',
      params
    );
  }

  async checkDeadlocks(targetId, params = {}) {
    return this._invoke(
      targetId,
      'checkDeadlocks',
      params
    );
  }

  async getPostgresActivity(targetId, params = {}) {
    return this._invoke(
      targetId,
      'getPostgresActivity',
      params
    );
  }

  async getPostgresReplication(targetId, params = {}) {
    return this._invoke(
      targetId,
      'getPostgresReplication',
      params
    );
  }

  async getMysqlProcesslist(targetId, params = {}) {
    return this._invoke(
      targetId,
      'getMysqlProcesslist',
      params
    );
  }

  async getMysqlReplication(targetId, params = {}) {
    return this._invoke(
      targetId,
      'getMysqlReplication',
      params
    );
  }

  async getRedisInfo(targetId, params = {}) {
    return this._invoke(
      targetId,
      'getRedisInfo',
      params
    );
  }

  async getRedisMemory(targetId, params = {}) {
    return this._invoke(
      targetId,
      'getRedisMemory',
      params
    );
  }

  async getRedisReplication(targetId, params = {}) {
    return this._invoke(
      targetId,
      'getRedisReplication',
      params
    );
  }

  async getMongoServerStatus(targetId, params = {}) {
    return this._invoke(
      targetId,
      'getMongoServerStatus',
      params
    );
  }

  async getMongoReplicaStatus(targetId, params = {}) {
    return this._invoke(
      targetId,
      'getMongoReplicaStatus',
      params
    );
  }
}

let instance = null;

function getDatabaseDiagnosticService() {
  if (!instance) {
    instance =
      new DatabaseDiagnosticService();
  }

  return instance;
}

function resetDatabaseDiagnosticService() {
  instance = null;
}

module.exports = {
  SUPPORTED_DATABASE_TYPES,
  DatabaseDiagnosticService,
  getDatabaseDiagnosticService,
  resetDatabaseDiagnosticService,
};