"use strict";

const fs =
  require(
    "node:fs"
  );

const path =
  require(
    "node:path"
  );

const {
  RecoveryResilienceReportBuilder,
} =
  require(
    "../services/reliability/reporting/recoveryResilienceReportBuilder"
  );


const SCRIPT_VERSION =
  "21.10D-generator-v1";


const ARTIFACT_DIRECTORY =
  path.resolve(
    __dirname,
    "../artifacts/phase21"
  );


const CAPACITY_PREFIX =
  "phase21-10b-final-certification-";


const TENANCY_PREFIX =
  "phase21-10c-final-certification-";


const REPORT_JSON_PREFIX =
  "phase21-10d-recovery-resilience-capacity-";


const REPORT_MARKDOWN_PREFIX =
  "phase21-10d-recovery-resilience-capacity-";


async function main() {
  printBanner();


  const capacityPath =
    findNewestArtifact(
      ARTIFACT_DIRECTORY,
      CAPACITY_PREFIX
    );


  const tenancyPath =
    findNewestArtifact(
      ARTIFACT_DIRECTORY,
      TENANCY_PREFIX
    );


  if (
    !capacityPath
  ) {
    throw createError(
      "Phase 21.10B final certificate was not found",
      "PHASE21_10D_CAPACITY_CERTIFICATE_NOT_FOUND"
    );
  }


  if (
    !tenancyPath
  ) {
    throw createError(
      "Phase 21.10C final certificate was not found",
      "PHASE21_10D_TENANCY_CERTIFICATE_NOT_FOUND"
    );
  }


  const capacityCertificate =
    readJson(
      capacityPath
    );


  const tenancyCertificate =
    readJson(
      tenancyPath
    );


  printSource(
    "21.10B",
    capacityPath,
    capacityCertificate
  );


  printSource(
    "21.10C",
    tenancyPath,
    tenancyCertificate
  );


  const builder =
    new RecoveryResilienceReportBuilder();


  const report =
    builder.build({
      capacityCertificate,
      tenancyCertificate,
      experimentEvidence: {},
    });


  validateGeneratedReport(
    report
  );


  fs.mkdirSync(
    ARTIFACT_DIRECTORY,
    {
      recursive:
        true,
    }
  );


  const timestamp =
    new Date()
      .toISOString()
      .replace(
        /:/g,
        "-"
      );


  const jsonPath =
    path.join(
      ARTIFACT_DIRECTORY,
      `${REPORT_JSON_PREFIX}${timestamp}.json`
    );


  const markdownPath =
    path.join(
      ARTIFACT_DIRECTORY,
      `${REPORT_MARKDOWN_PREFIX}${timestamp}.md`
    );


  const enrichedReport = {
    ...report,

    generator: {
      version:
        SCRIPT_VERSION,

      sourceArtifacts: {
        phase21_10B:
          path.basename(
            capacityPath
          ),

        phase21_10C:
          path.basename(
            tenancyPath
          ),
      },
    },

    finalResult: {
      ...report.finalResult,

      reportGenerated:
        true,

      jsonGenerated:
        true,

      markdownGenerated:
        true,

      productionCertified:
        false,

      executionAuthorized:
        false,
    },
  };


  fs.writeFileSync(
    jsonPath,
    JSON.stringify(
      enrichedReport,
      null,
      2
    ) + "\n",
    "utf8"
  );


  const markdown =
    builder.toMarkdown(
      enrichedReport
    );


  fs.writeFileSync(
    markdownPath,
    markdown,
    "utf8"
  );


  printSummary(
    enrichedReport,
    jsonPath,
    markdownPath
  );


  return {
    report:
      enrichedReport,

    jsonPath,

    markdownPath,
  };
}


// ============================================================================
// ARTIFACT DISCOVERY
// ============================================================================

function findNewestArtifact(
  directory,
  prefix
) {
  if (
    !fs.existsSync(
      directory
    )
  ) {
    return null;
  }


  const files =
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
            prefix
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


          const stat =
            fs.statSync(
              fullPath
            );


          return {
            path:
              fullPath,

            modifiedAt:
              stat.mtimeMs,
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
    of files
  ) {
    try {
      const artifact =
        readJson(
          candidate.path
        );


      if (
        artifact.status ===
          "PASS" &&
        sourceFrozen(
          artifact
        )
      ) {
        return candidate.path;
      }
    } catch (
      error
    ) {
      console.warn(
        `[phase21.10d] ignoring unreadable artifact ${candidate.path}: ${error.message}`
      );
    }
  }


  return null;
}


function sourceFrozen(
  artifact
) {
  return (
    artifact.frozen ===
      true ||
    artifact
      ?.finalResult
      ?.frozen ===
      true
  );
}


// ============================================================================
// VALIDATION
// ============================================================================

function validateGeneratedReport(
  report
) {
  if (
    !report ||
    typeof report !==
      "object"
  ) {
    throw createError(
      "Generated Phase 21.10D report is missing",
      "PHASE21_10D_REPORT_MISSING"
    );
  }


  if (
    report.status !==
      "PASS"
  ) {
    throw createError(
      "Generated Phase 21.10D report did not pass",
      "PHASE21_10D_REPORT_FAILED"
    );
  }


  if (
    report
      ?.authority
      ?.executionAuthorized !==
      false ||
    report
      ?.authority
      ?.productionCertified !==
      false
  ) {
    throw createError(
      "Phase 21.10D report contains forbidden authority",
      "PHASE21_10D_AUTHORITY_VIOLATION"
    );
  }


  if (
    report
      ?.capacity
      ?.summary
      ?.allCertifiedProvidersRecovered !==
      true
  ) {
    throw createError(
      "Not all certified integration paths recovered",
      "PHASE21_10D_PROVIDER_RECOVERY_FAILED"
    );
  }


  if (
    report
      ?.tenancy
      ?.summary
      ?.isolationPassed !==
      true
  ) {
    throw createError(
      "Multi-tenant isolation evidence did not pass",
      "PHASE21_10D_TENANT_ISOLATION_FAILED"
    );
  }


  if (
    report
      ?.interpretation
      ?.missingMeasurementsInvented !==
      false
  ) {
    throw createError(
      "Phase 21.10D must never invent missing measurements",
      "PHASE21_10D_SYNTHETIC_MEASUREMENT_FORBIDDEN"
    );
  }


  return true;
}


// ============================================================================
// JSON
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
    "AIRA PHASE 21.10D RECOVERY / RESILIENCE / CAPACITY REPORT"
  );

  console.log(
    "=============================================================="
  );

  console.log(
    "Mode:                  evidence consolidation"
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


function printSource(
  name,
  sourcePath,
  certificate
) {
  console.log(
    `${name} source: ${sourcePath}`
  );

  console.log(
    `${name} version: ${
      certificate.certificateVersion ||
      "unknown"
    }`
  );

  console.log(
    `${name} status: ${
      certificate.status ||
      "unknown"
    }`
  );

  console.log(
    ""
  );
}


function printSummary(
  report,
  jsonPath,
  markdownPath
) {
  console.log(
    "--------------------------------------------------------------"
  );

  console.log(
    "CAPACITY SUMMARY"
  );

  console.log(
    "--------------------------------------------------------------"
  );


  for (
    const provider
    of report.capacity.providers
  ) {
    console.log(
      `${provider.provider} | safe=${formatNumber(
        provider.safeSustainedRatePerSecond
      )}/s | tested=${formatNumber(
        provider.highestTestedOfferedRatePerSecond
      )}/s | degradation=${
        provider.degradationPoint
          ? provider
              .degradationPoint
              .state
          : "NOT_OBSERVED"
      } | recovery=${
        provider.recoveryPassed
          ? "PASS"
          : "FAIL"
      }`
    );
  }


  console.log(
    ""
  );


  console.log(
    "--------------------------------------------------------------"
  );

  console.log(
    "TENANT ISOLATION SUMMARY"
  );

  console.log(
    "--------------------------------------------------------------"
  );

  console.log(
    `Tenant scales:               ${report.tenancy.tenantScales.join(", ")}`
  );

  console.log(
    `Boundary violations:         ${report.tenancy.boundaryViolations}`
  );

  console.log(
    `Redis collisions:            ${report.tenancy.redisIdempotencyCollisions}`
  );

  console.log(
    `RabbitMQ envelope leaks:     ${report.tenancy.rabbitMqEnvelopeLeaks}`
  );

  console.log(
    `Starved controls:            ${report.tenancy.starvedControlTenants}`
  );

  console.log(
    `Recovery:                    ${report.tenancy.recoveryPassed ? "PASS" : "FAIL"}`
  );

  console.log(
    `Max interference factor:     ${formatNullable(
      report
        .tenancy
        .maximumTenantInterferenceFactor
    )}`
  );


  console.log(
    ""
  );


  console.log(
    "--------------------------------------------------------------"
  );

  console.log(
    "RECOVERY METRICS"
  );

  console.log(
    "--------------------------------------------------------------"
  );


  for (
    const [
      key,
      metric,
    ]
    of Object.entries(
      report.timing
    )
  ) {
    console.log(
      `${key}: ${formatMetric(
        metric
      )}`
    );
  }


  console.log(
    ""
  );


  console.log(
    "=============================================================="
  );

  console.log(
    `PHASE 21.10D REPORT RESULT: ${report.status}`
  );

  console.log(
    "=============================================================="
  );

  console.log(
    `JSON:     ${jsonPath}`
  );

  console.log(
    `Markdown: ${markdownPath}`
  );

  console.log(
    `Production certified: ${report.authority.productionCertified}`
  );

  console.log(
    `Execution authorized: ${report.authority.executionAuthorized}`
  );

  console.log(
    ""
  );

  console.log(
    "PHASE 21.10D.3-5 STATUS: PASS"
  );

  console.log(
    "Final freeze still requires Phase 21.10D.6."
  );

  console.log(
    ""
  );
}


// ============================================================================
// FORMAT
// ============================================================================

function formatNumber(
  value
) {
  if (
    typeof value !==
      "number" ||
    !Number.isFinite(
      value
    )
  ) {
    return "NOT_MEASURED";
  }


  return String(
    Number(
      value.toFixed(
        4
      )
    )
  );
}


function formatNullable(
  value
) {
  return (
    typeof value ===
      "number" &&
    Number.isFinite(
      value
    )
  )
    ? formatNumber(
        value
      )
    : "NOT_MEASURED";
}


function formatMetric(
  metric
) {
  if (
    !metric ||
    metric.value ===
      null ||
    metric.value ===
      undefined
  ) {
    return "NOT_MEASURED";
  }


  return `${
    formatNumber(
      metric.value
    )
  } ${
    metric.unit ||
    ""
  }`.trim();
}


// ============================================================================
// ERROR
// ============================================================================

function createError(
  message,
  code
) {
  return Object.assign(
    new Error(
      message
    ),

    {
      name:
        "Phase21RecoveryResilienceReportGeneratorError",

      code,

      productionCertified:
        false,

      executionAuthorized:
        false,
    }
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
          "PHASE 21.10D REPORT RESULT: FAIL"
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
  SCRIPT_VERSION,

  CAPACITY_PREFIX,

  TENANCY_PREFIX,

  REPORT_JSON_PREFIX,

  REPORT_MARKDOWN_PREFIX,

  findNewestArtifact,

  sourceFrozen,

  validateGeneratedReport,

  main,
};