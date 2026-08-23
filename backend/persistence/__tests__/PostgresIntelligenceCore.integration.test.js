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

const PostgresAgentIntelligenceRunRepository =
  require(
    "../postgres/PostgresAgentIntelligenceRunRepository"
  );

const PostgresIncidentDiagnosisRepository =
  require(
    "../postgres/PostgresIncidentDiagnosisRepository"
  );

const PostgresDecisionTraceRepository =
  require(
    "../postgres/PostgresDecisionTraceRepository"
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
  "Phase 13.4C PostgreSQL Intelligence Core",
  () => {
    let pool;
    let client;
    let transaction;

    let organizationId;
    let environmentId;

    let incident;

    let incidentRepository;
    let runRepository;
    let diagnosisRepository;
    let traceRepository;

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
              "13.4C Organization",
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

            "13.4C Environment",
          ]
        );

        incidentRepository =
          new PostgresIncidentRepository();

        runRepository =
          new PostgresAgentIntelligenceRunRepository();

        diagnosisRepository =
          new PostgresIncidentDiagnosisRepository();

        traceRepository =
          new PostgresDecisionTraceRepository();

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
                  `intel-${crypto.randomUUID()}`,

                title:
                  "Intelligence test incident",

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
      "persists intelligence run and returns latest run",
      async () => {
        const run =
          await runRepository
            .create(
              buildRun(),
              transaction
            );

        expect(
          run._id
        ).toHaveLength(
          24
        );

        expect(
          run.executionAuthorized
        ).toBe(
          false
        );

        const latest =
          await runRepository
            .findLatestForIncident(
              {
                organizationId,

                environmentId,

                incidentId:
                  incident._id,
              },
              transaction
            );

        expect(
          latest.status
        ).toBe(
          "completed"
        );
      }
    );

    test(
      "persists diagnosis revision and superseding relationships",
      async () => {
        const run =
          await runRepository
            .create(
              buildRun(),
              transaction
            );

        const first =
          await diagnosisRepository
            .create(
              buildDiagnosis(
                run,
                1
              ),
              transaction
            );

        expect(
          first.revision
        ).toBe(
          1
        );

        first.isCurrent =
          false;

        first.status =
          "superseded";

        await diagnosisRepository
          .save(
            first,
            transaction
          );

        const second =
          await diagnosisRepository
            .create(
              {
                ...buildDiagnosis(
                  run,
                  2
                ),

                diagnosisId:
                  `diagnosis-${crypto.randomUUID()}`,

                supersedesDiagnosisId:
                  first._id,
              },
              transaction
            );

        first.supersededByDiagnosisId =
          second._id;

        await diagnosisRepository
          .save(
            first,
            transaction
          );

        const current =
          await diagnosisRepository
            .findCurrent(
              {
                organizationId,

                environmentId,

                incidentId:
                  incident._id,
              },
              transaction
            );

        expect(
          current._id
        ).toBe(
          second._id
        );

        expect(
          current.revision
        ).toBe(
          2
        );

        expect(
          current.executionAuthorized
        ).toBe(
          false
        );
      }
    );

    test(
      "links intelligence run to diagnosis",
      async () => {
        const run =
          await runRepository
            .create(
              buildRun(),
              transaction
            );

        const diagnosis =
          await diagnosisRepository
            .create(
              buildDiagnosis(
                run,
                1
              ),
              transaction
            );

        run.diagnosisId =
          diagnosis._id;

        const saved =
          await runRepository
            .save(
              run,
              transaction
            );

        expect(
          saved.diagnosisId
        ).toBe(
          diagnosis._id
        );
      }
    );

    test(
      "persists and updates scoped decision trace",
      async () => {
        const decisionId =
          `decision-${crypto.randomUUID()}`;

        const trace =
          await traceRepository
            .create(
              {
                decisionId,

                tenantId:
                  "tenant-test",

                organizationId,

                environmentId,

                incidentId:
                  incident._id,

                correlationId:
                  "correlation-test",

                inputs: {
                  confidence:
                    0.9,
                },

                reasoning: {
                  hypothesis:
                    "CPU saturation",
                },

                rulesTriggered:
                  [],

                alternatives:
                  [],

                decision:
                  "TIERED_DECISION",

                recommendedAction:
                  "restart_service",

                tier:
                  "observe",

                actionRisk:
                  "LOW",

                auditTrail: [
                  {
                    stage:
                      "decision_made",

                    status:
                      "SUCCESS",
                  },
                ],
              },
              transaction
            );

        expect(
          trace.decisionId
        ).toBe(
          decisionId
        );

        const updated =
          await traceRepository
            .updateOne(
              {
                decisionId,

                tenantId:
                  "tenant-test",

                organizationId,

                environmentId,
              },
              {
                $set: {
                  "policyCheck.verdict":
                    "APPROVED",

                  tier:
                    "execute",
                },

                $push: {
                  auditTrail: {
                    stage:
                      "policy_checked",

                    status:
                      "APPROVED",
                  },
                },
              },
              transaction
            );

        expect(
          updated.policyCheck
            .verdict
        ).toBe(
          "APPROVED"
        );

        expect(
          updated.auditTrail
        ).toHaveLength(
          2
        );

        const loaded =
          await traceRepository
            .findOne(
              {
                decisionId,

                tenantId:
                  "tenant-test",

                organizationId,

                environmentId,
              },
              transaction
            );

        expect(
          loaded.tier
        ).toBe(
          "execute"
        );
      }
    );

    test(
      "decision trace list remains tenant and environment isolated",
      async () => {
        await traceRepository
          .create(
            {
              decisionId:
                `decision-${crypto.randomUUID()}`,

              tenantId:
                "tenant-test",

              organizationId,

              environmentId,

              incidentId:
                incident._id,

              decision:
                "SKIP_ACTION",

              tier:
                "observe",
            },
            transaction
          );

        const traces =
          await traceRepository
            .list(
              {
                tenantId:
                  "tenant-test",

                organizationId,

                environmentId,

                createdAt: {
                  $gte:
                    new Date(
                      Date.now() -
                      60000
                    ),
                },
              },
              {
                limit:
                  50,

                sort: {
                  createdAt:
                    -1,
                },
              },
              transaction
            );

        expect(
          traces
        ).toHaveLength(
          1
        );
      }
    );

    function buildRun() {
      const now =
        new Date();

      return {
        runId:
          `run-${crypto.randomUUID()}`,

        organizationId,

        environmentId,

        tenantId:
          "tenant-test",

        incidentId:
          incident._id,

        correlationId:
          "correlation-test",

        status:
          "completed",

        phase:
          "completed",

        startedAt:
          now,

        completedAt:
          now,

        durationMs:
          20,

        contextSummary: {
          signalCount:
            2,
        },

        confidence: {
          overallConfidence:
            0.91,
        },

        agentTrace: [],

        findingIds: [],

        hypothesisIds: [],

        contradictionIds: [],

        outcome:
          "ROOT_CAUSE_IDENTIFIED",

        summary:
          "CPU saturation",

        warnings: [],

        executionAuthorized:
          false,

        metadata: {},
      };
    }

    function buildDiagnosis(
      run,
      revision
    ) {
      return {
        diagnosisId:
          `diagnosis-${crypto.randomUUID()}`,

        organizationId,

        environmentId,

        tenantId:
          "tenant-test",

        incidentId:
          incident._id,

        correlationId:
          "correlation-test",

        revision,

        isCurrent:
          true,

        runId:
          run._id,

        runExternalId:
          run.runId,

        status:
          "completed",

        outcome:
          "ROOT_CAUSE_IDENTIFIED",

        title:
          "CPU saturation",

        summary:
          "Service CPU saturation",

        probableRootCause:
          "Runaway worker",

        rootCauseCategory:
          "resource_exhaustion",

        symptoms: [],

        findings: [],

        hypotheses: [],

        contradictions: [],

        unresolvedQuestions: [],

        unknowns: [],

        evidenceSummary: {},

        impactSnapshot: {},

        risk: {},

        confidence: {
          overallConfidence:
            0.9,
        },

        executionAuthorized:
          false,

        metadata: {},
      };
    }
  }
);