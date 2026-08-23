"use strict";

require(
  "dotenv"
)
  .config();

const crypto =
  require(
    "node:crypto"
  );

const {
  getPostgresPool,
  closePostgresPool,
} =
  require(
    "../postgres/postgresPool"
  );

const PostgresSignalRepository =
  require(
    "../postgres/PostgresSignalRepository"
  );

const PostgresSignalCorrelationRepository =
  require(
    "../postgres/PostgresSignalCorrelationRepository"
  );

const PostgresCorrelationTopologyRepository =
  require(
    "../postgres/PostgresCorrelationTopologyRepository"
  );

const enabled =
  String(
    process.env.POSTGRES_ENABLED ||
    ""
  )
    .trim()
    .toLowerCase() ===
  "true";

const describePostgres =
  enabled
    ? describe
    : describe.skip;

describePostgres(
  "Phase 13.4B PostgreSQL Signal Core",
  () => {
    let pool;
    let client;
    let transaction;

    let organizationId;
    let environmentId;

    let organizationUuid;
    let environmentUuid;

    let signalRepository;
    let correlationRepository;
    let topologyRepository;

    beforeAll(
      async () => {
        pool =
          getPostgresPool();
      }
    );

    beforeEach(
      async () => {
        client =
          await pool.connect();

        await client.query(
          "BEGIN"
        );

        transaction = {
          kind:
            "postgres",

          client,
        };

        organizationId =
          `org-${crypto.randomUUID()}`;

        environmentId =
          `env-${crypto.randomUUID()}`;

        const organization =
          await client.query(
            `
              INSERT INTO tenancy.organizations (
                public_id,
                name,
                status
              )
              VALUES ($1, $2, 'active')
              RETURNING id
            `,
            [
              organizationId,
              "13.4B Test Organization",
            ]
          );

        organizationUuid =
          organization.rows[0]
            .id;

        const environment =
          await client.query(
            `
              INSERT INTO tenancy.environments (
                public_id,
                organization_id,
                name,
                status
              )
              VALUES ($1, $2, $3, 'active')
              RETURNING id
            `,
            [
              environmentId,

              organizationUuid,

              "13.4B Environment",
            ]
          );

        environmentUuid =
          environment.rows[0]
            .id;

        signalRepository =
          new PostgresSignalRepository();

        correlationRepository =
          new PostgresSignalCorrelationRepository();

        topologyRepository =
          new PostgresCorrelationTopologyRepository();
      }
    );

    afterEach(
      async () => {
        if (client) {
          await client.query(
            "ROLLBACK"
          );

          client.release();
        }

        client =
          null;
      }
    );

    afterAll(
      async () => {
        await closePostgresPool();
      }
    );

    test(
      "creates and reloads canonical signal",
      async () => {
        const signal =
          await signalRepository
            .create(
              buildSignal(),
              transaction
            );

        expect(
          signal._id
        ).toHaveLength(
          24
        );

        const loaded =
          await signalRepository
            .findByDatabaseId(
              {
                organizationId,
                environmentId,
              },
              signal._id,
              transaction
            );

        expect(
          loaded.signalId
        ).toBe(
          signal.signalId
        );

        expect(
          loaded.processingStatus
        ).toBe(
          "enriched"
        );
      }
    );

    test(
      "supports deduplication filters and save semantics",
      async () => {
        const signal =
          await signalRepository
            .create(
              buildSignal(),
              transaction
            );

        const duplicate =
          await signalRepository
            .findLatestDuplicate(
              {
                organizationId,

                environmentId,

                fingerprint:
                  signal.fingerprint,

                lastSeenAt: {
                  $gte:
                    new Date(
                      Date.now() -
                      60000
                    ),
                },

                processingStatus: {
                  $ne:
                    "failed",
                },
              },
              transaction
            );

        expect(
          duplicate.signalId
        ).toBe(
          signal.signalId
        );

        duplicate.duplicateCount =
          1;

        duplicate.correlatedSignalIds =
          [
            "duplicate-1",
          ];

        const saved =
          await signalRepository
            .save(
              duplicate,
              transaction
            );

        expect(
          saved.duplicateCount
        ).toBe(
          1
        );

        expect(
          saved.correlatedSignalIds
        ).toContain(
          "duplicate-1"
        );
      }
    );

    test(
      "supports correlation query and Mongo-style updates",
      async () => {
        const first =
          await signalRepository
            .create(
              buildSignal(),
              transaction
            );

        const second =
          await signalRepository
            .create(
              buildSignal({
                signalId:
                  `signal-${crypto.randomUUID()}`,

                fingerprint:
                  `fingerprint-${crypto.randomUUID()}`,
              }),
              transaction
            );

        const candidates =
          await signalRepository
            .list(
              {
                organizationId,

                environmentId,

                _id: {
                  $ne:
                    first._id,
                },

                observedAt: {
                  $gte:
                    new Date(
                      Date.now() -
                      60000
                    ),

                  $lte:
                    new Date(
                      Date.now() +
                      60000
                    ),
                },

                processingStatus: {
                  $nin: [
                    "failed",
                    "ignored",
                  ],
                },
              },
              {
                limit:
                  100,
              },
              transaction
            );

        expect(
          candidates.some(
            (
              item
            ) =>
              item._id ===
              second._id
          )
        ).toBe(
          true
        );

        await signalRepository
          .updateOne(
            {
              organizationId,

              environmentId,

              _id:
                first._id,
            },
            {
              $set: {
                correlationGroupId:
                  "group-1",

                processingStatus:
                  "correlated",
              },

              $addToSet: {
                correlatedSignalIds: {
                  $each: [
                    second.signalId,
                  ],
                },
              },
            },
            transaction
          );

        const updated =
          await signalRepository
            .findByDatabaseId(
              {
                organizationId,

                environmentId,
              },
              first._id,
              transaction
            );

        expect(
          updated.correlationGroupId
        ).toBe(
          "group-1"
        );

        expect(
          updated.correlatedSignalIds
        ).toContain(
          second.signalId
        );
      }
    );

    test(
      "upserts and routes correlation group",
      async () => {
        const signal =
          await signalRepository
            .create(
              buildSignal(),
              transaction
            );

        const group =
          await correlationRepository
            .upsertGroup(
              {
                organizationId,

                environmentId,
              },
              "group-test",
              {
                set: {
                  tenantId:
                    "tenant-test",

                  status:
                    "active",

                  primarySignalId:
                    signal.signalId,

                  serviceId:
                    "service-a",

                  providers: [
                    "prometheus",
                  ],

                  signalTypes: [
                    "alert",
                  ],

                  highestSeverity:
                    "critical",

                  confidenceScore:
                    0.92,

                  incidentCandidate:
                    true,

                  signalCount:
                    1,

                  providerCount:
                    1,

                  evidence: [],
                },

                addSignalIds: [
                  signal.signalId,
                ],
              },
              transaction
            );

        expect(
          group.signalIds
        ).toContain(
          signal.signalId
        );

        expect(
          group.incidentCandidate
        ).toBe(
          true
        );

        await correlationRepository
          .updateOne(
            {
              _id:
                group._id,

              organizationId,

              environmentId,
            },
            {
              $set: {
                status:
                  "routed",

                routedAt:
                  new Date(),
              },
            },
            transaction
          );

        const routed =
          await correlationRepository
            .findGroup(
              {
                organizationId,

                environmentId,
              },
              "group-test",
              transaction
            );

        expect(
          routed.status
        ).toBe(
          "routed"
        );
      }
    );

    test(
      "detects service and resource topology relationships",
      async () => {
        await client.query(
          `
            SELECT
              set_config(
                'aira.organization_id',
                $1,
                true
              ),
              set_config(
                'aira.environment_id',
                $2,
                true
              )
          `,
          [
            String(
              organizationUuid
            ),

            String(
              environmentUuid
            ),
          ]
        );

        await client.query(
          `
            INSERT INTO resources.service_dependencies (
              organization_id,
              environment_id,
              tenant_public_id,
              source_service_id,
              target_service_id,
              active
            )
            VALUES (
              $1,
              $2,
              'tenant-test',
              'service-a',
              'service-b',
              TRUE
            )
          `,
          [
            organizationUuid,
            environmentUuid,
          ]
        );

        await client.query(
          `
            INSERT INTO resources.correlation_resource_relationships (
              organization_id,
              environment_id,
              tenant_public_id,
              source_type,
              source_id,
              target_type,
              target_id,
              relationship_type,
              active
            )
            VALUES (
              $1,
              $2,
              'tenant-test',
              'service',
              'service-a',
              'resource',
              'resource-b',
              'depends_on',
              TRUE
            )
          `,
          [
            organizationUuid,
            environmentUuid,
          ]
        );

        expect(
          await topologyRepository
            .hasServiceDependency(
              {
                organizationId,
                environmentId,
              },
              "service-a",
              "service-b",
              transaction
            )
        ).toBe(
          true
        );

        expect(
          await topologyRepository
            .hasResourceRelationship(
              {
                organizationId,
                environmentId,
              },
              {
                type:
                  "service",

                id:
                  "service-a",
              },
              {
                type:
                  "resource",

                id:
                  "resource-b",
              },
              transaction
            )
        ).toBe(
          true
        );
      }
    );

    function buildSignal(
      overrides = {}
    ) {
      const now =
        new Date();

      return {
        signalId:
          `signal-${crypto.randomUUID()}`,

        organizationId,

        environmentId,

        tenantId:
          "tenant-test",

        serviceId:
          "service-a",

        source:
          "integration",

        provider:
          "prometheus",

        signalType:
          "alert",

        eventType:
          "high_cpu",

        severity:
          "critical",

        title:
          "High CPU",

        description:
          "CPU exceeded threshold",

        resource: {
          serviceName:
            "api",
        },

        attributes: {
          cpu:
            95,
        },

        fingerprint:
          `fingerprint-${crypto.randomUUID()}`,

        duplicateCount:
          0,

        correlatedSignalIds:
          [],

        processingStatus:
          "enriched",

        incidentCandidate:
          false,

        observedAt:
          now,

        receivedAt:
          now,

        firstSeenAt:
          now,

        lastSeenAt:
          now,

        schemaVersion:
          1,

        metadata:
          {},

        ...overrides,
      };
    }
  }
);