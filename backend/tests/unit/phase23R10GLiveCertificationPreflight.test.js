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
  "AIRA Phase 23R.10G.1 — live certification preflight contract",
  () => {
    const scriptPath =
      path.resolve(
        __dirname,
        "../../scripts/preflight-phase23r-10g-live.js"
      );

    let source;

    beforeAll(
      () => {
        source =
          fs.readFileSync(
            scriptPath,
            "utf8"
          );
      }
    );


    test(
      "preflight exists and is locked to Phase 23R.10G.1",
      () => {
        expect(
          source
        ).toContain(
          '"23R.10G.1"'
        );

        expect(
          source
        ).toContain(
          "PREFLIGHT PASS != LIVE CERTIFICATION"
        );
      }
    );


    test(
      "hard-locks the certification to the Kind Reliability Lab",
      () => {
        expect(
          source
        ).toContain(
          '"kind-aira-reliability-lab"'
        );

        expect(
          source
        ).toContain(
          '"aira-reliability-lab"'
        );

        expect(
          source
        ).toContain(
          "PHASE23R_10G_CONTEXT_FORBIDDEN"
        );

        expect(
          source
        ).toContain(
          "PHASE23R_10G_NAMESPACE_FORBIDDEN"
        );
      }
    );


    test(
      "requires the canonical Phase-21 Kubernetes pod crash experiment",
      () => {
        expect(
          source
        ).toContain(
          '"kubernetes.pod.crash"'
        );

        expect(
          source
        ).toContain(
          "reliability.experiment_definitions"
        );

        expect(
          source
        ).toContain(
          "LAB_ONLY"
        );
      }
    );


    test(
      "requires persisted 23R environment replay lifecycle schema",
      () => {
        expect(
          source
        ).toContain(
          "reality.replay_runs"
        );

        expect(
          source
        ).toContain(
          "reality.environment_replay_runs"
        );

        expect(
          source
        ).toContain(
          "relforcerowsecurity"
        );
      }
    );


    test(
      "requires every frozen live Reality bridge",
      () => {
        const modules = [
          "realityEnvironmentReplayLiveOrchestrator.js",

          "realityEnvironmentReplayBindingService.js",

          "realityKubernetesReplayRunner.js",

          "realityAiraInvestigationBridge.js",

          "realityRecoveryVerificationResetBridge.js",
        ];

        for (
          const moduleName
          of modules
        ) {
          expect(
            source
          ).toContain(
            moduleName
          );
        }
      }
    );


    test(
      "preflight discovers a real Ready Kubernetes pod",
      () => {
        expect(
          source
        ).toContain(
          '"get"'
        );

        expect(
          source
        ).toContain(
          '"pods"'
        );

        expect(
          source
        ).toContain(
          '"app=lab-api"'
        );

        expect(
          source
        ).toContain(
          'condition.type ==='
        );

        expect(
          source
        ).toContain(
          '"Ready"'
        );
      }
    );


    test(
      "preflight contains no Kubernetes mutation commands",
      () => {
        expect(
          source
        ).not.toMatch(
          /"delete"\s*,\s*"pod"/
        );

        expect(
          source
        ).not.toContain(
          "rollout restart"
        );

        expect(
          source
        ).not.toMatch(
          /"scale"\s*,/
        );

        expect(
          source
        ).not.toMatch(
          /"apply"\s*,/
        );
      }
    );


    test(
      "preflight explicitly preserves no-authority and no-production semantics",
      () => {
        expect(
          source
        ).toContain(
          "REALITY REPLAY != EXECUTION AUTHORITY"
        );

        expect(
          source
        ).toContain(
          "LAB MUTATION != PRODUCTION AUTHORITY"
        );

        expect(
          source
        ).toContain(
          "GROUND TRUTH != AGENT CONTEXT"
        );

        expect(
          source
        ).toContain(
          "executionAuthorized:"
        );

        expect(
          source
        ).toContain(
          "production:"
        );
      }
    );
  }
);