"use strict";

const {
  RECOVERY_DECISION,
  CANDIDATE_STATUS,
  createRecoveryCandidate,
  createRecoveryDecision,
  validateRecoveryCandidate,
  validateRecoveryDecision,
} =
  require(
    "../recoveryDecisionContracts"
  );

describe(
  "RecoveryDecisionContracts",
  () => {
    test(
      "creates safe recovery candidate",
      () => {
        const candidate =
          createRecoveryCandidate({
            playbookId:
              "k8s.restart-deployment.v1",

            title:
              "Restart deployment",

            status:
              CANDIDATE_STATUS
                .APPLICABLE,

            diagnosisMatch: {
              score:
                0.9,
            },
          });

        expect(
          candidate.playbookId
        )
          .toBe(
            "k8s.restart-deployment.v1"
          );

        expect(
          candidate.executionAuthorized
        )
          .toBe(
            false
          );

        expect(
          validateRecoveryCandidate(
            candidate
          )
            .valid
        )
          .toBe(
            true
          );
      }
    );

    test(
      "creates recommendation without execution authorization",
      () => {
        const decision =
          createRecoveryDecision({
            incidentId:
              "incident-1",

            diagnosisId:
              "diagnosis-1",

            decision:
              RECOVERY_DECISION
                .RECOMMEND_PLAYBOOK,

            selectedPlaybookId:
              "k8s.restart-deployment.v1",

            confidence:
              0.9,
          });

        expect(
          decision.decision
        )
          .toBe(
            RECOVERY_DECISION
              .RECOMMEND_PLAYBOOK
          );

        expect(
          decision.executionAuthorized
        )
          .toBe(
            false
          );

        expect(
          validateRecoveryDecision(
            decision
          )
            .valid
        )
          .toBe(
            true
          );
      }
    );

    test(
      "recommendation requires playbook",
      () => {
        const decision =
          createRecoveryDecision({
            decision:
              RECOVERY_DECISION
                .RECOMMEND_PLAYBOOK,
          });

        const validation =
          validateRecoveryDecision(
            decision
          );

        expect(
          validation.valid
        )
          .toBe(
            false
          );
      }
    );

    test(
      "candidate cannot authorize execution",
      () => {
        const candidate =
          createRecoveryCandidate({
            playbookId:
              "test-playbook",
          });

        candidate
          .executionAuthorized =
          true;

        expect(
          validateRecoveryCandidate(
            candidate
          )
            .valid
        )
          .toBe(
            false
          );
      }
    );
    test(
  "preserves action risk dimensions",
  () => {
    const candidate =
      createRecoveryCandidate({
        playbookId:
          "risk-test",

        actionRisk: {
          level:
            "HIGH",

          score:
            0.8,

          reasons: [
            "High data risk",
          ],

          dimensions: [
            {
              name:
                "dataRisk",

              value:
                0.9,

              weight:
                0.1,
            },
          ],
        },
      });

    expect(
      candidate
        .actionRisk
        .dimensions
    )
      .toHaveLength(
        1
      );

    expect(
      candidate
        .actionRisk
        .dimensions[0]
        .name
    )
      .toBe(
        "dataRisk"
      );

    expect(
      candidate
        .actionRisk
        .dimensions[0]
        .value
    )
      .toBe(
        0.9
      );

    expect(
      candidate
        .executionAuthorized
    )
      .toBe(
        false
      );
  }
);

    test(
      "decision cannot authorize execution",
      () => {
        const decision =
          createRecoveryDecision({
            decision:
              RECOVERY_DECISION
                .MONITOR_ONLY,
          });

        decision
          .executionAuthorized =
          true;

        expect(
          validateRecoveryDecision(
            decision
          )
            .valid
        )
          .toBe(
            false
          );
      }
    );
  }
);