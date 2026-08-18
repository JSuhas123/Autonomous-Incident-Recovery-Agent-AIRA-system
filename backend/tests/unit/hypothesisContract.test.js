"use strict";

const {
  HYPOTHESIS_STATUS,
  HYPOTHESIS_ORIGIN,
  HYPOTHESIS_SCHEMA_VERSION,
  DIAGNOSIS_OUTCOME,
  EVIDENCE_TYPE,
  EVIDENCE_SOURCE_TYPE,
  createHypothesis,
  createEvidenceItem,
} =
  require(
    "../../agents/v2/contracts/agentContracts"
  );

const {
  RootCauseHypothesisAgent,
} =
  require(
    "../../agents/v2/agents/rootCauseHypothesisAgent"
  );

describe(
  "Phase 12.5 root-cause hypothesis contract",
  () => {
    test(
      "creates canonical hypothesis provenance",
      () => {
        const hypothesis =
          createHypothesis({
            id:
              "hyp-1",

            rootCause:
              "Database pool exhaustion",

            confidence:
              0.7,

            origin:
              HYPOTHESIS_ORIGIN
                .DETERMINISTIC,

            evidenceSupporting: [
              "ev-1",
              "ev-1",
            ],

            assumptions: [
              "pool belongs to failing service",
              "pool belongs to failing service",
            ],
          });

        expect(
          hypothesis.schemaVersion
        ).toBe(
          HYPOTHESIS_SCHEMA_VERSION
        );

        expect(
          hypothesis.origin
        ).toBe(
          HYPOTHESIS_ORIGIN
            .DETERMINISTIC
        );

        expect(
          hypothesis.evidenceSupporting
        ).toEqual([
          "ev-1",
        ]);

        expect(
          hypothesis.assumptions
        ).toEqual([
          "pool belongs to failing service",
        ]);
      }
    );

    test(
      "invalid evidence references do not increase confidence",
      () => {
        const agent =
          new RootCauseHypothesisAgent();

        const evidence =
          createEvidenceItem({
            id:
              "real-evidence",

            type:
              EVIDENCE_TYPE
                .METRIC,

            source:
              "prometheus",

            sourceType:
              EVIDENCE_SOURCE_TYPE
                .PROMETHEUS,
          });

        const context = {
          evidence: {
            completeness:
              0.8,

            items: [
              evidence,
            ],
          },
        };

        const scored =
          agent
            .scoreHypothesis(
              createHypothesis({
                id:
                  "hyp-invalid",

                rootCause:
                  "Memory exhaustion",

                confidence:
                  0.8,

                evidenceSupporting: [
                  "not-real-1",
                  "not-real-2",
                  "not-real-3",
                ],
              }),

              context
            );

        expect(
          scored
            .validEvidenceSupporting
        ).toEqual([]);

        expect(
          scored
            .invalidEvidenceSupporting
        ).toHaveLength(
          3
        );

        expect(
          scored
            .scoreBreakdown
            .validSupportingEvidenceCount
        ).toBe(
          0
        );

        expect(
          scored.confidence
        ).toBeLessThan(
          0.8
        );
      }
    );

    test(
      "real canonical evidence contributes to support",
      () => {
        const agent =
          new RootCauseHypothesisAgent();

        const context = {
          evidence: {
            completeness:
              1,

            items: [
              {
                id:
                  "ev-a",
              },
              {
                id:
                  "ev-b",
              },
            ],
          },
        };

        const scored =
          agent
            .scoreHypothesis(
              createHypothesis({
                id:
                  "hyp-real",

                rootCause:
                  "Dependency failure",

                confidence:
                  0.75,

                evidenceSupporting: [
                  "ev-a",
                  "ev-b",
                ],
              }),

              context
            );

        expect(
          scored
            .validEvidenceSupporting
        ).toEqual([
          "ev-a",
          "ev-b",
        ]);

        expect(
          scored
            .invalidEvidenceSupporting
        ).toEqual([]);
      }
    );

    test(
      "close strong hypotheses remain explicitly ambiguous",
      () => {
        const agent =
          new RootCauseHypothesisAgent();

        const hypotheses = [
          {
            id:
              "hyp-a",

            confidence:
              0.78,

            status:
              HYPOTHESIS_STATUS
                .SUPPORTED,
          },

          {
            id:
              "hyp-b",

            confidence:
              0.72,

            status:
              HYPOTHESIS_STATUS
                .WEAKLY_SUPPORTED,
          },
        ];

        const ambiguity =
          agent
            .buildAmbiguitySummary(
              hypotheses
            );

        expect(
          ambiguity.ambiguous
        ).toBe(
          true
        );

        expect(
          ambiguity
            .plausibleHypothesisIds
        ).toEqual([
          "hyp-a",
          "hyp-b",
        ]);
      }
    );

    test(
      "close plausible hypotheses produce MULTIPLE_PLAUSIBLE_CAUSES",
      () => {
        const agent =
          new RootCauseHypothesisAgent();

        const outcome =
          agent
            .determineOutcome(
              [
                {
                  id:
                    "hyp-a",

                  confidence:
                    0.75,

                  status:
                    HYPOTHESIS_STATUS
                      .SUPPORTED,

                  validEvidenceSupporting: [
                    "a",
                    "b",
                  ],
                },

                {
                  id:
                    "hyp-b",

                  confidence:
                    0.69,

                  status:
                    HYPOTHESIS_STATUS
                      .WEAKLY_SUPPORTED,

                  validEvidenceSupporting: [
                    "c",
                  ],
                },
              ],

              {
                evidence: {
                  completeness:
                    0.9,
                },
              }
            );

        expect(
          outcome
        ).toBe(
          DIAGNOSIS_OUTCOME
            .MULTIPLE_PLAUSIBLE_CAUSES
        );
      }
    );

    test(
      "ROOT_CAUSE_IDENTIFIED requires strong evidence and separation",
      () => {
        const agent =
          new RootCauseHypothesisAgent();

        const outcome =
          agent
            .determineOutcome(
              [
                {
                  id:
                    "hyp-a",

                  confidence:
                    0.94,

                  status:
                    HYPOTHESIS_STATUS
                      .SUPPORTED,

                  validEvidenceSupporting: [
                    "a",
                    "b",
                    "c",
                  ],
                },

                {
                  id:
                    "hyp-b",

                  confidence:
                    0.5,

                  status:
                    HYPOTHESIS_STATUS
                      .WEAKLY_SUPPORTED,

                  validEvidenceSupporting: [
                    "d",
                  ],
                },
              ],

              {
                evidence: {
                  completeness:
                    0.85,
                },
              }
            );

        expect(
          outcome
        ).toBe(
          DIAGNOSIS_OUTCOME
            .ROOT_CAUSE_IDENTIFIED
        );
      }
    );

    test(
      "high confidence alone cannot identify root cause without evidence",
      () => {
        const agent =
          new RootCauseHypothesisAgent();

        const outcome =
          agent
            .determineOutcome(
              [
                {
                  id:
                    "hyp-ai-only",

                  confidence:
                    0.97,

                  status:
                    HYPOTHESIS_STATUS
                      .SUPPORTED,

                  validEvidenceSupporting:
                    [],
                },
              ],

              {
                evidence: {
                  completeness:
                    0.9,
                },
              }
            );

        expect(
          outcome
        ).not.toBe(
          DIAGNOSIS_OUTCOME
            .ROOT_CAUSE_IDENTIFIED
        );
      }
    );

    test(
      "contradicted winner cannot become root cause",
      () => {
        const agent =
          new RootCauseHypothesisAgent();

        const outcome =
          agent
            .determineOutcome(
              [
                {
                  id:
                    "hyp-bad",

                  confidence:
                    0.99,

                  status:
                    HYPOTHESIS_STATUS
                      .CONTRADICTED,

                  validEvidenceSupporting: [
                    "a",
                    "b",
                    "c",
                  ],
                },
              ],

              {
                evidence: {
                  completeness:
                    1,
                },
              }
            );

        expect(
          outcome
        ).toBe(
          DIAGNOSIS_OUTCOME
            .CONTRADICTORY_EVIDENCE
        );
      }
    );
  }
);