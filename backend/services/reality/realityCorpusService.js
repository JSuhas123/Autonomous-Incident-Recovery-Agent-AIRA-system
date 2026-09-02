"use strict";


const PostgresRealityCorpusRepository =
  require(
    "../../persistence/postgres/PostgresRealityCorpusRepository"
  );


const {
  REALITY_CONTRACT_VERSION,
} =
  require(
    "../../constants/reality"
  );


const {
  assertRealityCaseContract,
  createRealityCaseDigest,
  hasValidRealityCaseDigest,
} =
  require(
    "../../contracts/reality"
  );


function createError(
  message,
  code,
  status =
    422
) {
  return Object.assign(
    new Error(
      message
    ),
    {
      code,

      status,

      executionAuthorized:
        false,
    }
  );
}


function requireValue(
  value,
  field,
  code
) {
  if (
    value ===
      undefined ||
    value ===
      null ||
    String(
      value
    ).trim() ===
      ""
  ) {
    throw createError(
      `${field} is required`,
      code
    );
  }

  return value;
}


class RealityCorpusService {
  constructor(
    options =
      {}
  ) {
    this.repository =
      options.repository ||

      new PostgresRealityCorpusRepository(
        options.postgres ||
        {}
      );
  }


  async createDatasetSource(
    input =
      {}
  ) {
    return this.repository
      .createDatasetSource({
        ...input,

        executionAuthorized:
          false,
      });
  }


  async createCorpus(
    input =
      {}
  ) {
    return this.repository
      .createCorpus({
        ...input,

        executionAuthorized:
          false,
      });
  }


  async registerCase(
    input =
      {}
  ) {
    const organizationId =
      requireValue(
        input.organizationId,
        "organizationId",
        "REALITY_ORGANIZATION_REQUIRED"
      );

    const environmentId =
      requireValue(
        input.environmentId,
        "environmentId",
        "REALITY_ENVIRONMENT_REQUIRED"
      );

    const corpusId =
      requireValue(
        input.corpusId,
        "corpusId",
        "REALITY_CORPUS_REQUIRED"
      );

    const realityCase =
      input.realityCase;

    /*
     * Reuse the frozen Phase 23R.0 contract.
     */
    assertRealityCaseContract(
      realityCase
    );

    /*
     * Registration scope must exactly match the case itself.
     *
     * The repository also receives RLS scope, so this gives us both
     * application-level and PostgreSQL-level tenant fencing.
     */
    if (
      realityCase
        .scope
        .organizationId !==
        organizationId ||

      realityCase
        .scope
        .environmentId !==
        environmentId
    ) {
      throw createError(
        "RealityCase scope does not match registration scope",
        "REALITY_SCOPE_MISMATCH",
        403
      );
    }

    /*
     * The digest represents the complete normalized RealityCase,
     * including sealed truth.
     *
     * The digest therefore binds visible evidence and hidden evaluation
     * truth to one immutable version without exposing the truth to replay.
     */
    const digest =
      createRealityCaseDigest(
        realityCase
      );

    const suppliedHash =
      realityCase
        .version
        .contentHash;

    if (
      suppliedHash &&
      !hasValidRealityCaseDigest(
        realityCase
      )
    ) {
      throw createError(
        "RealityCase content hash does not match case contents",
        "REALITY_CASE_HASH_MISMATCH",
        409
      );
    }

    const canonicalCase = {
      ...realityCase,

      version: {
        ...realityCase.version,

        contentHash:
          digest,
      },

      executionAuthorized:
        false,
    };

    /*
     * ================================================================
     * ANSWER SEALING
     * ================================================================
     *
     * Never give these fields to the replay-visible persistence channel.
     */
    const {
      sealedEvaluation,
      evaluationRubric,
      ...visibleCase
    } =
      canonicalCase;

    const result =
      await this.repository
        .registerCaseVersion({
          organizationId,

          environmentId,

          corpusId,

          datasetSourceId:
            input.datasetSourceId ||
            null,

          caseKey:
            canonicalCase
              .identity
              .caseId,

          casePublicId:
            input.casePublicId,

          title:
            canonicalCase
              .identity
              .title,

          evidenceGrade:
            canonicalCase
              .evidenceGrade,

          contractVersion:
            REALITY_CONTRACT_VERSION,

          contentHash:
            digest,

          visibleCase,

          sealedEvaluation,

          evaluationRubric,

          caseMetadata:
            input.caseMetadata ||
            {},

          versionMetadata:
            input.versionMetadata ||
            {},

          groundTruthMetadata:
            input.groundTruthMetadata ||
            {},

          executionAuthorized:
            false,
        });

    return {
      ...result,

      contentHash:
        digest,

      executionAuthorized:
        false,
    };
  }


  async getCaseForReplay(
    input =
      {}
  ) {
    const result =
      await this.repository
        .getCaseForReplay(
          input
        );

    if (
      !result
    ) {
      return null;
    }

    /*
     * Fail closed even if a future repository regression accidentally
     * introduces ground truth into the replay response.
     */
    if (
      result.groundTruthIncluded ===
        true ||

      Object.prototype
        .hasOwnProperty
        .call(
          result.realityCase ||
          {},
          "sealedEvaluation"
        ) ||

      Object.prototype
        .hasOwnProperty
        .call(
          result.realityCase ||
          {},
          "evaluationRubric"
        )
    ) {
      throw createError(
        "Ground truth leakage detected in replay channel",
        "REALITY_GROUND_TRUTH_LEAKAGE",
        500
      );
    }

    return {
      ...result,

      executionAuthorized:
        false,
    };
  }


  async getCaseForEvaluation(
    input =
      {}
  ) {
    const result =
      await this.repository
        .getCaseForEvaluation(
          input
        );

    if (
      !result
    ) {
      return null;
    }

    /*
     * Evaluation visibility is informational only.
     *
     * Ground truth can score AIRA.
     * It cannot authorize AIRA.
     */
    return {
      ...result,

      executionAuthorized:
        false,
    };
  }
}


module.exports = {
  RealityCorpusService,
};