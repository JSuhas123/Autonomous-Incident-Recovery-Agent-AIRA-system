'use strict';

/**
 * Phase 13.11 — Database Catalogue Expansion Pack
 *
 * DATA ONLY.
 *
 * This pack intentionally contains diagnostic/read-only knowledge.
 * It does NOT:
 * - connect directly to databases
 * - contain credentials
 * - execute arbitrary SQL
 * - terminate sessions
 * - promote replicas
 * - perform failover
 * - mutate database configuration
 * - modify AIRA's internal MongoDB
 */

const DB_PARAMETER = Object.freeze({
  TARGET: {
    name: 'targetId',
    type: 'string',
    required: true,
    description:
      'Identifier of an explicitly registered external database diagnostic target.',
  },
});

function targetParameters() {
  return [
    { ...DB_PARAMETER.TARGET },
  ];
}

function risk(level = 'LOW') {
  return {
    level,
    blastRadius: 'none',
    reversible: true,
  };
}

function step({
  id,
  name,
  order,
  type,
  action,
  extraParams = {},
  failurePolicy = 'STOP',
}) {
  return {
    id,
    name,
    order,
    type,
    action,
    params: {
      targetId: '${targetId}',
      ...extraParams,
    },
    failurePolicy,
  };
}

function verification(
  description
) {
  return {
    strategy: 'ALL',
    timeoutSeconds: 30,
    checks: [
      {
        id: 'check-01',
        type: 'diagnostic_completed',
        description,
        timeoutSeconds: 30,
        optional: false,
      },
    ],
  };
}

function runbook({
  file,
  runbookId,
  name,
  description,
  steps,
}) {
  return {
    file,
    runbookId,
    name,
    description,

    lifecycle: 'ACTIVE',

    risk: risk(),

    parameters:
      targetParameters(),

    steps,

    verification:
      verification(
        `${name} completed and returned diagnostic evidence.`
      ),
  };
}


// ============================================================================
// RUNBOOKS — 21
// ============================================================================

const DATABASE_RUNBOOKS = Object.freeze([

  // --------------------------------------------------------------------------
  // GENERIC DATABASE
  // --------------------------------------------------------------------------

  runbook({
    file:
      'databases/rb-db-check-connectivity.yaml',

    runbookId:
      'RB-DB-CHECK-CONNECTIVITY',

    name:
      'Database Connectivity Check',

    description:
      'Read-only connectivity assessment for an explicitly registered external database target.',

    steps: [
      step({
        id: 'step-01',
        name: 'Check database connectivity',
        order: 1,
        type: 'database',
        action: 'check_connectivity',
      }),
    ],
  }),


  runbook({
    file:
      'databases/rb-db-check-health.yaml',

    runbookId:
      'RB-DB-CHECK-HEALTH',

    name:
      'Database Health Assessment',

    description:
      'Read-only assessment of database availability and current health state.',

    steps: [
      step({
        id: 'step-01',
        name: 'Read database health',
        order: 1,
        type: 'database',
        action: 'get_health',
      }),

      step({
        id: 'step-02',
        name: 'Verify database connectivity',
        order: 2,
        type: 'database',
        action: 'check_connectivity',
        failurePolicy: 'CONTINUE',
      }),
    ],
  }),


  runbook({
    file:
      'databases/rb-db-investigate-connections.yaml',

    runbookId:
      'RB-DB-INVESTIGATE-CONNECTIONS',

    name:
      'Database Connection Exhaustion Investigation',

    description:
      'Investigates database connection utilization and connection-pool pressure without terminating sessions.',

    steps: [
      step({
        id: 'step-01',
        name: 'Inspect active connections',
        order: 1,
        type: 'database',
        action: 'get_connections',
      }),

      step({
        id: 'step-02',
        name: 'Evaluate connection pool',
        order: 2,
        type: 'database',
        action: 'check_connection_pool',
      }),

      step({
        id: 'step-03',
        name: 'Read database health',
        order: 3,
        type: 'database',
        action: 'get_health',
        failurePolicy: 'CONTINUE',
      }),
    ],
  }),


  runbook({
    file:
      'databases/rb-db-verify-connection-pool.yaml',

    runbookId:
      'RB-DB-VERIFY-CONNECTION-POOL',

    name:
      'Database Connection Pool Verification',

    description:
      'Verifies whether database connection-pool utilization is currently within healthy limits.',

    steps: [
      step({
        id: 'step-01',
        name: 'Check connection pool',
        order: 1,
        type: 'database',
        action: 'check_connection_pool',
      }),

      step({
        id: 'step-02',
        name: 'Inspect active connections',
        order: 2,
        type: 'database',
        action: 'get_connections',
        failurePolicy: 'CONTINUE',
      }),
    ],
  }),


  runbook({
    file:
      'databases/rb-db-investigate-storage.yaml',

    runbookId:
      'RB-DB-INVESTIGATE-STORAGE',

    name:
      'Database Storage Pressure Investigation',

    description:
      'Investigates database storage utilization and pressure without deleting or modifying data.',

    steps: [
      step({
        id: 'step-01',
        name: 'Inspect database storage',
        order: 1,
        type: 'database',
        action: 'get_storage',
      }),

      step({
        id: 'step-02',
        name: 'Evaluate storage pressure',
        order: 2,
        type: 'database',
        action: 'check_storage_pressure',
      }),

      step({
        id: 'step-03',
        name: 'Read database health',
        order: 3,
        type: 'database',
        action: 'get_health',
        failurePolicy: 'CONTINUE',
      }),
    ],
  }),


  runbook({
    file:
      'databases/rb-db-verify-storage.yaml',

    runbookId:
      'RB-DB-VERIFY-STORAGE',

    name:
      'Database Storage Verification',

    description:
      'Verifies database storage pressure and current capacity using read-only diagnostics.',

    steps: [
      step({
        id: 'step-01',
        name: 'Check storage pressure',
        order: 1,
        type: 'database',
        action: 'check_storage_pressure',
      }),

      step({
        id: 'step-02',
        name: 'Read storage state',
        order: 2,
        type: 'database',
        action: 'get_storage',
        failurePolicy: 'CONTINUE',
      }),
    ],
  }),


  runbook({
    file:
      'databases/rb-db-investigate-replication.yaml',

    runbookId:
      'RB-DB-INVESTIGATE-REPLICATION',

    name:
      'Database Replication Investigation',

    description:
      'Investigates generic database replication health and lag without changing topology.',

    steps: [
      step({
        id: 'step-01',
        name: 'Read replication status',
        order: 1,
        type: 'database',
        action: 'get_replication_status',
      }),

      step({
        id: 'step-02',
        name: 'Evaluate replication lag',
        order: 2,
        type: 'database',
        action: 'check_replication_lag',
      }),

      step({
        id: 'step-03',
        name: 'Read database health',
        order: 3,
        type: 'database',
        action: 'get_health',
        failurePolicy: 'CONTINUE',
      }),
    ],
  }),


  runbook({
    file:
      'databases/rb-db-verify-replication.yaml',

    runbookId:
      'RB-DB-VERIFY-REPLICATION',

    name:
      'Database Replication Verification',

    description:
      'Verifies generic database replication state and lag without performing failover.',

    steps: [
      step({
        id: 'step-01',
        name: 'Check replication lag',
        order: 1,
        type: 'database',
        action: 'check_replication_lag',
      }),

      step({
        id: 'step-02',
        name: 'Read replication status',
        order: 2,
        type: 'database',
        action: 'get_replication_status',
        failurePolicy: 'CONTINUE',
      }),
    ],
  }),


  runbook({
    file:
      'databases/rb-db-investigate-slow-queries.yaml',

    runbookId:
      'RB-DB-INVESTIGATE-SLOW-QUERIES',

    name:
      'Database Slow Query Investigation',

    description:
      'Collects slow-query and transaction evidence without terminating queries or changing indexes.',

    steps: [
      step({
        id: 'step-01',
        name: 'Collect slow queries',
        order: 1,
        type: 'database',
        action: 'get_slow_queries',
      }),

      step({
        id: 'step-02',
        name: 'Inspect long transactions',
        order: 2,
        type: 'database',
        action: 'get_long_transactions',
        failurePolicy: 'CONTINUE',
      }),

      step({
        id: 'step-03',
        name: 'Inspect locks',
        order: 3,
        type: 'database',
        action: 'get_locks',
        failurePolicy: 'CONTINUE',
      }),
    ],
  }),


  runbook({
    file:
      'databases/rb-db-investigate-long-transactions.yaml',

    runbookId:
      'RB-DB-INVESTIGATE-LONG-TRANSACTIONS',

    name:
      'Database Long Transaction Investigation',

    description:
      'Inspects long-running transactions and related lock state without terminating sessions.',

    steps: [
      step({
        id: 'step-01',
        name: 'Inspect long transactions',
        order: 1,
        type: 'database',
        action: 'get_long_transactions',
      }),

      step({
        id: 'step-02',
        name: 'Inspect locks',
        order: 2,
        type: 'database',
        action: 'get_locks',
        failurePolicy: 'CONTINUE',
      }),
    ],
  }),


  runbook({
    file:
      'databases/rb-db-investigate-locks.yaml',

    runbookId:
      'RB-DB-INVESTIGATE-LOCKS',

    name:
      'Database Lock Contention Investigation',

    description:
      'Inspects database lock and blocking relationships without killing blocking sessions.',

    steps: [
      step({
        id: 'step-01',
        name: 'Inspect locks',
        order: 1,
        type: 'database',
        action: 'get_locks',
      }),

      step({
        id: 'step-02',
        name: 'Inspect long transactions',
        order: 2,
        type: 'database',
        action: 'get_long_transactions',
        failurePolicy: 'CONTINUE',
      }),

      step({
        id: 'step-03',
        name: 'Check deadlocks',
        order: 3,
        type: 'database',
        action: 'check_deadlocks',
        failurePolicy: 'CONTINUE',
      }),
    ],
  }),


  runbook({
    file:
      'databases/rb-db-investigate-deadlocks.yaml',

    runbookId:
      'RB-DB-INVESTIGATE-DEADLOCKS',

    name:
      'Database Deadlock Investigation',

    description:
      'Investigates detected database deadlocks and supporting lock evidence without terminating transactions.',

    steps: [
      step({
        id: 'step-01',
        name: 'Check deadlock state',
        order: 1,
        type: 'database',
        action: 'check_deadlocks',
      }),

      step({
        id: 'step-02',
        name: 'Inspect lock relationships',
        order: 2,
        type: 'database',
        action: 'get_locks',
        failurePolicy: 'CONTINUE',
      }),

      step({
        id: 'step-03',
        name: 'Inspect long transactions',
        order: 3,
        type: 'database',
        action: 'get_long_transactions',
        failurePolicy: 'CONTINUE',
      }),
    ],
  }),


  // --------------------------------------------------------------------------
  // POSTGRESQL
  // --------------------------------------------------------------------------

  runbook({
    file:
      'databases/rb-postgres-investigate-activity.yaml',

    runbookId:
      'RB-POSTGRES-INVESTIGATE-ACTIVITY',

    name:
      'PostgreSQL Activity Investigation',

    description:
      'Inspects PostgreSQL activity and supporting generic database evidence without terminating sessions.',

    steps: [
      step({
        id: 'step-01',
        name: 'Inspect PostgreSQL activity',
        order: 1,
        type: 'postgres',
        action: 'get_activity',
      }),

      step({
        id: 'step-02',
        name: 'Inspect database locks',
        order: 2,
        type: 'database',
        action: 'get_locks',
        failurePolicy: 'CONTINUE',
      }),

      step({
        id: 'step-03',
        name: 'Inspect slow queries',
        order: 3,
        type: 'database',
        action: 'get_slow_queries',
        failurePolicy: 'CONTINUE',
      }),
    ],
  }),


  runbook({
    file:
      'databases/rb-postgres-investigate-replication.yaml',

    runbookId:
      'RB-POSTGRES-INVESTIGATE-REPLICATION',

    name:
      'PostgreSQL Replication Investigation',

    description:
      'Inspects PostgreSQL replication state and generic replication lag without promotion or failover.',

    steps: [
      step({
        id: 'step-01',
        name: 'Inspect PostgreSQL replication',
        order: 1,
        type: 'postgres',
        action: 'get_replication',
      }),

      step({
        id: 'step-02',
        name: 'Check replication lag',
        order: 2,
        type: 'database',
        action: 'check_replication_lag',
      }),
    ],
  }),


  // --------------------------------------------------------------------------
  // MYSQL
  // --------------------------------------------------------------------------

  runbook({
    file:
      'databases/rb-mysql-investigate-processlist.yaml',

    runbookId:
      'RB-MYSQL-INVESTIGATE-PROCESSLIST',

    name:
      'MySQL Process Activity Investigation',

    description:
      'Inspects MySQL process activity and supporting database evidence without killing sessions.',

    steps: [
      step({
        id: 'step-01',
        name: 'Inspect MySQL process list',
        order: 1,
        type: 'mysql',
        action: 'get_processlist',
      }),

      step({
        id: 'step-02',
        name: 'Inspect database locks',
        order: 2,
        type: 'database',
        action: 'get_locks',
        failurePolicy: 'CONTINUE',
      }),

      step({
        id: 'step-03',
        name: 'Inspect long transactions',
        order: 3,
        type: 'database',
        action: 'get_long_transactions',
        failurePolicy: 'CONTINUE',
      }),
    ],
  }),


  runbook({
    file:
      'databases/rb-mysql-investigate-replication.yaml',

    runbookId:
      'RB-MYSQL-INVESTIGATE-REPLICATION',

    name:
      'MySQL Replication Investigation',

    description:
      'Inspects MySQL replication state and generic lag without modifying replica configuration.',

    steps: [
      step({
        id: 'step-01',
        name: 'Inspect MySQL replication',
        order: 1,
        type: 'mysql',
        action: 'get_replication',
      }),

      step({
        id: 'step-02',
        name: 'Check replication lag',
        order: 2,
        type: 'database',
        action: 'check_replication_lag',
      }),
    ],
  }),


  // --------------------------------------------------------------------------
  // REDIS
  // --------------------------------------------------------------------------

  runbook({
    file:
      'databases/rb-redis-investigate-health.yaml',

    runbookId:
      'RB-REDIS-INVESTIGATE-HEALTH',

    name:
      'Redis Health Investigation',

    description:
      'Inspects Redis operational information and connectivity without changing configuration.',

    steps: [
      step({
        id: 'step-01',
        name: 'Read Redis operational information',
        order: 1,
        type: 'redis',
        action: 'get_info',
      }),

      step({
        id: 'step-02',
        name: 'Check database connectivity',
        order: 2,
        type: 'database',
        action: 'check_connectivity',
        failurePolicy: 'CONTINUE',
      }),
    ],
  }),


  runbook({
    file:
      'databases/rb-redis-investigate-memory.yaml',

    runbookId:
      'RB-REDIS-INVESTIGATE-MEMORY',

    name:
      'Redis Memory Pressure Investigation',

    description:
      'Inspects Redis memory state without flushing data or changing maxmemory and eviction policy.',

    steps: [
      step({
        id: 'step-01',
        name: 'Inspect Redis memory',
        order: 1,
        type: 'redis',
        action: 'get_memory',
      }),

      step({
        id: 'step-02',
        name: 'Read Redis operational information',
        order: 2,
        type: 'redis',
        action: 'get_info',
        failurePolicy: 'CONTINUE',
      }),
    ],
  }),


  runbook({
    file:
      'databases/rb-redis-investigate-replication.yaml',

    runbookId:
      'RB-REDIS-INVESTIGATE-REPLICATION',

    name:
      'Redis Replication Investigation',

    description:
      'Inspects Redis replication state without promotion, failover, or topology mutation.',

    steps: [
      step({
        id: 'step-01',
        name: 'Inspect Redis replication',
        order: 1,
        type: 'redis',
        action: 'get_replication',
      }),

      step({
        id: 'step-02',
        name: 'Read Redis operational information',
        order: 2,
        type: 'redis',
        action: 'get_info',
        failurePolicy: 'CONTINUE',
      }),
    ],
  }),


  // --------------------------------------------------------------------------
  // MONGODB
  // --------------------------------------------------------------------------

  runbook({
    file:
      'databases/rb-mongodb-investigate-health.yaml',

    runbookId:
      'RB-MONGODB-INVESTIGATE-HEALTH',

    name:
      'MongoDB Health Investigation',

    description:
      'Inspects an external MongoDB target server status without using or modifying AIRA internal MongoDB.',

    steps: [
      step({
        id: 'step-01',
        name: 'Read MongoDB server status',
        order: 1,
        type: 'mongodb',
        action: 'get_server_status',
      }),

      step({
        id: 'step-02',
        name: 'Check database connectivity',
        order: 2,
        type: 'database',
        action: 'check_connectivity',
        failurePolicy: 'CONTINUE',
      }),
    ],
  }),


  runbook({
    file:
      'databases/rb-mongodb-investigate-replica-set.yaml',

    runbookId:
      'RB-MONGODB-INVESTIGATE-REPLICA-SET',

    name:
      'MongoDB Replica Set Investigation',

    description:
      'Inspects MongoDB replica-set state without reconfiguration, election manipulation, or failover.',

    steps: [
      step({
        id: 'step-01',
        name: 'Inspect MongoDB replica-set status',
        order: 1,
        type: 'mongodb',
        action: 'get_replica_status',
      }),

      step({
        id: 'step-02',
        name: 'Read MongoDB server status',
        order: 2,
        type: 'mongodb',
        action: 'get_server_status',
        failurePolicy: 'CONTINUE',
      }),
    ],
  }),
]);


// ============================================================================
// PLAYBOOK HELPERS
// ============================================================================

function runbookRef(
  runbookId
) {
  return {
    runbookId,
    required: true,
    parameterMappings: {
      targetId:
        '${incident.resource.targetId}',
    },
  };
}


function stage({
  id,
  order,
  name,
  type,
  runbooks,
  failurePolicy = 'STOP',
}) {
  return {
    id,
    order,
    name,
    type,
    failurePolicy,
    runbooks:
      runbooks.map(
        runbookRef
      ),
  };
}


function playbook({
  file,
  playbookId,
  name,
  description,
  incidentTypes,
  providers,
  requiredEvidence,
  stages,
  riskLevel = 'LOW',
  approvalMode = 'MANUAL',
}) {
  return {
    file,
    playbookId,
    semver: '1.0.0',
    name,
    description,

    lifecycle: 'DRAFT',

    incident: {
      types:
        incidentTypes,

      severities: [
        'P1',
        'P2',
        'critical',
        'high',
      ],

      providers,

      environments: [
        'production',
        'staging',
      ],
    },

    requiredEvidence,

    minimumConfidence:
      0.75,

    risk: {
      level:
        riskLevel,

      blastRadius:
        'database-target',
    },

    approvalMode,

    stages,
  };
}


// ============================================================================
// NEW PLAYBOOKS — 9
//
// Existing:
// PB-DB-CONN-EXHAUST-001
// PB-DB-DISK-PRESSURE-001
// PB-DB-REPLICATION-LAG-001
//
// They are deliberately NOT duplicated here.
// ============================================================================

const DATABASE_PLAYBOOKS = Object.freeze([

  playbook({
    file:
      'databases/pb-db-unavailable-001.yaml',

    playbookId:
      'PB-DB-UNAVAILABLE-001',

    name:
      'Database Availability Investigation',

    description:
      'Investigates database unavailability using read-only connectivity and health diagnostics.',

    incidentTypes: [
      'DatabaseUnavailable',
      'DatabaseConnectivityFailure',
      'database.unavailable',
    ],

    providers: [
      'database',
      'postgresql',
      'mysql',
      'mongodb',
    ],

    requiredEvidence: [
      'resource.targetId',
    ],

    stages: [
      stage({
        id: 'check-connectivity',
        order: 1,
        name: 'Check Connectivity',
        type: 'INVESTIGATION',
        runbooks: [
          'RB-DB-CHECK-CONNECTIVITY',
        ],
      }),

      stage({
        id: 'check-health',
        order: 2,
        name: 'Assess Database Health',
        type: 'VERIFICATION',
        failurePolicy: 'ESCALATE',
        runbooks: [
          'RB-DB-CHECK-HEALTH',
        ],
      }),
    ],
  }),


  playbook({
    file:
      'databases/pb-db-slow-query-001.yaml',

    playbookId:
      'PB-DB-SLOW-QUERY-001',

    name:
      'Database Slow Query Investigation',

    description:
      'Investigates slow-query degradation, transaction duration, and lock evidence without query termination.',

    incidentTypes: [
      'DatabaseSlowQuery',
      'DatabaseLatencyHigh',
      'database.slow_query',
    ],

    providers: [
      'database',
      'postgresql',
      'mysql',
    ],

    requiredEvidence: [
      'resource.targetId',
    ],

    stages: [
      stage({
        id: 'investigate-queries',
        order: 1,
        name: 'Investigate Slow Queries',
        type: 'INVESTIGATION',
        runbooks: [
          'RB-DB-INVESTIGATE-SLOW-QUERIES',
        ],
      }),

      stage({
        id: 'verify-health',
        order: 2,
        name: 'Verify Database Health',
        type: 'VERIFICATION',
        failurePolicy: 'ESCALATE',
        runbooks: [
          'RB-DB-CHECK-HEALTH',
        ],
      }),
    ],
  }),


  playbook({
    file:
      'databases/pb-db-long-transaction-001.yaml',

    playbookId:
      'PB-DB-LONG-TRANSACTION-001',

    name:
      'Database Long Transaction Investigation',

    description:
      'Investigates long-running transactions and related lock contention without terminating transactions.',

    incidentTypes: [
      'DatabaseLongTransaction',
      'database.long_transaction',
    ],

    providers: [
      'database',
      'postgresql',
      'mysql',
    ],

    requiredEvidence: [
      'resource.targetId',
    ],

    stages: [
      stage({
        id: 'investigate-transactions',
        order: 1,
        name: 'Investigate Long Transactions',
        type: 'INVESTIGATION',
        runbooks: [
          'RB-DB-INVESTIGATE-LONG-TRANSACTIONS',
        ],
      }),

      stage({
        id: 'inspect-locks',
        order: 2,
        name: 'Inspect Lock Relationships',
        type: 'INVESTIGATION',
        runbooks: [
          'RB-DB-INVESTIGATE-LOCKS',
        ],
      }),
    ],
  }),


  playbook({
    file:
      'databases/pb-db-lock-contention-001.yaml',

    playbookId:
      'PB-DB-LOCK-CONTENTION-001',

    name:
      'Database Lock Contention Investigation',

    description:
      'Investigates lock contention and blocking relationships without terminating sessions.',

    incidentTypes: [
      'DatabaseLockContention',
      'DatabaseBlocking',
      'database.lock_contention',
    ],

    providers: [
      'database',
      'postgresql',
      'mysql',
    ],

    requiredEvidence: [
      'resource.targetId',
    ],

    stages: [
      stage({
        id: 'investigate-locks',
        order: 1,
        name: 'Investigate Locks',
        type: 'INVESTIGATION',
        runbooks: [
          'RB-DB-INVESTIGATE-LOCKS',
        ],
      }),

      stage({
        id: 'investigate-transactions',
        order: 2,
        name: 'Inspect Long Transactions',
        type: 'INVESTIGATION',
        runbooks: [
          'RB-DB-INVESTIGATE-LONG-TRANSACTIONS',
        ],
      }),
    ],
  }),


  playbook({
    file:
      'databases/pb-db-deadlock-001.yaml',

    playbookId:
      'PB-DB-DEADLOCK-001',

    name:
      'Database Deadlock Investigation',

    description:
      'Investigates database deadlock conditions and supporting lock evidence without terminating transactions.',

    incidentTypes: [
      'DatabaseDeadlock',
      'database.deadlock',
    ],

    providers: [
      'database',
      'postgresql',
      'mysql',
    ],

    requiredEvidence: [
      'resource.targetId',
    ],

    stages: [
      stage({
        id: 'investigate-deadlock',
        order: 1,
        name: 'Investigate Deadlock',
        type: 'INVESTIGATION',
        runbooks: [
          'RB-DB-INVESTIGATE-DEADLOCKS',
        ],
      }),

      stage({
        id: 'verify-health',
        order: 2,
        name: 'Verify Database Health',
        type: 'VERIFICATION',
        failurePolicy: 'ESCALATE',
        runbooks: [
          'RB-DB-CHECK-HEALTH',
        ],
      }),
    ],
  }),


  playbook({
    file:
      'databases/pb-postgres-replication-degraded-001.yaml',

    playbookId:
      'PB-POSTGRES-REPLICATION-DEGRADED-001',

    name:
      'PostgreSQL Replication Degradation Investigation',

    description:
      'Investigates PostgreSQL replication degradation without promotion, failover, or topology mutation.',

    incidentTypes: [
      'PostgresReplicationLag',
      'PostgresReplicationDegraded',
      'postgresql.replication.degraded',
    ],

    providers: [
      'postgresql',
      'postgres',
    ],

    requiredEvidence: [
      'resource.targetId',
    ],

    stages: [
      stage({
        id: 'postgres-replication',
        order: 1,
        name: 'Inspect PostgreSQL Replication',
        type: 'INVESTIGATION',
        runbooks: [
          'RB-POSTGRES-INVESTIGATE-REPLICATION',
        ],
      }),

      stage({
        id: 'verify-replication',
        order: 2,
        name: 'Verify Replication State',
        type: 'VERIFICATION',
        failurePolicy: 'ESCALATE',
        runbooks: [
          'RB-DB-VERIFY-REPLICATION',
        ],
      }),
    ],
  }),


  playbook({
    file:
      'databases/pb-mysql-replication-degraded-001.yaml',

    playbookId:
      'PB-MYSQL-REPLICATION-DEGRADED-001',

    name:
      'MySQL Replication Degradation Investigation',

    description:
      'Investigates MySQL replication degradation without modifying replica configuration.',

    incidentTypes: [
      'MySQLReplicationLag',
      'MySQLReplicationDegraded',
      'mysql.replication.degraded',
    ],

    providers: [
      'mysql',
    ],

    requiredEvidence: [
      'resource.targetId',
    ],

    stages: [
      stage({
        id: 'mysql-replication',
        order: 1,
        name: 'Inspect MySQL Replication',
        type: 'INVESTIGATION',
        runbooks: [
          'RB-MYSQL-INVESTIGATE-REPLICATION',
        ],
      }),

      stage({
        id: 'verify-replication',
        order: 2,
        name: 'Verify Replication State',
        type: 'VERIFICATION',
        failurePolicy: 'ESCALATE',
        runbooks: [
          'RB-DB-VERIFY-REPLICATION',
        ],
      }),
    ],
  }),


  playbook({
    file:
      'databases/pb-redis-memory-pressure-001.yaml',

    playbookId:
      'PB-REDIS-MEMORY-PRESSURE-001',

    name:
      'Redis Memory Pressure Investigation',

    description:
      'Investigates Redis memory pressure without flushing data or changing memory configuration.',

    incidentTypes: [
      'RedisMemoryPressure',
      'RedisMemoryHigh',
      'redis.memory.pressure',
    ],

    providers: [
      'redis',
    ],

    requiredEvidence: [
      'resource.targetId',
    ],

    stages: [
      stage({
        id: 'investigate-memory',
        order: 1,
        name: 'Investigate Redis Memory',
        type: 'INVESTIGATION',
        runbooks: [
          'RB-REDIS-INVESTIGATE-MEMORY',
        ],
      }),

      stage({
        id: 'verify-redis-health',
        order: 2,
        name: 'Verify Redis Health',
        type: 'VERIFICATION',
        failurePolicy: 'ESCALATE',
        runbooks: [
          'RB-REDIS-INVESTIGATE-HEALTH',
        ],
      }),
    ],
  }),


  playbook({
    file:
      'databases/pb-mongodb-replica-degraded-001.yaml',

    playbookId:
      'PB-MONGODB-REPLICA-DEGRADED-001',

    name:
      'MongoDB Replica Set Degradation Investigation',

    description:
      'Investigates MongoDB replica-set degradation without changing replica membership or election state.',

    incidentTypes: [
      'MongoReplicaSetDegraded',
      'MongoReplicationFailure',
      'mongodb.replica.degraded',
    ],

    providers: [
      'mongodb',
      'mongo',
    ],

    requiredEvidence: [
      'resource.targetId',
    ],

    stages: [
      stage({
        id: 'investigate-replica-set',
        order: 1,
        name: 'Investigate MongoDB Replica Set',
        type: 'INVESTIGATION',
        runbooks: [
          'RB-MONGODB-INVESTIGATE-REPLICA-SET',
        ],
      }),

      stage({
        id: 'verify-mongo-health',
        order: 2,
        name: 'Verify MongoDB Health',
        type: 'VERIFICATION',
        failurePolicy: 'ESCALATE',
        runbooks: [
          'RB-MONGODB-INVESTIGATE-HEALTH',
        ],
      }),
    ],
  }),
]);


module.exports = {
  DATABASE_RUNBOOKS,
  DATABASE_PLAYBOOKS,
};