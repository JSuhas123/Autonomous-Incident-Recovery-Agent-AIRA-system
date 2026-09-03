"use strict";


const {
  RealityDatasetIngestionService,
} =
  require(
    "./realityDatasetIngestionService"
  );


const {
  RealityCorpusService,
} =
  require(
    "./realityCorpusService"
  );


const {
  RealityReplayService,
} =
  require(
    "./realityReplayService"
  );


const EXTERNAL_BENCHMARK_SERVICE_VERSION =
  "23R.6D-E.0";


function benchmarkError(
  code,
  message,
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

      productionCertified:
        false,
    }
  );
}


function requireString(
  value,
  field
) {
  if (
    typeof value !==
      "string" ||

    !value.trim()
  ) {
    throw benchmarkError(
      "REALITY_EXTERNAL_BENCHMARK_FIELD_REQUIRED",

      `${field} is required`
    );
  }


  return value.trim();
}


function assertExternalRawDataset(
  rawDataset
) {
  if (
    !rawDataset ||

    typeof rawDataset !==
      "object" ||

    Array.isArray(
      rawDataset
    )
  ) {
    throw benchmarkError(
      "REALITY_EXTERNAL_BENCHMARK_DATASET_INVALID",

      (
        "External benchmark rawDataset "
        + "must be an object"
      )
    );
  }


  if (
    rawDataset.rawFormat !==
      "EXTERNAL_BENCHMARK_V1"
  ) {
    throw benchmarkError(
      "REALITY_EXTERNAL_BENCHMARK_FORMAT_INVALID",

      (
        "External benchmark ingestion requires "
        + "EXTERNAL_BENCHMARK_V1"
      )
    );
  }


  /*
   * Phase 23R.6A deliberately fail-closed all benchmark sources
   * except RCAEval.
   */
  if (
    rawDataset
      .benchmark
      ?.benchmarkId !==
      "RCAEVAL"
  ) {
    throw benchmarkError(
      "REALITY_EXTERNAL_BENCHMARK_SOURCE_NOT_APPROVED",

      (
        "Phase 23R.6 currently permits "
        + "RCAEval ingestion only"
      )
    );
  }


  if (
    rawDataset
      .case
      ?.evidenceGrade !==
      "E2"
  ) {
    throw benchmarkError(
      "REALITY_EXTERNAL_BENCHMARK_GRADE_INVALID",

      (
        "External benchmark cases "
        + "must use E2"
      )
    );
  }


  if (
    rawDataset
      .executionAuthorized ===
      true ||

    rawDataset
      .case
      ?.executionAuthorized ===
      true
  ) {
    throw benchmarkError(
      "REALITY_EXTERNAL_BENCHMARK_AUTHORITY_FORBIDDEN",

      (
        "External benchmarks cannot "
        + "grant execution authority"
      ),

      403
    );
  }


  return true;
}


function assertReplayEligibleCase(
  caseResult
) {
  const realityCase =
    caseResult
      ?.realityCase;


  if (
    !realityCase ||

    typeof realityCase !==
      "object"
  ) {
    throw benchmarkError(
      "REALITY_EXTERNAL_BENCHMARK_CASE_NOT_FOUND",

      (
        "Replay-visible external benchmark "
        + "case was not found"
      ),

      404
    );
  }


  if (
    realityCase
      .evidenceGrade !==
      "E2" ||

    realityCase
      .provenance
      ?.sourceKind !==
      "EXTERNAL_BENCHMARK"
  ) {
    throw benchmarkError(
      "REALITY_EXTERNAL_BENCHMARK_REPLAY_INELIGIBLE",

      (
        "Replay case is not an E2 "
        + "independent external benchmark"
      )
    );
  }


  if (
    Object.prototype
      .hasOwnProperty
      .call(
        realityCase,
        "sealedEvaluation"
      ) ||

    Object.prototype
      .hasOwnProperty
      .call(
        realityCase,
        "evaluationRubric"
      ) ||

    caseResult
      .groundTruthIncluded ===
      true ||

    realityCase
      .sealing
      ?.groundTruthAgentVisible !==
      false
  ) {
    throw benchmarkError(
      "REALITY_EXTERNAL_BENCHMARK_GROUND_TRUTH_LEAKAGE",

      (
        "External benchmark replay channel "
        + "contains evaluator ground truth"
      ),

      403
    );
  }


  if (
    caseResult
      .executionAuthorized ===
      true ||

    realityCase
      .executionAuthorized ===
      true
  ) {
    throw benchmarkError(
      "REALITY_EXTERNAL_BENCHMARK_AUTHORITY_FORBIDDEN",

      (
        "External benchmark replay cannot "
        + "grant execution authority"
      ),

      403
    );
  }


  return true;
}


class RealityExternalBenchmarkService {
  constructor(
    options =
      {}
  ) {
    this.ingestionService =
      options.ingestionService ||

      new RealityDatasetIngestionService(
        options.ingestion ||
        {}
      );


    this.corpusService =
      options.corpusService ||

      new RealityCorpusService(
        options.corpus ||
        {}
      );


    this.replayService =
      options.replayService ||

      new RealityReplayService(
        options.replay ||
        {}
      );
  }


  async ingestBatch(
    input =
      {}
  ) {
    const organizationId =
      requireString(
        input.organizationId,

        "organizationId"
      );


    const environmentId =
      requireString(
        input.environmentId,

        "environmentId"
      );


    const corpusId =
      requireString(
        input.corpusId,

        "corpusId"
      );


    if (
      !Array.isArray(
        input.rawDatasets
      ) ||

      input
        .rawDatasets
        .length ===
        0
    ) {
      throw benchmarkError(
        "REALITY_EXTERNAL_BENCHMARK_BATCH_REQUIRED",

        (
          "rawDatasets must contain at least "
          + "one external benchmark case"
        )
      );
    }


    const results =
      [];


    for (
      const rawDataset
      of input.rawDatasets
    ) {
      assertExternalRawDataset(
        rawDataset
      );


      const result =
        await this.ingestionService
          .ingestRawDataset({
            organizationId,

            environmentId,

            corpusId,

            rawDataset,
          });


      if (
        result
          .executionAuthorized ===
          true
      ) {
        throw benchmarkError(
          "REALITY_EXTERNAL_BENCHMARK_INGESTION_AUTHORITY_VIOLATION",

          (
            "Dataset ingestion unexpectedly "
            + "returned execution authority"
          ),

          500
        );
      }


      results.push(
        result
      );
    }


    return {
      version:
        EXTERNAL_BENCHMARK_SERVICE_VERSION,

      benchmarkId:
        "RCAEVAL",

      evidenceGrade:
        "E2",

      ingestedCount:
        results.length,

      results,

      groundTruthAgentVisible:
        false,

      productionCertified:
        false,

      executionAuthorized:
        false,
    };
  }


  async createReplay(
    input =
      {}
  ) {
    const organizationId =
      requireString(
        input.organizationId,

        "organizationId"
      );


    const environmentId =
      requireString(
        input.environmentId,

        "environmentId"
      );


    const caseId =
      requireString(
        input.caseId,

        "caseId"
      );


    const airaVersion =
      requireString(
        input.airaVersion,

        "airaVersion"
      );


    /*
     * Retrieve ONLY through the replay-visible corpus API.
     *
     * Never use getCaseForEvaluation() here.
     */
    const caseResult =
      await this.corpusService
        .getCaseForReplay({
          organizationId,

          environmentId,

          caseId,
        });


    assertReplayEligibleCase(
      caseResult
    );


    const run =
      await this.replayService
        .createRun({
          organizationId,

          environmentId,

          caseId,

          airaVersion,

          seed:
            input.seed ??
            caseResult
              .realityCase
              .replayConfiguration
              ?.seed ??
            0,

          speedMultiplier:
            input.speedMultiplier ??
            caseResult
              .realityCase
              .replayConfiguration
              ?.speedMultiplier ??
            1,

          deterministicTimestamps:
            input
              .deterministicTimestamps ??
            caseResult
              .realityCase
              .replayConfiguration
              ?.deterministicTimestamps ??
            true,

          disorderWindowMs:
            input
              .disorderWindowMs ??
            0,

          metadata: {
            ...(
              input.metadata ||
              {}
            ),

            phase:
              "23R.6E",

            benchmarkId:
              "RCAEVAL",

            evidenceGrade:
              "E2",

            groundTruthAgentVisible:
              false,

            externalBenchmarkReplay:
              true,
          },
        });


    if (
      run
        .executionAuthorized ===
        true
    ) {
      throw benchmarkError(
        "REALITY_EXTERNAL_BENCHMARK_REPLAY_AUTHORITY_VIOLATION",

        (
          "Replay engine unexpectedly returned "
          + "execution authority"
        ),

        500
      );
    }


    return {
      version:
        EXTERNAL_BENCHMARK_SERVICE_VERSION,

      benchmarkId:
        "RCAEVAL",

      evidenceGrade:
        "E2",

      run,

      groundTruthAgentVisible:
        false,

      productionCertified:
        false,

      executionAuthorized:
        false,
    };
  }
}


module.exports = {
  EXTERNAL_BENCHMARK_SERVICE_VERSION,

  RealityExternalBenchmarkService,

  assertExternalRawDataset,

  assertReplayEligibleCase,
};