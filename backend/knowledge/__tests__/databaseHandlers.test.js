'use strict';

const {
  DATABASE_CAPABILITIES,
  buildDatabaseCapabilityMatrix,
} =
  require(
    '../databaseCapabilityMatrix'
  );

const {
  handlers,
} =
  require(
    '../../runbooks/actions/handlers/databaseHandlers'
  );

const {
  DatabaseDiagnosticService,
} =
  require(
    '../../services/infrastructure/databaseDiagnosticService'
  );

const {
  getActionHandlerRegistry,
  resetActionHandlerRegistry,
} =
  require(
    '../../runbooks/actions/actionHandlerRegistry'
  );


describe(
  'Phase 13.11 — Database diagnostic handlers',
  () => {
    beforeEach(
      () => {
        resetActionHandlerRegistry();
      }
    );


    afterEach(
      () => {
        resetActionHandlerRegistry();
      }
    );


    test(
      'implements exactly the Phase-13 database capability surface',
      () => {
        const required =
          DATABASE_CAPABILITIES
            .map(
              capability =>
                capability.handlerKey
            )
            .sort();

        const implemented =
          handlers
            .map(
              handler =>
                `${handler.type}/${handler.action}`
            )
            .sort();

        expect(
          implemented
        ).toEqual(
          required
        );
      }
    );


    test(
      'contains exactly 21 deterministic database handlers',
      () => {
        expect(
          handlers
        ).toHaveLength(
          21
        );
      }
    );


    test(
      'every database handler is read-only and automation-safe',
      () => {
        for (
          const handler
          of handlers
        ) {
          expect(
            handler
              .metadata
              .destructive
          ).toBe(
            false
          );

          expect(
            handler
              .metadata
              .automationSafe
          ).toBe(
            true
          );

          expect(
            handler
              .metadata
              .requiresConfirmation
          ).toBe(
            false
          );

          expect(
            handler
              .metadata
              .outputMayContainSecrets
          ).toBe(
            false
          );
        }
      }
    );


    test(
      'authoritative action registry loads all database handlers',
      () => {
        const registry =
          getActionHandlerRegistry();

        for (
          const capability
          of DATABASE_CAPABILITIES
        ) {
          const [
            type,
            action,
          ] =
            capability
              .handlerKey
              .split(
                '/'
              );

          expect(
            registry.has(
              type,
              action
            )
          ).toBe(
            true
          );
        }
      }
    );


    test(
      'database capability matrix becomes fully available from registry',
      () => {
        const registry =
          getActionHandlerRegistry();

        const matrix =
          buildDatabaseCapabilityMatrix(
            registry.keys()
          );

        expect(
          matrix.counts
            .available
        ).toBe(
          21
        );

        expect(
          matrix.counts
            .missing
        ).toBe(
          0
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


    test(
      'handlers require targetId during deterministic validation',
      () => {
        for (
          const handler
          of handlers
        ) {
          const result =
            handler.validate(
              {}
            );

          expect(
            result.valid
          ).toBe(
            false
          );

          expect(
            result.errors
              .some(
                error =>
                  /targetId/i
                    .test(
                      error
                    )
              )
          ).toBe(
            true
          );
        }
      }
    );


    test(
      'raw credential material is rejected during validation',
      () => {
        const handler =
          handlers.find(
            item =>
              item.type ===
                'database' &&
              item.action ===
                'get_health'
          );

        const result =
          handler.validate({
            targetId:
              'db-test',

            password:
              'should-not-exist',

            connectionString:
              'mongodb://user:pass@example/db',
          });

        expect(
          result.valid
        ).toBe(
          false
        );

        expect(
          result.errors
            .join(
              ' '
            )
        ).toMatch(
          /password/i
        );

        expect(
          result.errors
            .join(
              ' '
            )
        ).toMatch(
          /connectionString/i
        );
      }
    );


    test(
      'handler delegates to registered external diagnostic target',
      async () => {
        const service =
          new DatabaseDiagnosticService();

        service.registerClient(
          'db-test-1',
          {
            async getHealth() {
              return {
                healthy:
                  true,

                engine:
                  'test',
              };
            },
          }
        );

        const handler =
          handlers.find(
            item =>
              item.type ===
                'database' &&
              item.action ===
                'get_health'
          );

        const result =
          await handler.execute(
            {
              targetId:
                'db-test-1',
            },
            {
              databaseDiagnosticService:
                service,
            }
          );

        expect(
          result.success
        ).toBe(
          true
        );

        expect(
          result.diagnostic
        ).toBe(
          true
        );

        expect(
          result.healthy
        ).toBe(
          true
        );

        expect(
          result.engine
        ).toBe(
          'test'
        );
      }
    );


    test(
      'handler never requires AIRA internal MongoDB connection',
      async () => {
        const service =
          new DatabaseDiagnosticService();

        service.registerClient(
          'external-db',
          {
            async checkConnectivity() {
              return {
                reachable:
                  true,
              };
            },
          }
        );

        const handler =
          handlers.find(
            item =>
              item.type ===
                'database' &&
              item.action ===
                'check_connectivity'
          );

        const result =
          await handler.execute(
            {
              targetId:
                'external-db',
            },
            {
              databaseDiagnosticService:
                service,
            }
          );

        expect(
          result.reachable
        ).toBe(
          true
        );
      }
    );


    test(
      'unsupported target diagnostic method fails closed',
      async () => {
        const service =
          new DatabaseDiagnosticService();

        service.registerClient(
          'db-missing-method',
          {}
        );

        const handler =
          handlers.find(
            item =>
              item.type ===
                'database' &&
              item.action ===
                'get_connections'
          );

        await expect(
          handler.execute(
            {
              targetId:
                'db-missing-method',
            },
            {
              databaseDiagnosticService:
                service,
            }
          )
        ).rejects.toThrow(
          /does not support diagnostic method/i
        );
      }
    );
  }
);