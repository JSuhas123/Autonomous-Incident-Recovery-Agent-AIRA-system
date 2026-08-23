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

const PostgresPolicyRepository =
  require(
    "../postgres/PostgresPolicyRepository"
  );

const PostgresApprovalRepository =
  require(
    "../postgres/PostgresApprovalRepository"
  );

const PostgresAuditRepository =
  require(
    "../postgres/PostgresAuditRepository"
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
  "Phase 13.4E1 PostgreSQL Enterprise Controls",
  () => {
    let pool;
    let client;
    let transaction;

    let organizationId;
    let environmentId;

    const tenantId =
      "tenant-phase-134e";

    let policyRepository;
    let approvalRepository;
    let auditRepository;

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
              "13.4E Organization",
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

            "13.4E Environment",
          ]
        );

        policyRepository =
          new PostgresPolicyRepository();

        approvalRepository =
          new PostgresApprovalRepository();

        auditRepository =
          new PostgresAuditRepository();
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
      "creates and loads active policy",
      async () => {
        const created =
          await policyRepository
            .create(
              {
                tenantId,

                version:
                  1,

                enforcementMode:
                  "strict",

                policyYaml:
                  "version: 1",

                policyJson: {
                  version:
                    1,
                },

                status:
                  "active",

                services:
                  [],
              },
              transaction
            );

        expect(
          created.version
        ).toBe(
          1
        );

        const active =
          await policyRepository
            .findActiveForTenant(
              tenantId,
              1,
              transaction
            );

        expect(
          active.status
        ).toBe(
          "active"
        );
      }
    );

    test(
      "approval stays environment scoped and supports approval transition",
      async () => {
        const request =
          await approvalRepository
            .createRequest(
              {
                tenantId,

                organizationId,

                environmentId,

                decisionId:
                  `decision-${crypto.randomUUID()}`,

                action:
                  "restart_pod",

                reason:
                  "test",

                severity:
                  "high",

                confidence:
                  0.92,

                resource:
                  "pod/api",

                namespace:
                  "default",
              },
              transaction
            );

        expect(
          request.status
        ).toBe(
          "pending"
        );

        const approved =
          await approvalRepository
            .approve(
              request,
              "operator-1",
              {
                test:
                  true,
              },
              transaction
            );

        expect(
          approved.status
        ).toBe(
          "approved"
        );

        expect(
          approved.approvedBy
        ).toBe(
          "operator-1"
        );
      }
    );

    test(
      "counts approval state inside environment",
      async () => {
        await approvalRepository
          .createRequest(
            {
              tenantId,

              organizationId,

              environmentId,

              decisionId:
                `decision-${crypto.randomUUID()}`,

              action:
                "restart_pod",

              reason:
                "test",

              confidence:
                0.8,

              resource:
                "pod/api",
            },
            transaction
          );

        const count =
          await approvalRepository
            .countByStatus(
              {
                organizationId,

                environmentId,
              },
              "pending",
              transaction
            );

        expect(
          count
        ).toBe(
          1
        );
      }
    );

    test(
      "appends and reloads tenant audit chain",
      async () => {
        const first =
          await auditRepository
            .create(
              {
                eventId:
                  crypto.randomUUID(),

                tenantId,

                organizationId,

                environmentId,

                chainIndex:
                  1,

                eventType:
                  "decision_made",

                principal:
                  "system",

                principalId:
                  "aira",

                correlationId:
                  "corr-1",

                payload: {
                  test:
                    true,
                },

                signature:
                  "signature-1",

                previousEventHash:
                  null,

                eventHash:
                  `hash-${crypto.randomUUID()}`,

                status:
                  "created",

                timestamp:
                  Date.now(),
              },
              transaction
            );

        expect(
          first.chainIndex
        ).toBe(
          1
        );

        const latest =
          await auditRepository
            .findLatestForTenant(
              tenantId,
              transaction
            );

        expect(
          latest.eventId
        ).toBe(
          first.eventId
        );

        expect(
          latest.chainIndex
        ).toBe(
          1
        );
      }
    );

    test(
      "audit repository exposes no mutation API",
      () => {
        expect(
          auditRepository.updateOne
        ).toBeUndefined();

        expect(
          auditRepository.deleteOne
        ).toBeUndefined();
      }
    );
  }
);