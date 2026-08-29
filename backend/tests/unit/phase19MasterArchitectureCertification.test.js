"use strict";

const fs =
  require(
    "fs"
  );

const path =
  require(
    "path"
  );


const ROOT =
  path.resolve(
    __dirname,
    "../.."
  );


function source(
  relativePath
) {
  return fs.readFileSync(
    path.join(
      ROOT,
      relativePath
    ),
    "utf8"
  );
}


function exists(
  relativePath
) {
  return fs.existsSync(
    path.join(
      ROOT,
      relativePath
    )
  );
}


describe(
  "Phase 19 master architecture certification",
  () => {
    /*
     * ========================================================================
     * DATABASE FOUNDATION
     * ========================================================================
     */


    test(
      "Phase 19 coverage foundation migration exists",
      () => {
        expect(
          exists(
            "persistence/postgres/migrations/0075_knowledge_coverage_foundation.sql"
          )
        ).toBe(true);
      }
    );


    test(
      "Phase 19 complete gap history migration exists",
      () => {
        expect(
          exists(
            "persistence/postgres/migrations/0076_coverage_gap_history.sql"
          )
        ).toBe(true);
      }
    );


    test(
      "PostgreSQL current evaluation repository exists",
      () => {
        expect(
          exists(
            "persistence/postgres/PostgresCoverageEvaluationRepository.js"
          )
        ).toBe(true);
      }
    );


    test(
      "PostgreSQL immutable snapshot repository exists",
      () => {
        expect(
          exists(
            "persistence/postgres/PostgresCoverageSnapshotRepository.js"
          )
        ).toBe(true);
      }
    );


    test(
      "PostgreSQL gap repository exists",
      () => {
        expect(
          exists(
            "persistence/postgres/PostgresCoverageGapRepository.js"
          )
        ).toBe(true);
      }
    );


    /*
     * ========================================================================
     * CLASSIFICATION
     * ========================================================================
     */


    test(
      "coverage classifications include all four canonical states",
      () => {
        const constants =
          source(
            "constants/coverage.js"
          );


        expect(
          constants
        ).toMatch(
          /COVERED/
        );


        expect(
          constants
        ).toMatch(
          /PARTIAL/
        );


        expect(
          constants
        ).toMatch(
          /HUMAN_ONLY/
        );


        expect(
          constants
        ).toMatch(
          /UNKNOWN/
        );
      }
    );


    test(
      "classification engine exists",
      () => {
        expect(
          exists(
            "coverage/RecoveryCoverageClassificationEngine.js"
          )
        ).toBe(true);
      }
    );


    test(
      "classification engine cannot authorize execution",
      () => {
        expect(
          source(
            "coverage/RecoveryCoverageClassificationEngine.js"
          )
        ).not.toMatch(
          /executionAuthorized\s*:\s*true/
        );
      }
    );


    test(
      "headline scoring engine exists",
      () => {
        expect(
          exists(
            "coverage/RecoveryCoverageScoringEngine.js"
          )
        ).toBe(true);
      }
    );


    /*
     * ========================================================================
     * COVERAGE REASON CODES
     * ========================================================================
     */


    test(
      "frozen Phase 19 reason codes remain present",
      () => {
        const constants =
          source(
            "constants/coverage.js"
          );


        const expected = [
          "NO_FAILURE_MODE",
          "NO_PLAYBOOK",
          "NO_APPROVED_PLAYBOOK",
          "RUNBOOK_MISSING",
          "RUNBOOK_VERSION_UNRESOLVED",
          "EVIDENCE_UNAVAILABLE",
          "CAPABILITY_MISSING",
          "POLICY_BLOCKED",
          "HUMAN_APPROVAL_REQUIRED",
          "ROLLBACK_MISSING",
          "VERIFICATION_MISSING",
          "UNTESTED_RECOVERY",
          "LOW_HISTORICAL_CONFIDENCE",
          "UNSUPPORTED_RESOURCE_TYPE",
        ];


        for (
          const reason
          of expected
        ) {
          expect(
            constants
          ).toContain(
            reason
          );
        }
      }
    );


    /*
     * ========================================================================
     * PHASE 17 INTEGRATION
     * ========================================================================
     */


    test(
      "Resource Inventory Provider reuses Phase 17 resource truth",
      () => {
        const provider =
          source(
            "coverage/ResourceInventoryProvider.js"
          );


        expect(
          provider
        ).toMatch(
          /PostgresResourceRepository/
        );


        expect(
          provider
        ).not.toMatch(
          /mongoose/i
        );
      }
    );


    test(
      "topology coverage reuses Phase 17 relationships",
      () => {
        const topology =
          source(
            "coverage/TopologyBlastRadiusCoverageService.js"
          );


        expect(
          topology
        ).toMatch(
          /PostgresResourceRelationshipRepository/
        );


        expect(
          topology
        ).toMatch(
          /listRelationshipsForResource/
        );


        expect(
          topology
        ).not.toMatch(
          /executionAuthorized\s*:\s*true/
        );
      }
    );


    /*
     * ========================================================================
     * PHASE 18 KNOWLEDGE INTEGRATION
     * ========================================================================
     */


    test(
      "Failure Mode resolver uses PostgreSQL production knowledge",
      () => {
        const repo =
          source(
            "persistence/postgres/PostgresFailureModeRepository.js"
          );


        expect(
          repo
        ).toMatch(
          /knowledge\.failure_mode/
        );


        expect(
          repo
        ).not.toMatch(
          /mongoose/i
        );
      }
    );


    test(
      "Playbook coverage resolver exists",
      () => {
        expect(
          exists(
            "coverage/FailureModePlaybookCoverageResolver.js"
          )
        ).toBe(true);
      }
    );


    test(
      "Runbook completeness service exists",
      () => {
        expect(
          exists(
            "coverage/PlaybookRunbookCompletenessService.js"
          )
        ).toBe(true);
      }
    );


    /*
     * ========================================================================
     * READINESS DIMENSIONS
     * ========================================================================
     */


    test(
      "Evidence readiness service exists",
      () => {
        expect(
          exists(
            "coverage/EvidenceReadinessService.js"
          )
        ).toBe(true);
      }
    );


    test(
      "Capability coverage service exists",
      () => {
        expect(
          exists(
            "coverage/CapabilityCoverageService.js"
          )
        ).toBe(true);
      }
    );


    test(
      "Policy and approval coverage service exists",
      () => {
        expect(
          exists(
            "coverage/PolicyApprovalCoverageService.js"
          )
        ).toBe(true);
      }
    );


    test(
      "Rollback readiness service exists",
      () => {
        expect(
          exists(
            "coverage/RollbackReadinessService.js"
          )
        ).toBe(true);
      }
    );


    test(
      "Verification readiness service exists",
      () => {
        const verification =
          source(
            "coverage/VerificationReadinessService.js"
          );


        expect(
          verification
        ).not.toMatch(
          /executionAuthorized\s*:\s*true/
        );
      }
    );


    test(
      "Escalation coverage service exists",
      () => {
        expect(
          exists(
            "coverage/EscalationCoverageService.js"
          )
        ).toBe(true);
      }
    );


    /*
     * ========================================================================
     * HISTORICAL VALIDATION
     * ========================================================================
     */


    test(
      "historical recovery validation uses PostgreSQL execution history",
      () => {
        const repository =
          source(
            "persistence/postgres/PostgresRecoveryExecutionHistoryRepository.js"
          );


        expect(
          repository
        ).toMatch(
          /execution\./
        );


        expect(
          repository
        ).not.toMatch(
          /mongoose/i
        );
      }
    );


    test(
      "historical effectiveness cannot authorize execution",
      () => {
        expect(
          source(
            "coverage/HistoricalValidationCoverageService.js"
          )
        ).not.toMatch(
          /executionAuthorized\s*:\s*true/
        );
      }
    );


    /*
     * ========================================================================
     * PHASE 16 MEMORY
     * ========================================================================
     */


    test(
      "Memory contribution uses PostgreSQL canonical Memory",
      () => {
        const memory =
          source(
            "coverage/MemoryCoverageContributionService.js"
          );


        expect(
          memory
        ).toMatch(
          /PostgresMemoryRepository/
        );


        expect(
          memory
        ).toMatch(
          /MemoryEvidenceAdapter/
        );


        expect(
          memory
        ).toMatch(
          /qdrantIsCanonical\s*:\s*false/
        );
      }
    );


    test(
      "Memory cannot create recovery knowledge",
      () => {
        const memory =
          source(
            "coverage/MemoryCoverageContributionService.js"
          );


        expect(
          memory
        ).toMatch(
          /canCreateRecoveryKnowledge\s*:\s*false/
        );


        expect(
          memory
        ).toMatch(
          /affectsClassification\s*:\s*false/
        );
      }
    );


    /*
     * ========================================================================
     * KNOWLEDGE GAPS
     * ========================================================================
     */


    test(
      "blind spot detector exists",
      () => {
        expect(
          exists(
            "coverage/KnowledgeGapDetectionService.js"
          )
        ).toBe(true);
      }
    );


    test(
      "critical gap prioritization exists",
      () => {
        expect(
          exists(
            "coverage/CriticalGapPrioritizationService.js"
          )
        ).toBe(true);
      }
    );


    test(
      "gap persistence supports NO_FAILURE_MODE",
      () => {
        const migration =
          source(
            "persistence/postgres/migrations/0076_coverage_gap_history.sql"
          );


        expect(
          migration
        ).toMatch(
          /evaluation_id[\s\S]*DROP NOT NULL/i
        );


        expect(
          migration
        ).toContain(
          "coverage.snapshot_gaps"
        );
      }
    );


    /*
     * ========================================================================
     * DYNAMIC KNOWLEDGE ADAPTATION
     * ========================================================================
     */


    test(
      "coverage refresh dynamically rediscovers knowledge",
      () => {
        const orchestrator =
          source(
            "coverage/CoverageRefreshOrchestrator.js"
          );


        expect(
          orchestrator
        ).toContain(
          "dynamicKnowledgeDiscovery"
        );


        expect(
          orchestrator
        ).toContain(
          "listApplicableVersions"
        );


        expect(
          orchestrator
        ).toContain(
          "listAllResources"
        );
      }
    );


    test(
      "coverage refresh never creates Phase 18 knowledge",
      () => {
        const orchestrator =
          source(
            "coverage/CoverageRefreshOrchestrator.js"
          );


        expect(
          orchestrator
        ).not.toMatch(
          /\.createDefinition\s*\(/
        );


        expect(
          orchestrator
        ).not.toMatch(
          /\.createVersion\s*\(/
        );
      }
    );


    /*
     * ========================================================================
     * IMMUTABLE HISTORY
     * ========================================================================
     */


    test(
      "snapshot persistence is immutable",
      () => {
        const migration75 =
          source(
            "persistence/postgres/migrations/0075_knowledge_coverage_foundation.sql"
          );


        const migration76 =
          source(
            "persistence/postgres/migrations/0076_coverage_gap_history.sql"
          );


        expect(
          migration75
        ).toContain(
          "protect_snapshot_immutability"
        );


        expect(
          migration76
        ).toContain(
          "trg_protect_coverage_snapshot_gap_update"
        );
      }
    );


    test(
      "snapshot repository exposes no update method",
      () => {
        const repository =
          source(
            "persistence/postgres/PostgresCoverageSnapshotRepository.js"
          );


        expect(
          repository
        ).not.toMatch(
          /async\s+updateSnapshot\s*\(/
        );


        expect(
          repository
        ).not.toMatch(
          /async\s+updateSnapshotItem\s*\(/
        );
      }
    );


    /*
     * ========================================================================
     * API / PRODUCT LAYER
     * ========================================================================
     */


    test(
      "Coverage API exposes summary resources failure modes domains gaps history and refresh",
      () => {
        const routes =
          source(
            "routes/coverageRoutes.js"
          );


        const endpoints = [
          '"/summary"',
          '"/resources"',
          '"/failure-modes"',
          '"/domains"',
          '"/gaps"',
          '"/history"',
          '"/refresh"',
        ];


        for (
          const endpoint
          of endpoints
        ) {
          expect(
            routes
          ).toContain(
            endpoint
          );
        }
      }
    );


    test(
      "Coverage API cannot authorize execution",
      () => {
        const files = [
          "controllers/coverageController.js",
          "routes/coverageRoutes.js",
          "coverage/CoverageQueryService.js",
        ];


        for (
          const file
          of files
        ) {
          expect(
            source(
              file
            )
          ).not.toMatch(
            /executionAuthorized\s*:\s*true/
          );
        }
      }
    );


    /*
     * ========================================================================
     * GLOBAL SAFETY
     * ========================================================================
     */


    test(
      "Coverage orchestration cannot authorize execution",
      () => {
        expect(
          source(
            "coverage/CoverageRefreshOrchestrator.js"
          )
        ).not.toMatch(
          /executionAuthorized\s*:\s*true/
        );
      }
    );


    test(
      "Coverage evaluation persistence cannot authorize execution",
      () => {
        expect(
          source(
            "persistence/postgres/PostgresCoverageEvaluationRepository.js"
          )
        ).not.toMatch(
          /executionAuthorized\s*:\s*true/
        );
      }
    );


    test(
      "Coverage snapshot persistence cannot authorize execution",
      () => {
        expect(
          source(
            "persistence/postgres/PostgresCoverageSnapshotRepository.js"
          )
        ).not.toMatch(
          /executionAuthorized\s*:\s*true/
        );
      }
    );


    test(
      "Coverage gap persistence cannot authorize execution",
      () => {
        expect(
          source(
            "persistence/postgres/PostgresCoverageGapRepository.js"
          )
        ).not.toMatch(
          /executionAuthorized\s*:\s*true/
        );
      }
    );


    test(
      "Phase 19 contains no direct arbitrary command execution authority",
      () => {
        const files = [
          "coverage/CoverageRefreshOrchestrator.js",
          "coverage/RecoveryCoverageClassificationEngine.js",
          "coverage/KnowledgeGapDetectionService.js",
          "coverage/CriticalGapPrioritizationService.js",
        ];


        for (
          const file
          of files
        ) {
          const text =
            source(
              file
            );


          expect(
            text
          ).not.toMatch(
            /child_process/
          );


          expect(
            text
          ).not.toMatch(
            /\bexecSync\s*\(/
          );


          expect(
            text
          ).not.toMatch(
            /\bspawnSync\s*\(/
          );
        }
      }
    );
  }
);