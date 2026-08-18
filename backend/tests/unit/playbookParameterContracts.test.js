"use strict";

const {
  PLAYBOOK_RECOMMENDATION,
  PLAYBOOK_RECOMMENDATION_SCHEMA_VERSION,
  PLAYBOOK_SELECTION_SOURCE,
  PARAMETER_RESOLUTION_SCHEMA_VERSION,
  PARAMETER_RESOLUTION_STATUS,
  createPlaybookRecommendation,
  createParameterRecommendation,
} =
  require(
    "../../agents/v2/contracts/agentContracts"
  );

describe(
  "Phase 12.8 + 12.9 playbook and parameter contracts",
  () => {
    test(
      "playbook recommendation is versioned and never authorizes execution",
      () => {
        const result =
          createPlaybookRecommendation({
            recommendedPlaybookId:
              "pb-1",

            eligiblePlaybookIds: [
              "pb-1",
            ],

            selectionSource:
              PLAYBOOK_SELECTION_SOURCE
                .AI_RANKED,

            recommendation:
              PLAYBOOK_RECOMMENDATION
                .EXECUTE_CANDIDATE,
          });

        expect(
          result.schemaVersion
        ).toBe(
          PLAYBOOK_RECOMMENDATION_SCHEMA_VERSION
        );

        expect(
          result.recommendedPlaybookId
        ).toBe(
          "pb-1"
        );

        expect(
          result.matcherAuthoritative
        ).toBe(
          true
        );

        expect(
          result.executionAuthorized
        ).toBe(
          false
        );
      }
    );

    test(
      "non-eligible playbook cannot enter canonical recommendation",
      () => {
        expect(
          () =>
            createPlaybookRecommendation({
              recommendedPlaybookId:
                "invented-playbook",

              eligiblePlaybookIds: [
                "pb-real",
              ],

              recommendation:
                PLAYBOOK_RECOMMENDATION
                  .EXECUTE_CANDIDATE,
            })
        ).toThrow(
          "not in deterministic eligible set"
        );
      }
    );

    test(
      "approval requirement cannot be downgraded to autonomous execution",
      () => {
        const result =
          createPlaybookRecommendation({
            recommendedPlaybookId:
              "pb-1",

            eligiblePlaybookIds: [
              "pb-1",
            ],

            approvalRequired:
              true,

            recommendation:
              PLAYBOOK_RECOMMENDATION
                .EXECUTE_CANDIDATE,
          });

        expect(
          result.recommendation
        ).toBe(
          PLAYBOOK_RECOMMENDATION
            .REQUIRE_APPROVAL
        );

        expect(
          result.approvalRequired
        ).toBe(
          true
        );

        expect(
          result.executionAuthorized
        ).toBe(
          false
        );
      }
    );

    test(
      "AI readiness alone can never make parameters executable",
      () => {
        const result =
          createParameterRecommendation({
            deterministicValidated:
              false,

            readyForExecution:
              true,

            unresolved:
              [],

            ambiguous:
              [],
          });

        expect(
          result.schemaVersion
        ).toBe(
          PARAMETER_RESOLUTION_SCHEMA_VERSION
        );

        expect(
          result.readyForExecution
        ).toBe(
          false
        );

        expect(
          result.status
        ).toBe(
          PARAMETER_RESOLUTION_STATUS
            .VALIDATION_FAILED
        );
      }
    );

    test(
      "ambiguous parameter fails readiness",
      () => {
        const result =
          createParameterRecommendation({
            deterministicValidated:
              true,

            readyForExecution:
              true,

            ambiguous: [
              "pod",
            ],
          });

        expect(
          result.readyForExecution
        ).toBe(
          false
        );

        expect(
          result.status
        ).toBe(
          PARAMETER_RESOLUTION_STATUS
            .AMBIGUOUS
        );
      }
    );

    test(
      "unresolved required parameter fails readiness",
      () => {
        const result =
          createParameterRecommendation({
            deterministicValidated:
              true,

            readyForExecution:
              true,

            unresolved: [
              "namespace",
            ],
          });

        expect(
          result.readyForExecution
        ).toBe(
          false
        );

        expect(
          result.status
        ).toBe(
          PARAMETER_RESOLUTION_STATUS
            .UNRESOLVED
        );
      }
    );

    test(
      "only deterministic clean validation can produce READY",
      () => {
        const result =
          createParameterRecommendation({
            deterministicValidated:
              true,

            readyForExecution:
              true,

            resolvedParameters: {
              namespace:
                "production",

              pod:
                "api-123",
            },

            unresolved:
              [],

            ambiguous:
              [],

            validationErrors:
              [],
          });

        expect(
          result.readyForExecution
        ).toBe(
          true
        );

        expect(
          result.status
        ).toBe(
          PARAMETER_RESOLUTION_STATUS
            .READY
        );

        expect(
          result.executionAuthorized
        ).toBe(
          false
        );
      }
    );
  }
);