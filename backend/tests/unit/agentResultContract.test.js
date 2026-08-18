"use strict";

const {
  AGENT_STATUS,
  AGENT_RESULT_SCHEMA_VERSION,
  createAgentExecutionRecord,
} =
  require(
    "../../agents/v2/contracts/agentContracts"
  );

const {
  BaseAgent,
} =
  require(
    "../../agents/v2/runtime/baseAgent"
  );

class TestAgent
  extends BaseAgent {
  constructor() {
    super(
      "TestAgent",
      "1.0.0"
    );
  }
}

describe(
  "Phase 12.3 canonical AgentResult",
  () => {
    test(
      "creates the complete canonical envelope",
      () => {
        const record =
          createAgentExecutionRecord({
            agent:
              "TestAgent",

            version:
              "1.0.0",

            status:
              AGENT_STATUS
                .SUCCESS,

            startedAt:
              "2026-08-18T10:00:00.000Z",

            completedAt:
              "2026-08-18T10:00:01.000Z",

            confidence:
              0.8,

            result: {
              answer:
                "ok",
            },

            evidenceUsed: [
              "ev-1",
            ],

            evidenceMissing: [
              "logs",
            ],

            assumptions: [
              "service mapping is correct",
            ],

            nextRecommendedStage:
              "DIAGNOSIS",

            modelMetadata: {
              provider:
                "test",

              model:
                "test-model",

              inputTokens:
                100,

              outputTokens:
                20,

              latencyMs:
                900,
            },
          });

        expect(
          record.schemaVersion
        ).toBe(
          AGENT_RESULT_SCHEMA_VERSION
        );

        expect(
          record.status
        ).toBe(
          "SUCCESS"
        );

        expect(
          record.result
        ).toEqual({
          answer:
            "ok",
        });

        expect(
          record.evidenceUsed
        ).toEqual([
          "ev-1",
        ]);

        expect(
          record.evidenceMissing
        ).toEqual([
          "logs",
        ]);

        expect(
          record.assumptions
        ).toEqual([
          "service mapping is correct",
        ]);

        expect(
          record.nextRecommendedStage
        ).toBe(
          "DIAGNOSIS"
        );

        expect(
          record.durationMs
        ).toBe(
          1000
        );

        expect(
          record.modelMetadata
            .totalTokens
        ).toBe(
          120
        );
      }
    );

    test(
      "keeps INSUFFICIENT_EVIDENCE distinct from FAILED",
      () => {
        const agent =
          new TestAgent();

        const record =
          agent
            ._insufficientEvidence(
              new Date(),
              {
                reason:
                  "metrics missing",
              },
              {
                evidenceMissing: [
                  "metrics",
                ],

                nextRecommendedStage:
                  "COLLECT_MORE_EVIDENCE",
              }
            );

        expect(
          record.status
        ).toBe(
          AGENT_STATUS
            .INSUFFICIENT_EVIDENCE
        );

        expect(
          record.status
        ).not.toBe(
          AGENT_STATUS
            .FAILED
        );

        expect(
          record.evidenceMissing
        ).toEqual([
          "metrics",
        ]);
      }
    );

    test(
      "BaseAgent SUCCESS always returns canonical result fields",
      () => {
        const agent =
          new TestAgent();

        const record =
          agent
            ._success(
              new Date(),
              {
                ok:
                  true,
              }
            );

        expect(
          record.agent
        ).toBe(
          "TestAgent"
        );

        expect(
          record.version
        ).toBe(
          "1.0.0"
        );

        expect(
          Array.isArray(
            record.evidenceUsed
          )
        ).toBe(
          true
        );

        expect(
          Array.isArray(
            record.evidenceMissing
          )
        ).toBe(
          true
        );

        expect(
          Array.isArray(
            record.assumptions
          )
        ).toBe(
          true
        );

        expect(
          Array.isArray(
            record.warnings
          )
        ).toBe(
          true
        );

        expect(
          record.modelMetadata
        ).toEqual({
          provider:
            null,

          model:
            null,

          inputTokens:
            null,

          outputTokens:
            null,

          totalTokens:
            null,

          latencyMs:
            null,

          estimatedCost:
            null,
        });
      }
    );

    test(
      "rejects unknown statuses",
      () => {
        expect(
          () =>
            createAgentExecutionRecord({
              agent:
                "TestAgent",

              version:
                "1.0.0",

              status:
                "MADE_UP_STATUS",

              startedAt:
                new Date(),
            })
        ).toThrow(
          "Unknown AgentResult status"
        );
      }
    );

    test(
      "preserves SKIPPED for backward compatible intentional skipping",
      () => {
        const agent =
          new TestAgent();

        const record =
          agent
            ._skipped(
              new Date(),
              "not applicable"
            );

        expect(
          record.status
        ).toBe(
          AGENT_STATUS
            .SKIPPED
        );

        expect(
          record.result
            .skipReason
        ).toBe(
          "not applicable"
        );
      }
    );

    test(
      "manual result remains fail closed",
      () => {
        const agent =
          new TestAgent();

        const record =
          agent
            ._manual(
              new Date(),
              "RESOURCE_AMBIGUOUS"
            );

        expect(
          record.status
        ).toBe(
          AGENT_STATUS
            .MANUAL_REQUIRED
        );

        expect(
          record.confidence
        ).toBe(
          0
        );

        expect(
          record.result
            .manualReason
        ).toBe(
          "RESOURCE_AMBIGUOUS"
        );
      }
    );
  }
);