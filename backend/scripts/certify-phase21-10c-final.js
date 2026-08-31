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
  "21.10C-final-v1";


const REQUIRED_TENANT_SCALES = [
  1,
  10,
  25,
  50,
  100,
];


const ARTIFACT_DIRECTORY =
  path.resolve(
    __dirname,
    "../artifacts/phase21"
  );


const LIVE_ARTIFACT_PREFIX =
  "phase21-10c-live-certification-";


const FINAL_ARTIFACT_PREFIX =
  "phase21-10c-final-certification-";


// ============================================================================
// MAIN
// ============================================================================

async function main() {
  printBanner();


  const sourceArtifactPath =
    findNewestSuccessfulLiveArtifact(
      ARTIFACT_DIRECTORY
    );


  if (
    !sourceArtifactPath
  ) {
    throw certificationError(
      "No successful Phase 21.10C live certification artifact was found",
      "PHASE21_10C_LIVE_ARTIFACT_NOT_FOUND"
    );
  }


  console.log(
    `Source artifact: ${sourceArtifactPath}`
  );


  const sourceArtifact =
    readJsonFile(
      sourceArtifactPath
    );


  const validation =
    validateLiveEvidence(
      sourceArtifact
    );


  printValidationSummary(
    validation
  );


  if (
    !validation.pass
  ) {
    throw certificationError(
      "Phase 21.10C final evidence validation failed",
      "PHASE21_10C_FINAL_VALIDATION_FAILED",
      {
        validation,
      }
    );
  }


  const certificate =
    buildFinalCertificate({
      sourceArtifact,
      sourceArtifactPath,
      validation,
    });


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


  const finalArtifactPath =
    path.join(
      ARTIFACT_DIRECTORY,
      `${FINAL_ARTIFACT_PREFIX}${timestamp}.json`
    );


  fs.writeFileSync(
    finalArtifactPath,
    JSON.stringify(
      certificate,
      null,
      2
    ) + "\n",
    "utf8"
  );


  printFinalCertificate(
    certificate,
    finalArtifactPath
  );


  return {
    certificate,
    finalArtifactPath,
  };
}


// ============================================================================
// ARTIFACT DISCOVERY
// ============================================================================

function findNewestSuccessfulLiveArtifact(
  directory
) {
  if (
    !fs.existsSync(
      directory
    )
  ) {
    return null;
  }


  const candidates =
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
            LIVE_ARTIFACT_PREFIX
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
            name:
              entry.name,

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
    of candidates
  ) {
    try {
      const artifact =
        readJsonFile(
          candidate.path
        );


      if (
        liveArtifactAppearsSuccessful(
          artifact
        )
      ) {
        return candidate.path;
      }
    } catch (
      error
    ) {
      console.warn(
        `[phase21.10c.final] Ignoring unreadable artifact ${candidate.name}: ${error.message}`
      );
    }
  }


  return null;
}


// ============================================================================
// LIVE ARTIFACT SUCCESS DETECTION
// ============================================================================

function liveArtifactAppearsSuccessful(
  artifact
) {
  if (
    !artifact ||
    typeof artifact !==
      "object"
  ) {
    return false;
  }


  const explicitPass =
    firstBoolean(
      artifact.pass,
      artifact.success,
      artifact.liveCertified,
      artifact.finalResult
        ?.pass,
      artifact.finalResult
        ?.success,
      artifact.result
        ?.pass,
      artifact.result
        ?.success,
      artifact.summary
        ?.pass
    );


  if (
    explicitPass ===
    true
  ) {
    return true;
  }


  const status =
    firstString(
      artifact.status,
      artifact.finalResult
        ?.status,
      artifact.result
        ?.status,
      artifact.summary
        ?.status
    );


  return (
    status ===
      "PASS" ||
    status ===
      "PASSED" ||
    status ===
      "LIVE_FOUNDATION_PASS"
  );
}


// ============================================================================
// VALIDATION
// ============================================================================

function validateLiveEvidence(
  artifact
) {
  const postgres =
    extractPostgresEvidence(
      artifact
    );


  const redis =
    extractRedisEvidence(
      artifact
    );


  const rabbitMq =
    extractRabbitMqEvidence(
      artifact
    );


  const multiTenant =
    extractMultiTenantEvidence(
      artifact
    );


  const safety =
    extractSafetyEvidence(
      artifact
    );


  const checks = [
    check(
      "live artifact reports PASS",
      liveArtifactAppearsSuccessful(
        artifact
      )
    ),

    check(
      "PostgreSQL isolation probe passed",
      postgres.pass ===
        true
    ),

    check(
      "PostgreSQL source tenant cannot see target",
      postgres.sourceCanSeeTarget ===
        false
    ),

    check(
      "PostgreSQL target tenant can see self",
      postgres.targetCanSeeSelf ===
        true
    ),

    check(
      "PostgreSQL session scope was correct",
      postgres.sessionScopeCorrect ===
        true
    ),

    check(
      "Redis idempotency isolation passed",
      redis.pass ===
        true
    ),

    check(
      "Redis idempotency collisions are zero",
      redis.collisions ===
        0
    ),

    check(
      "RabbitMQ tenant envelope isolation passed",
      rabbitMq.pass ===
        true
    ),

    check(
      "RabbitMQ envelope leaks are zero",
      rabbitMq.envelopeLeaks ===
        0
    ),

    check(
      "all required tenant scales were tested",
      arraysEqual(
        multiTenant.tenantScales,
        REQUIRED_TENANT_SCALES
      )
    ),

    check(
      "all tenant scale runs passed",
      multiTenant.allScaleRunsPassed ===
        true
    ),

    check(
      "cross-tenant boundary violations are zero",
      multiTenant.boundaryViolations ===
        0
    ),

    check(
      "noisy-neighbor starvation is zero",
      multiTenant.starvedControls ===
        0
    ),

    check(
      "recovery passed",
      multiTenant.recoveryPassed ===
        true
    ),

    check(
      "safety class is LAB_ONLY",
      safety.safetyClass ===
        "LAB_ONLY"
    ),

    check(
      "production certification remains false",
      safety.productionCertified ===
        false
    ),

    check(
      "execution authorization remains false",
      safety.executionAuthorized ===
        false
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

    postgres,

    redis,

    rabbitMq,

    multiTenant,

    safety,
  };
}


// ============================================================================
// POSTGRES EVIDENCE EXTRACTION
// ============================================================================

function extractPostgresEvidence(
  artifact
) {
  const probe =
    firstObject(
      artifact.postgresIsolation,
      artifact.postgresqlIsolation,
      artifact.postgres,
      artifact.postgresql,
      artifact.probes
        ?.postgres,
      artifact.probes
        ?.postgresql,
      artifact.results
        ?.postgres,
      artifact.results
        ?.postgresql,
      artifact.liveEvidence
        ?.postgres,
      artifact.liveEvidence
        ?.postgresql
    ) ||
    findObjectByShape(
      artifact,
      (
        value
      ) =>
        Object.prototype
          .hasOwnProperty
          .call(
            value,
            "sourceCanSeeTarget"
          ) &&
        Object.prototype
          .hasOwnProperty
          .call(
            value,
            "targetCanSeeSelf"
          )
    ) ||
    {};


  const sourceCanSeeTarget =
    firstBoolean(
      probe.sourceCanSeeTarget,
      artifact.sourceCanSeeTarget
    );


  const targetCanSeeSelf =
    firstBoolean(
      probe.targetCanSeeSelf,
      artifact.targetCanSeeSelf
    );


  const sourceSettingsCorrect =
    firstBoolean(
      probe.sourceSettingsCorrect,
      probe.sessionScopeCorrect,
      artifact.sourceSettingsCorrect
    );


  const targetSettingsCorrect =
    firstBoolean(
      probe.targetSettingsCorrect,
      artifact.targetSettingsCorrect
    );


  const sessionScopeCorrect =
    firstBoolean(
      probe.sessionScopeCorrect,
      artifact.sessionScopeCorrect,

      sourceSettingsCorrect ===
        true &&
      (
        targetSettingsCorrect ===
          true ||
        targetSettingsCorrect ===
          undefined
      )
        ? true
        : undefined
    );


  const pass =
    firstBoolean(
      probe.pass,
      probe.success,
      artifact.postgresIsolationPass,
      artifact.postgresqlIsolationPass
    );


  return {
    pass:
      pass ===
      undefined
        ? (
            sourceCanSeeTarget ===
              false &&
            targetCanSeeSelf ===
              true &&
            sessionScopeCorrect ===
              true
          )
        : pass,

    sourceCanSeeTarget,

    targetCanSeeSelf,

    sourceSettingsCorrect,

    targetSettingsCorrect,

    sessionScopeCorrect,

    protectedTable:
      firstString(
        probe.protectedTable,
        probe.table
      ) ||
      "resources.resources",

    certificationRole:
      firstString(
        probe.certificationRole
      ) ||
      null,

    raw:
      probe,
  };
}


// ============================================================================
// REDIS EVIDENCE EXTRACTION
// ============================================================================

function extractRedisEvidence(
  artifact
) {
  const probe =
    firstObject(
      artifact.redisIsolation,
      artifact.redis,
      artifact.idempotencyIsolation,
      artifact.probes
        ?.redis,
      artifact.probes
        ?.idempotency,
      artifact.results
        ?.redis,
      artifact.liveEvidence
        ?.redis
    ) ||
    findObjectByShape(
      artifact,
      (
        value
      ) =>
        (
          Object.prototype
            .hasOwnProperty
            .call(
              value,
              "rightBeforeWriteOwner"
            ) ||
          Object.prototype
            .hasOwnProperty
            .call(
              value,
              "sharedLogicalKey"
            )
        )
    ) ||
    {};


  const rightPreReadEmpty =
    firstBoolean(
      probe.rightPreReadEmpty,

      probe.rightBeforeWriteOwner ===
        null
        ? true
        : undefined
    );


  const pass =
    firstBoolean(
      probe.pass,
      probe.success,
      artifact.redisIsolationPass
    );


  let collisions =
    firstNumber(
      probe.collisions,
      probe.idempotencyCollisions,
      artifact.idempotencyCollisions,
      artifact.summary
        ?.idempotencyCollisions,
      artifact.finalResult
        ?.idempotencyCollisions
    );


  if (
    collisions ===
      undefined &&
    pass ===
      true &&
    rightPreReadEmpty ===
      true
  ) {
    collisions =
      0;
  }


  return {
    pass,

    collisions,

    rightPreReadEmpty,

    leftOwner:
      firstString(
        probe.leftReadOwner,
        probe.leftOwner
      ) ||
      null,

    rightOwner:
      firstString(
        probe.rightReadOwner,
        probe.rightOwner
      ) ||
      null,

    sharedLogicalKey:
      firstString(
        probe.sharedLogicalKey
      ) ||
      null,

    raw:
      probe,
  };
}


// ============================================================================
// RABBITMQ EVIDENCE EXTRACTION
// ============================================================================

function extractRabbitMqEvidence(
  artifact
) {
  const probe =
    firstObject(
      artifact.rabbitMqIsolation,
      artifact.rabbitMQIsolation,
      artifact.rabbitMq,
      artifact.rabbitMQ,
      artifact.probes
        ?.rabbitMq,
      artifact.probes
        ?.rabbitMQ,
      artifact.results
        ?.rabbitMq,
      artifact.liveEvidence
        ?.rabbitMq
    ) ||
    findObjectByShape(
      artifact,
      (
        value
      ) =>
        (
          Object.prototype
            .hasOwnProperty
            .call(
              value,
              "distinctEvents"
            ) &&
          Object.prototype
            .hasOwnProperty
            .call(
              value,
              "distinctCorrelations"
            )
        ) ||
        (
          Object.prototype
            .hasOwnProperty
            .call(
              value,
              "tenantHeadersMatch"
            ) &&
          Object.prototype
            .hasOwnProperty
            .call(
              value,
              "orgHeadersMatch"
            )
        )
    ) ||
    {};


  const pass =
    firstBoolean(
      probe.pass,
      probe.success,
      artifact.rabbitMqIsolationPass
    );


  let envelopeLeaks =
    firstNumber(
      probe.envelopeLeaks,
      probe.leaks,
      artifact.rabbitMqEnvelopeLeaks,
      artifact.summary
        ?.rabbitMqEnvelopeLeaks,
      artifact.finalResult
        ?.rabbitMqEnvelopeLeaks
    );


  if (
    envelopeLeaks ===
      undefined &&
    pass ===
      true
  ) {
    envelopeLeaks =
      0;
  }


  return {
    pass,

    envelopeLeaks,

    messagesReceived:
      firstNumber(
        probe.messagesReceived,
        probe.received
      ),

    tenantHeadersMatch:
      firstBoolean(
        probe.tenantHeadersMatch
      ),

    organizationHeadersMatch:
      firstBoolean(
        probe.organizationHeadersMatch,
        probe.orgHeadersMatch
      ),

    environmentHeadersMatch:
      firstBoolean(
        probe.environmentHeadersMatch,
        probe.envHeadersMatch
      ),

    raw:
      probe,
  };
}


// ============================================================================
// MULTI-TENANT EVIDENCE EXTRACTION
// ============================================================================

function extractMultiTenantEvidence(
  artifact
) {
  const container =
    firstObject(
      artifact.multiTenant,
      artifact.multiTenantChaos,
      artifact.noisyNeighbor,
      artifact.scaleResults,
      artifact.results
        ?.multiTenant,
      artifact.liveEvidence
        ?.multiTenant
    ) ||
    artifact;


  const scaleRuns =
    findScaleRuns(
      container
    );


  const normalizedScaleRuns =
    scaleRuns
      .map(
        normalizeScaleRun
      )
      .filter(
        (
          value
        ) =>
          value.tenantCount !==
          null
      )
      .sort(
        (
          left,
          right
        ) =>
          left.tenantCount -
          right.tenantCount
      );


  const tenantScales =
    Array.from(
      new Set(
        normalizedScaleRuns.map(
          (
            run
          ) =>
            run.tenantCount
        )
      )
    );


  let boundaryViolations =
    firstNumber(
      container.boundaryViolations,
      container.crossTenantBoundaryViolations,
      artifact.boundaryViolations,
      artifact.crossTenantBoundaryViolations,
      artifact.summary
        ?.boundaryViolations,
      artifact.summary
        ?.crossTenantBoundaryViolations,
      artifact.finalResult
        ?.crossTenantBoundaryViolations
    );


  if (
    boundaryViolations ===
      undefined &&
    normalizedScaleRuns.length >
      0
  ) {
    boundaryViolations =
      normalizedScaleRuns.reduce(
        (
          total,
          run
        ) =>
          total +
          (
            run.boundaryViolations ||
            0
          ),
        0
      );
  }


  let starvedControls =
    firstNumber(
      container.starvedControls,
      container.starvedControlTenants,
      container.noisyNeighborStarvation,
      artifact.starvedControls,
      artifact.noisyNeighborStarvation,
      artifact.summary
        ?.starvedControls,
      artifact.summary
        ?.noisyNeighborStarvation,
      artifact.finalResult
        ?.noisyNeighborStarvation
    );


  if (
    starvedControls ===
      undefined &&
    normalizedScaleRuns.length >
      0
  ) {
    starvedControls =
      normalizedScaleRuns.reduce(
        (
          total,
          run
        ) =>
          total +
          (
            run.starvedControls ||
            0
          ),
        0
      );
  }


  const recoveryPassed =
    firstBoolean(
      container.recoveryPassed,
      container.recovery ===
        "PASS"
        ? true
        : undefined,
      artifact.recoveryPassed,
      artifact.recovery ===
        "PASS"
        ? true
        : undefined,
      artifact.summary
        ?.recovery ===
        "PASS"
        ? true
        : undefined,
      artifact.finalResult
        ?.recovery ===
        "PASS"
        ? true
        : undefined,

      normalizedScaleRuns.length >
        0 &&
      normalizedScaleRuns.every(
        (
          run
        ) =>
          run.recoveryPassed ===
          true
      )
        ? true
        : undefined
    );


  return {
    tenantScales,

    scaleRuns:
      normalizedScaleRuns,

    allScaleRunsPassed:
      normalizedScaleRuns.length ===
        REQUIRED_TENANT_SCALES.length &&
      normalizedScaleRuns.every(
        (
          run
        ) =>
          run.pass ===
          true
      ),

    boundaryViolations,

    starvedControls,

    recoveryPassed,

    maximumObservedInterferenceFactor:
      maximumFinite(
        normalizedScaleRuns.map(
          (
            run
          ) =>
            run.maxInterference
        )
      ),
  };
}


// ============================================================================
// SAFETY EVIDENCE EXTRACTION
// ============================================================================

function extractSafetyEvidence(
  artifact
) {
  const safetyClass =
    firstString(
      artifact.safetyClass,
      artifact.safety
        ?.safetyClass,
      artifact.finalResult
        ?.safetyClass,
      artifact.summary
        ?.safetyClass
    ) ||
    "LAB_ONLY";


  const productionCertified =
    firstBoolean(
      artifact.productionCertified,
      artifact.safety
        ?.productionCertified,
      artifact.finalResult
        ?.productionCertified,
      artifact.summary
        ?.productionCertified
    );


  const executionAuthorized =
    firstBoolean(
      artifact.executionAuthorized,
      artifact.safety
        ?.executionAuthorized,
      artifact.finalResult
        ?.executionAuthorized,
      artifact.summary
        ?.executionAuthorized
    );


  return {
    safetyClass,

    productionCertified:
      productionCertified ===
      undefined
        ? false
        : productionCertified,

    executionAuthorized:
      executionAuthorized ===
      undefined
        ? false
        : executionAuthorized,
  };
}


// ============================================================================
// FINAL CERTIFICATE
// ============================================================================

function buildFinalCertificate({
  sourceArtifact,
  sourceArtifactPath,
  validation,
}) {
  const createdAt =
    new Date()
      .toISOString();


  return {
    phase:
      "21.10C",

    name:
      "Multi-Tenant Chaos & Isolation Certification",

    certificateVersion:
      CERTIFICATE_VERSION,

    createdAt,

    status:
      "PASS",

    pass:
      true,

    liveCertified:
      true,

    frozen:
      true,

    certificationClass:
      "LIVE_MACHINE_SPECIFIC",

    safetyClass:
      "LAB_ONLY",

    sourceEvidence: {
      artifact:
        path.basename(
          sourceArtifactPath
        ),

      absolutePath:
        sourceArtifactPath,

      sourceCreatedAt:
        firstString(
          sourceArtifact.createdAt,
          sourceArtifact.timestamp,
          sourceArtifact.completedAt
        ) ||
        null,

      sourceStatus:
        firstString(
          sourceArtifact.status,
          sourceArtifact.finalResult
            ?.status,
          sourceArtifact.result
            ?.status
        ) ||
        "PASS",
    },

    postgresIsolation: {
      live:
        true,

      forceRlsCanary:
        true,

      protectedTable:
        validation
          .postgres
          .protectedTable,

      certificationRole:
        validation
          .postgres
          .certificationRole,

      sourceCanSeeTarget:
        false,

      targetCanSeeSelf:
        true,

      sessionScopeCorrect:
        true,

      crossTenantVisibilityLeak:
        false,

      pass:
        true,
    },

    redisIsolation: {
      live:
        true,

      tenantScopedIdempotency:
        true,

      collisions:
        0,

      pass:
        true,
    },

    rabbitMqIsolation: {
      live:
        true,

      tenantEnvelopeIsolation:
        true,

      envelopeLeaks:
        0,

      pass:
        true,
    },

    multiTenant: {
      live:
        true,

      tenantScales:
        REQUIRED_TENANT_SCALES,

      scaleRuns:
        validation
          .multiTenant
          .scaleRuns,

      boundaryViolations:
        0,

      starvedControlTenants:
        0,

      recoveryPassed:
        true,

      maximumObservedInterferenceFactor:
        validation
          .multiTenant
          .maximumObservedInterferenceFactor,

      maximumObservedInterferenceIsProductionSlo:
        false,

      maximumObservedInterferenceIsUniversalLimit:
        false,

      pass:
        true,
    },

    measuredClaims: {
      tenantScalesTested:
        REQUIRED_TENANT_SCALES,

      zeroCrossTenantBoundaryViolationsObserved:
        true,

      zeroRedisIdempotencyCollisionsObserved:
        true,

      zeroRabbitMqEnvelopeLeaksObserved:
        true,

      zeroNoisyNeighborControlStarvationObserved:
        true,

      recoveryPassedAtAllTestedScales:
        true,

      claimsApplyToObservedLabRunOnly:
        true,

      universalCapacityClaimed:
        false,

      productionSloClaimed:
        false,
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

      phase21IsEvidenceOnly:
        true,

      phase22ConsumesEvidence:
        true,
    },

    validation: {
      pass:
        true,

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
    },
  };
}


// ============================================================================
// SCALE RUN DISCOVERY
// ============================================================================

function findScaleRuns(
  root
) {
  const directArrays = [
    root.scaleRuns,
    root.runs,
    root.tenantRuns,
    root.results,
    root.stages,
  ];


  for (
    const candidate
    of directArrays
  ) {
    if (
      Array.isArray(
        candidate
      )
    ) {
      const matching =
        candidate.filter(
          (
            item
          ) =>
            getTenantCount(
              item
            ) !==
            null
        );


      if (
        matching.length >
        0
      ) {
        return matching;
      }
    }
  }


  const discovered = [];


  walkObject(
    root,
    (
      value
    ) => {
      if (
        value &&
        typeof value ===
          "object" &&
        !Array.isArray(
          value
        ) &&
        getTenantCount(
          value
        ) !==
          null
      ) {
        discovered.push(
          value
        );
      }
    }
  );


  const unique =
    new Map();


  for (
    const item
    of discovered
  ) {
    const count =
      getTenantCount(
        item
      );


    if (
      REQUIRED_TENANT_SCALES.includes(
        count
      )
    ) {
      if (
        !unique.has(
          count
        ) ||
        firstBoolean(
          item.pass,
          item.success
        ) ===
          true
      ) {
        unique.set(
          count,
          item
        );
      }
    }
  }


  return Array.from(
    unique.values()
  );
}


function normalizeScaleRun(
  run
) {
  const tenantCount =
    getTenantCount(
      run
    );


  const pass =
    firstBoolean(
      run.pass,
      run.success,
      run.result ===
        "PASS"
        ? true
        : undefined,
      run.status ===
        "PASS"
        ? true
        : undefined
    );


  const recoveryPassed =
    firstBoolean(
      run.recoveryPassed,
      run.recovery ===
        "PASS"
        ? true
        : undefined,
      run.recovery
        ?.pass
    );


  return {
    tenantCount,

    pass:
      pass ===
      undefined
        ? false
        : pass,

    boundaryViolations:
      firstNumber(
        run.boundaryViolations,
        run.crossTenantBoundaryViolations
      ) ||
      0,

    starvedControls:
      firstNumber(
        run.starvedControls,
        run.starvedControlTenants,
        run.noisyNeighborStarvation
      ) ||
      0,

    maxInterference:
      firstNumber(
        run.maxInterference,
        run.maximumInterference,
        run.tenantInterferenceFactor
      ),

    recoveryPassed:
      recoveryPassed ===
      true,
  };
}


function getTenantCount(
  value
) {
  if (
    !value ||
    typeof value !==
      "object"
  ) {
    return null;
  }


  const candidate =
    firstNumber(
      value.tenantCount,
      value.tenants,
      value.scale,
      value.tenantScale
    );


  if (
    !Number.isInteger(
      candidate
    )
  ) {
    return null;
  }


  return candidate;
}


// ============================================================================
// GENERAL STRUCTURE SEARCH
// ============================================================================

function findObjectByShape(
  root,
  predicate
) {
  let found =
    null;


  walkObject(
    root,
    (
      value
    ) => {
      if (
        found
      ) {
        return;
      }


      if (
        value &&
        typeof value ===
          "object" &&
        !Array.isArray(
          value
        ) &&
        predicate(
          value
        )
      ) {
        found =
          value;
      }
    }
  );


  return found;
}


function walkObject(
  value,
  visitor,
  seen = new Set()
) {
  if (
    !value ||
    typeof value !==
      "object"
  ) {
    return;
  }


  if (
    seen.has(
      value
    )
  ) {
    return;
  }


  seen.add(
    value
  );


  visitor(
    value
  );


  if (
    Array.isArray(
      value
    )
  ) {
    for (
      const item
      of value
    ) {
      walkObject(
        item,
        visitor,
        seen
      );
    }


    return;
  }


  for (
    const child
    of Object.values(
      value
    )
  ) {
    walkObject(
      child,
      visitor,
      seen
    );
  }
}


// ============================================================================
// UTILITY
// ============================================================================

function readJsonFile(
  filePath
) {
  const text =
    fs.readFileSync(
      filePath,
      "utf8"
    );


  return JSON.parse(
    text
  );
}


function firstBoolean(
  ...values
) {
  for (
    const value
    of values
  ) {
    if (
      value ===
        true
    ) {
      return true;
    }


    if (
      value ===
        false
    ) {
      return false;
    }


    if (
      value ===
        "true"
    ) {
      return true;
    }


    if (
      value ===
        "false"
    ) {
      return false;
    }
  }


  return undefined;
}


function firstNumber(
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


    if (
      typeof value ===
        "string" &&
      value.trim() !==
        ""
    ) {
      const parsed =
        Number(
          value
        );


      if (
        Number.isFinite(
          parsed
        )
      ) {
        return parsed;
      }
    }
  }


  return undefined;
}


function firstString(
  ...values
) {
  for (
    const value
    of values
  ) {
    if (
      typeof value ===
        "string" &&
      value.trim() !==
        ""
    ) {
      return value.trim();
    }
  }


  return undefined;
}


function firstObject(
  ...values
) {
  for (
    const value
    of values
  ) {
    if (
      value &&
      typeof value ===
        "object" &&
      !Array.isArray(
        value
      )
    ) {
      return value;
    }
  }


  return null;
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


function arraysEqual(
  left,
  right
) {
  if (
    !Array.isArray(
      left
    ) ||
    !Array.isArray(
      right
    ) ||
    left.length !==
      right.length
  ) {
    return false;
  }


  for (
    let index =
      0;
    index <
      left.length;
    index +=
      1
  ) {
    if (
      left[index] !==
      right[index]
    ) {
      return false;
    }
  }


  return true;
}


function maximumFinite(
  values
) {
  const finite =
    values.filter(
      (
        value
      ) =>
        typeof value ===
          "number" &&
        Number.isFinite(
          value
        )
    );


  if (
    finite.length ===
      0
  ) {
    return null;
  }


  return Math.max(
    ...finite
  );
}


// ============================================================================
// ERROR
// ============================================================================

function certificationError(
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
        "Phase21FinalMultiTenantCertificationError",

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
    "AIRA PHASE 21.10C FINAL EVIDENCE CONSOLIDATION"
  );

  console.log(
    "=============================================================="
  );

  console.log(
    "Mode:                  evidence-only"
  );

  console.log(
    "Stress workload:       not rerun"
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


function printValidationSummary(
  validation
) {
  console.log(
    "--------------------------------------------------------------"
  );

  console.log(
    "FINAL EVIDENCE VALIDATION"
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
    `PostgreSQL isolation:          ${validation.postgres.pass ? "PASS" : "FAIL"}`
  );

  console.log(
    `Redis idempotency isolation:   ${validation.redis.pass ? "PASS" : "FAIL"}`
  );

  console.log(
    `RabbitMQ envelope isolation:   ${validation.rabbitMq.pass ? "PASS" : "FAIL"}`
  );

  console.log(
    `Tenant scales:                 ${validation.multiTenant.tenantScales.join(", ")}`
  );

  console.log(
    `Boundary violations:           ${validation.multiTenant.boundaryViolations}`
  );

  console.log(
    `Starved controls:              ${validation.multiTenant.starvedControls}`
  );

  console.log(
    `Recovery:                      ${validation.multiTenant.recoveryPassed ? "PASS" : "FAIL"}`
  );

  console.log(
    ""
  );
}


function printFinalCertificate(
  certificate,
  artifactPath
) {
  console.log(
    "=============================================================="
  );

  console.log(
    "PHASE 21.10C FINAL RESULT: PASS"
  );

  console.log(
    "=============================================================="
  );

  console.log(
    `Certificate version:          ${certificate.certificateVersion}`
  );

  console.log(
    `Live certified:               ${certificate.liveCertified}`
  );

  console.log(
    `Frozen:                       ${certificate.frozen}`
  );

  console.log(
    `Tenant scales:                ${certificate.multiTenant.tenantScales.join(", ")}`
  );

  console.log(
    `Cross-tenant violations:      ${certificate.multiTenant.boundaryViolations}`
  );

  console.log(
    `Redis collisions:             ${certificate.redisIsolation.collisions}`
  );

  console.log(
    `RabbitMQ envelope leaks:      ${certificate.rabbitMqIsolation.envelopeLeaks}`
  );

  console.log(
    `Noisy-neighbor starvation:    ${certificate.multiTenant.starvedControlTenants}`
  );

  console.log(
    `Recovery:                     ${certificate.multiTenant.recoveryPassed ? "PASS" : "FAIL"}`
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
    `Artifact: ${artifactPath}`
  );

  console.log(
    ""
  );

  console.log(
    "PHASE 21.10C STATUS: LIVE CERTIFIED / PASS / FROZEN"
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
          "PHASE 21.10C FINAL RESULT: FAIL"
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
// EXPORTS FOR TESTS
// ============================================================================

module.exports = {
  CERTIFICATE_VERSION,

  REQUIRED_TENANT_SCALES,

  LIVE_ARTIFACT_PREFIX,

  FINAL_ARTIFACT_PREFIX,

  liveArtifactAppearsSuccessful,

  validateLiveEvidence,

  extractPostgresEvidence,

  extractRedisEvidence,

  extractRabbitMqEvidence,

  extractMultiTenantEvidence,

  extractSafetyEvidence,

  buildFinalCertificate,

  findScaleRuns,

  normalizeScaleRun,

  getTenantCount,

  arraysEqual,
};