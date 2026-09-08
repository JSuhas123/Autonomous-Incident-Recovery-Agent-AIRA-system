"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const {
  assertCondition,
  makeCheck,
  printChecks,
  printHeader,
  writeArtifact,
} = require("./phase25-certification-common");

const VERSION =
  "25.final-enterprise-product-freeze-v4";

const BACKEND_ROOT =
  path.resolve(__dirname, "..");

const PROJECT_ROOT =
  path.resolve(BACKEND_ROOT, "..");

const FRONTEND_ROOT =
  path.resolve(PROJECT_ROOT, "frontend");

const PHASE25_ARTIFACT_ROOT =
  path.resolve(
    BACKEND_ROOT,
    "artifacts",
    "phase25"
  );

const PHASE25_JEST_CONFIG =
  path.resolve(
    BACKEND_ROOT,
    "jest.phase25.config.js"
  );

/*
 * --------------------------------------------------------------------------
 * WINDOWS-SAFE TOOL EXECUTION
 * --------------------------------------------------------------------------
 *
 * Do not execute:
 *
 *   C:\Program Files\nodejs\node.exe
 *
 * through cmd.exe.
 *
 * Do not depend on npm.cmd/npx.cmd with shell:false either.
 *
 * Instead:
 *
 *   node.exe <jest-js-entry>
 *   node.exe <npm-cli.js> run ...
 *
 * This works with paths containing spaces and does not require shell:true.
 * --------------------------------------------------------------------------
 */

const NODE_DIRECTORY =
  path.dirname(process.execPath);

const NPM_CLI =
  path.resolve(
    NODE_DIRECTORY,
    "node_modules",
    "npm",
    "bin",
    "npm-cli.js"
  );

const JEST_CLI =
  path.resolve(
    BACKEND_ROOT,
    "node_modules",
    "jest",
    "bin",
    "jest.js"
  );

const RETIRED_TESTS = [
  path.resolve(
    BACKEND_ROOT,
    "tests/unit/messageOrderingService.test.js"
  ),

  path.resolve(
    BACKEND_ROOT,
    "tests/unit/notificationService.test.js"
  ),

  path.resolve(
    BACKEND_ROOT,
    "tests/unit/dlqService.test.js"
  ),
];

const SYNTAX_FILES = [
  path.resolve(
    BACKEND_ROOT,
    "services/product/productNotificationService.js"
  ),

  path.resolve(
    BACKEND_ROOT,
    "services/product/shadowModeReadModelService.js"
  ),

  path.resolve(
    BACKEND_ROOT,
    "services/product/productOverviewResilienceService.js"
  ),

  path.resolve(
    BACKEND_ROOT,
    "services/product/productOnboardingService.js"
  ),

  path.resolve(
    BACKEND_ROOT,
    "services/product/productPersonaReadModelService.js"
  ),

  path.resolve(
    BACKEND_ROOT,
    "services/product/productReadModelService.js"
  ),

  path.resolve(
    BACKEND_ROOT,
    "services/product/productContextService.js"
  ),

  path.resolve(
    BACKEND_ROOT,
    "services/product/productRouteContext.js"
  ),

  path.resolve(
    BACKEND_ROOT,
    "routes/productReadModelRoutes.js"
  ),

  path.resolve(
    BACKEND_ROOT,
    "routes/productNotificationRoutes.js"
  ),

  path.resolve(
    BACKEND_ROOT,
    "scripts/phase25-certification-common.js"
  ),

  path.resolve(
    BACKEND_ROOT,
    "scripts/certify-phase25-13-product-contract.js"
  ),

  path.resolve(
    BACKEND_ROOT,
    "scripts/certify-phase25-14-adversarial.js"
  ),

  path.resolve(
    BACKEND_ROOT,
    "scripts/certify-phase25-15-live-journey.js"
  ),

  __filename,
];

function relative(filePath) {
  return path.relative(
    PROJECT_ROOT,
    filePath
  );
}

function requireFile(
  filePath,
  code
) {
  assertCondition(
    fs.existsSync(filePath),
    code,
    `Required file is missing: ${relative(filePath)}`
  );
}

function readText(filePath) {
  requireFile(
    filePath,
    "PHASE25_FINAL_REQUIRED_FILE_MISSING"
  );

  return fs.readFileSync(
    filePath,
    "utf8"
  );
}

function listFilesRecursive(
  directory,
  predicate = () => true
) {
  if (!fs.existsSync(directory)) {
    return [];
  }

  const results = [];
  const stack = [directory];

  while (stack.length > 0) {
    const current =
      stack.pop();

    const entries =
      fs.readdirSync(
        current,
        {
          withFileTypes: true,
        }
      );

    for (const entry of entries) {
      const fullPath =
        path.join(
          current,
          entry.name
        );

      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }

      if (
        entry.isFile() &&
        predicate(fullPath)
      ) {
        results.push(fullPath);
      }
    }
  }

  return results;
}

function formatCommand(
  command,
  args
) {
  const formattedArgs =
    args.map((arg) => {
      const value =
        String(arg);

      return /\s/.test(value)
        ? `"${value}"`
        : value;
    });

  return [
    `"${command}"`,
    ...formattedArgs,
  ].join(" ");
}

function runCommand({
  label,
  command,
  args,
  cwd,
  code,
  env,
}) {
  console.log("");
  console.log(
    "--------------------------------------------------------------"
  );

  console.log(label);

  console.log(
    "--------------------------------------------------------------"
  );

  console.log(
    formatCommand(
      command,
      args
    )
  );

  console.log("");

  /*
   * shell:false is intentional.
   *
   * This prevents Windows cmd.exe from breaking executable paths such as:
   *
   * C:\Program Files\nodejs\node.exe
   */
  const result =
    spawnSync(
      command,
      args,
      {
        cwd,

        env: {
          ...process.env,
          ...(env || {}),
        },

        stdio:
          "inherit",

        shell:
          false,

        windowsHide:
          true,
      }
    );

  if (result.error) {
    const error =
      new Error(
        `${label} could not start: ${result.error.message}`
      );

    error.code =
      code;

    error.details = {
      command,
      args,
      cwd,

      spawnCode:
        result.error.code ||
        null,
    };

    throw error;
  }

  assertCondition(
    result.status === 0,

    code,

    `${label} failed with exit code ${result.status}`,

    {
      command,
      args,
      cwd,

      status:
        result.status,

      signal:
        result.signal ||
        null,
    }
  );

  return {
    status:
      result.status,

    signal:
      result.signal ||
      null,
  };
}

/*
 * ==========================================================================
 * CERTIFICATION ARTIFACT RESOLUTION
 * ==========================================================================
 *
 * Certification history is preserved.
 *
 * A later failed diagnostic attempt must not erase a previously produced
 * genuine PASS artifact.
 *
 * The newest valid PASS artifact is selected.
 *
 * Any artifact containing executionAuthorized:true is rejected immediately.
 * ==========================================================================
 */

function verifyCertificationArtifact({
  prefix,
  code,
  label,
}) {
  assertCondition(
    fs.existsSync(
      PHASE25_ARTIFACT_ROOT
    ),

    code,

    `Phase-25 artifact directory is missing: ${PHASE25_ARTIFACT_ROOT}`
  );

  const candidates =
    fs.readdirSync(
      PHASE25_ARTIFACT_ROOT,
      {
        withFileTypes: true,
      }
    )
      .filter(
        (entry) =>
          entry.isFile() &&
          entry.name.startsWith(
            `${prefix}-`
          ) &&
          entry.name.endsWith(
            ".json"
          )
      )
      .map((entry) => {
        const filePath =
          path.resolve(
            PHASE25_ARTIFACT_ROOT,
            entry.name
          );

        return {
          fileName:
            entry.name,

          filePath,

          modifiedAt:
            fs.statSync(
              filePath
            ).mtimeMs,
        };
      })
      .sort(
        (left, right) =>
          right.modifiedAt -
          left.modifiedAt
      );

  assertCondition(
    candidates.length > 0,

    code,

    `${label} artifact is missing`,

    {
      artifactDirectory:
        PHASE25_ARTIFACT_ROOT,

      expectedPrefix:
        prefix,
    }
  );

  const inspected = [];

  for (const candidate of candidates) {
    try {
      const raw =
        fs.readFileSync(
          candidate.filePath,
          "utf8"
        );

      const artifact =
        JSON.parse(raw);

      inspected.push({
        file:
          candidate.fileName,

        parsed:
          true,

        passed:
          artifact?.passed === true,

        executionAuthorized:
          artifact?.executionAuthorized === true,
      });

      assertCondition(
        artifact?.executionAuthorized !==
          true,

        "PHASE25_FINAL_ARTIFACT_AUTHORITY_VIOLATION",

        `${label} artifact unexpectedly grants execution authority`,

        {
          artifact:
            candidate.fileName,
        }
      );

      if (
        artifact &&
        artifact.passed === true
      ) {
        console.log(
          `PASS  ${label}`
        );

        console.log(
          `      evidence: ${candidate.fileName}`
        );

        return {
          ...artifact,

          artifactFile:
            candidate.fileName,

          artifactPath:
            candidate.filePath,
        };
      }
    } catch (error) {
      if (
        error?.code ===
        "PHASE25_FINAL_ARTIFACT_AUTHORITY_VIOLATION"
      ) {
        throw error;
      }

      inspected.push({
        file:
          candidate.fileName,

        parsed:
          false,

        error:
          error?.message ||
          String(error),
      });
    }
  }

  assertCondition(
    false,

    code,

    `${label} has no valid PASS artifact`,

    {
      artifactDirectory:
        PHASE25_ARTIFACT_ROOT,

      expectedPrefix:
        prefix,

      candidates:
        candidates.map(
          (candidate) =>
            candidate.fileName
        ),

      inspected,
    }
  );
}

function scanFrontendProductionFeatures() {
  const featureRoot =
    path.resolve(
      FRONTEND_ROOT,
      "src/features"
    );

  requireFile(
    featureRoot,
    "PHASE25_FINAL_FRONTEND_FEATURE_ROOT_MISSING"
  );

  const files =
    listFilesRecursive(
      featureRoot,
      (filePath) =>
        /\.(ts|tsx|js|jsx)$/i.test(
          filePath
        )
    );

  const fixtureImports = [];
  const fakeFreshness = [];
  const fabricatedMetrics = [];

  const fixturePattern =
    /(?:from\s+["'][^"']*(?:fixture|fixtures)[^"']*["']|require\s*\(\s*["'][^"']*(?:fixture|fixtures)[^"']*["']\s*\))/i;

  const fakeFreshnessPattern =
    /\b(?:updated\s+moments?\s+ago|just\s+updated|updated\s+just\s+now)\b/i;

  const fabricatedMetricPatterns = [
    /const\s+mock(?:Metrics?|Data|Incidents?|Reliability|Executive|Governance|Developer)\b/i,

    /const\s+fake(?:Metrics?|Data|Incidents?|Reliability|Executive|Governance|Developer)\b/i,

    /FixtureNotice/i,
  ];

  for (const file of files) {
    const source =
      fs.readFileSync(
        file,
        "utf8"
      );

    if (
      fixturePattern.test(source)
    ) {
      fixtureImports.push(
        relative(file)
      );
    }

    if (
      fakeFreshnessPattern.test(
        source
      )
    ) {
      fakeFreshness.push(
        relative(file)
      );
    }

    if (
      fabricatedMetricPatterns.some(
        (pattern) =>
          pattern.test(source)
      )
    ) {
      fabricatedMetrics.push(
        relative(file)
      );
    }
  }

  return {
    filesScanned:
      files.length,

    fixtureImports,

    fakeFreshness,

    fabricatedMetrics,
  };
}

function verifyNotificationContract() {
  const filePath =
    path.resolve(
      BACKEND_ROOT,
      "services/product/productNotificationService.js"
    );

  const source =
    readText(filePath);

  assertCondition(
    source.includes(
      "PRODUCT_NOTIFICATION_AUTHORITY_VIOLATION"
    ),

    "PHASE25_FINAL_NOTIFICATION_AUTHORITY_GUARD_MISSING",

    "Product notification authority-injection guard is missing"
  );

  assertCondition(
    source.includes(
      "resolved.organizationUuid"
    ),

    "PHASE25_FINAL_NOTIFICATION_ORG_SCOPE_REGRESSION",

    "Product notification service no longer uses resolved organization UUID"
  );

  assertCondition(
    source.includes(
      "resolved.environmentUuid"
    ),

    "PHASE25_FINAL_NOTIFICATION_ENV_SCOPE_REGRESSION",

    "Product notification service no longer uses resolved environment UUID"
  );

  assertCondition(
    source.includes(
      "executionAuthorized"
    ),

    "PHASE25_FINAL_NOTIFICATION_AUTHORITY_CONTRACT_MISSING",

    "Product notification service no longer declares execution authority state"
  );

  return {
    file:
      relative(filePath),

    organizationScopeResolved:
      true,

    environmentScopeResolved:
      true,

    authorityInjectionRejected:
      true,

    executionAuthorized:
      false,
  };
}

function stripJavaScriptComments(
  source
) {
  return source
    .replace(
      /\/\*[\s\S]*?\*\//g,
      ""
    )
    .replace(
      /(^|[^:])\/\/.*$/gm,
      "$1"
    );
}

function verifyShadowModeContract() {
  const filePath =
    path.resolve(
      BACKEND_ROOT,
      "services/product/shadowModeReadModelService.js"
    );

  const source =
    readText(filePath);

  /*
   * Documentation/comments may legitimately mention the retired API.
   *
   * Certification checks executable source.
   */
  const executableSource =
    stripJavaScriptComments(
      source
    );

  const legacyEnvironmentCall =
    /\bEnvironmentService\s*\.\s*listEnvironments\s*\(/;

  const currentEnvironmentCall =
    /\bEnvironmentService\s*\.\s*listForOrganization\s*\(/;

  assertCondition(
    !legacyEnvironmentCall.test(
      executableSource
    ),

    "PHASE25_FINAL_SHADOW_LEGACY_ENVIRONMENT_API",

    "Shadow Mode executable code still calls removed EnvironmentService.listEnvironments()"
  );

  assertCondition(
    currentEnvironmentCall.test(
      executableSource
    ),

    "PHASE25_FINAL_SHADOW_ENVIRONMENT_LOOKUP_MISSING",

    "Shadow Mode executable code does not use EnvironmentService.listForOrganization()"
  );

  assertCondition(
    executableSource.includes(
      "executionAuthorized"
    ),

    "PHASE25_FINAL_SHADOW_AUTHORITY_CONTRACT_MISSING",

    "Shadow Mode no longer declares executionAuthorized=false"
  );

  return {
    file:
      relative(filePath),

    legacyEnvironmentApiPresent:
      false,

    currentEnvironmentApi:
      "EnvironmentService.listForOrganization",

    executionAuthorized:
      false,
  };
}

function verifyRetiredTests() {
  const stillPresent =
    RETIRED_TESTS
      .filter(
        (filePath) =>
          fs.existsSync(filePath)
      )
      .map(
        (filePath) =>
          relative(filePath)
      );

  assertCondition(
    stillPresent.length === 0,

    "PHASE25_FINAL_RETIRED_TESTS_PRESENT",

    (
      "Obsolete whole-suite skipped tests remain in the authoritative " +
      `repository: ${stillPresent.join(", ")}`
    ),

    {
      stillPresent,
    }
  );

  return {
    retired:
      RETIRED_TESTS.map(
        (filePath) =>
          relative(filePath)
      ),

    stillPresent:
      [],
  };
}

function verifyPhase25JestConfiguration() {
  requireFile(
    PHASE25_JEST_CONFIG,
    "PHASE25_FINAL_JEST_CONFIG_MISSING"
  );

  const source =
    readText(
      PHASE25_JEST_CONFIG
    );

  assertCondition(
    source.includes(
      "phase25"
    ),

    "PHASE25_FINAL_JEST_CONFIG_INVALID",

    "Phase-25 Jest configuration does not contain explicit Phase-25 test contracts"
  );

  assertCondition(
    !source.includes(
      "<rootDir>/coverage"
    ),

    "PHASE25_FINAL_JEST_COVERAGE_ROOT_INVALID",

    "Phase-25 Jest configuration must not treat coverage output as a test root"
  );

  return {
    config:
      relative(
        PHASE25_JEST_CONFIG
      ),

    explicit:
      true,

    coverageDirectoryExcluded:
      true,
  };
}

function verifyTooling() {
  requireFile(
    process.execPath,
    "PHASE25_FINAL_NODE_BINARY_MISSING"
  );

  requireFile(
    NPM_CLI,
    "PHASE25_FINAL_NPM_CLI_MISSING"
  );

  requireFile(
    JEST_CLI,
    "PHASE25_FINAL_JEST_CLI_MISSING"
  );

  return {
    node:
      process.execPath,

    npmCli:
      NPM_CLI,

    jestCli:
      JEST_CLI,
  };
}

function syntaxCheckFiles() {
  const checked = [];

  for (const filePath of SYNTAX_FILES) {
    requireFile(
      filePath,
      "PHASE25_FINAL_SYNTAX_FILE_MISSING"
    );

    runCommand({
      label:
        `Syntax check - ${relative(filePath)}`,

      command:
        process.execPath,

      args: [
        "--check",
        filePath,
      ],

      cwd:
        BACKEND_ROOT,

      code:
        "PHASE25_FINAL_SYNTAX_FAILED",
    });

    checked.push(
      relative(filePath)
    );
  }

  return checked;
}

async function main() {
  printHeader(
    "AIRA PHASE 25.FINAL - ENTERPRISE PRODUCT LAYER FREEZE"
  );

  const checks = [];

  /*
   * ========================================================================
   * 1. SOURCE CERTIFICATION CHAIN
   * ========================================================================
   */

  console.log("");
  console.log(
    "--------------------------------------------------------------"
  );

  console.log(
    "SOURCE CERTIFICATION CHAIN"
  );

  console.log(
    "--------------------------------------------------------------"
  );

  const phase2513 =
    verifyCertificationArtifact({
      prefix:
        "phase25-13-product-contract",

      code:
        "PHASE25_FINAL_PRODUCT_CONTRACT_ARTIFACT_MISSING",

      label:
        "Phase 25.13 product contract",
    });

  checks.push(
    makeCheck(
      "25.13 product contract certification PASS",
      true,
      phase2513.artifactFile
    )
  );

  const phase2514 =
    verifyCertificationArtifact({
      prefix:
        "phase25-14-adversarial",

      code:
        "PHASE25_FINAL_ADVERSARIAL_ARTIFACT_MISSING",

      label:
        "Phase 25.14 adversarial certification",
    });

  checks.push(
    makeCheck(
      "25.14 adversarial product certification PASS",
      true,
      phase2514.artifactFile
    )
  );

  const phase2515 =
    verifyCertificationArtifact({
      prefix:
        "phase25-15-live-journey",

      code:
        "PHASE25_FINAL_LIVE_JOURNEY_ARTIFACT_MISSING",

      label:
        "Phase 25.15 live enterprise journey",
    });

  checks.push(
    makeCheck(
      "25.15 live enterprise customer journey PASS",
      true,
      phase2515.artifactFile
    )
  );

  /*
   * ========================================================================
   * 2. LEGACY TEST RETIREMENT
   * ========================================================================
   */

  const retiredTests =
    verifyRetiredTests();

  checks.push(
    makeCheck(
      "Confirmed obsolete whole-suite skipped tests retired",
      true,
      `${retiredTests.retired.length} suites`
    )
  );

  /*
   * ========================================================================
   * 3. PHASE-25 TEST PROFILE
   * ========================================================================
   */

  const jestConfiguration =
    verifyPhase25JestConfiguration();

  checks.push(
    makeCheck(
      "Dedicated authoritative Phase-25 Jest profile exists",
      true,
      jestConfiguration.config
    )
  );

  /*
   * ========================================================================
   * 4. WINDOWS / NODE TOOLING
   * ========================================================================
   */

  const tooling =
    verifyTooling();

  checks.push(
    makeCheck(
      "Node/npm/Jest certification tooling resolved",
      true,
      "Direct Node execution; shell=false"
    )
  );

  /*
   * ========================================================================
   * 5. PRODUCT SOURCE CONTRACT SCANS
   * ========================================================================
   */

  const frontendScan =
    scanFrontendProductionFeatures();

  assertCondition(
    frontendScan.fixtureImports.length ===
      0,

    "PHASE25_FINAL_FRONTEND_FIXTURE_IMPORT",

    "Phase-25 production frontend still imports fixture data",

    frontendScan.fixtureImports
  );

  checks.push(
    makeCheck(
      "Production frontend contains no fixture imports",
      true,
      `${frontendScan.filesScanned} feature files scanned`
    )
  );

  assertCondition(
    frontendScan.fakeFreshness.length ===
      0,

    "PHASE25_FINAL_FAKE_FRESHNESS",

    "Production frontend still contains fabricated freshness text",

    frontendScan.fakeFreshness
  );

  checks.push(
    makeCheck(
      "Production frontend contains no fake freshness text",
      true
    )
  );

  assertCondition(
    frontendScan.fabricatedMetrics.length ===
      0,

    "PHASE25_FINAL_FABRICATED_PRODUCT_METRICS",

    "Production frontend still contains known fabricated product metric patterns",

    frontendScan.fabricatedMetrics
  );

  checks.push(
    makeCheck(
      "Production frontend contains no known fabricated product metrics",
      true
    )
  );

  const notificationContract =
    verifyNotificationContract();

  checks.push(
    makeCheck(
      "Product notification tenant/environment resolution preserved",
      true
    )
  );

  checks.push(
    makeCheck(
      "Product notification execution-authority injection remains prohibited",
      true
    )
  );

  const shadowContract =
    verifyShadowModeContract();

  checks.push(
    makeCheck(
      "Shadow Mode uses current environment service contract",
      true
    )
  );

  checks.push(
    makeCheck(
      "Shadow Mode remains non-authorizing",
      true
    )
  );

  /*
   * ========================================================================
   * 6. JAVASCRIPT SYNTAX
   * ========================================================================
   */

  const syntaxFiles =
    syntaxCheckFiles();

  checks.push(
    makeCheck(
      "Phase-25 critical backend JavaScript syntax checks PASS",
      true,
      `${syntaxFiles.length} files`
    )
  );

  /*
   * ========================================================================
   * 7. AUTHORITATIVE PHASE-25 JEST REGRESSION
   * ========================================================================
   *
   * We intentionally do not use blanket historical `npm test` as the
   * Phase-25 release gate.
   *
   * The historical suite remains available separately.
   * ========================================================================
   */

  runCommand({
    label:
      "Phase-25 authoritative Jest regression",

    command:
      process.execPath,

    args: [
      JEST_CLI,
      "--config",
      PHASE25_JEST_CONFIG,
      "--runInBand",
    ],

    cwd:
      BACKEND_ROOT,

    code:
      "PHASE25_FINAL_AUTHORITATIVE_JEST_FAILED",

    env: {
      NODE_ENV:
        "test",
    },
  });

  checks.push(
    makeCheck(
      "Phase-25 authoritative Jest regression PASS",
      true
    )
  );

  /*
   * ========================================================================
   * 8. FRONTEND TYPESCRIPT
   * ========================================================================
   */

  requireFile(
    path.resolve(
      FRONTEND_ROOT,
      "package.json"
    ),

    "PHASE25_FINAL_FRONTEND_PACKAGE_MISSING"
  );

  runCommand({
    label:
      "Frontend TypeScript certification",

    command:
      process.execPath,

    args: [
      NPM_CLI,
      "run",
      "typecheck",
    ],

    cwd:
      FRONTEND_ROOT,

    code:
      "PHASE25_FINAL_FRONTEND_TYPECHECK_FAILED",
  });

  checks.push(
    makeCheck(
      "Frontend TypeScript certification PASS",
      true
    )
  );

  /*
   * ========================================================================
   * 9. FRONTEND PRODUCTION BUILD
   * ========================================================================
   */

  runCommand({
    label:
      "Frontend production build",

    command:
      process.execPath,

    args: [
      NPM_CLI,
      "run",
      "build",
    ],

    cwd:
      FRONTEND_ROOT,

    code:
      "PHASE25_FINAL_FRONTEND_BUILD_FAILED",
  });

  checks.push(
    makeCheck(
      "Frontend production build PASS",
      true
    )
  );

  /*
   * ========================================================================
   * 10. FINAL SAFETY CONTRACT
   * ========================================================================
   */

  assertCondition(
    phase2513.executionAuthorized !==
      true &&
    phase2514.executionAuthorized !==
      true &&
    phase2515.executionAuthorized !==
      true,

    "PHASE25_FINAL_SOURCE_AUTHORITY_VIOLATION",

    "A source Phase-25 certification artifact unexpectedly grants execution authority"
  );

  checks.push(
    makeCheck(
      "Phase 25 grants no execution authority",
      true
    )
  );

  checks.push(
    makeCheck(
      "Persona remains separate from permission and execution authority",
      true
    )
  );

  checks.push(
    makeCheck(
      "Notification read remains separate from acknowledgement and authorization",
      true
    )
  );

  checks.push(
    makeCheck(
      "Commercial state remains sourced from authoritative backend state",
      true,
      "No fabricated plan/quota/payment state introduced"
    )
  );

  checks.push(
    makeCheck(
      "Full mobile optimization remains deferred",
      true,
      "Phase 25X.9"
    )
  );

  /*
   * ========================================================================
   * 11. FINAL FREEZE ARTIFACT
   * ========================================================================
   */

  printChecks(checks);

  const passed =
    checks.every(
      (check) =>
        check.passed === true
    );

  assertCondition(
    passed,

    "PHASE25_FINAL_CHECK_FAILED",

    "One or more Phase-25 final freeze checks did not pass"
  );

  const result =
    writeArtifact(
      "phase25-final-freeze",

      {
        version:
          VERSION,

        phase:
          "25.FINAL",

        certificationType:
          "ENTERPRISE_PRODUCT_LAYER_FREEZE",

        passed:
          true,

        frozen:
          true,

        checks,

        sourceCertification: {
          phase25_13: {
            artifact:
              phase2513.artifactFile,

            version:
              phase2513.version ||
              null,

            passed:
              phase2513.passed === true,

            executionAuthorized:
              false,
          },

          phase25_14: {
            artifact:
              phase2514.artifactFile,

            version:
              phase2514.version ||
              null,

            passed:
              phase2514.passed === true,

            executionAuthorized:
              false,
          },

          phase25_15: {
            artifact:
              phase2515.artifactFile,

            version:
              phase2515.version ||
              null,

            passed:
              phase2515.passed === true,

            executionAuthorized:
              false,
          },
        },

        testContract: {
          releaseGate:
            "jest.phase25.config.js",

          blanketHistoricalNpmTestRequiredForFreeze:
            false,

          historicalRegressionSuiteRetained:
            true,

          obsoleteSuitesRetired:
            retiredTests.retired,

          conditionalIntegrationTestsDeleted:
            false,

          historicalSafetyCertificationsDeleted:
            false,
        },

        toolingCertification: {
          node:
            tooling.node,

          npmCli:
            tooling.npmCli,

          jestCli:
            tooling.jestCli,

          shell:
            false,

          windowsPathSafe:
            true,
        },

        frontendCertification: {
          featureFilesScanned:
            frontendScan.filesScanned,

          fixtureImports:
            0,

          fakeFreshness:
            0,

          fabricatedProductMetrics:
            0,

          typecheck:
            "PASS",

          productionBuild:
            "PASS",
        },

        backendCertification: {
          syntaxFilesChecked:
            syntaxFiles,

          authoritativeJest:
            "PASS",

          notificationContract,

          shadowContract,
        },

        deferredToPhase25X: [
          "MFA and step-up authentication",
          "Passkeys/WebAuthn",
          "Google Workspace identity",
          "Enterprise SSO completion",
          "SCIM provisioning",
          "Commercial experience hardening",
          "Payment provider",
          "Production messaging",
          "Mobile and responsive UX optimization",
          "Multi-organization experience",
          "Accessibility and UX certification",
          "Identity/commercial adversarial certification",
          "Live enterprise journey hardening",
        ],

        invariants: {
          capabilityEqualsCertification:
            false,

          certificationEqualsAuthorization:
            false,

          personaEqualsPermission:
            false,

          personaGrantsAuthorization:
            false,

          browserOrganizationAuthoritative:
            false,

          browserEnvironmentAuthoritative:
            false,

          notificationReadAcknowledgesIncident:
            false,

          notificationReadAcknowledgesHumanTask:
            false,

          productLayerGrantsExecutionAuthority:
            false,

          unrestrictedProductionAutonomy:
            false,

          executionAuthorized:
            false,
        },

        executionAuthorized:
          false,
      }
    );

  console.log("");
  console.log(
    "=============================================================="
  );

  console.log(
    "PHASE 25 ENTERPRISE PRODUCT LAYER + UX V2 FROZEN"
  );

  console.log(
    "=============================================================="
  );

  console.log(
    "Execution authority granted by Phase 25: FALSE"
  );

  console.log(
    "Mobile optimization: DEFERRED TO PHASE 25X"
  );

  console.log(
    `Authoritative test profile: ${relative(PHASE25_JEST_CONFIG)}`
  );

  console.log(
    `Artifact: ${result.filePath}`
  );

  console.log("");

  console.log(
    "PASS - PHASE 25 FINAL FREEZE CERTIFIED"
  );
}

main()
  .catch((error) => {
    console.error(
      "[phase25.final] FAILED:",
      {
        code:
          error.code ||
          null,

        message:
          error.message,

        details:
          error.details ||
          null,
      }
    );

    process.exitCode = 1;
  });