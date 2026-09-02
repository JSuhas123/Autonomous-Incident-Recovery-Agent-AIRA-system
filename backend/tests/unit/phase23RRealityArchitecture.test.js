"use strict";

const {
  EVIDENCE_GRADE,
  REALITY_CASE_SOURCE_KIND,
  REALITY_ARTIFACT_KIND,
  REALITY_VISIBILITY,
  REALITY_ARCHITECTURE_INVARIANTS,
  REALITY_ARCHITECTURE_CONTRACT,
  REQUIRED_REALITY_CASE_SECTIONS,
  validateRealityArchitectureContract,
  assertRealityCaseContract,
  createRealityCaseDigest,
  hasValidRealityCaseDigest,
} =
  require(
    "../../contracts/reality"
  );

function buildRealityCase() {
  return {
    identity:
      {
        caseId:
          "reality_case_phase23r_0001",

        title:
          "Kubernetes dependency failure",
      },

    scope:
      {
        organizationId:
          "org_test",

        environmentId:
          "env_lab",
      },

    provenance:
      {
        sourceKind:
          REALITY_CASE_SOURCE_KIND.AIRA_LAB,

        sourceName:
          "AIRA Reliability Lab",

        sourceVersion:
          "phase21",

        license:
          "INTERNAL",

        modified:
          false,

        groundTruthMethod:
          "controlled fault injection",
      },

    evidenceGrade:
      EVIDENCE_GRADE.E2,

    workload:
      {
        platform:
          "kubernetes",

        service:
          "api",
      },

    timeline:
      [
        {
          eventId:
            "evt_signal",

          offsetMs:
            0,

          kind:
            "SIGNAL",
        },
        {
          eventId:
            "evt_logs",

          offsetMs:
            30000,

          kind:
            "LOG_BATCH",
        },
      ],

    visibleEvidence:
      {
        signals:
          [
            {
              alert:
                "DependencyUnavailable",
            },
          ],

        metrics:
          [],

        logs:
          [],

        traces:
          [],

        topology:
          [],

        resourceStates:
          [],
      },

    sealedEvaluation:
      {
        knownFault:
          "dependency unavailable",

        expectedDiagnosis:
          "upstream dependency outage",

        acceptableDiagnoses:
          [
            "dependency outage",
            "upstream dependency unavailable",
          ],

        expectedRecoveryFamily:
          "DEPENDENCY_RECOVERY",
      },

    safetyRestrictions:
      [
        "LAB_ONLY",
        "NO_AUTHORIZATION_GRANT",
      ],

    evaluationRubric:
      {
        safetyDominates:
          true,
      },

    replayConfiguration:
      {
        seed:
          23,

        speedMultiplier:
          1,

        deterministicTimestamps:
          true,
      },

    artifacts:
      [
        {
          artifactId:
            "artifact_logs_1",

          kind:
            REALITY_ARTIFACT_KIND.LOG,

          contentHash:
            "sha256:placeholder-until-23R.2-object-storage",
        },
      ],

    sealing:
      {
        evidenceVisibility:
          REALITY_VISIBILITY.EVIDENCE,

        evaluationVisibility:
          REALITY_VISIBILITY.SEALED_EVALUATION,

        groundTruthAgentVisible:
          false,
      },

    version:
      {
        revision:
          1,

        contentHash:
          null,
      },

    executionAuthorized:
      false,
  };
}

describe(
  "Phase 23R.0 reality architecture + evidence model",
  () => {
    test(
      "architecture contract is frozen and non-authorizing",
      () => {
        expect(
          validateRealityArchitectureContract()
        ).toEqual(
          expect.objectContaining({
            valid:
              true,

            executionAuthorized:
              false,

            productionProofGranted:
              false,
          })
        );

        expect(
          REALITY_ARCHITECTURE_CONTRACT.phase
        ).toBe(
          "23R.0"
        );
      }
    );

    test(
      "evidence grades are frozen from E0 through E6",
      () => {
        expect(
          Object.values(
            EVIDENCE_GRADE
          )
        ).toEqual(
          [
            "E0",
            "E1",
            "E2",
            "E3",
            "E4",
            "E5",
            "E6",
          ]
        );
      }
    );

    test(
      "critical Phase 23R invariants are fail-closed",
      () => {
        expect(
          REALITY_ARCHITECTURE_INVARIANTS
        ).toEqual(
          expect.objectContaining({
            RAW_DATASET_MUST_BE_NORMALIZED:
              true,

            GROUND_TRUTH_NEVER_ENTERS_AGENT_CONTEXT:
              true,

            EVIDENCE_AND_EVALUATION_CHANNELS_ARE_SEPARATE:
              true,

            BENCHMARK_SCORE_IS_NOT_PRODUCTION_PROOF:
              true,

            REPLAY_NEVER_GRANTS_EXECUTION_AUTHORIZATION:
              true,

            PHASE_23_HUMAN_CONTROL_SEMANTICS_ARE_FROZEN:
              true,

            POSTGRES_IS_CANONICAL_REALITY_METADATA_AUTHORITY:
              true,
          })
        );
      }
    );

    test(
      "RealityCase requires the complete normalized section model",
      () => {
        expect(
          REQUIRED_REALITY_CASE_SECTIONS
        ).toEqual(
          [
            "identity",
            "scope",
            "provenance",
            "evidenceGrade",
            "workload",
            "timeline",
            "visibleEvidence",
            "sealedEvaluation",
            "safetyRestrictions",
            "evaluationRubric",
            "replayConfiguration",
            "artifacts",
            "sealing",
            "version",
          ]
        );

        expect(
          assertRealityCaseContract(
            buildRealityCase()
          )
        ).toEqual(
          expect.objectContaining({
            valid:
              true,

            evidenceGrade:
              "E2",

            executionAuthorized:
              false,
          })
        );
      }
    );

    test(
      "tenant and environment scope are mandatory",
      () => {
        const realityCase =
          buildRealityCase();

        realityCase.scope.environmentId =
          "";

        expect(
          () =>
            assertRealityCaseContract(
              realityCase
            )
        ).toThrow(
          "scope.environmentId is required"
        );
      }
    );

    test(
      "ground truth cannot be exposed to AIRA",
      () => {
        const realityCase =
          buildRealityCase();

        realityCase.sealing.groundTruthAgentVisible =
          true;

        expect(
          () =>
            assertRealityCaseContract(
              realityCase
            )
        ).toThrow(
          "Ground truth must never enter AIRA agent context"
        );
      }
    );

    test(
      "evidence and evaluation channels cannot collapse",
      () => {
        const realityCase =
          buildRealityCase();

        realityCase.sealing.evaluationVisibility =
          REALITY_VISIBILITY.EVIDENCE;

        expect(
          () =>
            assertRealityCaseContract(
              realityCase
            )
        ).toThrow(
          "Ground truth must use the SEALED_EVALUATION channel"
        );
      }
    );

    test(
      "RealityCase cannot manufacture execution authorization",
      () => {
        const realityCase =
          buildRealityCase();

        realityCase.executionAuthorized =
          true;

        expect(
          () =>
            assertRealityCaseContract(
              realityCase
            )
        ).toThrow(
          "RealityCase metadata cannot grant execution authorization"
        );
      }
    );

    test(
      "timeline is deterministic-order ready",
      () => {
        const realityCase =
          buildRealityCase();

        realityCase.timeline =
          [
            {
              eventId:
                "later",

              offsetMs:
                100,

              kind:
                "LOG",
            },
            {
              eventId:
                "earlier",

              offsetMs:
                10,

              kind:
                "SIGNAL",
            },
          ];

        expect(
          () =>
            assertRealityCaseContract(
              realityCase
            )
        ).toThrow(
          "RealityCase timeline must be ordered by offsetMs"
        );
      }
    );

    test(
      "case digest is deterministic and ignores its own stored digest",
      () => {
        const first =
          buildRealityCase();

        const second =
          JSON.parse(
            JSON.stringify(
              first
            )
          );

        const digest =
          createRealityCaseDigest(
            first
          );

        expect(
          digest
        ).toMatch(
          /^[a-f0-9]{64}$/
        );

        expect(
          createRealityCaseDigest(
            second
          )
        ).toBe(
          digest
        );

        first.version.contentHash =
          digest;

        expect(
          hasValidRealityCaseDigest(
            first
          )
        ).toBe(
          true
        );
      }
    );

    test(
      "case digest detects case-version content drift",
      () => {
        const realityCase =
          buildRealityCase();

        realityCase.version.contentHash =
          createRealityCaseDigest(
            realityCase
          );

        realityCase.visibleEvidence.signals[0].alert =
          "ChangedAlert";

        expect(
          hasValidRealityCaseDigest(
            realityCase
          )
        ).toBe(
          false
        );
      }
    );

    test(
      "invalid evidence grade is rejected",
      () => {
        const realityCase =
          buildRealityCase();

        realityCase.evidenceGrade =
          "E7";

        expect(
          () =>
            assertRealityCaseContract(
              realityCase
            )
        ).toThrow(
          "RealityCase evidenceGrade is invalid"
        );
      }
    );
  }
);