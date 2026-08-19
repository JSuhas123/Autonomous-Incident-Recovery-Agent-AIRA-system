'use strict';

const {
  DATABASE_CAPABILITY_CLASS,
  DATABASE_CAPABILITIES,

  getDatabaseCapabilities,
  getRequiredDatabaseCapabilities,
  getDatabaseCapability,

  buildDatabaseCapabilityMatrix,
} =
  require(
    '../databaseCapabilityMatrix'
  );


describe(
  'Phase 13.11 — Database capability matrix',
  () => {

    test(
      'defines the expected Phase-13 database capability surface',
      () => {
        expect(
          DATABASE_CAPABILITIES
        ).toHaveLength(
          21
        );

        expect(
          getDatabaseCapabilities()
        ).toHaveLength(
          21
        );
      }
    );


    test(
      'capability handler keys are unique',
      () => {
        const keys =
          DATABASE_CAPABILITIES.map(
            capability =>
              capability.handlerKey
          );

        expect(
          new Set(
            keys
          ).size
        ).toBe(
          keys.length
        );
      }
    );


    test(
      'all Phase-13 database capabilities are required',
      () => {
        expect(
          getRequiredDatabaseCapabilities()
        ).toHaveLength(
          21
        );
      }
    );


    test(
      'database capability surface is observation/verification only',
      () => {
        const mutations =
          DATABASE_CAPABILITIES.filter(
            capability =>
              capability.class ===
              DATABASE_CAPABILITY_CLASS.MUTATE
          );

        expect(
          mutations
        ).toEqual(
          []
        );
      }
    );


    test(
      'contains generic database diagnostics',
      () => {
        expect(
          getDatabaseCapability(
            'database/get_connections'
          )
        ).not.toBeNull();

        expect(
          getDatabaseCapability(
            'database/get_locks'
          )
        ).not.toBeNull();

        expect(
          getDatabaseCapability(
            'database/get_slow_queries'
          )
        ).not.toBeNull();

        expect(
          getDatabaseCapability(
            'database/check_replication_lag'
          )
        ).not.toBeNull();
      }
    );


    test(
      'contains PostgreSQL, MySQL, Redis and MongoDB capabilities',
      () => {
        const required = [
          'postgres/get_activity',
          'postgres/get_replication',

          'mysql/get_processlist',
          'mysql/get_replication',

          'redis/get_info',
          'redis/get_memory',
          'redis/get_replication',

          'mongodb/get_server_status',
          'mongodb/get_replica_status',
        ];

        for (
          const handlerKey
          of required
        ) {
          expect(
            getDatabaseCapability(
              handlerKey
            )
          ).not.toBeNull();
        }
      }
    );


    test(
      'reports missing capabilities correctly',
      () => {
        const matrix =
          buildDatabaseCapabilityMatrix([
            'database/check_connectivity',
            'database/get_health',
            'redis/get_info',
          ]);

        expect(
          matrix.counts.total
        ).toBe(
          21
        );

        expect(
          matrix.counts.available
        ).toBe(
          3
        );

        expect(
          matrix.counts.missing
        ).toBe(
          18
        );

        expect(
          matrix.ready
        ).toBe(
          false
        );
      }
    );


    test(
      'becomes ready when every required capability exists',
      () => {
        const matrix =
          buildDatabaseCapabilityMatrix(
            DATABASE_CAPABILITIES.map(
              capability =>
                capability.handlerKey
            )
          );

        expect(
          matrix.counts
            .missingRequired
        ).toBe(
          0
        );

        expect(
          matrix.ready
        ).toBe(
          true
        );
      }
    );
  }
);