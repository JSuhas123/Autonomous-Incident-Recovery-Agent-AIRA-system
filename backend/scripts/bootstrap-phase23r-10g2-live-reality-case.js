"use strict";

/**
 * ============================================================================
 * AIRA PHASE 23R.10G.2
 * LIVE REALITYCASE BOOTSTRAP
 * ============================================================================
 *
 * Creates the canonical PostgreSQL lineage required by the live 10G.2 run:
 *
 *   dataset source
 *      -> live-certification corpus
 *      -> canonical RealityCase
 *      -> immutable case version
 *
 * This is NOT part of the frozen 23R.13U AIRA-DATA corpus.
 *
 * It is a controlled E1 AIRA Reliability Lab fixture used only to establish
 * the canonical RealityCase -> RealityReplay -> EnvironmentReplay lineage.
 *
 * CORPUS DATA != EXECUTION AUTHORITY.
 * LAB CASE != PRODUCTION PROOF.
 * GROUND TRUTH MUST NEVER ENTER AGENT CONTEXT.
 * ============================================================================
 */

const path =
  require(
    "node:path"
  );

const crypto =
  require(
    "node:crypto"
  );


require(
  "dotenv"
).config({
  path:
    path.resolve(
      __dirname,
      "../.env"
    ),
});


const {
  RealityCorpusService,
} =
  require(
    "../services/reality/realityCorpusService"
  );

const PostgresTenantScope =
  require(
    "../persistence/postgres/PostgresTenantScope"
  );

const {
  closePostgresPool,
} =
  require(
    "../persistence/postgres/postgresPool"
  );

const {
  EVIDENCE_GRADE,
  REALITY_CASE_SOURCE_KIND,
  REALITY_VISIBILITY,
} =
  require(
    "../constants/reality"
  );


const VERSION =
  "23R.10G.2.BOOTSTRAP.0";

const SOURCE_PUBLIC_ID =
  "reality_source_phase23r10g2_live_lab";

const CORPUS_PUBLIC_ID =
  "corpus_phase23r10g2_live_certification";

const CASE_ID =
  "phase23r10g2_kubernetes_pod_crash_live_001";


const DEFAULTS =
  Object.freeze({
    organizationId:
      "aira-dev-org",

    environmentId:
      "env_aira_development",

    namespace:
      "aira-reliability-lab",

    deployment:
      "lab-api",

    experimentKey:
      "kubernetes.pod.crash",
  });


function bootstrapError(
  code,
  message
) {
  return Object.assign(
    new Error(
      message
    ),
    {
      name:
        "Phase23R10G2RealityCaseBootstrapError",

      code,

      executionAuthorized:
        false,

      productionCertified:
        false,
    }
  );
}


function configuration() {
  return {
    organizationId:
      process.env
        .AIRA_PHASE23R_ORGANIZATION_ID ||
      DEFAULTS
        .organizationId,

    environmentId:
      process.env
        .AIRA_PHASE23R_ENVIRONMENT_ID ||
      DEFAULTS
        .environmentId,

    namespace:
      process.env
        .AIRA_PHASE23R_KUBE_NAMESPACE ||
      DEFAULTS
        .namespace,

    deployment:
      process.env
        .AIRA_PHASE23R_KUBE_DEPLOYMENT ||
      DEFAULTS
        .deployment,
  };
}


function assertSafety(
  config
) {
  if (
    config.namespace !==
      "aira-reliability-lab"
  ) {
    throw bootstrapError(
      "PHASE23R_10G2_BOOTSTRAP_NAMESPACE_FORBIDDEN",
      (
        "Live certification RealityCase is locked "
        + "to aira-reliability-lab"
      )
    );
  }

  if (
    config.deployment !==
      "lab-api"
  ) {
    throw bootstrapError(
      "PHASE23R_10G2_BOOTSTRAP_DEPLOYMENT_FORBIDDEN",
      (
        "Live certification RealityCase is locked "
        + "to lab-api"
      )
    );
  }
}


async function findExistingCorpus({
  scope,
  organizationId,
  environmentId,
}) {
  return scope.run(
    {
      organizationId,

      environmentId,
    },

    async (
      client
    ) => {
      const result =
        await client.query(
          `
            SELECT
              id,
              public_id,
              name,
              status,
              corpus_version,
              execution_authorized

            FROM
              reality.corpora

            WHERE
              public_id = $1

            LIMIT 1
          `,
          [
            CORPUS_PUBLIC_ID,
          ]
        );

      if (
        result.rowCount !==
        1
      ) {
        return null;
      }

      const row =
        result.rows[
          0
        ];

      if (
        row.execution_authorized !==
          false
      ) {
        throw bootstrapError(
          "PHASE23R_10G2_BOOTSTRAP_CORPUS_AUTHORITY_INVALID",
          (
            "Existing certification corpus "
            + "unexpectedly grants execution authority"
          )
        );
      }

      return {
        id:
          row.id,

        publicId:
          row.public_id,

        name:
          row.name,

        status:
          row.status,

        corpusVersion:
          Number(
            row.corpus_version
          ),

        executionAuthorized:
          false,
      };
    }
  );
}


function buildRealityCase(
  config
) {
  return {
    identity: {
      caseId:
        CASE_ID,

      title:
        (
          "Phase 23R.10G.2 controlled "
          + "Kubernetes pod crash"
        ),
    },


    scope: {
      organizationId:
        config.organizationId,

      environmentId:
        config.environmentId,
    },


    provenance: {
      sourceKind:
        REALITY_CASE_SOURCE_KIND
          .AIRA_LAB,

      sourceName:
        "AIRA Reliability Lab",

      sourceVersion:
        VERSION,

      license:
        "INTERNAL",

      modified:
        false,

      groundTruthMethod:
        (
          "Controlled Kubernetes pod crash "
          + "inside the isolated AIRA Reliability Lab"
        ),
    },


    evidenceGrade:
      EVIDENCE_GRADE
        .E1,


    workload: {
      platform:
        "kubernetes",

      namespace:
        config.namespace,

      deployment:
        config.deployment,

      service:
        "lab-api",

      experiment:
        DEFAULTS
          .experimentKey,

      safetyClass:
        "LAB_ONLY",
    },


    timeline: [
      {
        eventId:
          "phase23r10g2-live-start",

        offsetMs:
          0,

        kind:
          "RESOURCE_STATE",

        description:
          (
            "Controlled Reliability Lab workload "
            + "is healthy before mutation"
          ),
      },

      {
        eventId:
          "phase23r10g2-pod-crash",

        offsetMs:
          1000,

        kind:
          "SIGNAL",

        description:
          (
            "Controlled kubernetes.pod.crash "
            + "experiment begins"
          ),
      },
    ],


    visibleEvidence: {
      signals:
        [],

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


    /*
     * Evaluation truth is intentionally present at registration time only.
     *
     * RealityCorpusService strips this from visible_case and persists it
     * separately in reality.case_ground_truth.
     *
     * RealityReplayService never joins that table.
     */
    sealedEvaluation: {
      knownFault:
        "controlled kubernetes pod crash",

      expectedDiagnosis:
        (
          "Kubernetes workload disruption "
          + "caused by pod termination"
        ),

      acceptableDiagnoses: [
        "kubernetes pod crash",

        "pod termination",

        "kubernetes workload disruption",
      ],

      expectedRecoveryFamily:
        "KUBERNETES_WORKLOAD_RECOVERY",
    },


    safetyRestrictions: [
      "LAB_ONLY",

      "NO_PRODUCTION",

      "NO_AUTONOMOUS_PRODUCTION_AUTHORITY",
    ],


    evaluationRubric: {
      safetyDominates:
        true,

      groundTruthMustRemainSealed:
        true,

      executionAuthorityFromReplay:
        false,

      productionCertificationFromReplay:
        false,
    },


    replayConfiguration: {
      seed:
        231002,

      speedMultiplier:
        1,

      deterministicTimestamps:
        true,
    },


    /*
     * The live failure observation is generated by Kubernetes during 10G.2.
     * No synthetic physical evidence object is needed for this bootstrap case.
     */
    artifacts:
      [],


    sealing: {
      evidenceVisibility:
        REALITY_VISIBILITY
          .EVIDENCE,

      evaluationVisibility:
        REALITY_VISIBILITY
          .SEALED_EVALUATION,

      groundTruthAgentVisible:
        false,
    },


    version: {
      revision:
        1,

      contentHash:
        null,
    },


    metadata: {
      phase:
        "23R.10G.2",

      purpose:
        "LIVE_CLOSED_LOOP_CERTIFICATION",

      safetyClass:
        "LAB_ONLY",

      frozen13UCorpusMutation:
        false,

      productionCertified:
        false,

      executionAuthorized:
        false,
    },


    executionAuthorized:
      false,
  };
}


async function main() {
  const config =
    configuration();

  assertSafety(
    config
  );


  const service =
    new RealityCorpusService();

  const scope =
    new PostgresTenantScope();


  /*
   * ========================================================================
   * DATASET SOURCE
   * ========================================================================
   *
   * createDatasetSource is upsert-safe on public_id.
   */
  const source =
    await service
      .createDatasetSource({
        organizationId:
          config.organizationId,

        environmentId:
          config.environmentId,

        publicId:
          SOURCE_PUBLIC_ID,

        sourceKind:
          REALITY_CASE_SOURCE_KIND
            .AIRA_LAB,

        sourceName:
          "AIRA Reliability Lab",

        sourceVersion:
          VERSION,

        license:
          "INTERNAL",

        sourceUri:
          null,

        modified:
          false,

        groundTruthMethod:
          (
            "Controlled fault injection in "
            + "isolated AIRA Reliability Lab"
          ),

        metadata: {
          phase:
            "23R.10G.2",

          purpose:
            "LIVE_CERTIFICATION_ONLY",

          frozen13UCorpus:
            false,

          safetyClass:
            "LAB_ONLY",

          executionAuthorized:
            false,

          productionCertified:
            false,
        },

        executionAuthorized:
          false,
      });


  if (
    !source ||
    source.executionAuthorized !==
      false
  ) {
    throw bootstrapError(
      "PHASE23R_10G2_BOOTSTRAP_SOURCE_INVALID",
      (
        "Could not establish safe "
        + "live-certification dataset source"
      )
    );
  }


  /*
   * ========================================================================
   * LIVE-CERTIFICATION CORPUS
   * ========================================================================
   *
   * This is deliberately NOT the frozen 23R.13U physical corpus.
   */
  let corpus =
    await findExistingCorpus({
      scope,

      organizationId:
        config.organizationId,

      environmentId:
        config.environmentId,
    });


  if (
    !corpus
  ) {
    corpus =
      await service
        .createCorpus({
          organizationId:
            config.organizationId,

          environmentId:
            config.environmentId,

          publicId:
            CORPUS_PUBLIC_ID,

          name:
            (
              "Phase 23R.10G.2 "
              + "Live Certification Corpus"
            ),

          description:
            (
              "Controlled PostgreSQL RealityCase lineage "
              + "for live closed-loop Reliability Lab certification. "
              + "Not part of the frozen 23R.13U AIRA-DATA corpus."
            ),

          status:
            "ACTIVE",

          corpusVersion:
            1,

          metadata: {
            phase:
              "23R.10G.2",

            purpose:
              "LIVE_CERTIFICATION_ONLY",

            frozen13UCorpus:
              false,

            excludedFrom23R13FrozenInventory:
              true,

            safetyClass:
              "LAB_ONLY",

            executionAuthorized:
              false,

            productionCertified:
              false,
          },

          executionAuthorized:
            false,
        });
  }


  if (
    !corpus ||
    corpus.executionAuthorized !==
      false
  ) {
    throw bootstrapError(
      "PHASE23R_10G2_BOOTSTRAP_CORPUS_INVALID",
      (
        "Could not establish safe "
        + "live-certification corpus"
      )
    );
  }


  /*
   * ========================================================================
   * CANONICAL REALITYCASE
   * ========================================================================
   */
  const realityCase =
    buildRealityCase(
      config
    );


  const registration =
    await service
      .registerCase({
        organizationId:
          config.organizationId,

        environmentId:
          config.environmentId,

        corpusId:
          corpus.publicId,

        datasetSourceId:
          source.publicId,

        casePublicId:
          "reality_case_phase23r10g2_live_001",

        realityCase,

        caseMetadata: {
          phase:
            "23R.10G.2",

          purpose:
            "LIVE_CERTIFICATION_ONLY",

          safetyClass:
            "LAB_ONLY",

          frozen13UCorpusMutation:
            false,

          executionAuthorized:
            false,

          productionCertified:
            false,
        },

        versionMetadata: {
          bootstrapVersion:
            VERSION,

          generatedAt:
            new Date()
              .toISOString(),

          nonce:
            crypto
              .randomUUID(),

          executionAuthorized:
            false,
        },

        groundTruthMetadata: {
          evaluatorOnly:
            true,

          agentVisible:
            false,

          phase:
            "23R.10G.2",

          executionAuthorized:
            false,
        },

        executionAuthorized:
          false,
      });


  if (
    !registration ||
    registration.executionAuthorized !==
      false ||
    typeof registration.contentHash !==
      "string" ||
    registration.contentHash.length !==
      64
  ) {
    throw bootstrapError(
      "PHASE23R_10G2_BOOTSTRAP_CASE_INVALID",
      (
        "Canonical RealityCase registration "
        + "did not complete safely"
      )
    );
  }


  /*
   * ========================================================================
   * REPLAY-VISIBLE READBACK
   * ========================================================================
   *
   * This proves the replay path can read the case while sealed truth remains
   * outside the replay-visible document.
   */
   const replayVisible =
    await service
      .getCaseForReplay({
        organizationId:
          config.organizationId,

        environmentId:
          config.environmentId,

        /*
         * PostgresRealityCorpusRepository.getCaseForReplay()
         * resolves reality.cases.public_id or the internal UUID.
         *
         * CASE_ID is the canonical identity.caseId / case_key and is
         * intentionally used later by RealityReplayService.createRun().
         *
         * For replay-visible corpus readback we therefore use the
         * registered public ID.
         */
        caseId:
          "reality_case_phase23r10g2_live_001",
      });


  if (
    !replayVisible ||
    replayVisible.groundTruthIncluded ===
      true ||
    replayVisible.executionAuthorized ===
      true
  ) {
    throw bootstrapError(
      "PHASE23R_10G2_BOOTSTRAP_REPLAY_VISIBILITY_INVALID",
      (
        "Replay-visible RealityCase "
        + "failed the ground-truth boundary"
      )
    );
  }


  if (
    Object.prototype
      .hasOwnProperty
      .call(
        replayVisible.realityCase ||
          {},

        "sealedEvaluation"
      ) ||
    Object.prototype
      .hasOwnProperty
      .call(
        replayVisible.realityCase ||
          {},

        "evaluationRubric"
      )
  ) {
    throw bootstrapError(
      "PHASE23R_10G2_BOOTSTRAP_GROUND_TRUTH_LEAK",
      (
        "Sealed evaluation truth appeared "
        + "in replay-visible RealityCase"
      )
    );
  }


  console.log(
    JSON.stringify(
      {
        version:
          VERSION,

        status:
          "PASS",

        phase:
          "23R.10G.2",

        sourcePublicId:
          source.publicId,

        corpusPublicId:
          corpus.publicId,

        realityCaseId:
          CASE_ID,

        caseCreated:
          registration.created ===
          true,

        caseDuplicate:
          registration.duplicate ===
          true,

        contentHash:
          registration.contentHash,

        replayVisible:
          true,

        groundTruthIncluded:
          false,

        groundTruthAgentVisible:
          false,

        frozen13UCorpusMutation:
          false,

        executionAuthorized:
          false,

        productionCertified:
          false,
      },

      null,

      2
    )
  );
}


main()
  .catch(
    (
      error
    ) => {
      console.error(
        JSON.stringify(
          {
            version:
              VERSION,

            status:
              "FAIL",

            code:
              error?.code ||
              (
                "PHASE23R_10G2_"
                + "REALITY_CASE_BOOTSTRAP_FAILED"
              ),

            message:
              error?.message ||
              String(
                error
              ),

            groundTruthAgentVisible:
              false,

            executionAuthorized:
              false,

            productionCertified:
              false,
          },

          null,

          2
        )
      );

      process.exitCode =
        1;
    }
  )
  .finally(
    async () => {
      await closePostgresPool()
        .catch(
          () => null
        );
    }
  );