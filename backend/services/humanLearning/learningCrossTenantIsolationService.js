"use strict";


const {
  ISOLATION_CHECK,

  assertGeneralizationCannotAuthorize,
} =
  require(
    "../../contracts/humanLearningGeneralization"
  );


function stringify(
  value
) {
  return JSON.stringify(
    value ||
    {}
  ).toLowerCase();
}


class LearningCrossTenantIsolationService {
  evaluate(
    input = {}
  ) {
    assertGeneralizationCannotAuthorize(
      input
    );


    const candidate =
      input.generalizedCandidate ||
      {};


    const serialized =
      stringify(
        candidate
      );


    const identifiers =
      Array.isArray(
        input.tenantIdentifiers
      )
        ? input.tenantIdentifiers
        : [];


    const sourceIdentifiers =
      Array.isArray(
        input.sourceIdentifiers
      )
        ? input.sourceIdentifiers
        : [];


    const checks =
      [];


    const tenantFindings =
      identifiers
        .filter(
          (
            value
          ) =>
            typeof value ===
              "string"
            &&
            value.trim()
            &&
            serialized.includes(
              value
                .trim()
                .toLowerCase()
            )
        )
        .map(
          () => ({
            type:
              "TENANT_IDENTIFIER_PRESENT",
          })
        );


    checks.push({
      checkType:
        ISOLATION_CHECK
          .TENANT_IDENTIFIER_LEAKAGE,

      passed:
        tenantFindings.length ===
          0,

      findings:
        tenantFindings,
    });


    const sourceFindings =
      sourceIdentifiers
        .filter(
          (
            value
          ) =>
            typeof value ===
              "string"
            &&
            value.trim()
            &&
            serialized.includes(
              value
                .trim()
                .toLowerCase()
            )
        )
        .map(
          () => ({
            type:
              "SOURCE_IDENTITY_PRESENT",
          })
        );


    checks.push({
      checkType:
        ISOLATION_CHECK
          .SOURCE_IDENTITY_LEAKAGE,

      passed:
        sourceFindings.length ===
          0,

      findings:
        sourceFindings,
    });


    const secretPatterns = [
      /-----begin [a-z ]*private key-----/i,

      /\bbearer\s+[a-z0-9._~+/=-]{12,}\b/i,

      /\b(?:api[_-]?key|client[_-]?secret|password)\s*[:=]\s*[^\s,}]+/i,

      /\b(?:aws_secret_access_key|aws_access_key_id)\b/i,
    ];


    const secretFindings =
      secretPatterns
        .filter(
          (
            pattern
          ) =>
            pattern.test(
              serialized
            )
        )
        .map(
          () => ({
            type:
              "SECRET_PATTERN_PRESENT",
          })
        );


    checks.push({
      checkType:
        ISOLATION_CHECK
          .SECRET_LEAKAGE,

      passed:
        secretFindings.length ===
          0,

      findings:
        secretFindings,
    });


    const topologyPatterns = [
      /\b10\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/,

      /\b192\.168\.\d{1,3}\.\d{1,3}\b/,

      /\b172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}\b/,

      /\b[a-z0-9.-]+\.(?:internal|local|corp|lan)\b/i,
    ];


    const topologyFindings =
      topologyPatterns
        .filter(
          (
            pattern
          ) =>
            pattern.test(
              serialized
            )
        )
        .map(
          () => ({
            type:
              "PRIVATE_TOPOLOGY_PRESENT",
          })
        );


    checks.push({
      checkType:
        ISOLATION_CHECK
          .TOPOLOGY_LEAKAGE,

      passed:
        topologyFindings.length ===
          0,

      findings:
        topologyFindings,
    });


    const retrievalPassed =
      candidate.knowledgeScope ===
        "GLOBAL"

      &&

      candidate.truthLevel ===
        "CANDIDATE"

      &&

      candidate.publicationEligible ===
        false

      &&

      candidate.requiresIndependentValidation ===
        true

      &&

      candidate.executionAuthorized ===
        false;


    checks.push({
      checkType:
        ISOLATION_CHECK
          .CROSS_TENANT_RETRIEVAL,

      passed:
        retrievalPassed,

      findings:
        retrievalPassed
          ? []
          : [
              {
                type:
                  "GLOBAL_PROPOSAL_BOUNDARY_INVALID",
              },
            ],
    });


    const passed =
      checks.every(
        (
          check
        ) =>
          check.passed ===
          true
      );


    return {
      passed,

      checks,

      executionAuthorized:
        false,
    };
  }
}


module.exports = {
  LearningCrossTenantIsolationService,
};