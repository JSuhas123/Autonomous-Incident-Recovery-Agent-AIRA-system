"use strict";

const fs =
  require(
    "node:fs"
  );

const path =
  require(
    "node:path"
  );


describe(
  "AIRA Phase 23R.10G.2 live certification contract",
  () => {
    const scriptPath =
      path.resolve(
        __dirname,
        "../../scripts/certify-phase23r-10g2-live.js"
      );

    const executorPath =
      path.resolve(
        __dirname,
        (
          "../../services/reality/"
          + "phase23r10g2RecoveryExecutor.js"
        )
      );

    let script;

    let executor;


    beforeAll(
      () => {
        script =
          fs.readFileSync(
            scriptPath,
            "utf8"
          );

        executor =
          fs.readFileSync(
            executorPath,
            "utf8"
          );
      }
    );


    test(
      "is locked to 23R.10G.2 and the Reliability Lab",
      () => {
        expect(
          script
        ).toContain(
          '"23R.10G.2.2"'
        );

        expect(
          script
        ).toContain(
          '"kind-aira-reliability-lab"'
        );

        expect(
          script
        ).toContain(
          '"aira-reliability-lab"'
        );

        expect(
          script
        ).toContain(
          '"kubernetes.pod.crash"'
        );
      }
    );


    test(
      "requires the frozen 23R.13U corpus before live certification",
      () => {
        expect(
          script
        ).toContain(
          "phase23r13-corpus-freeze.json"
        );

        expect(
          script
        ).toContain(
          'freeze.status !=='
        );

        expect(
          script
        ).toContain(
          '"FROZEN"'
        );

        expect(
          script
        ).toContain(
          '"23R.13U"'
        );
      }
    );


    test(
      "executes the frozen 10D 10E and 10F bridges",
      () => {
        expect(
          script
        ).toContain(
          "RealityKubernetesReplayRunner"
        );

        expect(
          script
        ).toContain(
          "RealityAiraInvestigationBridge"
        );

        expect(
          script
        ).toContain(
          "RealityRecoveryVerificationResetBridge"
        );
      }
    );


    test(
      "does not pass evaluator ground truth into AIRA",
      () => {
        expect(
          script
        ).toContain(
          "groundTruthPassedToAira"
        );

        expect(
          script
        ).toContain(
          "groundTruthAgentVisible"
        );

        expect(
          executor
        ).toContain(
          "PHASE23R_10G2_RECOVERY_GROUND_TRUTH_FORBIDDEN"
        );
      }
    );


    test(
      "proves unauthorized execution is blocked before positive execution",
      () => {
        expect(
          executor
        ).toContain(
          "unauthorizedExecutionBlocked"
        );

        expect(
          executor
        ).toContain(
          "PHASE23R_10G2_UNAUTHORIZED_EXECUTION_NOT_BLOCKED"
        );

        expect(
          script
        ).toContain(
          "unauthorizedExecutionBlocked"
        );
      }
    );


    test(
      "uses canonical authorization critic persistence and Phase-20 runtime",
      () => {
        expect(
          executor
        ).toContain(
          "ExecutionAuthorizationEngine"
        );

        expect(
          executor
        ).toContain(
          "executionAuthorizationCritic"
        );

        expect(
          executor
        ).toContain(
          "executionAuthorizationPersistenceService"
        );

        expect(
          executor
        ).toContain(
          "IntegrationRuntime"
        );

        expect(
          executor
        ).toContain(
          "executeCapability"
        );
      }
    );


    test(
      "requires independent verification reset and restored baseline",
      () => {
        expect(
          script
        ).toContain(
          '"VERIFIED_RECOVERY"'
        );

        expect(
          script
        ).toContain(
          "resetSucceeded"
        );

        expect(
          script
        ).toContain(
          "baselineRestored"
        );
      }
    );


    test(
      "never converts replay or corpus state into authority",
      () => {
        expect(
          script
        ).toContain(
          "REALITY REPLAY != EXECUTION AUTHORITY"
        );

        expect(
          script
        ).toContain(
          "LAB MUTATION != PRODUCTION AUTHORITY"
        );

        expect(
          script
        ).toContain(
          "executionAuthorized"
        );

        expect(
          script
        ).toContain(
          "productionCertified"
        );

        expect(
          executor
        ).toContain(
          "executionAuthorized"
        );

        expect(
          executor
        ).toContain(
          "productionCertified"
        );
      }
    );
  }
);