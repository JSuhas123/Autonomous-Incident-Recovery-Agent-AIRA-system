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

const PostgresIncidentRepository =
  require(
    "../postgres/PostgresIncidentRepository"
  );

const PostgresIncidentEventRepository =
  require(
    "../postgres/PostgresIncidentEventRepository"
  );

const PostgresIncidentLifecycleRepository =
  require(
    "../postgres/PostgresIncidentLifecycleRepository"
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
  "Phase 13.4A PostgreSQL Incident Core",
  () => {
    let pool;

    let client;

    let transaction;

    let organizationId;

    let environmentId;

    let incidentRepository;

    let eventRepository;

    let lifecycleRepository;

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
              "13.4A Test Organization",
            ]
          );

        await client.query(
          `
            INSERT INTO tenancy.environments (
              public_id,
              organization_id,
              name,
              status
            )
            VALUES ($1, $2, $3, 'active')
          `,
          [
            environmentId,

            organization.rows[0]
              .id,

            "13.4A Test Environment",
          ]
        );

        incidentRepository =
          new PostgresIncidentRepository();

        eventRepository =
          new PostgresIncidentEventRepository();

        lifecycleRepository =
          new PostgresIncidentLifecycleRepository();
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
      "creates, queries and updates Incident aggregate",
      async () => {
        const incident =
          await incidentRepository
            .create(
              {
                organizationId,

                environmentId,

                tenantId:
                  "tenant-test",

                serviceId:
                  "service-1",

                monitorId:
                  "monitor-1",

                source:
                  "monitor",

                detectionMethod:
                  "monitor_transition",

                fingerprint:
                  `fingerprint-${crypto.randomUUID()}`,

                title:
                  "PostgreSQL test incident",

                description:
                  "13.4A integration test",

                severity:
                  "critical",

                status:
                  "open",

                occurrenceCount:
                  1,

                providers: [
                  "monitor",
                ],

                providerCount:
                  1,

                evidence:
                  [],

                timeline:
                  [],

                metadata: {
                  test:
                    true,
                },
              },
              transaction
            );

        expect(
          incident._id
        ).toHaveLength(
          24
        );

        const found =
          await incidentRepository
            .findOne(
              {
                organizationId,

                environmentId,

                fingerprint:
                  incident.fingerprint,

                status: {
                  $in: [
                    "open",
                    "investigating",
                  ],
                },
              },
              transaction
            );

        expect(
          found._id
        ).toBe(
          incident._id
        );

        found.occurrenceCount =
          2;

        found.timeline.push({
          eventType:
            "test_update",

          occurredAt:
            new Date(),
        });

        const saved =
          await incidentRepository
            .save(
              found,
              transaction
            );

        expect(
          saved.occurrenceCount
        ).toBe(
          2
        );

        expect(
          saved.timeline
        ).toHaveLength(
          1
        );
      }
    );

    test(
      "preserves active incident uniqueness",
      async () => {
        const fingerprint =
          `duplicate-${crypto.randomUUID()}`;

        const data = {
          organizationId,

          environmentId,

          tenantId:
            "tenant-test",

          serviceId:
            "service-1",

          fingerprint,

          title:
            "Duplicate",

          severity:
            "warning",

          status:
            "open",
        };

        await incidentRepository
          .create(
            data,
            transaction
          );

        await expect(
          incidentRepository
            .create(
              data,
              transaction
            )
        ).rejects.toMatchObject({
          code:
            11000,
        });
      }
    );

    test(
      "persists IncidentEvent processing lifecycle",
      async () => {
        const incident =
          await incidentRepository
            .create(
              {
                organizationId,

                environmentId,

                tenantId:
                  "tenant-test",

                serviceId:
                  "service-1",

                fingerprint:
                  `event-${crypto.randomUUID()}`,

                title:
                  "Event incident",

                severity:
                  "warning",

                status:
                  "open",
              },
              transaction
            );

        const eventId =
          crypto.randomUUID();

        const event =
          await eventRepository
            .create(
              {
                eventId,

                eventType:
                  "incident.detected",

                organizationId,

                environmentId,

                tenantId:
                  "tenant-test",

                incidentId:
                  incident._id,

                serviceId:
                  "service-1",

                correlationId:
                  "correlation-1",

                severity:
                  "warning",

                status:
                  "pending",

                payload: {
                  test:
                    true,
                },

                occurredAt:
                  new Date(),
              },
              transaction
            );

        expect(
          event.eventId
        ).toBe(
          eventId
        );

        const processed =
          await eventRepository
            .markProcessed(
              {
                organizationId,

                environmentId,
              },
              eventId,
              25,
              transaction
            );

        expect(
          processed.status
        ).toBe(
          "processed"
        );

        expect(
          Number(
            processed
              .processingTimeMs
          )
        ).toBe(
          25
        );

        const history =
          await eventRepository
            .listForIncident(
              {
                organizationId,

                environmentId,
              },
              incident._id,
              100,
              transaction
            );

        expect(
          history
        ).toHaveLength(
          1
        );
      }
    );

    test(
      "persists current lifecycle and immutable transition history",
      async () => {
        const incident =
          await incidentRepository
            .create(
              {
                organizationId,

                environmentId,

                tenantId:
                  "tenant-test",

                serviceId:
                  "service-1",

                fingerprint:
                  `lifecycle-${crypto.randomUUID()}`,

                title:
                  "Lifecycle incident",

                severity:
                  "critical",

                status:
                  "open",
              },
              transaction
            );

        const transitionId =
          `transition-${crypto.randomUUID()}`;

        await lifecycleRepository
          .createTransition(
            {
              transitionId,

              organizationId,

              environmentId,

              incidentId:
                incident._id,

              revision:
                1,

              fromState:
                "detected",

              toState:
                "diagnosing",

              reason:
                "integration_test",

              actor: {
                type:
                  "system",
              },

              source: {
                service:
                  "test",
              },

              transitionedAt:
                new Date(),
            },
            transaction
          );

        const current =
          await lifecycleRepository
            .upsertCurrent(
              {
                organizationId,

                environmentId,

                incidentId:
                  incident._id,
              },
              {
                lifecycleState:
                  "diagnosing",

                revision:
                  1,

                lastReason:
                  "integration_test",

                metadata: {
                  test:
                    true,
                },
              },
              transaction
            );

        expect(
          current.lifecycleState
        ).toBe(
          "diagnosing"
        );

        expect(
          current.revision
        ).toBe(
          1
        );

        const history =
          await lifecycleRepository
            .getHistory(
              {
                organizationId,

                environmentId,

                incidentId:
                  incident._id,
              },
              100,
              transaction
            );

        expect(
          history
        ).toHaveLength(
          1
        );

        expect(
          history[0]
            .transitionId
        ).toBe(
          transitionId
        );
      }
    );

    test(
      "RLS prevents cross-environment incident reads",
      async () => {
        const incident =
          await incidentRepository
            .create(
              {
                organizationId,

                environmentId,

                tenantId:
                  "tenant-test",

                serviceId:
                  "service-1",

                fingerprint:
                  `isolation-${crypto.randomUUID()}`,

                title:
                  "Isolation test",

                severity:
                  "critical",

                status:
                  "open",
              },
              transaction
            );

        const otherEnvironmentId =
          `env-${crypto.randomUUID()}`;

        const organization =
          await client.query(
            `
              SELECT id
              FROM tenancy.organizations
              WHERE public_id = $1
            `,
            [
              organizationId,
            ]
          );

        await client.query(
          `
            INSERT INTO tenancy.environments (
              public_id,
              organization_id,
              name,
              status
            )
            VALUES ($1, $2, $3, 'active')
          `,
          [
            otherEnvironmentId,

            organization.rows[0]
              .id,

            "Other Environment",
          ]
        );

        const hidden =
          await incidentRepository
            .findOne(
              {
                organizationId,

                environmentId:
                  otherEnvironmentId,

                _id:
                  incident._id,
              },
              transaction
            );

        expect(
          hidden
        ).toBeNull();
      }
    );
  }
);