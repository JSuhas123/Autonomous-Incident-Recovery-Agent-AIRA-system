'use strict';

/**
 * AIRA Database Diagnostic Action Handlers
 *
 * Phase 13.11
 *
 * Deterministic READ-ONLY handlers for externally registered
 * database diagnostic targets.
 *
 * SAFETY INVARIANTS:
 *
 * - NEVER use AIRA's internal Mongoose connection.
 * - NEVER read MONGODB_URI.
 * - NEVER accept raw credentials or connection strings.
 * - NEVER mutate customer databases.
 * - All targets must be explicitly registered with DatabaseDiagnosticService.
 * - All handlers are non-destructive and confirmation-free.
 */

const {
  getDatabaseDiagnosticService,
} = require(
  '../../../services/infrastructure/databaseDiagnosticService'
);


// ============================================================================
// CONSTANTS
// ============================================================================

const SAFE_ENVIRONMENTS =
  Object.freeze([
    'production',
    'staging',
    'dev',
  ]);


const FORBIDDEN_PARAMETER_NAMES =
  Object.freeze([
    'password',
    'secret',
    'token',
    'connectionString',
    'uri',
    'url',
    'credential',
    'credentials',
  ]);


// ============================================================================
// HELPERS
// ============================================================================

function requireParams(
  params,
  ...names
) {
  const errors = [];

  for (
    const name
    of names
  ) {
    const value =
      params?.[name];

    if (
      value === undefined ||
      value === null ||
      value === ''
    ) {
      errors.push(
        `${name} is required`
      );
    }
  }

  return errors;
}


function sanitizeParams(
  params = {}
) {
  const safe = {
    ...params,
  };

  for (
    const forbidden
    of FORBIDDEN_PARAMETER_NAMES
  ) {
    delete safe[
      forbidden
    ];
  }

  return safe;
}


function resolveTargetId(
  params = {},
  context = {}
) {
  return (
    params.targetId ||
    params.databaseTargetId ||
    context.databaseTargetId ||
    context.resource?.targetId ||
    context.resource?.databaseTargetId ||
    null
  );
}


function resolveService(
  context = {}
) {
  return (
    context.databaseDiagnosticService ||
    getDatabaseDiagnosticService()
  );
}


function baseMetadata(
  description
) {
  return {
    automationSafe:
      true,

    idempotent:
      true,

    retrySafe:
      true,

    destructive:
      false,

    reversible:
      true,

    builtinRollback:
      false,

    requiresConfirmation:
      false,

    allowedEnvironments:
      SAFE_ENVIRONMENTS,

    blastRadius:
      'none',

    outputMayContainSecrets:
      false,

    description,
  };
}


function createReadOnlyHandler({
  type,
  action,
  serviceMethod,
  description,
}) {
  return {
    type,

    action,

    metadata:
      baseMetadata(
        description
      ),

    validate(
      params = {}
    ) {
      const errors =
        requireParams(
          params,
          'targetId'
        );

      for (
        const forbidden
        of FORBIDDEN_PARAMETER_NAMES
      ) {
        if (
          params[
            forbidden
          ] !== undefined
        ) {
          errors.push(
            `${forbidden} must not be supplied directly; use a registered database target`
          );
        }
      }

      return {
        valid:
          errors.length ===
          0,

        errors,
      };
    },

    async execute(
      params = {},
      context = {}
    ) {
      const targetId =
        resolveTargetId(
          params,
          context
        );

      if (
        !targetId
      ) {
        throw new Error(
          `${type}/${action} requires targetId`
        );
      }

      const service =
        resolveService(
          context
        );

      if (
        !service ||
        typeof service[
          serviceMethod
        ] !==
          'function'
      ) {
        throw new Error(
          `Database diagnostic service does not implement ${serviceMethod}`
        );
      }

      const safeParams =
        sanitizeParams(
          params
        );

      delete safeParams
        .targetId;

      delete safeParams
        .databaseTargetId;

      const result =
        await service[
          serviceMethod
        ](
          targetId,
          safeParams
        );

      return {
        success:
          true,

        targetId,

        diagnostic:
          true,

        ...(
          result &&
          typeof result ===
            'object'
            ? result
            : {
                result,
              }
        ),
      };
    },
  };
}


// ============================================================================
// GENERIC DATABASE
// ============================================================================

const checkConnectivity =
  createReadOnlyHandler({
    type:
      'database',

    action:
      'check_connectivity',

    serviceMethod:
      'checkConnectivity',

    description:
      'Check connectivity to an explicitly registered external database target.',
  });


const getHealth =
  createReadOnlyHandler({
    type:
      'database',

    action:
      'get_health',

    serviceMethod:
      'getHealth',

    description:
      'Read availability and health information from an external database target.',
  });


const getConnections =
  createReadOnlyHandler({
    type:
      'database',

    action:
      'get_connections',

    serviceMethod:
      'getConnections',

    description:
      'Inspect active database connection utilization for a registered target.',
  });


const checkConnectionPool =
  createReadOnlyHandler({
    type:
      'database',

    action:
      'check_connection_pool',

    serviceMethod:
      'checkConnectionPool',

    description:
      'Evaluate database connection-pool utilization against diagnostic thresholds.',
  });


const getStorage =
  createReadOnlyHandler({
    type:
      'database',

    action:
      'get_storage',

    serviceMethod:
      'getStorage',

    description:
      'Inspect database storage utilization and available capacity.',
  });


const checkStoragePressure =
  createReadOnlyHandler({
    type:
      'database',

    action:
      'check_storage_pressure',

    serviceMethod:
      'checkStoragePressure',

    description:
      'Determine whether database storage utilization is under unsafe pressure.',
  });


const getReplicationStatus =
  createReadOnlyHandler({
    type:
      'database',

    action:
      'get_replication_status',

    serviceMethod:
      'getReplicationStatus',

    description:
      'Inspect generic database replication state.',
  });


const checkReplicationLag =
  createReadOnlyHandler({
    type:
      'database',

    action:
      'check_replication_lag',

    serviceMethod:
      'checkReplicationLag',

    description:
      'Evaluate database replication lag against safe thresholds.',
  });


const getSlowQueries =
  createReadOnlyHandler({
    type:
      'database',

    action:
      'get_slow_queries',

    serviceMethod:
      'getSlowQueries',

    description:
      'Inspect slow-query information without terminating or modifying queries.',
  });


const getLongTransactions =
  createReadOnlyHandler({
    type:
      'database',

    action:
      'get_long_transactions',

    serviceMethod:
      'getLongTransactions',

    description:
      'Inspect long-running database transactions without terminating them.',
  });


const getLocks =
  createReadOnlyHandler({
    type:
      'database',

    action:
      'get_locks',

    serviceMethod:
      'getLocks',

    description:
      'Inspect database lock and blocking relationships.',
  });


const checkDeadlocks =
  createReadOnlyHandler({
    type:
      'database',

    action:
      'check_deadlocks',

    serviceMethod:
      'checkDeadlocks',

    description:
      'Inspect whether database deadlock conditions are present.',
  });


// ============================================================================
// POSTGRESQL
// ============================================================================

const getPostgresActivity =
  createReadOnlyHandler({
    type:
      'postgres',

    action:
      'get_activity',

    serviceMethod:
      'getPostgresActivity',

    description:
      'Inspect PostgreSQL activity through an explicitly registered diagnostic target.',
  });


const getPostgresReplication =
  createReadOnlyHandler({
    type:
      'postgres',

    action:
      'get_replication',

    serviceMethod:
      'getPostgresReplication',

    description:
      'Inspect PostgreSQL replication state without changing replication topology.',
  });


// ============================================================================
// MYSQL
// ============================================================================

const getMysqlProcesslist =
  createReadOnlyHandler({
    type:
      'mysql',

    action:
      'get_processlist',

    serviceMethod:
      'getMysqlProcesslist',

    description:
      'Inspect MySQL process activity without killing sessions.',
  });


const getMysqlReplication =
  createReadOnlyHandler({
    type:
      'mysql',

    action:
      'get_replication',

    serviceMethod:
      'getMysqlReplication',

    description:
      'Inspect MySQL replication state without changing replica configuration.',
  });


// ============================================================================
// REDIS
// ============================================================================

const getRedisInfo =
  createReadOnlyHandler({
    type:
      'redis',

    action:
      'get_info',

    serviceMethod:
      'getRedisInfo',

    description:
      'Read Redis operational information from a registered target.',
  });


const getRedisMemory =
  createReadOnlyHandler({
    type:
      'redis',

    action:
      'get_memory',

    serviceMethod:
      'getRedisMemory',

    description:
      'Inspect Redis memory utilization without changing maxmemory or eviction policy.',
  });


const getRedisReplication =
  createReadOnlyHandler({
    type:
      'redis',

    action:
      'get_replication',

    serviceMethod:
      'getRedisReplication',

    description:
      'Inspect Redis replication state without promoting replicas or changing topology.',
  });


// ============================================================================
// MONGODB
// ============================================================================

const getMongoServerStatus =
  createReadOnlyHandler({
    type:
      'mongodb',

    action:
      'get_server_status',

    serviceMethod:
      'getMongoServerStatus',

    description:
      'Read MongoDB server health information from an external registered target.',
  });


const getMongoReplicaStatus =
  createReadOnlyHandler({
    type:
      'mongodb',

    action:
      'get_replica_status',

    serviceMethod:
      'getMongoReplicaStatus',

    description:
      'Inspect MongoDB replica-set health without changing membership or election state.',
  });


// ============================================================================
// AUTHORITATIVE HANDLER LIST
// ============================================================================

const handlers = [
  // Generic database
  checkConnectivity,
  getHealth,
  getConnections,
  checkConnectionPool,
  getStorage,
  checkStoragePressure,
  getReplicationStatus,
  checkReplicationLag,
  getSlowQueries,
  getLongTransactions,
  getLocks,
  checkDeadlocks,

  // PostgreSQL
  getPostgresActivity,
  getPostgresReplication,

  // MySQL
  getMysqlProcesslist,
  getMysqlReplication,

  // Redis
  getRedisInfo,
  getRedisMemory,
  getRedisReplication,

  // MongoDB
  getMongoServerStatus,
  getMongoReplicaStatus,
];


module.exports = {
  handlers,

  createReadOnlyHandler,
  sanitizeParams,
  resolveTargetId,
};