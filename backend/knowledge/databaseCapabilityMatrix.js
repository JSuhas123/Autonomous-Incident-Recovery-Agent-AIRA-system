'use strict';

/**
 * AIRA Database Capability Matrix
 *
 * Phase 13.11
 *
 * Defines the deterministic capability surface required by the
 * database knowledge catalogue.
 *
 * IMPORTANT:
 * This file does NOT implement database operations.
 * It describes the capabilities that database Runbooks may require.
 */

const DATABASE_CAPABILITY_CLASS =
  Object.freeze({
    OBSERVE:
      'OBSERVE',

    VERIFY:
      'VERIFY',

    MUTATE:
      'MUTATE',
  });


const DATABASE_CAPABILITIES =
  Object.freeze([

    // ========================================================================
    // GENERIC DATABASE
    // ========================================================================

    {
      handlerKey:
        'database/check_connectivity',

      class:
        DATABASE_CAPABILITY_CLASS.OBSERVE,

      description:
        'Check whether the configured database endpoint is reachable.',

      requiredForPhase13:
        true,
    },

    {
      handlerKey:
        'database/get_health',

      class:
        DATABASE_CAPABILITY_CLASS.OBSERVE,

      description:
        'Read database health and availability state.',

      requiredForPhase13:
        true,
    },

    {
      handlerKey:
        'database/get_connections',

      class:
        DATABASE_CAPABILITY_CLASS.OBSERVE,

      description:
        'Inspect current database connection usage.',

      requiredForPhase13:
        true,
    },

    {
      handlerKey:
        'database/check_connection_pool',

      class:
        DATABASE_CAPABILITY_CLASS.VERIFY,

      description:
        'Determine whether connection-pool utilization is healthy.',

      requiredForPhase13:
        true,
    },

    {
      handlerKey:
        'database/get_storage',

      class:
        DATABASE_CAPABILITY_CLASS.OBSERVE,

      description:
        'Inspect database storage utilization and capacity.',

      requiredForPhase13:
        true,
    },

    {
      handlerKey:
        'database/check_storage_pressure',

      class:
        DATABASE_CAPABILITY_CLASS.VERIFY,

      description:
        'Determine whether database storage is under unsafe pressure.',

      requiredForPhase13:
        true,
    },

    {
      handlerKey:
        'database/get_replication_status',

      class:
        DATABASE_CAPABILITY_CLASS.OBSERVE,

      description:
        'Inspect database replication state.',

      requiredForPhase13:
        true,
    },

    {
      handlerKey:
        'database/check_replication_lag',

      class:
        DATABASE_CAPABILITY_CLASS.VERIFY,

      description:
        'Determine whether replication lag exceeds safe thresholds.',

      requiredForPhase13:
        true,
    },

    {
      handlerKey:
        'database/get_slow_queries',

      class:
        DATABASE_CAPABILITY_CLASS.OBSERVE,

      description:
        'Inspect currently observed slow-query information.',

      requiredForPhase13:
        true,
    },

    {
      handlerKey:
        'database/get_long_transactions',

      class:
        DATABASE_CAPABILITY_CLASS.OBSERVE,

      description:
        'Inspect long-running database transactions.',

      requiredForPhase13:
        true,
    },

    {
      handlerKey:
        'database/get_locks',

      class:
        DATABASE_CAPABILITY_CLASS.OBSERVE,

      description:
        'Inspect lock and blocking relationships.',

      requiredForPhase13:
        true,
    },

    {
      handlerKey:
        'database/check_deadlocks',

      class:
        DATABASE_CAPABILITY_CLASS.VERIFY,

      description:
        'Inspect whether deadlock conditions are occurring.',

      requiredForPhase13:
        true,
    },


    // ========================================================================
    // POSTGRESQL
    // ========================================================================

    {
      handlerKey:
        'postgres/get_activity',

      class:
        DATABASE_CAPABILITY_CLASS.OBSERVE,

      description:
        'Inspect PostgreSQL activity information.',

      requiredForPhase13:
        true,
    },

    {
      handlerKey:
        'postgres/get_replication',

      class:
        DATABASE_CAPABILITY_CLASS.OBSERVE,

      description:
        'Inspect PostgreSQL replication information.',

      requiredForPhase13:
        true,
    },


    // ========================================================================
    // MYSQL
    // ========================================================================

    {
      handlerKey:
        'mysql/get_processlist',

      class:
        DATABASE_CAPABILITY_CLASS.OBSERVE,

      description:
        'Inspect MySQL process activity.',

      requiredForPhase13:
        true,
    },

    {
      handlerKey:
        'mysql/get_replication',

      class:
        DATABASE_CAPABILITY_CLASS.OBSERVE,

      description:
        'Inspect MySQL replication state.',

      requiredForPhase13:
        true,
    },


    // ========================================================================
    // REDIS
    // ========================================================================

    {
      handlerKey:
        'redis/get_info',

      class:
        DATABASE_CAPABILITY_CLASS.OBSERVE,

      description:
        'Read Redis operational information.',

      requiredForPhase13:
        true,
    },

    {
      handlerKey:
        'redis/get_memory',

      class:
        DATABASE_CAPABILITY_CLASS.OBSERVE,

      description:
        'Inspect Redis memory utilization.',

      requiredForPhase13:
        true,
    },

    {
      handlerKey:
        'redis/get_replication',

      class:
        DATABASE_CAPABILITY_CLASS.OBSERVE,

      description:
        'Inspect Redis replication state.',

      requiredForPhase13:
        true,
    },


    // ========================================================================
    // MONGODB
    // ========================================================================

    {
      handlerKey:
        'mongodb/get_server_status',

      class:
        DATABASE_CAPABILITY_CLASS.OBSERVE,

      description:
        'Read MongoDB server health information.',

      requiredForPhase13:
        true,
    },

    {
      handlerKey:
        'mongodb/get_replica_status',

      class:
        DATABASE_CAPABILITY_CLASS.OBSERVE,

      description:
        'Inspect MongoDB replica-set state.',

      requiredForPhase13:
        true,
    },
  ]);


function getDatabaseCapabilities() {
  return DATABASE_CAPABILITIES.map(
    capability => ({
      ...capability,
    })
  );
}


function getRequiredDatabaseCapabilities() {
  return DATABASE_CAPABILITIES
    .filter(
      capability =>
        capability.requiredForPhase13 ===
        true
    )
    .map(
      capability => ({
        ...capability,
      })
    );
}


function getDatabaseCapability(
  handlerKey
) {
  return DATABASE_CAPABILITIES.find(
    capability =>
      capability.handlerKey ===
      handlerKey
  ) || null;
}


function buildDatabaseCapabilityMatrix(
  availableHandlerKeys = []
) {
  const availableSet =
    new Set(
      availableHandlerKeys
    );

  const capabilities =
    DATABASE_CAPABILITIES.map(
      capability => ({
        ...capability,

        available:
          availableSet.has(
            capability.handlerKey
          ),
      })
    );

  const available =
    capabilities.filter(
      capability =>
        capability.available
    );

  const missing =
    capabilities.filter(
      capability =>
        !capability.available
    );

  const required =
    capabilities.filter(
      capability =>
        capability.requiredForPhase13
    );

  const missingRequired =
    required.filter(
      capability =>
        !capability.available
    );

  return {
    capabilities,

    available,

    missing,

    required,

    missingRequired,

    counts: {
      total:
        capabilities.length,

      available:
        available.length,

      missing:
        missing.length,

      required:
        required.length,

      missingRequired:
        missingRequired.length,
    },

    ready:
      missingRequired.length ===
      0,
  };
}


module.exports = {
  DATABASE_CAPABILITY_CLASS,
  DATABASE_CAPABILITIES,

  getDatabaseCapabilities,
  getRequiredDatabaseCapabilities,
  getDatabaseCapability,

  buildDatabaseCapabilityMatrix,
};