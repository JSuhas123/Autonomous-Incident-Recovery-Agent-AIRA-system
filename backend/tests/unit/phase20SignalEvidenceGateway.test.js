"use strict";

const {
  IntegrationSignalGateway,

  DEFAULT_MAX_SIGNALS_PER_INVOCATION,

  normalizeProviderEvents,

  buildCanonicalSignalInput,
} =
  require(
    "../../services/integrations/integrationSignalGateway"
  );

const {
  IntegrationEvidenceGateway,

  EVIDENCE_TYPE,

  MAX_EVIDENCE_LIMIT,

  MAX_EVIDENCE_WINDOW_MS,

  parseEvidenceTimestamp,

  sanitizeQueryMetadata,
} =
  require(
    "../../services/integrations/integrationEvidenceGateway"
  );


const CONTEXT = {
  organizationId:
    "aira-dev-org",

  environmentId:
    "env_aira_development",

  integrationId:
    "int_conn_test",

  provider:
    "prometheus_alertmanager",
};


describe(
  "Phase 20.8 Integration Signal Gateway",
  () => {
    test(
      "provider events are routed into existing canonical signal ingestion pipeline",
      async () => {
        const runtime = {
          receiveSignals:
            jest.fn(
              async () => ({
                schemaVersion:
                  "20.1-v1",

                provider:
                  "prometheus_alertmanager",

                operation:
                  "receiveSignals",

                status:
                  "SUCCESS",

                data: [
                  {
                    provider:
                      "prometheus_alertmanager",

                    eventType:
                      "alert.open",

                    title:
                      "High CPU",

                    severity:
                      "high",

                    service:
                      "api",

                    externalEventId:
                      "provider-event-1",

                    receivedAt:
                      "2026-08-30T00:00:00.000Z",
                  },
                ],

                provenance: {
                  invocationId:
                    "int_inv_test",

                  integrationPublicId:
                    "int_conn_test",

                  integrationCanonicalId:
                    "33333333-3333-3333-3333-333333333333",

                  provider:
                    "prometheus_alertmanager",
                },

                executionAuthorized:
                  false,
              })
            ),
        };


        const signalIngestionService = {
          ingest:
            jest.fn(
              async (
                input,
                context
              ) => ({
                accepted:
                  true,

                duplicate:
                  false,

                signal: {
                  signalId:
                    "sig_1",

                  provider:
                    input.provider,

                  organizationId:
                    context.organizationId,

                  environmentId:
                    context.environmentId,

                  integrationConnectionId:
                    context.integrationConnectionId,
                },

                correlation:
                  null,

                correlationGroup:
                  null,

                routing: {
                  routed:
                    false,
                },
              })
            ),
        };


        const gateway =
          new IntegrationSignalGateway({
            runtime,

            signalIngestionService,
          });


        const result =
          await gateway
            .receiveSignals({
              ...CONTEXT,

              payload: {
                alerts: [],
              },

              headers: {
                "x-test":
                  "1",
              },
            });


        expect(
          runtime.receiveSignals
        ).toHaveBeenCalledTimes(
          1
        );


        expect(
          signalIngestionService
            .ingest
        ).toHaveBeenCalledTimes(
          1
        );


        const [
          ingestedInput,
          ingestedContext,
        ] =
          signalIngestionService
            .ingest
            .mock
            .calls[0];


        expect(
          ingestedInput
            .organizationId
        ).toBe(
          "aira-dev-org"
        );


        expect(
          ingestedInput
            .environmentId
        ).toBe(
          "env_aira_development"
        );


        expect(
          ingestedInput
            .integrationConnectionId
        ).toBe(
          "int_conn_test"
        );


        expect(
          ingestedContext
            .tenantId
        ).toBe(
          "aira-dev-org"
        );


        expect(
          ingestedContext
            .source
        ).toBe(
          "integration"
        );


        expect(
          result.received
        ).toBe(
          1
        );


        expect(
          result.accepted
        ).toBe(
          1
        );


        expect(
          result.duplicates
        ).toBe(
          0
        );


        expect(
          result.failed
        ).toBe(
          0
        );


        expect(
          result.executionAuthorized
        ).toBe(
          false
        );
      }
    );


    test(
      "provider cannot override organization or environment ownership",
      () => {
        const signal =
          buildCanonicalSignalInput({
            providerEvent: {
              organizationId:
                "attacker-org",

              environmentId:
                "attacker-env",

              tenantId:
                "attacker-tenant",

              provider:
                "evil-provider",

              title:
                "Test",
            },

            organizationId:
              "aira-dev-org",

            environmentId:
              "env_aira_development",

            tenantId:
              "aira-dev-org",

            integrationId:
              "int_conn_test",

            provider:
              "prometheus_alertmanager",

            serviceId:
              null,

            correlationId:
              null,

            providerResult: {
              provenance: {
                invocationId:
                  "invocation-1",
              },
            },

            eventIndex:
              0,
          });


        expect(
          signal.organizationId
        ).toBe(
          "aira-dev-org"
        );


        expect(
          signal.environmentId
        ).toBe(
          "env_aira_development"
        );


        expect(
          signal.tenantId
        ).toBe(
          "aira-dev-org"
        );


        expect(
          signal.provider
        ).toBe(
          "prometheus_alertmanager"
        );


        expect(
          signal.executionAuthorized
        ).not.toBe(
          true
        );
      }
    );


    test(
      "single provider result is normalized into one event",
      () => {
        const events =
          normalizeProviderEvents({
            title:
              "single",
          });


        expect(
          events
        ).toHaveLength(
          1
        );
      }
    );


    test(
      "signal batch is bounded",
      async () => {
        const runtime = {
          receiveSignals:
            jest.fn(
              async () => ({
                data:
                  Array.from(
                    {
                      length:
                        DEFAULT_MAX_SIGNALS_PER_INVOCATION +
                        1,
                    },
                    (
                      _,
                      index
                    ) => ({
                      title:
                        `event-${index}`,
                    })
                  ),

                executionAuthorized:
                  false,
              })
            ),
        };


        const gateway =
          new IntegrationSignalGateway({
            runtime,

            signalIngestionService: {
              ingest:
                jest.fn(),
            },
          });


        await expect(
          gateway
            .receiveSignals({
              ...CONTEXT,

              payload:
                {},
            })
        ).rejects
          .toMatchObject({
            code:
              "INTEGRATION_SIGNAL_BATCH_TOO_LARGE",

            executionAuthorized:
              false,
          });
      }
    );


    test(
      "duplicate result remains explicit",
      async () => {
        const gateway =
          new IntegrationSignalGateway({
            runtime: {
              receiveSignals:
                jest.fn(
                  async () => ({
                    data: {
                      title:
                        "duplicate event",

                      eventType:
                        "alert.open",

                      severity:
                        "high",
                    },

                    provenance:
                      {},

                    executionAuthorized:
                      false,
                  })
                ),
            },

            signalIngestionService: {
              ingest:
                jest.fn(
                  async () => ({
                    accepted:
                      true,

                    duplicate:
                      true,

                    signal: {
                      signalId:
                        "sig_existing",
                    },

                    routing: {
                      routed:
                        false,

                      reason:
                        "DUPLICATE_SIGNAL",
                    },
                  })
                ),
            },
          });


        const result =
          await gateway
            .receiveSignals({
              ...CONTEXT,

              payload:
                {},
            });


        expect(
          result.accepted
        ).toBe(
          0
        );


        expect(
          result.duplicates
        ).toBe(
          1
        );


        expect(
          result.failed
        ).toBe(
          0
        );
      }
    );


    test(
      "one failed signal does not corrupt already processed signals",
      async () => {
        let call =
          0;


        const gateway =
          new IntegrationSignalGateway({
            runtime: {
              receiveSignals:
                jest.fn(
                  async () => ({
                    data: [
                      {
                        title:
                          "first",
                      },

                      {
                        title:
                          "second",
                      },
                    ],

                    provenance:
                      {},

                    executionAuthorized:
                      false,
                  })
                ),
            },

            signalIngestionService: {
              ingest:
                jest.fn(
                  async () => {
                    call +=
                      1;


                    if (
                      call ===
                      2
                    ) {
                      throw Object.assign(
                        new Error(
                          "persistence failed"
                        ),
                        {
                          code:
                            "SIGNAL_PERSISTENCE_FAILED",
                        }
                      );
                    }


                    return {
                      accepted:
                        true,

                      duplicate:
                        false,

                      signal: {
                        signalId:
                          "sig_first",
                      },
                    };
                  }
                ),
            },
          });


        const result =
          await gateway
            .receiveSignals({
              ...CONTEXT,

              payload:
                {},
            });


        expect(
          result.received
        ).toBe(
          2
        );


        expect(
          result.accepted
        ).toBe(
          1
        );


        expect(
          result.failed
        ).toBe(
          1
        );


        expect(
          result.executionAuthorized
        ).toBe(
          false
        );
      }
    );
  }
);


describe(
  "Phase 20.9 Integration Evidence Gateway",
  () => {
    function buildRuntime() {
      return {
        queryMetrics:
          jest.fn(
            async (
              _context,
              query
            ) => ({
              status:
                "SUCCESS",

              data: {
                series: [
                  {
                    value:
                      97,
                  },
                ],

                receivedLimit:
                  query.limit,
              },

              provenance: {
                invocationId:
                  "metric-invocation",

                provider:
                  "datadog",

                durationMs:
                  10,
              },

              observedAt:
                "2026-08-30T00:00:00.000Z",

              executionAuthorized:
                false,
            })
          ),


        queryLogs:
          jest.fn(
            async (
              _context,
              query
            ) => ({
              status:
                "SUCCESS",

              data: [
                {
                  message:
                    "database timeout",
                },
              ],

              provenance: {
                invocationId:
                  "log-invocation",
              },

              observedAt:
                "2026-08-30T00:00:00.000Z",

              executionAuthorized:
                false,
            })
          ),


        queryTraces:
          jest.fn(
            async () => ({
              status:
                "SUCCESS",

              data: [
                {
                  traceId:
                    "trace-1",
                },
              ],

              provenance: {
                invocationId:
                  "trace-invocation",
              },

              observedAt:
                "2026-08-30T00:00:00.000Z",

              executionAuthorized:
                false,
            })
          ),
      };
    }


    const evidenceContext = {
      organizationId:
        "aira-dev-org",

      environmentId:
        "env_aira_development",

      integrationId:
        "int_conn_datadog",

      provider:
        "datadog",
    };


    test(
      "queryMetrics returns external-provider evidence without persisting telemetry",
      async () => {
        const runtime =
          buildRuntime();


        const gateway =
          new IntegrationEvidenceGateway({
            runtime,
          });


        const result =
          await gateway
            .queryMetrics(
              evidenceContext,
              {
                query:
                  "avg:system.cpu.user{*}",

                from:
                  "2026-08-30T00:00:00.000Z",

                to:
                  "2026-08-30T00:15:00.000Z",

                limit:
                  50,
              }
            );


        expect(
          runtime.queryMetrics
        ).toHaveBeenCalledTimes(
          1
        );


        expect(
          result.evidenceType
        ).toBe(
          EVIDENCE_TYPE
            .METRIC
        );


        expect(
          result.evidence
            .series[0]
            .value
        ).toBe(
          97
        );


        expect(
          result.provenance
            .source
        ).toBe(
          "EXTERNAL_PROVIDER"
        );


        expect(
          result.provenance
            .persistedByGateway
        ).toBe(
          false
        );


        expect(
          result.executionAuthorized
        ).toBe(
          false
        );
      }
    );


    test(
      "queryLogs routes through runtime",
      async () => {
        const runtime =
          buildRuntime();


        const gateway =
          new IntegrationEvidenceGateway({
            runtime,
          });


        const result =
          await gateway
            .queryLogs(
              evidenceContext,
              {
                query:
                  "service:api",

                limit:
                  25,
              }
            );


        expect(
          runtime.queryLogs
        ).toHaveBeenCalledTimes(
          1
        );


        expect(
          result.evidenceType
        ).toBe(
          EVIDENCE_TYPE
            .LOG
        );


        expect(
          result.evidence[0]
            .message
        ).toBe(
          "database timeout"
        );
      }
    );


    test(
      "queryTraces routes through runtime",
      async () => {
        const runtime =
          buildRuntime();


        const gateway =
          new IntegrationEvidenceGateway({
            runtime,
          });


        const result =
          await gateway
            .queryTraces(
              evidenceContext,
              {
                traceId:
                  "trace-1",
              }
            );


        expect(
          runtime.queryTraces
        ).toHaveBeenCalledTimes(
          1
        );


        expect(
          result.evidenceType
        ).toBe(
          EVIDENCE_TYPE
            .TRACE
        );


        expect(
          result.evidence[0]
            .traceId
        ).toBe(
          "trace-1"
        );
      }
    );


    test(
      "result limit is bounded to maximum",
      async () => {
        const runtime =
          buildRuntime();


        const gateway =
          new IntegrationEvidenceGateway({
            runtime,
          });


        await gateway
          .queryMetrics(
            evidenceContext,
            {
              query:
                "cpu",

              limit:
                MAX_EVIDENCE_LIMIT +
                5000,
            }
          );


        const query =
          runtime
            .queryMetrics
            .mock
            .calls[0][1];


        expect(
          query.limit
        ).toBe(
          MAX_EVIDENCE_LIMIT
        );
      }
    );


    test(
      "evidence time window is bounded",
      async () => {
        const gateway =
          new IntegrationEvidenceGateway({
            runtime:
              buildRuntime(),
          });


        await expect(
          gateway
            .queryMetrics(
              evidenceContext,
              {
                query:
                  "cpu",

                from:
                  "2026-08-28T00:00:00.000Z",

                to:
                  "2026-08-30T00:00:00.000Z",
              }
            )
        ).rejects
          .toMatchObject({
            code:
              "INTEGRATION_EVIDENCE_WINDOW_TOO_LARGE",

            executionAuthorized:
              false,
          });


        expect(
          MAX_EVIDENCE_WINDOW_MS
        ).toBe(
          86_400_000
        );
      }
    );


    test(
      "from after to is rejected",
      async () => {
        const gateway =
          new IntegrationEvidenceGateway({
            runtime:
              buildRuntime(),
          });


        await expect(
          gateway
            .queryLogs(
              evidenceContext,
              {
                from:
                  "2026-08-30T01:00:00.000Z",

                to:
                  "2026-08-30T00:00:00.000Z",
              }
            )
        ).rejects
          .toMatchObject({
            code:
              "INTEGRATION_EVIDENCE_WINDOW_INVALID",

            executionAuthorized:
              false,
          });
      }
    );


    test(
      "unix seconds and ISO timestamps are understood for bounds checking",
      () => {
        expect(
          parseEvidenceTimestamp(
            1788048000
          )
        ).toBe(
          1788048000000
        );


        expect(
          typeof parseEvidenceTimestamp(
            "2026-08-30T00:00:00.000Z"
          )
        ).toBe(
          "number"
        );
      }
    );


    test(
      "provider-native relative time strings are preserved",
      async () => {
        const runtime =
          buildRuntime();


        const gateway =
          new IntegrationEvidenceGateway({
            runtime,
          });


        await gateway
          .queryLogs(
            evidenceContext,
            {
              query:
                "*",

              from:
                "now-15m",

              to:
                "now",

              limit:
                20,
            }
          );


        const query =
          runtime
            .queryLogs
            .mock
            .calls[0][1];


        expect(
          query.from
        ).toBe(
          "now-15m"
        );


        expect(
          query.to
        ).toBe(
          "now"
        );
      }
    );


    test(
      "query metadata redacts actual credential-bearing fields",
      () => {
        const safe =
          sanitizeQueryMetadata({
            query:
              "service:api",

            apiKey:
              "should-hide",

            nested: {
              token:
                "hide",

              service:
                "api",
            },
          });


        expect(
          safe.apiKey
        ).toBe(
          "[REDACTED]"
        );


        expect(
          safe.nested.token
        ).toBe(
          "[REDACTED]"
        );


        expect(
          safe.query
        ).toBe(
          "service:api"
        );


        expect(
          safe.nested.service
        ).toBe(
          "api"
        );
      }
    );


    test(
      "evidence context can never grant execution authority",
      async () => {
        const gateway =
          new IntegrationEvidenceGateway({
            runtime:
              buildRuntime(),
          });


        await expect(
          gateway
            .queryMetrics(
              {
                ...evidenceContext,

                executionAuthorized:
                  true,
              },
              {
                query:
                  "cpu",
              }
            )
        ).rejects
          .toMatchObject({
            code:
              "INTEGRATION_EVIDENCE_AUTHORITY_VIOLATION",

            executionAuthorized:
              false,
          });
      }
    );
  }
);