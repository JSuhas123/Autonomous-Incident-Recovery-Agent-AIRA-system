"use strict";


const {
  CATALOGUE,
  INTEGRATION_CAPABILITIES,
  validateCatalogue,
} =
  require(
    "../../config/integrationCatalogue"
  );


const kubernetesAdapter =
  require(
    "../../services/integrations/adapters/kubernetesAdapter"
  );


describe(
  "Phase 20 Kubernetes catalogue execution parity",
  () => {
    function getKubernetesDefinition() {
      const definition =
        CATALOGUE.find(
          candidate =>
            candidate.provider ===
            "kubernetes"
        );


      expect(
        definition
      )
        .toBeDefined();


      return definition;
    }


    test(
      "canonical capability vocabulary contains execute_capability",
      () => {
        expect(
          INTEGRATION_CAPABILITIES
        )
          .toContain(
            "execute_capability"
          );
      }
    );


    test(
      "Kubernetes catalogue advertises execute_capability",
      () => {
        const definition =
          getKubernetesDefinition();


        expect(
          definition
            .capabilities
        )
          .toContain(
            "execute_capability"
          );
      }
    );


    test(
      "Kubernetes adapter implements executeCapability",
      () => {
        expect(
          typeof kubernetesAdapter
            .executeCapability
        )
          .toBe(
            "function"
          );
      }
    );


    test(
      "available Kubernetes catalogue capabilities exactly match adapter capabilities",
      () => {
        const definition =
          getKubernetesDefinition();


        const catalogueCapabilities =
          [
            ...definition
              .capabilities,
          ]
            .sort();


        const adapterCapabilities =
          [
            ...kubernetesAdapter
              .capabilities,
          ]
            .sort();


        expect(
          catalogueCapabilities
        )
          .toEqual(
            adapterCapabilities
          );
      }
    );


    test(
      "catalogue remains globally valid",
      () => {
        const result =
          validateCatalogue();


        expect(
          result.valid
        )
          .toBe(
            true
          );


        expect(
          result.errors
        )
          .toEqual(
            []
          );
      }
    );


    test(
      "technical execution capability does not grant execution authority",
      () => {
        expect(
          kubernetesAdapter
            .executionAuthorized
        )
          .not
          .toBe(
            true
          );
      }
    );


    test(
      "Kubernetes remains available rather than being promoted by test code",
      () => {
        const definition =
          getKubernetesDefinition();


        expect(
          definition
            .availabilityStatus
        )
          .toBe(
            "available"
          );
      }
    );
  }
);