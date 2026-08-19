'use strict';

const {
  NETWORKING_CAPABILITIES,
  buildNetworkingCapabilityMatrix,
} =
  require(
    '../networkingCapabilityMatrix'
  );


describe(
  'Phase 13.12 — Networking capability matrix',
  () => {

    test(
      'defines the expected networking capability surface',
      () => {
        expect(
          NETWORKING_CAPABILITIES.length
        ).toBe(
          10
        );
      }
    );


    test(
      'networking handler keys are unique',
      () => {
        const keys =
          NETWORKING_CAPABILITIES.map(
            capability =>
              capability.handlerKey
          );

        expect(
          new Set(
            keys
          ).size
        ).toBe(
          keys.length
        );
      }
    );


    test(
      'all networking capabilities are required',
      () => {
        expect(
          NETWORKING_CAPABILITIES.every(
            capability =>
              capability.required ===
              true
          )
        ).toBe(
          true
        );
      }
    );


    test(
      'networking Phase-13 surface is read-only',
      () => {
        expect(
          NETWORKING_CAPABILITIES.every(
            capability =>
              capability.mode ===
              'OBSERVE'
          )
        ).toBe(
          true
        );
      }
    );


    test(
      'every capability identifies affected playbooks',
      () => {
        for (
          const capability
          of NETWORKING_CAPABILITIES
        ) {
          expect(
            capability
              .affectedPlaybooks
              .length
          ).toBeGreaterThan(
            0
          );
        }
      }
    );


    test(
      'reports all capabilities missing against empty registry',
      () => {
        const matrix =
          buildNetworkingCapabilityMatrix(
            []
          );

        expect(
          matrix.stats.total
        ).toBe(
          10
        );

        expect(
          matrix.stats.available
        ).toBe(
          0
        );

        expect(
          matrix.stats.missing
        ).toBe(
          10
        );

        expect(
          matrix.ready
        ).toBe(
          false
        );
      }
    );


    test(
      'becomes ready when all required handlers exist',
      () => {
        const registry =
          NETWORKING_CAPABILITIES.map(
            capability =>
              capability.handlerKey
          );

        const matrix =
          buildNetworkingCapabilityMatrix(
            registry
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