"use strict";


const REALITY_CONTRACT_VERSION =
  "23R.4A.0";


/*
 * PHASE 23R CANONICAL EVIDENCE LADDER
 *
 * Evidence grade measures the credibility / independence
 * of the evidence supporting a RealityCase.
 *
 * It does NOT measure:
 *
 * - how difficult the incident is,
 * - how realistic the generated scenario appears,
 * - how sophisticated the workload is,
 * - whether AIRA passed the case,
 * - whether AIRA has production authority.
 *
 * The ladder is intentionally monotonic in real-world
 * evidentiary strength:
 *
 * E0  Synthetic
 * E1  Controlled AIRA Lab
 * E2  Independent External Benchmark
 * E3  Reconstructed Production Incident
 * E4  Customer Shadow Incident
 * E5  Human-approved Production Recovery
 * E6  Verified Autonomous Production Recovery
 */


const EVIDENCE_GRADE =
  Object.freeze({
    E0:
      "E0",

    E1:
      "E1",

    E2:
      "E2",

    E3:
      "E3",

    E4:
      "E4",

    E5:
      "E5",

    E6:
      "E6",
  });


const EVIDENCE_GRADE_DEFINITION =
  Object.freeze({
    E0:
      Object.freeze({
        grade:
          EVIDENCE_GRADE.E0,

        key:
          "SYNTHETIC",

        label:
          "Synthetic",

        description:
          (
            "Invented, generated, unit-level, or otherwise " +
            "synthetic evidence that does not originate from " +
            "an independently observed operational incident."
          ),

        external:
          false,

        productionOrigin:
          false,

        customerOrigin:
          false,

        productionExecution:
          false,

        autonomousProductionRecovery:
          false,
      }),


    E1:
      Object.freeze({
        grade:
          EVIDENCE_GRADE.E1,

        key:
          "CONTROLLED_AIRA_LAB",

        label:
          "Controlled AIRA Lab",

        description:
          (
            "Evidence produced by a controlled AIRA lab, " +
            "Reliability Lab, executable test workload, or " +
            "other AIRA-controlled infrastructure experiment."
          ),

        external:
          false,

        productionOrigin:
          false,

        customerOrigin:
          false,

        productionExecution:
          false,

        autonomousProductionRecovery:
          false,
      }),


    E2:
      Object.freeze({
        grade:
          EVIDENCE_GRADE.E2,

        key:
          "INDEPENDENT_EXTERNAL_BENCHMARK",

        label:
          "Independent External Benchmark",

        description:
          (
            "Evidence originating from an external benchmark, " +
            "research dataset, public fault dataset, or other " +
            "independent evaluation source not invented " +
            "specifically for AIRA."
          ),

        external:
          true,

        productionOrigin:
          false,

        customerOrigin:
          false,

        productionExecution:
          false,

        autonomousProductionRecovery:
          false,
      }),


    E3:
      Object.freeze({
        grade:
          EVIDENCE_GRADE.E3,

        key:
          "RECONSTRUCTED_PRODUCTION_INCIDENT",

        label:
          "Reconstructed Production Incident",

        description:
          (
            "Evidence reconstructed from a documented real-world " +
            "production incident or postmortem while preserving " +
            "the evidence that would have been available during " +
            "the incident timeline."
          ),

        external:
          true,

        productionOrigin:
          true,

        customerOrigin:
          false,

        productionExecution:
          false,

        autonomousProductionRecovery:
          false,
      }),


    E4:
      Object.freeze({
        grade:
          EVIDENCE_GRADE.E4,

        key:
          "CUSTOMER_SHADOW_INCIDENT",

        label:
          "Customer Shadow Incident",

        description:
          (
            "Evidence from a real customer operational incident " +
            "observed or evaluated by AIRA in shadow mode without " +
            "autonomous production recovery authority."
          ),

        external:
          true,

        productionOrigin:
          true,

        customerOrigin:
          true,

        productionExecution:
          false,

        autonomousProductionRecovery:
          false,
      }),


    E5:
      Object.freeze({
        grade:
          EVIDENCE_GRADE.E5,

        key:
          "HUMAN_APPROVED_PRODUCTION_RECOVERY",

        label:
          "Human-approved Production Recovery",

        description:
          (
            "Evidence from a real production recovery where the " +
            "recovery action was explicitly authorized by an " +
            "appropriate human authority and independently " +
            "verified after execution."
          ),

        external:
          true,

        productionOrigin:
          true,

        customerOrigin:
          true,

        productionExecution:
          true,

        autonomousProductionRecovery:
          false,
      }),


    E6:
      Object.freeze({
        grade:
          EVIDENCE_GRADE.E6,

        key:
          "VERIFIED_AUTONOMOUS_PRODUCTION_RECOVERY",

        label:
          "Verified Autonomous Production Recovery",

        description:
          (
            "Evidence from an actual autonomous production " +
            "recovery performed under valid production authority " +
            "and independently verified as successful."
          ),

        external:
          true,

        productionOrigin:
          true,

        customerOrigin:
          true,

        productionExecution:
          true,

        autonomousProductionRecovery:
          true,
      }),
  });


const REALITY_CASE_SOURCE_KIND =
  Object.freeze({
    SYNTHETIC:
      "SYNTHETIC",

    GENERATED_SIMULATION:
      "GENERATED_SIMULATION",

    AIRA_LAB:
      "AIRA_LAB",

    EXTERNAL_BENCHMARK:
      "EXTERNAL_BENCHMARK",

    PUBLIC_INCIDENT_RECONSTRUCTION:
      "PUBLIC_INCIDENT_RECONSTRUCTION",

    CUSTOMER_SHADOW:
      "CUSTOMER_SHADOW",

    HUMAN_APPROVED_PRODUCTION:
      "HUMAN_APPROVED_PRODUCTION",

    VERIFIED_PRODUCTION:
      "VERIFIED_PRODUCTION",
  });


const REALITY_ARTIFACT_KIND =
  Object.freeze({
    SIGNAL:
      "SIGNAL",

    METRIC:
      "METRIC",

    LOG:
      "LOG",

    TRACE:
      "TRACE",

    TOPOLOGY:
      "TOPOLOGY",

    RESOURCE_STATE:
      "RESOURCE_STATE",

    MANIFEST:
      "MANIFEST",

    DATASET_BUNDLE:
      "DATASET_BUNDLE",

    POSTMORTEM:
      "POSTMORTEM",

    REPLAY_OUTPUT:
      "REPLAY_OUTPUT",

    CERTIFICATION_EVIDENCE:
      "CERTIFICATION_EVIDENCE",
  });


const REALITY_VISIBILITY =
  Object.freeze({
    EVIDENCE:
      "EVIDENCE",

    SEALED_EVALUATION:
      "SEALED_EVALUATION",
  });


/*
 * Frozen Phase 23R architecture invariants.
 *
 * These are deliberately boolean assertions rather than
 * descriptive strings because the architecture contract
 * validates every invariant fail-closed.
 */


const REALITY_ARCHITECTURE_INVARIANTS =
  Object.freeze({
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

    OBJECT_STORAGE_IS_NOT_TRANSACTIONAL_AUTHORITY:
      true,

    QDRANT_IS_NOT_SOURCE_OF_TRUTH:
      true,

    REDIS_IS_NOT_REPLAY_HISTORY_AUTHORITY:
      true,

    BENCHMARK_PASS_IS_NOT_PRODUCTION_AUTHORIZATION:
      true,
  });


const EVIDENCE_GRADE_ORDER =
  Object.freeze([
    EVIDENCE_GRADE.E0,

    EVIDENCE_GRADE.E1,

    EVIDENCE_GRADE.E2,

    EVIDENCE_GRADE.E3,

    EVIDENCE_GRADE.E4,

    EVIDENCE_GRADE.E5,

    EVIDENCE_GRADE.E6,
  ]);


function isKnownEvidenceGrade(
  value
) {
  return EVIDENCE_GRADE_ORDER
    .includes(
      value
    );
}


function getEvidenceGradeDefinition(
  value
) {
  if (
    !isKnownEvidenceGrade(
      value
    )
  ) {
    return null;
  }


  return EVIDENCE_GRADE_DEFINITION[
    value
  ];
}


function compareEvidenceGrades(
  left,
  right
) {
  if (
    !isKnownEvidenceGrade(
      left
    )
  ) {
    throw Object.assign(
      new Error(
        `Unknown evidence grade: ${left}`
      ),
      {
        code:
          "REALITY_EVIDENCE_GRADE_UNKNOWN",

        executionAuthorized:
          false,
      }
    );
  }


  if (
    !isKnownEvidenceGrade(
      right
    )
  ) {
    throw Object.assign(
      new Error(
        `Unknown evidence grade: ${right}`
      ),
      {
        code:
          "REALITY_EVIDENCE_GRADE_UNKNOWN",

        executionAuthorized:
          false,
      }
    );
  }


  return (
    EVIDENCE_GRADE_ORDER
      .indexOf(
        left
      ) -

    EVIDENCE_GRADE_ORDER
      .indexOf(
        right
      )
  );
}


function evidenceGradeAtLeast(
  actual,
  minimum
) {
  return (
    compareEvidenceGrades(
      actual,
      minimum
    ) >=
    0
  );
}


function isKnownRealityArtifactKind(
  value
) {
  return Object.values(
    REALITY_ARTIFACT_KIND
  ).includes(
    value
  );
}


function isKnownRealitySourceKind(
  value
) {
  return Object.values(
    REALITY_CASE_SOURCE_KIND
  ).includes(
    value
  );
}


/*
 * Source-kind / evidence-grade compatibility.
 *
 * This intentionally validates the provenance class rather
 * than claiming that the grade itself grants authority.
 *
 * GENERATED_SIMULATION remains E0.
 * AIRA_LAB is E1.
 * External benchmark is E2.
 * Public production reconstruction is E3.
 * Customer shadow is E4.
 * Human-approved production recovery is E5.
 * Verified autonomous production recovery is E6.
 */


const SOURCE_KIND_ALLOWED_EVIDENCE_GRADES =
  Object.freeze({
    SYNTHETIC:
      Object.freeze([
        EVIDENCE_GRADE.E0,
      ]),

    GENERATED_SIMULATION:
      Object.freeze([
        EVIDENCE_GRADE.E0,
      ]),

    AIRA_LAB:
      Object.freeze([
        EVIDENCE_GRADE.E1,
      ]),

    EXTERNAL_BENCHMARK:
      Object.freeze([
        EVIDENCE_GRADE.E2,
      ]),

    PUBLIC_INCIDENT_RECONSTRUCTION:
      Object.freeze([
        EVIDENCE_GRADE.E3,
      ]),

    CUSTOMER_SHADOW:
      Object.freeze([
        EVIDENCE_GRADE.E4,
      ]),

    HUMAN_APPROVED_PRODUCTION:
      Object.freeze([
        EVIDENCE_GRADE.E5,
      ]),

    VERIFIED_PRODUCTION:
      Object.freeze([
        EVIDENCE_GRADE.E6,
      ]),
  });


function isEvidenceGradeCompatibleWithSourceKind(
  sourceKind,
  evidenceGrade
) {
  if (
    !isKnownRealitySourceKind(
      sourceKind
    ) ||

    !isKnownEvidenceGrade(
      evidenceGrade
    )
  ) {
    return false;
  }


  const allowed =
    SOURCE_KIND_ALLOWED_EVIDENCE_GRADES[
      sourceKind
    ] ||
    [];


  return allowed.includes(
    evidenceGrade
  );
}


module.exports = {
  REALITY_CONTRACT_VERSION,

  EVIDENCE_GRADE,

  EVIDENCE_GRADE_DEFINITION,

  EVIDENCE_GRADE_ORDER,

  REALITY_CASE_SOURCE_KIND,

  REALITY_ARTIFACT_KIND,

  REALITY_VISIBILITY,

  REALITY_ARCHITECTURE_INVARIANTS,

  SOURCE_KIND_ALLOWED_EVIDENCE_GRADES,

  isKnownEvidenceGrade,

  getEvidenceGradeDefinition,

  compareEvidenceGrades,

  evidenceGradeAtLeast,

  isKnownRealityArtifactKind,

  isKnownRealitySourceKind,

  isEvidenceGradeCompatibleWithSourceKind,
};