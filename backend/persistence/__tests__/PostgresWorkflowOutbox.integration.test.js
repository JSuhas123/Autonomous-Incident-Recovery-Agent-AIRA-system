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

const PostgresWorkflowOutboxRepository =
  require(
    "../postgres/PostgresWorkflowOutboxRepository"
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
  "Phase 13.4E2 PostgreSQL Workflow Outbox",
  () => {
    let pool;
    let client;
    let transaction;

    let organizationId;
    let environmentId;
    let incident;

    let incidentRepository;
    let repository;

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
              "13.4E2 Organization",
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
            organization.rows[0].id,
            "13.4E2 Environment",
          ]
        );

        incidentRepository =
          new PostgresIncidentRepository();

        repository =
          new PostgresWorkflowOutboxRepository();

        incident =
          await incidentRepository
            .create(
              {
                organizationId,
                environmentId,
                tenantId:
                  "tenant-test",
                serviceId:
                  "service-a",
                fingerprint:
                  `outbox-${crypto.randomUUID()}`,
                title:
                  "Outbox test incident",
                severity:
                  "critical",
                status:
                  "open",
              },
              transaction
            );
      }
    );

    afterEach(
      async () => {
        await client.query(
          "ROLLBACK"
        );

        client.release();
      }
    );

    afterAll(
      async () => {
        await closePostgresPool();
      }
    );

    test(
      "creates and retrieves deterministic event",
      async () => {
        const event =
          await createEvent();

        const loaded =
          await repository
            .findByEventKey(
              {
                organizationId,
                environmentId,
              },
              event.eventKey,
              transaction
            );

        expect(
          loaded.eventId
        ).toBe(
          event.eventId
        );

        expect(
          loaded.executionAuthorized
        ).toBe(
          false
        );
      }
    );

    test(
      "atomically claims event and increments attempt count",
      async () => {
        const event =
          await createEvent();

        const now =
          new Date();

        const claimed =
          await repository
            .claim(
              {
                organizationId,
                environmentId,
              },
              {
                eventId:
                  event.eventId,

                ownerId:
                  "worker-a",

                claimToken:
                  "claim-a",

                currentTime:
                  now,

                leaseExpiresAt:
                  new Date(
                    now.getTime() +
                    30000
                  ),
              },
              transaction
            );

        expect(
          claimed.status
        ).toBe(
          "processing"
        );

        expect(
          claimed.attempts.count
        ).toBe(
          1
        );

        expect(
          claimed.owner.claimToken
        ).toBe(
          "claim-a"
        );
      }
    );

    test(
      "fences stale owner during delivery",
      async () => {
        const event =
          await createEvent();

        const now =
          new Date();

        await repository
          .claim(
            {
              organizationId,
              environmentId,
            },
            {
              eventId:
                event.eventId,

              ownerId:
                "worker-a",

              claimToken:
                "claim-a",

              currentTime:
                now,

              leaseExpiresAt:
                new Date(
                  now.getTime() +
                  30000
                ),
            },
            transaction
          );

        const rejected =
          await repository
            .markDelivered(
              {
                organizationId,
                environmentId,
              },
              {
                eventId:
                  event.eventId,

                ownerId:
                  "worker-b",

                claimToken:
                  "wrong-token",

                currentTime:
                  new Date(),

                messageId:
                  "msg-1",
              },
              transaction
            );

        expect(
          rejected
        ).toBeNull();
      }
    );

    test(
      "marks delivery only for current owner",
      async () => {
        const event =
          await createEvent();

        const now =
          new Date();

        await repository
          .claim(
            {
              organizationId,
              environmentId,
            },
            {
              eventId:
                event.eventId,

              ownerId:
                "worker-a",

              claimToken:
                "claim-a",

              currentTime:
                now,

              leaseExpiresAt:
                new Date(
                  now.getTime() +
                  30000
                ),
            },
            transaction
          );

        const delivered =
          await repository
            .markDelivered(
              {
                organizationId,
                environmentId,
              },
              {
                eventId:
                  event.eventId,

                ownerId:
                  "worker-a",

                claimToken:
                  "claim-a",

                currentTime:
                  new Date(),

                messageId:
                  "msg-1",

                queue:
                  "execution",
              },
              transaction
            );

        expect(
          delivered.status
        ).toBe(
          "delivered"
        );

        expect(
          delivered.delivery.messageId
        ).toBe(
          "msg-1"
        );
      }
    );

    test(
      "PostgreSQL global dispatcher scan fails closed without worker role",
      async () => {
        await expect(
          repository
            .findDeliverable()
        ).rejects.toMatchObject({
          code:
            "POSTGRES_OUTBOX_WORKER_ROLE_REQUIRED",
        });
      }
    );

    async function createEvent() {
      return repository
        .create(
          {
            eventId:
              `evt-${crypto.randomUUID()}`,

            eventKey:
              `key-${crypto.randomUUID()}`,

            payloadFingerprint:
              crypto
                .randomBytes(
                  32
                )
                .toString(
                  "hex"
                ),

            organizationId,

            environmentId,

            incidentId:
              incident._id,

            aggregateType:
              "recovery_decision",

            aggregateId:
              "aggregate-1",

            eventType:
              "recovery.execution.requested",

            payload: {
              incidentId:
                incident._id,
            },

            metadata: {},

            status:
              "pending",

            attempts: {
              count:
                0,

              maxAttempts:
                10,

              nextAttemptAt:
                new Date(),
            },

            executionAuthorized:
              false,
          },
          transaction
        );
    }
  }
);