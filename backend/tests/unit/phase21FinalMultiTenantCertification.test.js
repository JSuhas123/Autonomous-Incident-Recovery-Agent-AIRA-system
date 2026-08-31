"use strict";


const {
  CERTIFICATE_VERSION,

  REQUIRED_TENANT_SCALES,

  liveArtifactAppearsSuccessful,

  validateLiveEvidence,

  buildFinalCertificate,
} =
  require(
    "../../scripts/certify-phase21-10c-final"
  );


function createValidArtifact() {
  return {
    phase:
      "21.10C",

    status:
      "PASS",

    pass:
      true,

    safetyClass:
      "LAB_ONLY",

    productionCertified:
      false,

    executionAuthorized:
      false,

    postgresIsolation: {
      pass:
        true,

      protectedTable:
        "resources.resources",

      certificationRole:
        "aira_rls_certifier",

      sourceCanSeeTarget:
        false,

      targetCanSeeSelf:
        true,

      sourceSettingsCorrect:
        true,

      targetSettingsCorrect:
        true,

      sessionScopeCorrect:
        true,
    },

    redisIsolation: {
      pass:
        true,

      collisions:
        0,

      rightPreReadEmpty:
        true,

      leftReadOwner:
        "tenant-a",

      rightReadOwner:
        "tenant-b",
    },

    rabbitMqIsolation: {
      pass:
        true,

      envelopeLeaks:
        0,

      messagesReceived:
        2,

      tenantHeadersMatch:
        true,

      orgHeadersMatch:
        true,

      envHeadersMatch:
        true,
    },

    multiTenant: {
      scaleRuns: [
        {
          tenantCount:
            1,

          pass:
            true,

          boundaryViolations:
            0,

          starvedControls:
            0,

          maxInterference:
            1.956,

          recoveryPassed:
            true,
        },

        {
          tenantCount:
            10,

          pass:
            true,

          boundaryViolations:
            0,

          starvedControls:
            0,

          maxInterference:
            1.0,

          recoveryPassed:
            true,
        },

        {
          tenantCount:
            25,

          pass:
            true,

          boundaryViolations:
            0,

          starvedControls:
            0,

          maxInterference:
            1.5898,

          recoveryPassed:
            true,
        },

        {
          tenantCount:
            50,

          pass:
            true,

          boundaryViolations:
            0,

          starvedControls:
            0,

          maxInterference:
            1.0,

          recoveryPassed:
            true,
        },

        {
          tenantCount:
            100,

          pass:
            true,

          boundaryViolations:
            0,

          starvedControls:
            0,

          maxInterference:
            1.3536,

          recoveryPassed:
            true,
        },
      ],

      boundaryViolations:
        0,

      starvedControls:
        0,

      recoveryPassed:
        true,
    },
  };
}


describe(
  "Phase 21.10C final multi-tenant certification",

  () => {
    test(
      "certificate version and tenant scale contract are frozen",

      () => {
        expect(
          CERTIFICATE_VERSION
        )
          .toBe(
            "21.10C-final-v1"
          );


        expect(
          REQUIRED_TENANT_SCALES
        )
          .toEqual(
            [
              1,
              10,
              25,
              50,
              100,
            ]
          );
      }
    );


    test(
      "successful live artifact is recognized",

      () => {
        expect(
          liveArtifactAppearsSuccessful(
            createValidArtifact()
          )
        )
          .toBe(
            true
          );
      }
    );


    test(
      "valid live evidence passes final validation",

      () => {
        const validation =
          validateLiveEvidence(
            createValidArtifact()
          );


        expect(
          validation.pass
        )
          .toBe(
            true
          );


        expect(
          validation
            .postgres
            .sourceCanSeeTarget
        )
          .toBe(
            false
          );


        expect(
          validation
            .postgres
            .targetCanSeeSelf
        )
          .toBe(
            true
          );


        expect(
          validation
            .redis
            .collisions
        )
          .toBe(
            0
          );


        expect(
          validation
            .rabbitMq
            .envelopeLeaks
        )
          .toBe(
            0
          );


        expect(
          validation
            .multiTenant
            .tenantScales
        )
          .toEqual(
            [
              1,
              10,
              25,
              50,
              100,
            ]
          );


        expect(
          validation
            .multiTenant
            .boundaryViolations
        )
          .toBe(
            0
          );


        expect(
          validation
            .multiTenant
            .starvedControls
        )
          .toBe(
            0
          );


        expect(
          validation
            .multiTenant
            .recoveryPassed
        )
          .toBe(
            true
          );
      }
    );


    test(
      "cross-tenant PostgreSQL visibility fails certification",

      () => {
        const artifact =
          createValidArtifact();


        artifact
          .postgresIsolation
          .sourceCanSeeTarget =
          true;


        const validation =
          validateLiveEvidence(
            artifact
          );


        expect(
          validation.pass
        )
          .toBe(
            false
          );
      }
    );


    test(
      "missing tenant scale fails certification",

      () => {
        const artifact =
          createValidArtifact();


        artifact
          .multiTenant
          .scaleRuns =
          artifact
            .multiTenant
            .scaleRuns
            .filter(
              (
                run
              ) =>
                run.tenantCount !==
                100
            );


        const validation =
          validateLiveEvidence(
            artifact
          );


        expect(
          validation.pass
        )
          .toBe(
            false
          );
      }
    );


    test(
      "any boundary violation fails certification",

      () => {
        const artifact =
          createValidArtifact();


        artifact
          .multiTenant
          .boundaryViolations =
          1;


        const validation =
          validateLiveEvidence(
            artifact
          );


        expect(
          validation.pass
        )
          .toBe(
            false
          );
      }
    );


    test(
      "noisy-neighbor starvation fails certification",

      () => {
        const artifact =
          createValidArtifact();


        artifact
          .multiTenant
          .starvedControls =
          1;


        const validation =
          validateLiveEvidence(
            artifact
          );


        expect(
          validation.pass
        )
          .toBe(
            false
          );
      }
    );


    test(
      "failed recovery fails certification",

      () => {
        const artifact =
          createValidArtifact();


        artifact
          .multiTenant
          .recoveryPassed =
          false;


        const validation =
          validateLiveEvidence(
            artifact
          );


        expect(
          validation.pass
        )
          .toBe(
            false
          );
      }
    );


    test(
      "execution authorization can never be true",

      () => {
        const artifact =
          createValidArtifact();


        artifact.executionAuthorized =
          true;


        const validation =
          validateLiveEvidence(
            artifact
          );


        expect(
          validation.pass
        )
          .toBe(
            false
          );
      }
    );


    test(
      "production certification can never be true",

      () => {
        const artifact =
          createValidArtifact();


        artifact.productionCertified =
          true;


        const validation =
          validateLiveEvidence(
            artifact
          );


        expect(
          validation.pass
        )
          .toBe(
            false
          );
      }
    );


    test(
      "final certificate remains evidence-only and non-authorizing",

      () => {
        const artifact =
          createValidArtifact();


        const validation =
          validateLiveEvidence(
            artifact
          );


        expect(
          validation.pass
        )
          .toBe(
            true
          );


        const certificate =
          buildFinalCertificate({
            sourceArtifact:
              artifact,

            sourceArtifactPath:
              "C:\\temp\\phase21-10c-live-certification-test.json",

            validation,
          });


        expect(
          certificate.status
        )
          .toBe(
            "PASS"
          );


        expect(
          certificate.liveCertified
        )
          .toBe(
            true
          );


        expect(
          certificate.frozen
        )
          .toBe(
            true
          );


        expect(
          certificate
            .authority
            .productionCertified
        )
          .toBe(
            false
          );


        expect(
          certificate
            .authority
            .executionAuthorized
        )
          .toBe(
            false
          );


        expect(
          certificate
            .authority
            .canGrantExecutionAuthorization
        )
          .toBe(
            false
          );


        expect(
          certificate
            .authority
            .canGrantAutonomy
        )
          .toBe(
            false
          );


        expect(
          certificate
            .authority
            .canModifyProductionAuthority
        )
          .toBe(
            false
          );


        expect(
          certificate
            .authority
            .phase22ConsumesEvidence
        )
          .toBe(
            true
          );


        expect(
          certificate
            .measuredClaims
            .universalCapacityClaimed
        )
          .toBe(
            false
          );


        expect(
          certificate
            .measuredClaims
            .productionSloClaimed
        )
          .toBe(
            false
          );
      }
    );
  }
);