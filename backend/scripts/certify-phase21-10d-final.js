"use strict";

const fs =
  require(
    "node:fs"
  );

const path =
  require(
    "node:path"
  );


const CERTIFICATE_VERSION =
  "21.10D-final-v1";


const REQUIRED_REPORT_VERSION =
  "21.10D-report-v1";


const REQUIRED_GENERATOR_VERSION =
  "21.10D-generator-v1";


const REQUIRED_CAPACITY_CERTIFICATE =
  "21.10B-final-v2";


const REQUIRED_TENANCY_CERTIFICATE =
  "21.10C-final-v1";


const ARTIFACT_DIRECTORY =
  path.resolve(
    __dirname,
    "../artifacts/phase21"
  );


const REPORT_JSON_PREFIX =
  "phase21-10d-recovery-resilience-capacity-";


const REPORT_MARKDOWN_PREFIX =
  "phase21-10d-recovery-resilience-capacity-";


const FINAL_CERTIFICATE_PREFIX =
  "phase21-10d-final-certification-";


// ============================================================================
// MAIN
// ============================================================================

async function main() {
  printBanner();


  const source =
    findNewestReportPair(
      ARTIFACT_DIRECTORY
    );


  if (
    !source
  ) {
    throw createError(
      "No valid Phase 21.10D JSON/Markdown report pair was found",
      "PHASE21_10D_REPORT_PAIR_NOT_FOUND"
    );
  }


  console.log(
    `JSON source:     ${source.jsonPath}`
  );


  console.log(
    `Markdown source: ${source.markdownPath}`
  );


  console.log(
    ""
  );


  const report =
    readJson(
      source.jsonPath
    );


  const markdown =
    fs.readFileSync(
      source.markdownPath,
      "utf8"
    );


  const validation =
    validateFinalReport({
      report,
      markdown,
      jsonPath:
        source.jsonPath,
      markdownPath:
        source.markdownPath,
    });


  printValidation(
    validation
  );


  if (
    !validation.pass
  ) {
    throw createError(
      "Phase 21.10D final validation failed",
      "PHASE21_10D_FINAL_VALIDATION_FAILED",
      {
        validation,
      }
    );
  }


  const certificate =
    buildFinalCertificate({
      report,
      validation,
      jsonPath:
        source.jsonPath,
      markdownPath:
        source.markdownPath,
    });


  const timestamp =
    new Date()
      .toISOString()
      .replace(
        /:/g,
        "-"
      );


  const finalPath =
    path.join(
      ARTIFACT_DIRECTORY,
      `${FINAL_CERTIFICATE_PREFIX}${timestamp}.json`
    );


  fs.writeFileSync(
    finalPath,
    JSON.stringify(
      certificate,
      null,
      2
    ) + "\n",
    "utf8"
  );


  printFinalResult(
    certificate,
    finalPath
  );


  return {
    certificate,
    finalPath,
  };
}


// ============================================================================
// REPORT DISCOVERY
// ============================================================================

function findNewestReportPair(
  directory
) {
  if (
    !fs.existsSync(
      directory
    )
  ) {
    return null;
  }


  const jsonCandidates =
    fs.readdirSync(
      directory,
      {
        withFileTypes:
          true,
      }
    )
      .filter(
        (
          entry
        ) =>
          entry.isFile() &&
          entry.name.startsWith(
            REPORT_JSON_PREFIX
          ) &&
          entry.name.endsWith(
            ".json"
          )
      )
      .map(
        (
          entry
        ) => {
          const fullPath =
            path.join(
              directory,
              entry.name
            );


          return {
            path:
              fullPath,

            modifiedAt:
              fs.statSync(
                fullPath
              )
                .mtimeMs,
          };
        }
      )
      .sort(
        (
          left,
          right
        ) =>
          right.modifiedAt -
          left.modifiedAt
      );


  for (
    const candidate
    of jsonCandidates
  ) {
    try {
      const report =
        readJson(
          candidate.path
        );


      if (
        report.status !==
          "PASS"
      ) {
        continue;
      }


      const markdownPath =
        matchingMarkdownPath(
          candidate.path
        );


      if (
        !fs.existsSync(
          markdownPath
        )
      ) {
        continue;
      }


      return {
        jsonPath:
          candidate.path,

        markdownPath,
      };
    } catch (
      error
    ) {
      console.warn(
        `[phase21.10d.final] ignoring ${candidate.path}: ${error.message}`
      );
    }
  }


  return null;
}


function matchingMarkdownPath(
  jsonPath
) {
  const directory =
    path.dirname(
      jsonPath
    );


  const basename =
    path.basename(
      jsonPath
    );


  const markdownName =
    basename.replace(
      /\.json$/i,
      ".md"
    );


  return path.join(
    directory,
    markdownName
  );
}


// ============================================================================
// FINAL VALIDATION
// ============================================================================

function validateFinalReport({
  report,
  markdown,
  jsonPath,
  markdownPath,
}) {
  const checks = [
    check(
      "JSON report exists",
      fs.existsSync(
        jsonPath
      )
    ),

    check(
      "Markdown report exists",
      fs.existsSync(
        markdownPath
      )
    ),

    check(
      "report phase is 21.10D",
      report.phase ===
        "21.10D"
    ),

    check(
      "report version is frozen contract",
      report.reportVersion ===
        REQUIRED_REPORT_VERSION
    ),

    check(
      "generator version is frozen contract",
      report
        ?.generator
        ?.version ===
        REQUIRED_GENERATOR_VERSION
    ),

    check(
      "report status is PASS",
      report.status ===
        "PASS"
    ),

    check(
      "safety class is LAB_ONLY",
      report.safetyClass ===
        "LAB_ONLY"
    ),

    check(
      "21.10B capacity certificate consumed",
      report
        ?.evidenceSources
        ?.phase21_10B
        ?.certificateVersion ===
        REQUIRED_CAPACITY_CERTIFICATE
    ),

    check(
      "21.10B source passed",
      report
        ?.evidenceSources
        ?.phase21_10B
        ?.status ===
        "PASS"
    ),

    check(
      "21.10B source was live certified",
      report
        ?.evidenceSources
        ?.phase21_10B
        ?.liveCertified ===
        true
    ),

    check(
      "21.10B source was frozen",
      report
        ?.evidenceSources
        ?.phase21_10B
        ?.frozen ===
        true
    ),

    check(
      "21.10C tenant certificate consumed",
      report
        ?.evidenceSources
        ?.phase21_10C
        ?.certificateVersion ===
        REQUIRED_TENANCY_CERTIFICATE
    ),

    check(
      "21.10C source passed",
      report
        ?.evidenceSources
        ?.phase21_10C
        ?.status ===
        "PASS"
    ),

    check(
      "21.10C source was live certified",
      report
        ?.evidenceSources
        ?.phase21_10C
        ?.liveCertified ===
        true
    ),

    check(
      "21.10C source was frozen",
      report
        ?.evidenceSources
        ?.phase21_10C
        ?.frozen ===
        true
    ),

    check(
      "at least one certified provider exists",
      Number(
        report
          ?.capacity
          ?.summary
          ?.providerCount
      ) >
        0
    ),

    check(
      "all certified providers recovered",
      report
        ?.capacity
        ?.summary
        ?.allCertifiedProvidersRecovered ===
        true
    ),

    check(
      "capacity envelope is not claimed as maximum",
      report
        ?.interpretation
        ?.capacityEnvelopeIsMaximum ===
        false
    ),

    check(
      "production SLO was not established",
      report
        ?.interpretation
        ?.productionSloEstablished ===
        false
    ),

    check(
      "external provider quota was not inferred",
      report
        ?.interpretation
        ?.externalProviderQuotaMeasured ===
        false
    ),

    check(
      "missing measurements were not invented",
      report
        ?.interpretation
        ?.missingMeasurementsInvented ===
        false
    ),

    check(
      "missing measurements remain null",
      report
        ?.interpretation
        ?.notMeasuredValuesRemainNull ===
        true
    ),

    check(
      "tenant isolation passed",
      report
        ?.tenancy
        ?.summary
        ?.isolationPassed ===
        true
    ),

    check(
      "cross-tenant boundary violations are zero",
      report
        ?.tenancy
        ?.boundaryViolations ===
        0
    ),

    check(
      "Redis tenant collisions are zero",
      report
        ?.tenancy
        ?.redisIdempotencyCollisions ===
        0
    ),

    check(
      "RabbitMQ envelope leaks are zero",
      report
        ?.tenancy
        ?.rabbitMqEnvelopeLeaks ===
        0
    ),

    check(
      "noisy-neighbor starvation is zero",
      report
        ?.tenancy
        ?.starvedControlTenants ===
        0
    ),

    check(
      "tenant recovery passed",
      report
        ?.tenancy
        ?.recoveryPassed ===
        true
    ),

    check(
      "production certification remains false",
      report
        ?.authority
        ?.productionCertified ===
        false
    ),

    check(
      "execution authorization remains false",
      report
        ?.authority
        ?.executionAuthorized ===
        false
    ),

    check(
      "report cannot grant execution authorization",
      report
        ?.authority
        ?.canGrantExecutionAuthorization ===
        false
    ),

    check(
      "report cannot grant autonomy",
      report
        ?.authority
        ?.canGrantAutonomy ===
        false
    ),

    check(
      "report cannot modify production authority",
      report
        ?.authority
        ?.canModifyProductionAuthority ===
        false
    ),

    check(
      "Phase 21 remains evidence only",
      report
        ?.authority
        ?.phase21IsEvidenceOnly ===
        true
    ),

    check(
      "Phase 22 consumes evidence",
      report
        ?.authority
        ?.phase22ConsumesEvidence ===
        true
    ),

    check(
      "generated final result passed",
      report
        ?.finalResult
        ?.pass ===
        true
    ),

    check(
      "generated report itself is not yet frozen",
      report
        ?.finalResult
        ?.frozen ===
        false
    ),

    check(
      "generated report remains non-production",
      report
        ?.finalResult
        ?.productionCertified ===
        false
    ),

    check(
      "generated report remains non-authorizing",
      report
        ?.finalResult
        ?.executionAuthorized ===
        false
    ),

    check(
      "JSON generation recorded",
      report
        ?.finalResult
        ?.jsonGenerated ===
        true
    ),

    check(
      "Markdown generation recorded",
      report
        ?.finalResult
        ?.markdownGenerated ===
        true
    ),

    check(
      "Markdown identifies Phase 21.10D",
      markdown.includes(
        "Phase 21.10D"
      )
    ),

    check(
      "Markdown states production certification false",
      markdown.includes(
        "Production certified: **false**"
      )
    ),

    check(
      "Markdown states execution authorization false",
      markdown.includes(
        "Execution authorized: **false**"
      )
    ),

    check(
      "Markdown rejects universal maximum interpretation",
      markdown.includes(
        "Measured capacity envelope is not a universal maximum."
      )
    ),

    check(
      "Markdown preserves NOT_MEASURED semantics",
      markdown.includes(
        "NOT_MEASURED"
      )
    ),
  ];


  return {
    pass:
      checks.every(
        (
          item
        ) =>
          item.pass ===
          true
      ),

    checks,
  };
}


// ============================================================================
// FINAL CERTIFICATE
// ============================================================================

function buildFinalCertificate({
  report,
  validation,
  jsonPath,
  markdownPath,
}) {
  return {
    phase:
      "21",

    subphase:
      "21.10D",

    title:
      "Recovery, Resilience & Capacity Report",

    certificateVersion:
      CERTIFICATE_VERSION,

    generatedAt:
      new Date()
        .toISOString(),

    status:
      "PASS",

    pass:
      true,

    liveCertified:
      true,

    frozen:
      true,

    certificationClass:
      "EVIDENCE_CONSOLIDATION_OF_LIVE_MACHINE_SPECIFIC_RESULTS",

    safetyClass:
      "LAB_ONLY",

    sourceEvidence: {
      reportJson:
        path.basename(
          jsonPath
        ),

      reportMarkdown:
        path.basename(
          markdownPath
        ),

      phase21_10B: {
        certificateVersion:
          report
            .evidenceSources
            .phase21_10B
            .certificateVersion,

        status:
          report
            .evidenceSources
            .phase21_10B
            .status,

        liveCertified:
          true,

        frozen:
          true,
      },

      phase21_10C: {
        certificateVersion:
          report
            .evidenceSources
            .phase21_10C
            .certificateVersion,

        status:
          report
            .evidenceSources
            .phase21_10C
            .status,

        liveCertified:
          true,

        frozen:
          true,
      },
    },

    capacity: {
      providerCount:
        report
          .capacity
          .summary
          .providerCount,

      allCertifiedProvidersRecovered:
        true,

      providersWithObservedDegradation:
        report
          .capacity
          .summary
          .providersWithObservedDegradation,

      providersWithObservedBreakingPoint:
        report
          .capacity
          .summary
          .providersWithObservedBreakingPoint,

      providersWithNoObservedBreakingPoint:
        report
          .capacity
          .summary
          .providersWithNoObservedBreakingPoint,

      providerResults:
        report
          .capacity
          .providers,

      measuredEnvelopeNotMaximum:
        true,

      productionSloEstablished:
        false,

      externalProviderQuotaClaimed:
        false,
    },

    tenancy: {
      tenantScales:
        report
          .tenancy
          .tenantScales,

      boundaryViolations:
        report
          .tenancy
          .boundaryViolations,

      redisIdempotencyCollisions:
        report
          .tenancy
          .redisIdempotencyCollisions,

      rabbitMqEnvelopeLeaks:
        report
          .tenancy
          .rabbitMqEnvelopeLeaks,

      starvedControlTenants:
        report
          .tenancy
          .starvedControlTenants,

      maximumTenantInterferenceFactor:
        report
          .tenancy
          .maximumTenantInterferenceFactor,

      recoveryPassed:
        report
          .tenancy
          .recoveryPassed,

      pass:
        true,
    },

    recoveryMetrics: {
      timing:
        report.timing,

      resilience:
        report.resilience,

      missingMeasurementsInvented:
        false,

      notMeasuredValuesRemainNull:
        true,
    },

    interpretation: {
      evidenceAppliesToTestedLabEnvironment:
        true,

      universalMaximumClaimed:
        false,

      productionSloClaimed:
        false,

      externalProviderLimitClaimed:
        false,

      historicalEvidencePreserved:
        true,

      absentMeasurementIsNotFailure:
        true,

      absentMeasurementIsNotEstimated:
        true,

      reportDoesNotAuthorizeRecovery:
        true,
    },

    authority: {
      productionCertified:
        false,

      executionAuthorized:
        false,

      canGrantExecutionAuthorization:
        false,

      canGrantAutonomy:
        false,

      canModifyProductionAuthority:
        false,

      canBypassPolicy:
        false,

      canBypassApproval:
        false,

      reliabilityEvidenceIsNonAuthorizing:
        true,

      phase21IsEvidenceOnly:
        true,

      phase22ConsumesEvidence:
        true,
    },

    validation: {
      pass:
        validation.pass,

      checkCount:
        validation
          .checks
          .length,

      passedChecks:
        validation
          .checks
          .filter(
            (
              item
            ) =>
              item.pass ===
              true
          )
          .length,

      failedChecks:
        validation
          .checks
          .filter(
            (
              item
            ) =>
              item.pass !==
              true
          )
          .length,

      checks:
        validation.checks,
    },

    finalResult: {
      pass:
        true,

      status:
        "PASS",

      liveCertified:
        true,

      frozen:
        true,

      productionCertified:
        false,

      executionAuthorized:
        false,

      phase22ConsumesEvidence:
        true,
    },
  };
}


// ============================================================================
// HELPERS
// ============================================================================

function readJson(
  filePath
) {
  return JSON.parse(
    fs.readFileSync(
      filePath,
      "utf8"
    )
  );
}


function check(
  name,
  pass
) {
  return {
    name,

    pass:
      pass ===
      true,
  };
}


function createError(
  message,
  code,
  extra = {}
) {
  return Object.assign(
    new Error(
      message
    ),

    {
      name:
        "Phase21FinalRecoveryResilienceCertificationError",

      code,

      productionCertified:
        false,

      executionAuthorized:
        false,

      ...extra,
    }
  );
}


// ============================================================================
// OUTPUT
// ============================================================================

function printBanner() {
  console.log(
    ""
  );

  console.log(
    "=============================================================="
  );

  console.log(
    "AIRA PHASE 21.10D FINAL CERTIFICATION"
  );

  console.log(
    "=============================================================="
  );

  console.log(
    "Mode:                  evidence validation + freeze"
  );

  console.log(
    "Chaos workload rerun:  false"
  );

  console.log(
    "Safety class:          LAB_ONLY"
  );

  console.log(
    "Production certified:  false"
  );

  console.log(
    "Execution authorized:  false"
  );

  console.log(
    "=============================================================="
  );

  console.log(
    ""
  );
}


function printValidation(
  validation
) {
  console.log(
    "--------------------------------------------------------------"
  );

  console.log(
    "FINAL VALIDATION"
  );

  console.log(
    "--------------------------------------------------------------"
  );


  for (
    const item
    of validation.checks
  ) {
    console.log(
      `${item.pass ? "PASS" : "FAIL"} | ${item.name}`
    );
  }


  console.log(
    ""
  );


  console.log(
    `Checks: ${validation.checks.filter((item) => item.pass).length}/${validation.checks.length} PASS`
  );

  console.log(
    ""
  );
}


function printFinalResult(
  certificate,
  finalPath
) {
  console.log(
    "=============================================================="
  );

  console.log(
    "PHASE 21.10D FINAL RESULT: PASS"
  );

  console.log(
    "=============================================================="
  );

  console.log(
    `Certificate version:          ${certificate.certificateVersion}`
  );

  console.log(
    `Live evidence consumed:       ${certificate.liveCertified}`
  );

  console.log(
    `Frozen:                       ${certificate.frozen}`
  );

  console.log(
    `Capacity providers:           ${certificate.capacity.providerCount}`
  );

  console.log(
    `All providers recovered:      ${certificate.capacity.allCertifiedProvidersRecovered}`
  );

  console.log(
    `Boundary violations:          ${certificate.tenancy.boundaryViolations}`
  );

  console.log(
    `Redis collisions:             ${certificate.tenancy.redisIdempotencyCollisions}`
  );

  console.log(
    `RabbitMQ envelope leaks:      ${certificate.tenancy.rabbitMqEnvelopeLeaks}`
  );

  console.log(
    `Starved control tenants:      ${certificate.tenancy.starvedControlTenants}`
  );

  console.log(
    `Tenant recovery:              ${certificate.tenancy.recoveryPassed ? "PASS" : "FAIL"}`
  );

  console.log(
    `Production certified:         ${certificate.authority.productionCertified}`
  );

  console.log(
    `Execution authorized:         ${certificate.authority.executionAuthorized}`
  );

  console.log(
    `Phase 22 consumes evidence:   ${certificate.authority.phase22ConsumesEvidence}`
  );

  console.log(
    `Artifact: ${finalPath}`
  );

  console.log(
    ""
  );

  console.log(
    "PHASE 21.10D STATUS: LIVE EVIDENCE CONSOLIDATED / PASS / FROZEN"
  );

  console.log(
    ""
  );
}


// ============================================================================
// CLI
// ============================================================================

if (
  require.main ===
  module
) {
  main()
    .catch(
      (
        error
      ) => {
        console.error(
          ""
        );

        console.error(
          "PHASE 21.10D FINAL RESULT: FAIL"
        );

        console.error(
          error
        );


        process.exitCode =
          1;
      }
    );
}


// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  CERTIFICATE_VERSION,

  REQUIRED_REPORT_VERSION,

  REQUIRED_GENERATOR_VERSION,

  REQUIRED_CAPACITY_CERTIFICATE,

  REQUIRED_TENANCY_CERTIFICATE,

  REPORT_JSON_PREFIX,

  REPORT_MARKDOWN_PREFIX,

  FINAL_CERTIFICATE_PREFIX,

  findNewestReportPair,

  matchingMarkdownPath,

  validateFinalReport,

  buildFinalCertificate,

  main,
};