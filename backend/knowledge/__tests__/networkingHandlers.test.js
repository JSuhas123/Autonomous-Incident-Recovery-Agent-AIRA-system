"use strict";

const {
  NETWORKING_ACTIONS,
  ACTION_METHODS,
  networkingHandlers,
  validateNetworkingParams,
  executeNetworkingAction,
} =
  require(
    "../../runbooks/actions/handlers/networkingHandlers"
  );

const {
  registerNetworkDiagnosticTarget,
  clearNetworkDiagnosticTargets,
} =
  require(
    "../../services/networking/networkDiagnosticTargetRegistry"
  );


describe(
  "Phase 13.12 — Networking diagnostic handlers",
  () => {

    afterEach(
      () => {
        clearNetworkDiagnosticTargets();
      }
    );


    test(
      "implements exactly ten networking actions",
      () => {
        expect(
          Object.keys(
            networkingHandlers
          ).length
        ).toBe(
          10
        );

        expect(
          Object.keys(
            ACTION_METHODS
          ).length
        ).toBe(
          10
        );
      }
    );


    test(
      "networking handlers are read-only diagnostic capabilities",
      async () => {
        const target = {};

        for (
          const method
          of Object.values(
            ACTION_METHODS
          )
        ) {
          target[
            method
          ] =
            async () => ({
              healthy:
                true,
            });
        }

        registerNetworkDiagnosticTarget(
          "test-network",
          target
        );

        for (
          const action
          of Object.values(
            NETWORKING_ACTIONS
          )
        ) {
          const result =
            await executeNetworkingAction(
              action,
              {
                targetId:
                  "test-network",
              }
            );

          expect(
            result.readOnly
          ).toBe(
            true
          );
        }
      }
    );


    test(
      "targetId is mandatory",
      () => {
        expect(
          () =>
            validateNetworkingParams(
              {}
            )
        ).toThrow(
          /targetId/i
        );
      }
    );


    test(
      "raw credential material is rejected",
      () => {
        expect(
          () =>
            validateNetworkingParams({
              targetId:
                "network-a",

              password:
                "forbidden",
            })
        ).toThrow(
          /credential|forbidden/i
        );

        expect(
          () =>
            validateNetworkingParams({
              targetId:
                "network-a",

              token:
                "forbidden",
            })
        ).toThrow(
          /credential|forbidden/i
        );
      }
    );


    test(
      "delegates to registered diagnostic target",
      async () => {
        const checkConnectivity =
          jest.fn(
            async params => ({
              reachable:
                true,

              destination:
                params.host,
            })
          );

        registerNetworkDiagnosticTarget(
          "network-a",
          {
            checkConnectivity,
          }
        );

        const result =
          await executeNetworkingAction(
            "networking/check_connectivity",
            {
              targetId:
                "network-a",

              host:
                "example.internal",
            }
          );

        expect(
          checkConnectivity
        ).toHaveBeenCalledTimes(
          1
        );

        expect(
          result.result
            .reachable
        ).toBe(
          true
        );
      }
    );


    test(
      "unsupported target diagnostic method fails closed",
      async () => {
        registerNetworkDiagnosticTarget(
          "network-a",
          {}
        );

        await expect(
          executeNetworkingAction(
            "networking/check_dns",
            {
              targetId:
                "network-a",
            }
          )
        ).rejects.toThrow(
          /does not implement/i
        );
      }
    );


    test(
      "unknown networking action fails closed",
      async () => {
        registerNetworkDiagnosticTarget(
          "network-a",
          {}
        );

        await expect(
          executeNetworkingAction(
            "networking/delete_route",
            {
              targetId:
                "network-a",
            }
          )
        ).rejects.toThrow(
          /unsupported networking action/i
        );
      }
    );
    test(
  'authoritative registry exposes all networking handlers',
  () => {
    const {
      getActionHandlerRegistry,
      resetActionHandlerRegistry,
    } =
      require(
        '../../runbooks/actions/actionHandlerRegistry'
      );

    resetActionHandlerRegistry();

    const registry =
      getActionHandlerRegistry();

    const networkingKeys =
      registry
        .keys()
        .filter(
          key =>
            key.startsWith(
              'networking/'
            )
        )
        .sort();

    expect(
      networkingKeys
    ).toEqual([
      'networking/check_connectivity',
      'networking/check_dns',
      'networking/check_egress',
      'networking/check_latency',
      'networking/check_load_balancer',
      'networking/check_packet_loss',
      'networking/check_port',
      'networking/check_route',
      'networking/check_tls',
      'networking/check_upstream',
    ]);
  }
);
test(
  'live authoritative registry satisfies networking capability matrix',
  () => {
    const {
      getActionHandlerRegistry,
      resetActionHandlerRegistry,
    } =
      require(
        '../../runbooks/actions/actionHandlerRegistry'
      );

    const {
      buildNetworkingCapabilityMatrix,
    } =
      require(
        '../networkingCapabilityMatrix'
      );

    resetActionHandlerRegistry();

    const registry =
      getActionHandlerRegistry();

    const matrix =
      buildNetworkingCapabilityMatrix(
        registry.keys()
      );

    expect(
      matrix.stats.available
    ).toBe(
      10
    );

    expect(
      matrix.stats.requiredMissing
    ).toBe(
      0
    );

    expect(
      matrix.ready
    ).toBe(
      true
    );
  }
);
  }
);