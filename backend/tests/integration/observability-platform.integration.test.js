"use strict";

jest.mock(
  "../../services/monitoring/monitorExecutionService",
  () => ({
    ...jest.requireActual(
      "../../services/monitoring/monitorExecutionService"
    ),

    executeCheck:
      jest.fn(),
  })
);

const request =
  require(
    "supertest"
  );

const serviceRoutes =
  require(
    "../../routes/serviceRoutes"
  );

const {
  topLevelRouter:
    monitorTopLevelRoutes,
} =
  require(
    "../../routes/monitorRoutes"
  );

const Service =
  require(
    "../../models/Service"
  );

const Monitor =
  require(
    "../../models/Monitor"
  );

const MonitorCheck =
  require(
    "../../models/MonitorCheck"
  );

const execService =
  require(
    "../../services/monitoring/monitorExecutionService"
  );

const {
  startPhase1Database,
  resetPhase1Database,
  stopPhase1Database,
  createPhase1App,
  registerPhase1User,
} =
  require(
    "../helpers/phase1TestHarness"
  );

const {
  VALID_SERVICE,
  VALID_WEBSITE_SERVICE,
  VALID_MONITOR,
  monitorResult,
} =
  require(
    "../helpers/phase1Fixtures"
  );

let app;

// ============================================================================
// SETUP
// ============================================================================

beforeAll(
  async () => {
    await startPhase1Database([
      Service,
      Monitor,
      MonitorCheck,
    ]);

    app =
      createPhase1App({
        errorPrefix:
          "observability.integration",

        routes: [
          {
            path:
              "/api/v1/services",

            router:
              serviceRoutes,
          },

          {
            path:
              "/api/v1/monitors",

            router:
              monitorTopLevelRoutes,
          },
        ],
      });
  },
  60000
);

afterEach(
  async () => {
    await resetPhase1Database();

    jest.resetAllMocks();
  }
);

afterAll(
  async () => {
    await stopPhase1Database();
  }
);

// ============================================================================
// HELPERS
// ============================================================================

async function createService(
  agent,
  overrides = {}
) {
  const response =
    await agent
      .post(
        "/api/v1/services"
      )
      .send({
        ...VALID_SERVICE,
        ...overrides,
      });

  expect(
    response.status
  ).toBe(
    201
  );

  return response
    .body
    .data;
}

async function createMonitor(
  agent,
  serviceId,
  overrides = {}
) {
  const response =
    await agent
      .post(
        `/api/v1/services/${serviceId}/monitors`
      )
      .send({
        ...VALID_MONITOR,
        ...overrides,
      });

  expect(
    response.status
  ).toBe(
    201
  );

  return response
    .body
    .monitor;
}

// ============================================================================
// SERVICES
// ============================================================================

describe(
  "Services",
  () => {
    test(
      "requires authentication",
      async () => {
        const response =
          await request(app)
            .get(
              "/api/v1/services"
            );

        expect(
          response.status
        ).toBe(
          401
        );
      }
    );

    test(
      "creates an environment-owned service",
      async () => {
        const context =
          await registerPhase1User({
            app,
            email:
              "service@example.com",

            organizationName:
              "ServiceOrg",
          });

        const service =
          await createService(
            context.agent
          );

        expect(
          service.organizationId
        ).toBe(
          context.organizationId
        );

        expect(
          service.environmentId
        ).toBe(
          context.environmentId
        );

        expect(
          service.status
        ).toBe(
          "active"
        );
      }
    );

    test(
      "lists only current organization services",
      async () => {
        const first =
          await registerPhase1User({
            app,

            email:
              "orga@example.com",

            organizationName:
              "OrgA",
          });

        const second =
          await registerPhase1User({
            app,

            email:
              "orgb@example.com",

            organizationName:
              "OrgB",
          });

        await createService(
          first.agent,
          {
            name:
              "OrgA API",
          }
        );

        await createService(
          second.agent,
          {
            name:
              "OrgB API",
          }
        );

        const response =
          await first.agent
            .get(
              "/api/v1/services"
            );

        expect(
          response.status
        ).toBe(
          200
        );

        expect(
          response.body.data
        ).toHaveLength(
          1
        );

        expect(
          response
            .body
            .data[0]
            .name
        ).toBe(
          "OrgA API"
        );
      }
    );

    test(
      "rejects duplicate service name",
      async () => {
        const context =
          await registerPhase1User({
            app,

            email:
              "duplicate@example.com",

            organizationName:
              "DuplicateOrg",
          });

        await createService(
          context.agent
        );

        const duplicate =
          await context
            .agent
            .post(
              "/api/v1/services"
            )
            .send(
              VALID_SERVICE
            );

        expect(
          duplicate.status
        ).toBe(
          409
        );
      }
    );

    test(
      "rejects private network URL",
      async () => {
        const context =
          await registerPhase1User({
            app,

            email:
              "url@example.com",

            organizationName:
              "UrlOrg",
          });

        const response =
          await context
            .agent
            .post(
              "/api/v1/services"
            )
            .send({
              ...VALID_SERVICE,

              baseUrl:
                "http://127.0.0.1",
            });

        expect(
          response.status
        ).toBe(
          400
        );
      }
    );

    test(
      "archives a service",
      async () => {
        const context =
          await registerPhase1User({
            app,

            email:
              "archive@example.com",

            organizationName:
              "ArchiveOrg",
          });

        const service =
          await createService(
            context.agent
          );

        const response =
          await context
            .agent
            .delete(
              `/api/v1/services/${service.id}`
            );

        expect(
          response.status
        ).toBe(
          200
        );

        expect(
          response.body
            .data.status
        ).toBe(
          "archived"
        );
      }
    );
  }
);

// ============================================================================
// MONITORS
// ============================================================================

describe(
  "Monitors",
  () => {
    test(
      "creates monitor for service",
      async () => {
        const context =
          await registerPhase1User({
            app,

            email:
              "monitor@example.com",

            organizationName:
              "MonitorOrg",
          });

        const service =
          await createService(
            context.agent,
            VALID_WEBSITE_SERVICE
          );

        const monitor =
          await createMonitor(
            context.agent,
            service.id
          );

        expect(
          monitor.name
        ).toBe(
          VALID_MONITOR.name
        );

        expect(
          monitor.enabled
        ).toBe(
          true
        );
      }
    );

    test(
      "lists service monitors",
      async () => {
        const context =
          await registerPhase1User({
            app,

            email:
              "monitor-list@example.com",

            organizationName:
              "MonitorListOrg",
          });

        const service =
          await createService(
            context.agent,
            VALID_WEBSITE_SERVICE
          );

        await createMonitor(
          context.agent,
          service.id,
          {
            name:
              "Monitor A",
          }
        );

        await createMonitor(
          context.agent,
          service.id,
          {
            name:
              "Monitor B",
          }
        );

        const response =
          await context
            .agent
            .get(
              `/api/v1/services/${service.id}/monitors`
            );

        expect(
          response.status
        ).toBe(
          200
        );

        expect(
          response.body.monitors
        ).toHaveLength(
          2
        );
      }
    );

    test(
      "pauses and resumes monitor",
      async () => {
        const context =
          await registerPhase1User({
            app,

            email:
              "pause@example.com",

            organizationName:
              "PauseOrg",
          });

        const service =
          await createService(
            context.agent
          );

        const monitor =
          await createMonitor(
            context.agent,
            service.id
          );

        const paused =
          await context
            .agent
            .post(
              `/api/v1/monitors/${monitor.id}/pause`
            );

        expect(
          paused.status
        ).toBe(
          200
        );

        expect(
          paused
            .body
            .monitor
            .enabled
        ).toBe(
          false
        );

        const resumed =
          await context
            .agent
            .post(
              `/api/v1/monitors/${monitor.id}/resume`
            );

        expect(
          resumed.status
        ).toBe(
          200
        );

        expect(
          resumed
            .body
            .monitor
            .enabled
        ).toBe(
          true
        );
      }
    );

    test(
      "test-run does not persist MonitorCheck",
      async () => {
        const context =
          await registerPhase1User({
            app,

            email:
              "check@example.com",

            organizationName:
              "CheckOrg",
          });

        const service =
          await createService(
            context.agent
          );

        const monitor =
          await createMonitor(
            context.agent,
            service.id
          );

        execService
          .executeCheck
          .mockResolvedValue(
            monitorResult()
          );

        const response =
          await context
            .agent
            .post(
              `/api/v1/monitors/${monitor.id}/test`
            );

        expect(
          response.status
        ).toBe(
          200
        );

        expect(
          response
            .body
            .result
            .status
        ).toBe(
          "healthy"
        );

        expect(
          await MonitorCheck
            .countDocuments()
        ).toBe(
          0
        );
      }
    );

    test(
      "cross-organization monitor lookup is isolated",
      async () => {
        const owner =
          await registerPhase1User({
            app,

            email:
              "owner@example.com",

            organizationName:
              "OwnerOrg",
          });

        const outsider =
          await registerPhase1User({
            app,

            email:
              "outsider@example.com",

            organizationName:
              "OutsiderOrg",
          });

        const service =
          await createService(
            owner.agent
          );

        const monitor =
          await createMonitor(
            owner.agent,
            service.id
          );

        const response =
          await outsider
            .agent
            .get(
              `/api/v1/monitors/${monitor.id}`
            );

        expect(
          [403, 404]
        ).toContain(
          response.status
        );
      }
    );
  }
);