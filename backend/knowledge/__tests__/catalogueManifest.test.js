"use strict";

/**
 * Phase 13.1 + 13.2
 *
 * Knowledge Catalogue inventory and naming tests.
 */

const {
  validatePlaybookId,
  validateRunbookId,
} =
  require(
    "../../knowledge/catalogueNaming"
  );

const {
  buildCatalogueManifest,
} =
  require(
    "../../knowledge/catalogueManifestService"
  );

const {
  scanCatalogue,
} =
  require(
    "../catalogueScanner"
  );

describe(
  "Phase 13.1 — catalogue naming",
  () => {
    test(
      "accepts canonical playbook IDs",
      () => {
        const result =
          validatePlaybookId(
            "PB-K8S-CRASHLOOP-001"
          );

        expect(
          result.valid
        ).toBe(
          true
        );

        expect(
          result.classification
        ).toBe(
          "CANONICAL"
        );
      }
    );


    test(
      "recognizes legacy-valid playbook IDs without breaking them",
      () => {
        const result =
          validatePlaybookId(
            "PB-K8S-OOM-001"
          );

        expect(
          result.valid
        ).toBe(
          true
        );

        expect(
          result.classification
        ).toBe(
          "LEGACY_VALID"
        );

        expect(
          result.canonicalId
        ).toBe(
          "PB-K8S-OOMKILLED-001"
        );
      }
    );


    test(
      "accepts canonical runbook IDs",
      () => {
        const result =
          validateRunbookId(
            "RB-K8S-RESTART-POD"
          );

        expect(
          result.valid
        ).toBe(
          true
        );

        expect(
          result.classification
        ).toBe(
          "CANONICAL"
        );
      }
    );


    test(
      "recognizes legacy Kubernetes restart runbook",
      () => {
        const result =
          validateRunbookId(
            "RB-K8S-POD-RESTART"
          );

        expect(
          result.valid
        ).toBe(
          true
        );

        expect(
          result.classification
        ).toBe(
          "LEGACY_VALID"
        );

        expect(
          result.canonicalId
        ).toBe(
          "RB-K8S-RESTART-POD"
        );
      }
    );
  }
);


describe(
  "Phase 13.2 — physical catalogue manifest",
  () => {
    let manifest;


    beforeAll(
      () => {
        manifest =
          buildCatalogueManifest();
      }
    );


 test(
  "discovers current physical catalogue",
  () => {
    const manifest =
      buildCatalogueManifest();

    const scan =
      scanCatalogue();

    expect(
      manifest
        .catalogue
        .playbooks
        .total
    ).toBe(
      scan.playbooks.length
    );

    expect(
      manifest
        .catalogue
        .runbooks
        .total
    ).toBe(
      scan.runbooks.length
    );

    expect(
      manifest
        .catalogue
        .playbooks
        .uniqueIds
    ).toBe(
      scan.playbooks.length
    );

    expect(
      manifest
        .catalogue
        .runbooks
        .uniqueIds
    ).toBe(
      scan.runbooks.length
    );

    expect(
      manifest
        .catalogue
        .playbooks
        .total
    ).toBeGreaterThan(
      0
    );

    expect(
      manifest
        .catalogue
        .runbooks
        .total
    ).toBeGreaterThan(
      0
    );
  }
);


  test(
  "tracks Phase 13 expansion progress",
  () => {
    const manifest =
      buildCatalogueManifest();

    const scan =
      scanCatalogue();

    const playbookTotal =
      scan.playbooks.length;

    const runbookTotal =
      scan.runbooks.length;

    expect(
      manifest
        .catalogue
        .playbooks
        .total
    ).toBe(
      playbookTotal
    );

    expect(
      manifest
        .catalogue
        .runbooks
        .total
    ).toBe(
      runbookTotal
    );

    // Phase 13 production catalogue targets.
    expect(
      playbookTotal
    ).toBeLessThanOrEqual(
      100
    );

    expect(
      runbookTotal
    ).toBeLessThanOrEqual(
      150
    );

    const remainingPlaybooks =
      Math.max(
        0,
        100 - playbookTotal
      );

    const remainingRunbooks =
      Math.max(
        0,
        150 - runbookTotal
      );

    expect(
      remainingPlaybooks
    ).toBeGreaterThanOrEqual(
      0
    );

    expect(
      remainingRunbooks
    ).toBeGreaterThanOrEqual(
      0
    );
  }
);


   test(
  "has no missing physical runbook references",
  () => {
    const missing =
      manifest
        .integrity
        .missingRunbookReferences;

    expect(
      missing
    ).toEqual(
      []
    );
  }
);


    test(
      "detects currently unused scale runbook",
      () => {
        const orphanIds =
          manifest
            .integrity
            .orphanRunbooks
            .map(
              (
                item
              ) =>
                item
                  .runbookId
            );

        expect(
          orphanIds
        ).toContain(
          "RB-K8S-SCALE-DEPLOYMENT"
        );
      }
    );


    test(
  "physical catalogue has no broken required references",
  () => {
    expect(
      manifest
        .integrity
        .missingRunbookReferences
        .length
    ).toBe(
      0
    );
  }
);
  }
);