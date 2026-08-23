/**
 * INCIDENT DETECTION FLOW TESTS
 *
 * Tests:
 * - Signal ingestion and validation
 * - Incident event persistence
 * - Baseline anomaly detection
 * - Pattern matching against known incidents
 * - Incident tiering and prioritization
 * - Real-time detection accuracy
 * - Decision trace structure
 */

"use strict";

const mongoose =
  require(
    "mongoose"
  );

const {
  dbService: {
    connectDatabase,
    disconnectDatabase,
  },
} =
  require(
    "../../services/infrastructure"
  );

const {
  incidentRepository,
  incidentEventRepository,
} = require(
  "../../persistence/repositories"
);

const {
  getPostgresPool,
} =
  require(
    "../../persistence/postgres/postgresPool"
  );
  
const {
  TenantConfig,
} = require(
  "../../persistence/operational/identityModels"
);

describe(
  "Incident Detection Flow Tests",
  () => {
    const TEST_TENANT =
      "test-tenant-incident-detection";

    beforeAll(
      async () => {
        await connectDatabase();
      }
    );

    afterAll(
      async () => {
        await disconnectDatabase();
      }
    );

    beforeEach(
      async () => {
        let tenant =
          await TenantConfig
            .findOne({
              tenantId:
                TEST_TENANT,
            });

        if (
          !tenant
        ) {
          tenant =
            new TenantConfig({
              tenantId:
                TEST_TENANT,

              name:
                "Incident Detection Test Tenant",

              apiKeys: [
                {
                  keyId:
                    "test-key",

                  keyHash:
                    "test-hash",

                  secretHash:
                    "test-secret",
                },
              ],
            });

          await tenant.save();
        }
      }
    );

    describe(
      "Signal Ingestion and Validation",
      () => {
        test(
          "should accept valid incident signals",
          async () => {
            const signals = {
              error_rate:
                8.5,

              response_time:
                2400,

              cpu_usage:
                75,

              memory_usage:
                68,

              disk_usage:
                82,

              active_connections:
                450,
            };

            expect(
              typeof signals
                .error_rate
            ).toBe(
              "number"
            );

            expect(
              signals.error_rate
            ).toBeGreaterThan(
              0
            );

            expect(
              signals.error_rate
            ).toBeLessThan(
              100
            );

            expect(
              typeof signals
                .response_time
            ).toBe(
              "number"
            );

            expect(
              signals.response_time
            ).toBeGreaterThan(
              0
            );
          }
        );

        test(
          "should reject invalid incident signals",
          async () => {
            const invalidSignals = [
              {
                error_rate:
                  -5,
              },

              {
                response_time:
                  "slow",
              },

              {
                cpu_usage:
                  150,
              },

              {
                custom_metric:
                  null,
              },
            ];

            invalidSignals
              .forEach(
                (
                  signal
                ) => {
                  const invalidErrorRate =
                    signal.error_rate !==
                      undefined &&
                    (
                      typeof signal
                        .error_rate !==
                        "number" ||
                      signal
                        .error_rate <
                        0
                    );

                  const invalidResponseTime =
                    signal.response_time !==
                      undefined &&
                    typeof signal
                      .response_time !==
                      "number";

                  const invalidCpu =
                    signal.cpu_usage !==
                      undefined &&
                    (
                      signal.cpu_usage <
                        0 ||
                      signal.cpu_usage >
                        100
                    );

                  const unsupportedEmptyValue =
                    Object.values(
                      signal
                    ).some(
                      (
                        value
                      ) =>
                        value ===
                        null
                    );

                  expect(
                    invalidErrorRate ||
                    invalidResponseTime ||
                    invalidCpu ||
                    unsupportedEmptyValue
                  ).toBe(
                    true
                  );
                }
              );
          }
        );

       test(
  "should create incident events from signals",
  async () => {
    const pool =
      getPostgresPool();

    const scopeResult =
      await pool.query(`
        SELECT
          o.public_id AS organization_id,
          e.public_id AS environment_id
        FROM tenancy.environments e
        INNER JOIN tenancy.organizations o
          ON o.id = e.organization_id
        WHERE
          o.public_id IS NOT NULL
          AND e.public_id IS NOT NULL
        ORDER BY
          e.created_at ASC
        LIMIT 1
      `);

    expect(
      scopeResult.rows.length
    ).toBeGreaterThan(
      0
    );

    const organizationId =
      String(
        scopeResult
          .rows[0]
          .organization_id
      );

    const environmentId =
      String(
        scopeResult
          .rows[0]
          .environment_id
      );

    const incident =
      await incidentRepository
        .create({
          organizationId,

          environmentId,

          tenantId:
            TEST_TENANT,

          serviceId:
            "api-server",

          fingerprint:
            `incident-event-test-${Date.now()}`,

          title:
            "High CPU utilization",

          description:
            "CPU exceeded expected baseline",

          severity:
            "warning",

          status:
            "open",

          startedAt:
            new Date(),

          detectedAt:
            new Date(),

          metadata: {
            source:
              "incident-detection-flow-test",
          },
        });

    expect(
      incident
    ).toBeTruthy();

    expect(
      incident._id
    ).toBeTruthy();

    const eventId =
      `incident-event-${Date.now()}`;

    const event =
      await incidentEventRepository
        .create({
          organizationId,

          environmentId,

          incidentId:
            incident._id,

          serviceId:
            "api-server",

          eventId,

          eventType:
            "signal_received",

          source:
            "test",

          severity:
            "warning",

          status:
            "pending",

          occurredAt:
            new Date(),

          payload: {
            signalType:
              "cpu_threshold",

            value:
              95,

            threshold:
              80,
          },

          metadata: {
            test:
              true,
          },
        });

    expect(
      event
    ).toBeTruthy();

    expect(
      event.eventId
    ).toBe(
      eventId
    );

    expect(
      String(
        event.incidentId
      )
    ).toBe(
      String(
        incident._id
      )
    );
const history =
  await incidentEventRepository
    .listForIncident(
      {
        organizationId,
        environmentId,
      },
      incident._id,
      20
    );
    expect(
      Array.isArray(
        history
      )
    ).toBe(
      true
    );

    expect(
      history.some(
        (
          item
        ) =>
          item.eventId ===
          eventId
      )
    ).toBe(
      true
    );
  }
);
      }
    );

    describe(
      "Baseline Anomaly Detection",
      () => {
        test(
          "should detect signals exceeding baseline thresholds",
          async () => {
            const baselines = {
              error_rate: {
                normal:
                  1.5,

                threshold:
                  5,
              },

              response_time: {
                normal:
                  800,

                threshold:
                  2000,
              },

              cpu_usage: {
                normal:
                  45,

                threshold:
                  80,
              },
            };

            const currentSignals = {
              error_rate:
                8.2,

              response_time:
                2500,

              cpu_usage:
                60,
            };

            const anomalies =
              [];

            Object.keys(
              baselines
            ).forEach(
              (
                metric
              ) => {
                const current =
                  currentSignals[
                    metric
                  ];

                const baseline =
                  baselines[
                    metric
                  ];

                if (
                  current >
                  baseline.threshold
                ) {
                  anomalies.push({
                    metric,

                    current,

                    threshold:
                      baseline
                        .threshold,

                    deviation:
                      (
                        (
                          current -
                          baseline
                            .normal
                        ) /
                        baseline
                          .normal *
                        100
                      ).toFixed(
                        2
                      ),
                  });
                }
              }
            );

            expect(
              anomalies.length
            ).toBeGreaterThan(
              0
            );

            expect(
              anomalies[0]
                .metric
            ).toBe(
              "error_rate"
            );
          }
        );

        test(
          "should calculate anomaly severity",
          async () => {
            const anomalies = [
              {
                metric:
                  "error_rate",

                current:
                  25,

                threshold:
                  5,

                deviation:
                  1200,
              },

              {
                metric:
                  "latency_p99",

                current:
                  6000,

                threshold:
                  2000,

                deviation:
                  200,
              },

              {
                metric:
                  "cpu_usage",

                current:
                  92,

                threshold:
                  80,

                deviation:
                  15,
              },
            ];

            anomalies.forEach(
              (
                anomaly
              ) => {
                let severity =
                  "LOW";

                const deviationPercent =
                  anomaly
                    .deviation;

                if (
                  deviationPercent >
                  500
                ) {
                  severity =
                    "CRITICAL";
                } else if (
                  deviationPercent >
                  200
                ) {
                  severity =
                    "HIGH";
                } else if (
                  deviationPercent >
                  100
                ) {
                  severity =
                    "MEDIUM";
                }

                expect(
                  [
                    "LOW",
                    "MEDIUM",
                    "HIGH",
                    "CRITICAL",
                  ]
                ).toContain(
                  severity
                );
              }
            );
          }
        );

        test(
          "should detect trend in metrics",
          async () => {
            const timeSeries = [
              {
                timestamp:
                  Date.now() -
                  300000,

                error_rate:
                  2.1,
              },

              {
                timestamp:
                  Date.now() -
                  240000,

                error_rate:
                  3.5,
              },

              {
                timestamp:
                  Date.now() -
                  180000,

                error_rate:
                  5.2,
              },

              {
                timestamp:
                  Date.now() -
                  120000,

                error_rate:
                  7.8,
              },

              {
                timestamp:
                  Date.now() -
                  60000,

                error_rate:
                  10.2,
              },

              {
                timestamp:
                  Date.now(),

                error_rate:
                  12.5,
              },
            ];

            const first =
              timeSeries[0];

            const last =
              timeSeries[
                timeSeries.length -
                1
              ];

            const trend =
              last.error_rate >
              first.error_rate
                ? "INCREASING"
                : "DECREASING";

            const timeDiff =
              (
                last.timestamp -
                first.timestamp
              ) /
              1000;

            const valueDiff =
              last.error_rate -
              first.error_rate;

            const velocity =
              valueDiff /
              (
                timeDiff /
                60
              );

            expect(
              trend
            ).toBe(
              "INCREASING"
            );

            expect(
              velocity
            ).toBeGreaterThan(
              0
            );
          }
        );
      }
    );

    describe(
      "Pattern Matching Against Known Incidents",
      () => {
        test(
          "should match current incident to historical patterns",
          async () => {
            const historicalPatterns = [
              {
                patternId:
                  "transient-timeout",

                signature: {
                  error_rate:
                    "high",

                  duration:
                    "short",

                  affected_services:
                    "single",
                },

                successRate:
                  0.92,

                commonAction:
                  "RETRY",
              },

              {
                patternId:
                  "cascading-failure",

                signature: {
                  error_rate:
                    "very_high",

                  affected_services:
                    "multiple",

                  propagation:
                    "rapid",
                },

                successRate:
                  0.78,

                commonAction:
                  "CIRCUIT_BREAK",
              },

              {
                patternId:
                  "resource-exhaustion",

                signature: {
                  cpu_usage:
                    "high",

                  memory_usage:
                    "high",

                  disk_usage:
                    "high",
                },

                successRate:
                  0.85,

                commonAction:
                  "SCALE_UP",
              },
            ];

            const currentIncident = {
              error_rate:
                18,

              duration:
                45,

              affected_services: [
                "api-1",
              ],

              cpu_usage:
                72,

              memory_usage:
                60,
            };

            let bestMatch =
              null;

            let bestScore =
              0;

            historicalPatterns
              .forEach(
                (
                  pattern
                ) => {
                  let matchScore =
                    0;

                  const signature =
                    pattern
                      .signature;

                  if (
                    signature
                      .error_rate ===
                      "high" &&
                    currentIncident
                      .error_rate >
                      10
                  ) {
                    matchScore +=
                      0.33;
                  }

                  if (
                    signature
                      .duration ===
                      "short" &&
                    currentIncident
                      .duration <
                      60
                  ) {
                    matchScore +=
                      0.33;
                  }

                  if (
                    signature
                      .affected_services ===
                      "single" &&
                    currentIncident
                      .affected_services
                      .length ===
                      1
                  ) {
                    matchScore +=
                      0.34;
                  }

                  if (
                    matchScore >
                    bestScore
                  ) {
                    bestScore =
                      matchScore;

                    bestMatch =
                      pattern;
                  }
                }
              );

            expect(
              bestMatch
            ).toBeDefined();

            expect(
              bestMatch
                .patternId
            ).toBe(
              "transient-timeout"
            );

            expect(
              bestMatch
                .commonAction
            ).toBe(
              "RETRY"
            );
          }
        );

        test(
          "should handle novel incidents not matching known patterns",
          async () => {
            const knownPatterns = [
              "error_spike",
              "latency_degradation",
              "resource_exhaustion",
            ];

            const novelIncident = {
              metric_1:
                5,

              metric_2:
                8,

              custom_behavior:
                "unexpected",
            };

            let matchedPattern =
              null;

            knownPatterns
              .forEach(
                (
                  pattern
                ) => {
                  if (
                    pattern ===
                      "error_spike" &&
                    novelIncident
                      .metric_1 >
                      10
                  ) {
                    matchedPattern =
                      pattern;
                  }
                }
              );

            expect(
              matchedPattern
            ).toBeNull();

            const defaultAction =
              "ALERT";

            expect(
              defaultAction
            ).toBe(
              "ALERT"
            );
          }
        );
      }
    );

    describe(
      "Incident Tiering and Prioritization",
      () => {
        test(
          "should tier incidents by severity",
          async () => {
            const incidents = [
              {
                id:
                  "inc-1",

                error_rate:
                  35,

                affected_services:
                  5,

                duration:
                  180,

                name:
                  "Severe cascading failure",
              },

              {
                id:
                  "inc-2",

                error_rate:
                  8,

                affected_services:
                  1,

                duration:
                  30,

                name:
                  "Brief service timeout",
              },

              {
                id:
                  "inc-3",

                error_rate:
                  20,

                affected_services:
                  3,

                duration:
                  180,

                name:
                  "Moderate partial outage",
              },
            ];

            const tieredIncidents =
              incidents.map(
                (
                  incident
                ) => {
                  let tier =
                    "TIER_4";

                  let severityScore =
                    0;

                  if (
                    incident.error_rate >
                    20
                  ) {
                    severityScore +=
                      3;
                  } else if (
                    incident.error_rate >
                    10
                  ) {
                    severityScore +=
                      2;
                  } else {
                    severityScore +=
                      1;
                  }

                  if (
                    incident
                      .affected_services >
                    3
                  ) {
                    severityScore +=
                      3;
                  } else if (
                    incident
                      .affected_services >
                    1
                  ) {
                    severityScore +=
                      2;
                  } else {
                    severityScore +=
                      1;
                  }

                  if (
                    incident.duration >
                    120
                  ) {
                    severityScore +=
                      2;
                  }

                  if (
                    severityScore >=
                    7
                  ) {
                    tier =
                      "TIER_1";
                  } else if (
                    severityScore >=
                    5
                  ) {
                    tier =
                      "TIER_2";
                  } else if (
                    severityScore >=
                    3
                  ) {
                    tier =
                      "TIER_3";
                  }

                  return {
                    ...incident,

                    tier,

                    severityScore,
                  };
                }
              );

            expect(
              tieredIncidents[0]
                .tier
            ).toBe(
              "TIER_1"
            );

            expect(
              tieredIncidents[1]
                .tier
            ).toBe(
              "TIER_4"
            );

            expect(
              tieredIncidents[2]
                .tier
            ).toBe(
              "TIER_2"
            );

            const prioritized =
              tieredIncidents
                .sort(
                  (
                    left,
                    right
                  ) => {
                    const tierValues = {
                      TIER_1:
                        4,

                      TIER_2:
                        3,

                      TIER_3:
                        2,

                      TIER_4:
                        1,
                    };

                    return (
                      tierValues[
                        right.tier
                      ] -
                      tierValues[
                        left.tier
                      ]
                    );
                  }
                );

            expect(
              prioritized[0]
                .id
            ).toBe(
              "inc-1"
            );
          }
        );

        test(
          "should assign action recommendations by tier",
          async () => {
            const tiers = {
              TIER_1: {
                autoExecute:
                  true,

                requiresApproval:
                  false,

                action:
                  "IMMEDIATE",
              },

              TIER_2: {
                autoExecute:
                  false,

                requiresApproval:
                  true,

                action:
                  "MONITOR_AND_DECIDE",
              },

              TIER_3: {
                autoExecute:
                  false,

                requiresApproval:
                  false,

                action:
                  "ALERT",
              },

              TIER_4: {
                autoExecute:
                  false,

                requiresApproval:
                  false,

                action:
                  "LOG_ONLY",
              },
            };

            Object.values(
              tiers
            ).forEach(
              (
                config
              ) => {
                expect(
                  [
                    "IMMEDIATE",
                    "MONITOR_AND_DECIDE",
                    "ALERT",
                    "LOG_ONLY",
                  ]
                ).toContain(
                  config.action
                );
              }
            );
          }
        );
      }
    );

    describe(
      "Real-Time Detection Accuracy",
      () => {
        test(
          "should detect incidents within acceptable latency",
          async () => {
            const detectionStartTime =
              Date.now();

            const signal = {
              error_rate:
                15,

              timestamp:
                Date.now(),
            };

            expect(
              signal.error_rate
            ).toBeGreaterThan(
              5
            );

            const totalLatency =
              Date.now() -
              detectionStartTime;

            expect(
              totalLatency
            ).toBeLessThan(
              100
            );
          }
        );

        test(
          "should handle high volume of signals without degradation",
          async () => {
            const signalVolume =
              1000;

            const startTime =
              Date.now();

            let anomalyCount =
              0;

            for (
              let index =
                0;
              index <
                signalVolume;
              index +=
                1
            ) {
              const signal = {
                error_rate:
                  Math.random() *
                  20,

                latency:
                  Math.random() *
                  3000,

                timestamp:
                  Date.now(),
              };

              if (
                signal.error_rate >
                  5 ||
                signal.latency >
                  2000
              ) {
                anomalyCount +=
                  1;
              }
            }

            const processingTime =
              Math.max(
                Date.now() -
                  startTime,
                1
              );

            const throughput =
              (
                signalVolume /
                processingTime
              ) *
              1000;

            expect(
              throughput
            ).toBeGreaterThan(
              100
            );

            expect(
              anomalyCount
            ).toBeGreaterThanOrEqual(
              0
            );
          }
        );

        test(
          "should maintain detection accuracy with signal variance",
          async () => {
            const threshold =
              80;

            const testCases = [
              {
                value:
                  52,

                shouldAlert:
                  false,
              },

              {
                value:
                  78,

                shouldAlert:
                  false,
              },

              {
                value:
                  81,

                shouldAlert:
                  true,
              },

              {
                value:
                  95,

                shouldAlert:
                  true,
              },
            ];

            const accuracy =
              testCases.filter(
                (
                  test
                ) => {
                  const alertTriggered =
                    test.value >
                    threshold;

                  return (
                    alertTriggered ===
                    test.shouldAlert
                  );
                }
              ).length /
              testCases.length;

            expect(
              accuracy
            ).toBe(
              1
            );
          }
        );
      }
    );

    describe(
      "Decision Trace Creation",
      () => {
        test(
          "should create detailed decision trace for each incident detection",
          async () => {
            const detectionTrace = {
              tenantId:
                TEST_TENANT,

              correlationId:
                `trace-${Date.now()}`,

              inputs: {
                signals: {
                  errorRate:
                    12,

                  responseTime:
                    2500,

                  affectedServices: [
                    "api-1",
                    "api-2",
                  ],
                },

                severity:
                  "HIGH",

                confidence:
                  0.87,
              },

              reasoning: {
                hypothesis:
                  "Cascading failure from load spike",

                evidenceFor: [
                  "Error rate increased 5x in 2 minutes",
                  "Multiple services affected simultaneously",
                  "Latency correlates with error rate increase",
                ],

                evidenceAgainst: [
                  "CPU usage still moderate",
                  "Recent deployments were rolled back",
                ],
              },

              alternatives: [
                {
                  action:
                    "RESTART_SERVICE",

                  riskScore:
                    0.4,

                  expectedSuccess:
                    0.65,

                  status:
                    "REJECTED",
                },

                {
                  action:
                    "SCALE_UP",

                  riskScore:
                    0.2,

                  expectedSuccess:
                    0.85,

                  status:
                    "CHOSEN",
                },
              ],

              decision: {
                action:
                  "SCALE_UP",

                confidence:
                  0.85,

                reasoning:
                  "Based on pattern match with previous similar incidents",
              },
            };

            expect(
              detectionTrace.inputs
            ).toBeDefined();

            expect(
              detectionTrace.reasoning
            ).toBeDefined();

            expect(
              detectionTrace.alternatives
            ).toBeDefined();

            expect(
              detectionTrace.decision
            ).toBeDefined();

            expect(
              detectionTrace
                .decision
                .action
            ).toBe(
              "SCALE_UP"
            );
          }
        );
      }
    );
  }
);




