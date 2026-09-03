"use strict";


const crypto =
  require(
    "node:crypto"
  );


const INTEGRATION_TRANSLATION_POPULATION_VERSION =
  "23R.13S.2.0";


const PROVIDERS =
  Object.freeze([
    "prometheus_alertmanager",

    "grafana_alerting",

    "datadog",

    "aws_cloudwatch",

    "azure_monitor",

    "gcp_monitoring",

    "opentelemetry",
  ]);


const PROVIDER_FAMILY =
  Object.freeze({
    prometheus_alertmanager:
      "PROMETHEUS",

    grafana_alerting:
      "GRAFANA",

    datadog:
      "DATADOG",

    aws_cloudwatch:
      "CLOUDWATCH",

    azure_monitor:
      "AZURE_MONITOR",

    gcp_monitoring:
      "GCP_MONITORING",

    opentelemetry:
      "OPENTELEMETRY",
  });


const DEFAULT_SCENARIOS =
  Object.freeze([
    Object.freeze({
      scenarioId:
        "dependency-latency",

      condition:
        "DEPENDENCY_LATENCY",

      title:
        "Checkout dependency latency",

      service:
        "checkout",

      severity:
        "critical",

      status:
        "open",

      metricName:
        "dependency_latency_ms",

      metricValue:
        4200,
    }),


    Object.freeze({
      scenarioId:
        "dependency-unavailable",

      condition:
        "DEPENDENCY_UNAVAILABLE",

      title:
        "Payment dependency unavailable",

      service:
        "payment",

      severity:
        "critical",

      status:
        "open",

      metricName:
        "dependency_available",

      metricValue:
        0,
    }),


    Object.freeze({
      scenarioId:
        "queue-backlog",

      condition:
        "QUEUE_BACKLOG",

      title:
        "Order queue backlog",

      service:
        "orders",

      severity:
        "warning",

      status:
        "open",

      metricName:
        "queue_depth",

      metricValue:
        18000,
    }),


    Object.freeze({
      scenarioId:
        "recovered",

      condition:
        "DEPENDENCY_LATENCY",

      title:
        "Checkout latency recovered",

      service:
        "checkout",

      severity:
        "info",

      status:
        "resolved",

      metricName:
        "dependency_latency_ms",

      metricValue:
        120,
    }),
  ]);


function stableHash(
  value
) {
  return crypto
    .createHash(
      "sha256"
    )
    .update(
      JSON.stringify(
        sortDeep(
          value
        )
      )
    )
    .digest(
      "hex"
    );
}


function sortDeep(
  value
) {
  if (
    Array.isArray(
      value
    )
  ) {
    return value.map(
      sortDeep
    );
  }


  if (
    value &&
    typeof value ===
      "object" &&
    !(
      value
      instanceof Date
    )
  ) {
    return Object
      .keys(
        value
      )
      .sort()
      .reduce(
        (
          accumulator,
          key
        ) => {
          accumulator[
            key
          ] =
            sortDeep(
              value[
                key
              ]
            );


          return accumulator;
        },
        {}
      );
  }


  if (
    value
    instanceof Date
  ) {
    return value
      .toISOString();
  }


  return value;
}


function sanitizeVolatile(
  value
) {
  if (
    Array.isArray(
      value
    )
  ) {
    return value.map(
      sanitizeVolatile
    );
  }


  if (
    !value ||
    typeof value !==
      "object"
  ) {
    return value;
  }


  const result =
    {};


  for (
    const [
      key,
      entry,
    ]
    of Object.entries(
      value
    )
  ) {
    if (
      [
        "receivedAt",
        "observedAt",
      ].includes(
        key
      )
    ) {
      continue;
    }


    result[
      key
    ] =
      sanitizeVolatile(
        entry
      );
  }


  return result;
}


function providerPayload(
  provider,
  canonical
) {
  const open =
    canonical.status ===
    "open";


  const timestamp =
    "2026-09-03T00:00:00.000Z";


  switch (
    provider
  ) {
    case "prometheus_alertmanager":
      return {
        receiver:
          "aira",

        status:
          open
            ? "firing"
            : "resolved",

        alerts: [
          {
            status:
              open
                ? "firing"
                : "resolved",

            labels: {
              alertname:
                canonical.condition,

              severity:
                canonical.severity,

              service:
                canonical.service,
            },

            annotations: {
              summary:
                canonical.title,
            },

            startsAt:
              timestamp,

            endsAt:
              open
                ? "0001-01-01T00:00:00Z"
                : timestamp,

            fingerprint:
              stableHash(
                canonical
              ).slice(
                0,
                16
              ),
          },
        ],
      };


    case "grafana_alerting":
      return {
        receiver:
          "aira",

        status:
          open
            ? "firing"
            : "resolved",

        title:
          canonical.title,

        alerts: [
          {
            status:
              open
                ? "firing"
                : "resolved",

            labels: {
              alertname:
                canonical.condition,

              severity:
                canonical.severity,

              service:
                canonical.service,
            },

            annotations: {
              summary:
                canonical.title,
            },

            startsAt:
              timestamp,

            endsAt:
              open
                ? null
                : timestamp,

            fingerprint:
              stableHash(
                canonical
              ).slice(
                0,
                16
              ),
          },
        ],
      };


    case "datadog":
      return {
        id:
          stableHash(
            canonical
          ).slice(
            0,
            20
          ),

        alert_status:
          open
            ? "triggered"
            : "recovered",

        title:
          canonical.title,

        priority:
          canonical.severity,

        service:
          canonical.service,

        tags: [
          `service:${canonical.service}`,

          `condition:${canonical.condition}`,
        ],

        message:
          canonical.title,
      };


    case "aws_cloudwatch":
      return {
        AlarmName:
          canonical.title,

        AlarmArn:
          (
            "arn:aws:cloudwatch:fixture:"
            +
            "000000000000:alarm:"
            +
            canonical.scenarioId
          ),

        NewStateValue:
          open
            ? "ALARM"
            : "OK",

        NewStateReason:
          canonical.condition,

        Trigger: {
          Namespace:
            canonical.service,

          MetricName:
            canonical.metricName,

          Dimensions: [
            {
              name:
                "Service",

              value:
                canonical.service,
            },
          ],
        },
      };


    case "azure_monitor":
      return {
        schemaId:
          "azureMonitorCommonAlertSchema",

        data: {
          essentials: {
            alertId:
              stableHash(
                canonical
              ).slice(
                0,
                24
              ),

            alertRule:
              canonical.title,

            severity:
              canonical.severity ===
                "critical"
                ? "Sev1"
                : canonical.severity ===
                    "warning"
                    ? "Sev2"
                    : "Sev4",

            signalType:
              "Metric",

            monitorCondition:
              open
                ? "Fired"
                : "Resolved",

            monitoringService:
              "Platform",

            targetResourceType:
              canonical.service,

            alertTargetIDs: [
              (
                "/subscriptions/fixture/"
                +
                "resourceGroups/aira/"
                +
                "providers/AIRA/"
                +
                canonical.service
              ),
            ],

            targetResourceGroup:
              "aira",

            description:
              canonical.condition,

            firedDateTime:
              timestamp,
          },

          alertContext: {
            condition:
              open
                ? "Fired"
                : "Resolved",
          },
        },
      };


    case "gcp_monitoring":
      return {
        incident: {
          incident_id:
            stableHash(
              canonical
            ).slice(
              0,
              24
            ),

          state:
            open
              ? "open"
              : "closed",

          policy_name:
            canonical.title,

          condition_name:
            canonical.condition,

          severity:
            canonical.severity,

          resource: {
            type:
              canonical.service,

            labels: {
              service:
                canonical.service,
            },
          },

          summary:
            canonical.title,
        },
      };


    case "opentelemetry":
      return {
        resourceLogs: [
          {
            resource: {
              attributes: [
                {
                  key:
                    "service.name",

                  value: {
                    stringValue:
                      canonical.service,
                  },
                },

                {
                  key:
                    "aira.condition",

                  value: {
                    stringValue:
                      canonical.condition,
                  },
                },

                {
                  key:
                    "aira.status",

                  value: {
                    stringValue:
                      canonical.status,
                  },
                },
              ],
            },

            scopeLogs: [
              {
                scope: {
                  name:
                    (
                      "aira.phase23r13."
                      +
                      "integration-translation"
                    ),
                },

                logRecords: [
                  {
                    timeUnixNano:
                      "1788393600000000000",

                    severityText:
                      canonical.severity ===
                        "warning"
                        ? "WARN"
                        : canonical.severity ===
                            "info"
                            ? "INFO"
                            : "CRITICAL",

                    body: {
                      stringValue:
                        canonical.title,
                    },

                    attributes: [
                      {
                        key:
                          "event.name",

                        value: {
                          stringValue:
                            canonical.condition,
                        },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };


    default:
      throw Object.assign(
        new Error(
          `Unsupported translation provider: ${provider}`
        ),
        {
          code:
            "REALITY_TRANSLATION_PROVIDER_UNSUPPORTED",

          provider,

          executionAuthorized:
            false,
        }
      );
  }
}


class RealityIntegrationTranslationCorpusService {
  constructor(
    options =
      {}
  ) {
    this.adapterRegistry =
      options.adapterRegistry
      ||
      require(
        "../integrations/adapterRegistry"
      );


    this.catalogue =
      options.catalogue
      ||
      require(
        "../../config/integrationCatalogue"
      );
  }


  generateScenario(
    canonical,
    providers =
      PROVIDERS
  ) {
    if (
      !canonical ||
      typeof canonical !==
        "object" ||
      Array.isArray(
        canonical
      )
    ) {
      throw new TypeError(
        "canonical incident is required"
      );
    }


    for (
      const key
      of [
        "scenarioId",

        "condition",

        "title",

        "service",

        "severity",

        "status",
      ]
    ) {
      if (
        !canonical[
          key
        ]
      ) {
        throw new Error(
          `canonical.${key} is required`
        );
      }
    }


    const parentCaseId =
      (
        "integration-parent-"
        +
        stableHash(
          canonical
        ).slice(
          0,
          24
        )
      );


    const translations =
      providers.map(
        (
          provider
        ) => {
          const adapter =
            this.adapterRegistry
              .getAdapter(
                provider
              );


          if (
            !adapter ||
            typeof adapter
              .normalizeEvent !==
              "function"
          ) {
            throw Object.assign(
              new Error(
                (
                  `Provider ${provider} has no `
                  +
                  "normalizeEvent adapter contract"
                )
              ),
              {
                code:
                  "REALITY_TRANSLATION_ADAPTER_NORMALIZER_MISSING",

                provider,

                executionAuthorized:
                  false,
              }
            );
          }


          const payload =
            providerPayload(
              provider,
              canonical
            );


          const normalized =
            sanitizeVolatile(
              adapter
                .normalizeEvent(
                  payload
                )
            );


          const definition =
            this.catalogue
              .findDefinition(
                provider
              );


          if (
            provider ===
            "opentelemetry"
          ) {
            if (
              !Array.isArray(
                normalized
              ) ||
              normalized.length ===
                0
            ) {
              throw new Error(
                "OpenTelemetry translation produced no normalized signals"
              );
            }


            if (
              normalized[0]
                .serviceName !==
              canonical.service
            ) {
              throw new Error(
                "OpenTelemetry translation changed canonical service meaning"
              );
            }
          } else {
            const first =
              Array.isArray(
                normalized
              )
                ? normalized[0]
                : normalized;


            if (
              !first
            ) {
              throw new Error(
                (
                  `${provider} translation `
                  +
                  "produced no normalized event"
                )
              );
            }


            if (
              first.service !==
              canonical.service
            ) {
              throw new Error(
                (
                  `${provider} translation changed `
                  +
                  "canonical service meaning"
                )
              );
            }


            if (
              first.status !==
              canonical.status
            ) {
              throw new Error(
                (
                  `${provider} translation changed `
                  +
                  "canonical incident status"
                )
              );
            }
          }


          const recordCore = {
            version:
              INTEGRATION_TRANSLATION_POPULATION_VERSION,

            parentCaseId,

            corpusRole:
              "INTEGRATION_TRANSLATION",

            provider,

            providerFamily:
              PROVIDER_FAMILY[
                provider
              ],

            catalogueAvailabilityStatus:
              definition
                ?.availabilityStatus
              ||
              "unknown",

            canonicalMeaning: {
              ...canonical,
            },

            providerPayload:
              payload,

            normalizedAdapterOutput:
              normalized,

            independentEvidence:
              false,

            groundTruthAgentVisible:
              false,

            executionAuthorized:
              false,

            productionCertified:
              false,
          };


          return {
            ...recordCore,

            translationId:
              (
                "translation-"
                +
                stableHash(
                  recordCore
                ).slice(
                  0,
                  24
                )
              ),

            translationHash:
              stableHash(
                recordCore
              ),
          };
        }
      );


    return {
      version:
        INTEGRATION_TRANSLATION_POPULATION_VERSION,

      parentCaseId,

      canonicalMeaning: {
        ...canonical,
      },

      translations,

      providerCount:
        translations.length,

      executionAuthorized:
        false,

      productionCertified:
        false,
    };
  }


  generateCorpus(
    scenarios =
      DEFAULT_SCENARIOS,

    providers =
      PROVIDERS
  ) {
    const groups =
      scenarios.map(
        (
          scenario
        ) =>
          this.generateScenario(
            scenario,
            providers
          )
      );


    const translations =
      groups.flatMap(
        (
          group
        ) =>
          group.translations
      );


    const manifestCore = {
      version:
        INTEGRATION_TRANSLATION_POPULATION_VERSION,

      scenarioCount:
        groups.length,

      translationCount:
        translations.length,

      providers: [
        ...providers,
      ],

      providerFamilies: [
        ...new Set(
          translations.map(
            (
              item
            ) =>
              item.providerFamily
          )
        ),
      ].sort(),

      translations:
        translations.map(
          (
            item
          ) => ({
            translationId:
              item.translationId,

            translationHash:
              item.translationHash,

            parentCaseId:
              item.parentCaseId,

            provider:
              item.provider,

            providerFamily:
              item.providerFamily,
          })
        ),

      executionAuthorized:
        false,

      productionCertified:
        false,
    };


    return {
      groups,

      manifest: {
        ...manifestCore,

        manifestHash:
          stableHash(
            manifestCore
          ),
      },
    };
  }
}


module.exports = {
  INTEGRATION_TRANSLATION_POPULATION_VERSION,

  PROVIDERS,

  PROVIDER_FAMILY,

  DEFAULT_SCENARIOS,

  providerPayload,

  sanitizeVolatile,

  stableHash,

  RealityIntegrationTranslationCorpusService,
};