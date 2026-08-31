"use strict";


const {
  deriveRecoveryMetrics,
} =
  require(
    "./recoveryResilienceMetrics"
  );


const REPORT_VERSION =
  "21.10D-report-v1";


class RecoveryResilienceReportBuilder {
  build(
    input = {}
  ) {
    const capacityCertificate =
      input.capacityCertificate ||
      {};


    const tenancyCertificate =
      input.tenancyCertificate ||
      {};


    const experimentEvidence =
      input.experimentEvidence ||
      {};


    validateCertificate(
      capacityCertificate,
      "21.10B"
    );


    validateCertificate(
      tenancyCertificate,
      "21.10C"
    );


    const capacityProviders =
      Array.isArray(
        capacityCertificate
          .providerResults
      )
        ? capacityCertificate
            .providerResults
        : [];


    const tenancyScaleRuns =
      normalizeTenancyScaleRuns(
        tenancyCertificate
      );


    const metrics =
      deriveRecoveryMetrics({
        timing:
          experimentEvidence
            .timing ||
          {},

        resilience:
          experimentEvidence
            .resilience ||
          {},

        capacity: {
          providers:
            capacityProviders,
        },

        tenancy: {
          scaleRuns:
            tenancyScaleRuns,

          boundaryViolations:
            readNumber(
              tenancyCertificate,
              [
                [
                  "multiTenant",
                  "boundaryViolations",
                ],

                [
                  "measuredClaims",
                  "crossTenantBoundaryViolations",
                ],
              ],
              0
            ),

          redisIdempotencyCollisions:
            readNumber(
              tenancyCertificate,
              [
                [
                  "redisIsolation",
                  "collisions",
                ],
              ],
              0
            ),

          rabbitMqEnvelopeLeaks:
            readNumber(
              tenancyCertificate,
              [
                [
                  "rabbitMqIsolation",
                  "envelopeLeaks",
                ],
              ],
              0
            ),

          starvedControlTenants:
            readNumber(
              tenancyCertificate,
              [
                [
                  "multiTenant",
                  "starvedControlTenants",
                ],
              ],
              0
            ),

          recoveryPassed:
            tenancyCertificate
              ?.multiTenant
              ?.recoveryPassed ===
            true,
        },
      });


    const providerSummary =
      summarizeProviders(
        metrics
          .capacity
          .providers
      );


    const isolationSummary =
      summarizeIsolation(
        metrics.tenancy
      );


    return {
      phase:
        "21.10D",

      title:
        "Recovery, Resilience & Capacity Report",

      reportVersion:
        REPORT_VERSION,

      generatedAt:
        new Date()
          .toISOString(),

      status:
        determineReportStatus(
          providerSummary,
          isolationSummary
        ),

      certificationClass:
        "EVIDENCE_CONSOLIDATION",

      safetyClass:
        "LAB_ONLY",

      evidenceSources: {
        phase21_10B: {
          certificateVersion:
            capacityCertificate
              .certificateVersion ||
            null,

          status:
            capacityCertificate
              .status ||
            null,

          liveCertified:
            Boolean(
              capacityCertificate
                ?.finalResult
                ?.liveCertified
            ),

          frozen:
            Boolean(
              capacityCertificate
                ?.finalResult
                ?.frozen
            ),
        },

        phase21_10C: {
          certificateVersion:
            tenancyCertificate
              .certificateVersion ||
            null,

          status:
            tenancyCertificate
              .status ||
            null,

          liveCertified:
            tenancyCertificate
              .liveCertified ===
            true,

          frozen:
            tenancyCertificate
              .frozen ===
            true,
        },
      },

      timing:
        metrics.timing,

      resilience:
        metrics.resilience,

      capacity:
        {
          ...metrics.capacity,

          summary:
            providerSummary,
        },

      tenancy:
        {
          ...metrics.tenancy,

          summary:
            isolationSummary,
        },

      interpretation: {
        capacityEnvelopeIsMaximum:
          false,

        productionSloEstablished:
          false,

        externalProviderQuotaMeasured:
          false,

        missingMeasurementsInvented:
          false,

        notMeasuredValuesRemainNull:
          true,

        recoveryPassDoesNotGrantAuthority:
          true,

        tenantIsolationPassDoesNotGrantAuthority:
          true,

        reportAppliesToTestedLabEnvironment:
          true,
      },

      authority:
        metrics.authority,

      finalResult: {
        pass:
          providerSummary
            .allCertifiedProvidersRecovered ===
            true &&
          isolationSummary
            .isolationPassed ===
            true,

        productionCertified:
          false,

        executionAuthorized:
          false,

        frozen:
          false,
      },
    };
  }


  toMarkdown(
    report
  ) {
    if (
      !report ||
      typeof report !==
        "object"
    ) {
      throw createError(
        "Recovery/resilience report is required",
        "PHASE21_10D_REPORT_REQUIRED"
      );
    }


    const lines = [];


    lines.push(
      "# AIRA Phase 21.10D — Recovery, Resilience & Capacity Report"
    );

    lines.push(
      ""
    );


    lines.push(
      `Generated: ${report.generatedAt}`
    );

    lines.push(
      ""
    );


    lines.push(
      `Status: **${report.status}**`
    );

    lines.push(
      ""
    );


    lines.push(
      "Safety class: **LAB_ONLY**"
    );

    lines.push(
      ""
    );


    lines.push(
      "Production certified: **false**"
    );

    lines.push(
      ""
    );


    lines.push(
      "Execution authorized: **false**"
    );

    lines.push(
      ""
    );


    lines.push(
      "## Evidence Sources"
    );

    lines.push(
      ""
    );


    lines.push(
      `- Phase 21.10B: ${safeText(
        report
          .evidenceSources
          .phase21_10B
          .certificateVersion
      )}`
    );


    lines.push(
      `- Phase 21.10C: ${safeText(
        report
          .evidenceSources
          .phase21_10C
          .certificateVersion
      )}`
    );

    lines.push(
      ""
    );


    lines.push(
      "## Integration Capacity"
    );

    lines.push(
      ""
    );


    lines.push(
      "| Provider | Safe sustained req/s | Highest tested req/s | Degradation | Breaking point | Recovery |"
    );

    lines.push(
      "|---|---:|---:|---|---|---|"
    );


    for (
      const provider
      of report.capacity.providers
    ) {
      lines.push(
        `| ${safeText(
          provider.provider
        )} | ${formatNumber(
          provider
            .safeSustainedRatePerSecond
        )} | ${formatNumber(
          provider
            .highestTestedOfferedRatePerSecond
        )} | ${formatCapacityPoint(
          provider.degradationPoint
        )} | ${formatCapacityPoint(
          provider.breakingPoint
        )} | ${
          provider.recoveryPassed
            ? "PASS"
            : "FAIL"
        } |`
      );
    }


    lines.push(
      ""
    );


    lines.push(
      "## Multi-Tenant Isolation"
    );

    lines.push(
      ""
    );


    lines.push(
      `- Tenant scales tested: ${
        report
          .tenancy
          .tenantScales
          .join(
            ", "
          )
      }`
    );


    lines.push(
      `- Cross-tenant boundary violations: ${formatNumber(
        report
          .tenancy
          .boundaryViolations
      )}`
    );


    lines.push(
      `- Redis idempotency collisions: ${formatNumber(
        report
          .tenancy
          .redisIdempotencyCollisions
      )}`
    );


    lines.push(
      `- RabbitMQ envelope leaks: ${formatNumber(
        report
          .tenancy
          .rabbitMqEnvelopeLeaks
      )}`
    );


    lines.push(
      `- Starved control tenants: ${formatNumber(
        report
          .tenancy
          .starvedControlTenants
      )}`
    );


    lines.push(
      `- Recovery: ${
        report
          .tenancy
          .recoveryPassed
          ? "PASS"
          : "FAIL"
      }`
    );


    lines.push(
      `- Maximum measured Tenant Interference Factor: ${formatNumber(
        report
          .tenancy
          .maximumTenantInterferenceFactor
      )}`
    );


    lines.push(
      ""
    );


    lines.push(
      "## Recovery Timing"
    );

    lines.push(
      ""
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
      lines.push(
        `- ${key}: ${formatMetric(
          metric
        )}`
      );
    }


    lines.push(
      ""
    );


    lines.push(
      "## Derived Resilience Metrics"
    );

    lines.push(
      ""
    );


    for (
      const [
        key,
        metric,
      ]
      of Object.entries(
        report.resilience
      )
    ) {
      lines.push(
        `- ${key}: ${formatMetric(
          metric
        )}`
      );
    }


    lines.push(
      ""
    );


    lines.push(
      "## Interpretation Boundaries"
    );

    lines.push(
      ""
    );


    lines.push(
      "- Measured capacity envelope is not a universal maximum."
    );

    lines.push(
      "- This report does not establish a production SLO."
    );

    lines.push(
      "- External provider quota limits are not inferred from local measurements."
    );

    lines.push(
      "- Missing measurements remain NOT_MEASURED rather than being estimated."
    );

    lines.push(
      "- Reliability evidence does not grant execution authorization or autonomy."
    );

    lines.push(
      "- Results apply to the tested Reliability Lab hardware, dependencies and configuration."
    );

    lines.push(
      ""
    );


    lines.push(
      "## Authority"
    );

    lines.push(
      ""
    );


    lines.push(
      `- Production certified: ${report.authority.productionCertified}`
    );

    lines.push(
      `- Execution authorized: ${report.authority.executionAuthorized}`
    );

    lines.push(
      `- Can grant autonomy: ${report.authority.canGrantAutonomy}`
    );

    lines.push(
      `- Can modify production authority: ${report.authority.canModifyProductionAuthority}`
    );

    lines.push(
      `- Phase 22 consumes evidence: ${report.authority.phase22ConsumesEvidence}`
    );


    return (
      lines.join(
        "\n"
      ) +
      "\n"
    );
  }
}


// ============================================================================
// CERTIFICATE VALIDATION
// ============================================================================

function validateCertificate(
  certificate,
  expectedSubphase
) {
  if (
    !certificate ||
    typeof certificate !==
      "object"
  ) {
    throw createError(
      `${expectedSubphase} certificate is required`,
      "PHASE21_10D_CERTIFICATE_REQUIRED"
    );
  }


  if (
    certificate.status !==
      "PASS" &&
    certificate
      ?.finalResult
      ?.pass !==
      true
  ) {
    throw createError(
      `${expectedSubphase} certificate has not passed`,
      "PHASE21_10D_SOURCE_NOT_PASSED"
    );
  }


  if (
    certificate.productionCertified ===
      true ||
    certificate.executionAuthorized ===
      true ||
    certificate
      ?.finalResult
      ?.productionCertified ===
      true ||
    certificate
      ?.finalResult
      ?.executionAuthorized ===
      true
  ) {
    throw createError(
      `${expectedSubphase} source contains forbidden authority`,
      "PHASE21_10D_SOURCE_AUTHORITY_VIOLATION"
    );
  }
}


// ============================================================================
// CAPACITY SUMMARY
// ============================================================================

function summarizeProviders(
  providers
) {
  const certified =
    Array.isArray(
      providers
    )
      ? providers
      : [];


  return {
    providerCount:
      certified.length,

    allCertifiedProvidersRecovered:
      certified.length >
        0 &&
      certified.every(
        (
          provider
        ) =>
          provider.recoveryPassed ===
          true
      ),

    providersWithObservedDegradation:
      certified
        .filter(
          (
            provider
          ) =>
            provider.degradationPoint !==
            null
        )
        .map(
          (
            provider
          ) =>
            provider.provider
        ),

    providersWithObservedBreakingPoint:
      certified
        .filter(
          (
            provider
          ) =>
            provider.breakingPoint !==
            null
        )
        .map(
          (
            provider
          ) =>
            provider.provider
        ),

    providersWithNoObservedBreakingPoint:
      certified
        .filter(
          (
            provider
          ) =>
            provider.breakingPoint ===
            null
        )
        .map(
          (
            provider
          ) =>
            provider.provider
        ),
  };
}


// ============================================================================
// ISOLATION SUMMARY
// ============================================================================

function summarizeIsolation(
  tenancy
) {
  const zeroBoundary =
    tenancy.boundaryViolations ===
    0;


  const zeroRedis =
    tenancy
      .redisIdempotencyCollisions ===
    0;


  const zeroRabbit =
    tenancy.rabbitMqEnvelopeLeaks ===
    0;


  const zeroStarvation =
    tenancy.starvedControlTenants ===
    0;


  return {
    isolationPassed:
      zeroBoundary &&
      zeroRedis &&
      zeroRabbit &&
      zeroStarvation &&
      tenancy.recoveryPassed ===
        true,

    zeroCrossTenantBoundaryViolations:
      zeroBoundary,

    zeroRedisIdempotencyCollisions:
      zeroRedis,

    zeroRabbitMqEnvelopeLeaks:
      zeroRabbit,

    zeroNoisyNeighborStarvation:
      zeroStarvation,

    recoveryPassed:
      tenancy.recoveryPassed ===
      true,
  };
}


// ============================================================================
// TENANCY NORMALIZATION
// ============================================================================

function normalizeTenancyScaleRuns(
  certificate
) {
  const runs =
    certificate
      ?.multiTenant
      ?.scaleRuns;


  if (
    !Array.isArray(
      runs
    )
  ) {
    return [];
  }


  return runs.map(
    (
      run
    ) => ({
      tenantCount:
        run.tenantCount,

      pass:
        run.pass,

      boundaryViolations:
        run.boundaryViolations,

      starvedControls:
        run.starvedControls,

      tenantInterferenceFactor:
        firstFinite(
          run
            .tenantInterferenceFactor,
          run
            .maxInterference,
          run
            .maximumInterference
        ),

      recoveryPassed:
        run.recoveryPassed,
    })
  );
}


// ============================================================================
// REPORT STATUS
// ============================================================================

function determineReportStatus(
  capacitySummary,
  isolationSummary
) {
  if (
    capacitySummary
      .allCertifiedProvidersRecovered ===
      true &&
    isolationSummary
      .isolationPassed ===
      true
  ) {
    return "PASS";
  }


  return "FAIL";
}


// ============================================================================
// GENERIC READERS
// ============================================================================

function readNumber(
  root,
  paths,
  fallback = null
) {
  for (
    const pathParts
    of paths
  ) {
    let value =
      root;


    for (
      const part
      of pathParts
    ) {
      value =
        value
          ?.[
            part
          ];
    }


    if (
      typeof value ===
        "number" &&
      Number.isFinite(
        value
      )
    ) {
      return value;
    }
  }


  return fallback;
}


function firstFinite(
  ...values
) {
  for (
    const value
    of values
  ) {
    if (
      typeof value ===
        "number" &&
      Number.isFinite(
        value
      )
    ) {
      return value;
    }
  }


  return null;
}


// ============================================================================
// MARKDOWN HELPERS
// ============================================================================

function safeText(
  value
) {
  if (
    value ===
      null ||
    value ===
      undefined ||
    value ===
      ""
  ) {
    return "NOT_MEASURED";
  }


  return String(
    value
  )
    .replace(
      /\|/g,
      "\\|"
    );
}


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


function formatCapacityPoint(
  point
) {
  if (
    !point
  ) {
    return "NOT_OBSERVED";
  }


  const rate =
    formatNumber(
      point.targetRatePerSecond
    );


  const state =
    point.state ||
    "UNKNOWN";


  return `${state} @ ${rate}/s`;
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


  if (
    typeof metric.value ===
      "number"
  ) {
    return `${
      formatNumber(
        metric.value
      )
    }${
      metric.unit
        ? ` ${metric.unit}`
        : ""
    }`;
  }


  return `${
    metric.value
  }${
    metric.unit
      ? ` ${metric.unit}`
      : ""
  }`;
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
        "Phase21RecoveryResilienceReportError",

      code,

      productionCertified:
        false,

      executionAuthorized:
        false,
    }
  );
}


// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  REPORT_VERSION,

  RecoveryResilienceReportBuilder,

  summarizeProviders,

  summarizeIsolation,

  normalizeTenancyScaleRuns,

  determineReportStatus,
};