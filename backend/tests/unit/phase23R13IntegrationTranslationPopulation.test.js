"use strict";


const {
  INTEGRATION_TRANSLATION_POPULATION_VERSION,

  PROVIDERS,

  DEFAULT_SCENARIOS,

  providerPayload,

  RealityIntegrationTranslationCorpusService,
} =
  require(
    "../../services/reality/realityIntegrationTranslationCorpusService"
  );


function fakeAdapter(
  provider
) {
  return {
    normalizeEvent(
      payload
    ) {
      if (
        provider ===
        "opentelemetry"
      ) {
        const attributes =
          payload
            .resourceLogs[0]
            .resource
            .attributes;


        const service =
          attributes
            .find(
              (
                item
              ) =>
                item.key ===
                "service.name"
            )
            .value
            .stringValue;


        return [
          {
            signalType:
              "log",

            serviceName:
              service,

            observedAt:
              new Date(),
          },
        ];
      }


      const canonicalService =
        (() => {
          if (
            provider ===
              "prometheus_alertmanager"
            ||
            provider ===
              "grafana_alerting"
          ) {
            return payload
              .alerts[0]
              .labels
              .service;
          }


          if (
            provider ===
            "datadog"
          ) {
            return payload.service;
          }


          if (
            provider ===
            "aws_cloudwatch"
          ) {
            return payload
              .Trigger
              .Namespace;
          }


          if (
            provider ===
            "azure_monitor"
          ) {
            return payload
              .data
              .essentials
              .targetResourceType;
          }


          if (
            provider ===
            "gcp_monitoring"
          ) {
            return payload
              .incident
              .resource
              .type;
          }


          return null;
        })();


      const status =
        (() => {
          if (
            provider ===
              "prometheus_alertmanager"
            ||
            provider ===
              "grafana_alerting"
          ) {
            return payload
              .alerts[0]
              .status ===
              "firing"
                ? "open"
                : "resolved";
          }


          if (
            provider ===
            "datadog"
          ) {
            return payload
              .alert_status ===
              "triggered"
                ? "open"
                : "resolved";
          }


          if (
            provider ===
            "aws_cloudwatch"
          ) {
            return payload
              .NewStateValue ===
              "ALARM"
                ? "open"
                : "resolved";
          }


          if (
            provider ===
            "azure_monitor"
          ) {
            return payload
              .data
              .essentials
              .monitorCondition ===
              "Fired"
                ? "open"
                : "resolved";
          }


          if (
            provider ===
            "gcp_monitoring"
          ) {
            return payload
              .incident
              .state ===
              "open"
                ? "open"
                : "resolved";
          }


          return "unknown";
        })();


      return {
        provider,

        service:
          canonicalService,

        status,

        receivedAt:
          new Date()
            .toISOString(),
      };
    },
  };
}


const adapterRegistry = {
  getAdapter(
    provider
  ) {
    return fakeAdapter(
      provider
    );
  },
};


const catalogue = {
  findDefinition(
    provider
  ) {
    return {
      provider,

      availabilityStatus:
        [
          "prometheus_alertmanager",

          "grafana_alerting",

          "opentelemetry",
        ].includes(
          provider
        )
          ? "available"
          : "coming_soon",
    };
  },
};


describe(
  "Phase 23R.13S.2 integration translation corpus population",

  () => {
    test(
      "freezes population version",

      () => {
        expect(
          INTEGRATION_TRANSLATION_POPULATION_VERSION
        ).toBe(
          "23R.13S.2.0"
        );
      }
    );


    test(
      "covers the selected adapter-backed providers",

      () => {
        expect(
          PROVIDERS
        ).toEqual([
          "prometheus_alertmanager",

          "grafana_alerting",

          "datadog",

          "aws_cloudwatch",

          "azure_monitor",

          "gcp_monitoring",

          "opentelemetry",
        ]);
      }
    );


    test(
      "builds a provider payload for every provider and scenario",

      () => {
        for (
          const scenario
          of DEFAULT_SCENARIOS
        ) {
          for (
            const provider
            of PROVIDERS
          ) {
            expect(
              providerPayload(
                provider,
                scenario
              )
            ).toBeTruthy();
          }
        }
      }
    );


    test(
      "generates deterministic translations",

      () => {
        const service =
          new RealityIntegrationTranslationCorpusService({
            adapterRegistry,

            catalogue,
          });


        const first =
          service.generateCorpus();


        const second =
          service.generateCorpus();


        expect(
          first.manifest
            .manifestHash
        ).toBe(
          second.manifest
            .manifestHash
        );


        expect(
          first.manifest
            .scenarioCount
        ).toBe(
          DEFAULT_SCENARIOS
            .length
        );


        expect(
          first.manifest
            .translationCount
        ).toBe(
          DEFAULT_SCENARIOS
            .length
          *
          PROVIDERS.length
        );
      }
    );


    test(
      "provider format does not change canonical meaning",

      () => {
        const service =
          new RealityIntegrationTranslationCorpusService({
            adapterRegistry,

            catalogue,
          });


        const corpus =
          service.generateCorpus();


        for (
          const group
          of corpus.groups
        ) {
          for (
            const translation
            of group.translations
          ) {
            expect(
              translation
                .canonicalMeaning
            ).toEqual(
              group
                .canonicalMeaning
            );


            expect(
              translation
                .parentCaseId
            ).toBe(
              group
                .parentCaseId
            );


            expect(
              translation
                .independentEvidence
            ).toBe(
              false
            );
          }
        }
      }
    );


    test(
      "adapter existence does not imply product production status",

      () => {
        const service =
          new RealityIntegrationTranslationCorpusService({
            adapterRegistry,

            catalogue,
          });


        const group =
          service.generateScenario(
            DEFAULT_SCENARIOS[0],

            [
              "aws_cloudwatch",
            ]
          );


        expect(
          group
            .translations[0]
            .catalogueAvailabilityStatus
        ).toBe(
          "coming_soon"
        );
      }
    );


    test(
      "grants no execution or production authority",

      () => {
        const service =
          new RealityIntegrationTranslationCorpusService({
            adapterRegistry,

            catalogue,
          });


        const corpus =
          service.generateCorpus();


        expect(
          corpus.manifest
            .executionAuthorized
        ).toBe(
          false
        );


        expect(
          corpus.manifest
            .productionCertified
        ).toBe(
          false
        );


        for (
          const group
          of corpus.groups
        ) {
          for (
            const translation
            of group.translations
          ) {
            expect(
              translation
                .executionAuthorized
            ).toBe(
              false
            );


            expect(
              translation
                .productionCertified
            ).toBe(
              false
            );


            expect(
              translation
                .groundTruthAgentVisible
            ).toBe(
              false
            );
          }
        }
      }
    );
  }
);