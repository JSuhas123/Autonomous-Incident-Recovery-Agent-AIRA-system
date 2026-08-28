"use strict";

const {
  EvidenceRequirementEngine,
  HypothesisEngine,
  CapabilityRequirementEngine,
} = require(
  "../../knowledge/reasoning"
);

describe(
  "Phase 18.8-18.10 reasoning foundation",
  () => {
    test(
      "missing required evidence blocks evidence completeness",
      () => {
        const engine =
          new EvidenceRequirementEngine();

        const result =
          engine.evaluate({
            failureMode: {
              failureModeId:
                "FM-K8S-CRASHLOOP",

              requiredEvidence: [
                {
                  id: "logs",
                  type: "LOGS",
                  required: true,
                },

                {
                  id: "events",
                  type: "EVENTS",
                  required: true,
                },
              ],
            },

            evidence: [
              {
                id: "ev-1",
                type: "LOGS",
              },
            ],
          });

        expect(
          result.complete
        ).toBe(false);

        expect(
          result.missingRequiredCount
        ).toBe(1);

        expect(
          result.executionAuthorized
        ).toBe(false);
      }
    );

    test(
      "complete evidence produces complete assessment",
      () => {
        const engine =
          new EvidenceRequirementEngine();

        const result =
          engine.evaluate({
            failureMode: {
              failureModeId: "FM-1",

              requiredEvidence: [
                {
                  type: "LOGS",
                },

                {
                  type: "METRICS",
                },
              ],
            },

            evidence: [
              {
                type: "LOGS",
              },

              {
                type: "METRICS",
              },
            ],
          });

        expect(
          result.complete
        ).toBe(true);

        expect(
          result.confidence
        ).toBe(1);
      }
    );

    test(
      "hypotheses are deterministically ranked",
      () => {
        const engine =
          new HypothesisEngine();

        const result =
          engine.generate({
            failureModes: [
              {
                failureModeId: "FM-B",
                confidence: 0.4,
              },

              {
                failureModeId: "FM-A",
                confidence: 0.8,
              },
            ],

            evidenceAssessments: [
              {
                failureModeId: "FM-B",
                confidence: 0.2,
                complete: false,
              },

              {
                failureModeId: "FM-A",
                confidence: 1,
                complete: true,
              },
            ],
          });

        expect(
          result.bestHypothesis
            .failureModeId
        ).toBe("FM-A");

        expect(
          result.executionAuthorized
        ).toBe(false);
      }
    );

    test(
      "missing capability makes Playbook technically inapplicable",
      () => {
        const engine =
          new CapabilityRequirementEngine();

        const result =
          engine.evaluate({
            requiredCapabilities: [
              "READ_STATE",
              "RESTART",
            ],

            availableCapabilities: [
              "READ_STATE",
            ],
          });

        expect(
          result.technicallyApplicable
        ).toBe(false);

        expect(
          result.missingCapabilities
        ).toEqual([
          "RESTART",
        ]);
      }
    );

    test(
      "all capabilities can make procedure technically applicable but never authorized",
      () => {
        const engine =
          new CapabilityRequirementEngine();

        const result =
          engine.evaluate({
            requiredCapabilities: [
              "READ_STATE",
              "RESTART",
            ],

            availableCapabilities: [
              "RESTART",
              "READ_STATE",
            ],
          });

        expect(
          result.technicallyApplicable
        ).toBe(true);

        expect(
          result.capabilityCoverage
        ).toBe(1);

        expect(
          result.executionAuthorized
        ).toBe(false);
      }
    );

    test(
      "Memory evidence contributes support but not authorization",
      () => {
        const engine =
          new HypothesisEngine();

        const result =
          engine.generate({
            failureModes: [
              {
                failureModeId: "FM-1",
                confidence: 0.5,
              },
            ],

            evidenceAssessments: [
              {
                failureModeId: "FM-1",
                confidence: 0.5,
                complete: true,
              },
            ],

            memoryEvidence: [
              {
                failureModeId: "FM-1",
                confidence: 1,
              },
            ],
          });

        expect(
          result.bestHypothesis
            .memorySupport
        ).toBe(1);

        expect(
          result.bestHypothesis
            .executionAuthorized
        ).toBe(false);
      }
    );

    test(
      "Resource Graph context contributes structural support but not authorization",
      () => {
        const engine =
          new HypothesisEngine();

        const result =
          engine.generate({
            failureModes: [
              {
                failureModeId: "FM-1",

                resourceTypes: [
                  "KUBERNETES_POD",
                ],
              },
            ],

            evidenceAssessments: [
              {
                failureModeId: "FM-1",
                confidence: 1,
                complete: true,
              },
            ],

            resourceContext: {
              resourceType:
                "KUBERNETES_POD",
            },
          });

        expect(
          result.bestHypothesis
            .graphSupport
        ).toBe(1);

        expect(
          result.executionAuthorized
        ).toBe(false);
      }
    );

    test(
      "reasoning layer never grants execution authorization",
      () => {
        const evidence =
          new EvidenceRequirementEngine()
            .evaluate({
              failureMode: {
                failureModeId: "FM-1",
              },

              evidence: [],
            });

        const capabilities =
          new CapabilityRequirementEngine()
            .evaluate({
              requiredCapabilities: [],
              availableCapabilities: [],
            });

        expect(
          evidence.executionAuthorized
        ).toBe(false);

        expect(
          capabilities.executionAuthorized
        ).toBe(false);
      }
    );
  }
);