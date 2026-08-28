"use strict";

const KubernetesResourceNormalizer =
  require(
    "../../services/topology/normalization/KubernetesResourceNormalizer"
  );

const ResourceNormalizerRegistry =
  require(
    "../../services/topology/normalization/ResourceNormalizerRegistry"
  );

const ResourceStateIngestionService =
  require(
    "../../services/topology/ResourceStateIngestionService"
  );

const {
  canonicalFingerprint,
} = require(
  "../../services/topology/normalization/CanonicalFingerprint"
);


describe(
  "Phase 17.8 - State ingestion and normalization",
  function () {
    const organizationId =
      "aira-dev-org";

    const environmentId =
      "env_aira_development";

    const integrationId =
      "integration-k8s-test";


    test(
      "canonical fingerprint is deterministic across key ordering",
      function () {
        const first =
          canonicalFingerprint({
            b: 2,
            a: {
              d: 4,
              c: 3,
            },
          });


        const second =
          canonicalFingerprint({
            a: {
              c: 3,
              d: 4,
            },
            b: 2,
          });


        expect(
          first
        ).toBe(
          second
        );
      }
    );


    test(
      "normalizes Kubernetes Pod into canonical Resource and ResourceState",
      function () {
        const normalizer =
          new KubernetesResourceNormalizer();


        const result =
          normalizer.normalize({
            organizationId,

            environmentId,

            integrationId,

            observedAt:
              new Date(
                "2026-08-28T10:00:00.000Z"
              ),

            resource: {
              kind:
                "pod",

              name:
                "payments-api",

              namespace:
                "production",

              uid:
                "pod-uid-123",

              labels: {
                app:
                  "payments",
              },

              spec: {
                nodeName:
                  "worker-01",
              },

              status: {
                phase:
                  "Running",

                totalContainers:
                  2,

                readyContainers:
                  2,

                restartCount:
                  0,
              },

              active:
                true,
            },
          });


        expect(
          result.resource.provider
        ).toBe(
          "kubernetes"
        );


        expect(
          result.resource.resourceType
        ).toBe(
          "kubernetes.pod"
        );


        expect(
          result.resource.externalId
        ).toBe(
          "kubernetes:integration-k8s-test:pod-uid-123"
        );


        expect(
          result.state.health
        ).toBe(
          "HEALTHY"
        );


        expect(
          result.state.lifecycle
        ).toBe(
          "RUNNING"
        );


        expect(
          result.state.fingerprint
        ).toMatch(
          /^[a-f0-9]{64}$/
        );
      }
    );


    test(
      "maps Kubernetes CrashLoopBackOff to critical state",
      function () {
        const normalizer =
          new KubernetesResourceNormalizer();


        const result =
          normalizer.normalize({
            organizationId,

            environmentId,

            integrationId,

            resource: {
              kind:
                "pod",

              name:
                "broken-api",

              uid:
                "broken-1",

              status: {
                phase:
                  "Running",

                failureSignals: [
                  {
                    reason:
                      "CrashLoopBackOff",
                  },
                ],
              },
            },
          });


        expect(
          result.state.health
        ).toBe(
          "CRITICAL"
        );
      }
    );


    test(
      "normalizes Kubernetes deployment replica health",
      function () {
        const normalizer =
          new KubernetesResourceNormalizer();


        const result =
          normalizer.normalize({
            organizationId,

            environmentId,

            integrationId,

            resource: {
              kind:
                "deployment",

              name:
                "api",

              namespace:
                "production",

              uid:
                "deploy-1",

              spec: {
                replicas:
                  4,
              },

              status: {
                readyReplicas:
                  2,

                unavailableReplicas:
                  2,
              },
            },
          });


        expect(
          result.state.health
        ).toBe(
          "DEGRADED"
        );


        expect(
          result.state.metrics
            .desiredReplicas
        ).toBe(
          4
        );
      }
    );


    test(
      "provider-specific details remain inside attributes/configuration/runtime",
      function () {
        const normalizer =
          new KubernetesResourceNormalizer();


        const result =
          normalizer.normalize({
            organizationId,

            environmentId,

            integrationId,

            resource: {
              kind:
                "pod",

              name:
                "api",

              uid:
                "api-pod",

              spec: {
                nodeName:
                  "worker-5",
              },

              status: {
                phase:
                  "Running",
              },
            },
          });


        expect(
          result.resource.nodeName
        ).toBeUndefined();


        expect(
          result.state.nodeName
        ).toBeUndefined();


        expect(
          result.state.configuration
            .nodeName
        ).toBe(
          "worker-5"
        );
      }
    );


    test(
      "normalizer registry is provider-extensible without core redesign",
      function () {
        const registry =
          new ResourceNormalizerRegistry();


        registry.register(
          "robotics",
          {
            normalize:
              function () {
                return {
                  resource: {
                    provider:
                      "robotics",

                    resourceType:
                      "robotics.amr",
                  },

                  state: {},
                };
              },
          }
        );


        const result =
          registry.normalize(
            "robotics",
            {}
          );


        expect(
          result.resource
            .resourceType
        ).toBe(
          "robotics.amr"
        );
      }
    );


    test(
      "ingestion creates resource then appends immutable state",
      async function () {
        const resourceRepository = {
          findResourceByExternalId:
            jest.fn()
              .mockResolvedValue(
                null
              ),

          createResource:
            jest.fn(
              async (
                input
              ) => ({
                ...input,

                id:
                  "resource-uuid-1",
              })
            ),

          updateResourceMetadata:
            jest.fn(),

          markResourceSeen:
            jest.fn(),
        };


        const resourceStateRepository = {
          appendResourceState:
            jest.fn(
              async (
                input
              ) => ({
                ...input,

                id:
                  "state-uuid-1",
              })
            ),
        };


        const service =
          new ResourceStateIngestionService({
            resourceRepository,

            resourceStateRepository,
          });


        const result =
          await service
            .ingestProviderObservation({
              provider:
                "kubernetes",

              organizationId,

              environmentId,

              integrationId,

              resource: {
                kind:
                  "pod",

                name:
                  "payments",

                uid:
                  "pod-1",

                status: {
                  phase:
                    "Running",
                },
              },
            });


        expect(
          resourceRepository
            .createResource
        ).toHaveBeenCalledTimes(
          1
        );


        expect(
          resourceStateRepository
            .appendResourceState
        ).toHaveBeenCalledTimes(
          1
        );


        expect(
          result.state.resourceId
        ).toBe(
          "resource-uuid-1"
        );


        expect(
          result.resourceCreated
        ).toBe(
          true
        );


        expect(
          result.executionAuthorized
        ).toBe(
          false
        );
      }
    );


    test(
      "existing Resource is reused while new state snapshot is appended",
      async function () {
        const resourceRepository = {
          findResourceByExternalId:
            jest.fn()
              .mockResolvedValue({
                id:
                  "resource-existing",

                externalId:
                  "existing",
              }),

          createResource:
            jest.fn(),

          updateResourceMetadata:
            jest.fn(
              async () => ({
                id:
                  "resource-existing",
              })
            ),

          markResourceSeen:
            jest.fn(
              async () => ({
                id:
                  "resource-existing",
              })
            ),
        };


        const resourceStateRepository = {
          appendResourceState:
            jest.fn(
              async (
                input
              ) => ({
                ...input,

                id:
                  "state-new",
              })
            ),
        };


        const service =
          new ResourceStateIngestionService({
            resourceRepository,

            resourceStateRepository,
          });


        const result =
          await service
            .ingestProviderObservation({
              provider:
                "kubernetes",

              organizationId,

              environmentId,

              integrationId,

              resource: {
                kind:
                  "pod",

                name:
                  "payments",

                uid:
                  "pod-existing",

                status: {
                  phase:
                    "Running",
                },
              },
            });


        expect(
          resourceRepository
            .createResource
        ).not.toHaveBeenCalled();


        expect(
          resourceRepository
            .updateResourceMetadata
        ).toHaveBeenCalledTimes(
          1
        );


        expect(
          resourceRepository
            .markResourceSeen
        ).toHaveBeenCalledTimes(
          1
        );


        expect(
          resourceStateRepository
            .appendResourceState
        ).toHaveBeenCalledTimes(
          1
        );


        expect(
          result.resourceCreated
        ).toBe(
          false
        );
      }
    );


    test(
      "ingestion never creates known-good state automatically",
      function () {
        const service =
          new ResourceStateIngestionService({
            resourceRepository:
              {},

            resourceStateRepository:
              {},
          });


        expect(
          service.promoteKnownGood
        ).toBeUndefined();


        expect(
          service.authorizeExecution
        ).toBeUndefined();


        expect(
          service.executeRecovery
        ).toBeUndefined();
      }
    );
  }
);