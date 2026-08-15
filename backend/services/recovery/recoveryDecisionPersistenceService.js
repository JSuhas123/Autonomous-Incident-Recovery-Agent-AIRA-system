"use strict";

const mongoose =
  require(
    "mongoose"
  );

const RecoveryDecision =
  require(
    "../../models/RecoveryDecision"
  );

const RecoveryDecisionRun =
  require(
    "../../models/RecoveryDecisionRun"
  );

class RecoveryDecisionPersistenceService {
  // ==========================================================================
  // MAIN ENTRY
  // ==========================================================================

  async persist({
    engineResult,
    criticResult,
    organizationId,
    environmentId,
    incidentId,
    diagnosisId = null,
    diagnosisRevision = null,
  }) {
    this.assertInput({
      engineResult,
      criticResult,
      organizationId,
      environmentId,
      incidentId,
    });

    const session =
      await mongoose
        .startSession();

    let persistedRun;
    let persistedDecision;

    try {
      await session
        .withTransaction(
          async () => {
            // =================================================================
            // 1. CREATE RUN
            // =================================================================

            persistedRun =
              await this.createRun(
                {
                  engineResult,
                  criticResult,
                  organizationId,
                  environmentId,
                  incidentId,
                  diagnosisId,
                  diagnosisRevision,
                },
                session
              );

            // =================================================================
            // 2. FIND CURRENT DECISION
            // =================================================================

            const currentDecision =
              await RecoveryDecision
                .findOne({
                  organizationId,
                  environmentId,
                  incidentId,
                  isCurrent:
                    true,
                })
                .session(
                  session
                );

            // =================================================================
            // 3. REVISION
            // =================================================================

            const revision =
              currentDecision
                ? currentDecision
                    .revision +
                  1
                : 1;

            // =================================================================
            // 4. SUPERSEDE OLD
            // =================================================================

            if (
              currentDecision
            ) {
              currentDecision
                .isCurrent =
                false;

              currentDecision
                .status =
                "superseded";

              await currentDecision
                .save({
                  session,
                });
            }

            // =================================================================
            // 5. CREATE NEW
            // =================================================================

            persistedDecision =
              await this.createDecision(
                {
                  engineResult,
                  criticResult,
                  organizationId,
                  environmentId,
                  incidentId,
                  diagnosisId,
                  diagnosisRevision,
                  revision,
                  previousDecision:
                    currentDecision,
                  run:
                    persistedRun,
                },
                session
              );

            // =================================================================
            // 6. LINK OLD -> NEW
            // =================================================================

            if (
              currentDecision
            ) {
              currentDecision
                .supersededByDecisionId =
                persistedDecision
                  ._id;

              await currentDecision
                .save({
                  session,
                });
            }

            // =================================================================
            // 7. LINK RUN -> DECISION
            // =================================================================

            persistedRun
              .decisionId =
              persistedDecision
                ._id;

            await persistedRun
              .save({
                session,
              });
          }
        );

      return {
        run:
          persistedRun,

        decision:
          persistedDecision,

        revision:
          persistedDecision
            .revision,

        isCurrent:
          persistedDecision
            .isCurrent,

        executionAuthorized:
          false,
      };
    } finally {
      await session
        .endSession();
    }
  }

  // ==========================================================================
  // CREATE RUN
  // ==========================================================================

  async createRun(
    {
      engineResult,
      criticResult,
      organizationId,
      environmentId,
      incidentId,
      diagnosisId,
      diagnosisRevision,
    },
    session
  ) {
    const decision =
      engineResult.decision;

    const startedAt =
      engineResult.startedAt ||
      new Date();

    const completedAt =
      engineResult.completedAt ||
      new Date();

    const run =
      new RecoveryDecisionRun({
        runId:
          decision
            ?.metadata
            ?.runId ||
          decision
            ?.decisionId ||
          `recovery-run:${Date.now()}`,

        organizationId,

        environmentId,

        incidentId,

        diagnosisId,

        diagnosisRevision,

        decisionType:
          decision.decision,

        selectedCandidateId:
          decision
            .selectedCandidateId,

        selectedPlaybookId:
          decision
            .selectedPlaybookId,

        confidence:
          decision.confidence,

        stageTrace:
          engineResult
            .stageTrace ||
          [],

        candidateSnapshot:
          engineResult
            .candidates ||
          [],

        criticResult,

        status:
          "completed",

        startedAt,

        completedAt,

        durationMs:
          Math.max(
            0,
            completedAt -
            startedAt
          ),

        executionAuthorized:
          false,

        metadata: {
          engineVersion:
            decision
              ?.metadata
              ?.engineVersion ||
            null,
        },
      });

    await run.save({
      session,
    });

    return run;
  }

  // ==========================================================================
  // CREATE DECISION
  // ==========================================================================

  async createDecision(
    {
      engineResult,
      criticResult,
      organizationId,
      environmentId,
      incidentId,
      diagnosisId,
      diagnosisRevision,
      revision,
      previousDecision,
      run,
    },
    session
  ) {
    const source =
      engineResult.decision;

    const status =
      criticResult
        ?.rejected
        ? "rejected"
        : criticResult
            ?.requiresManualReview
          ? "manual_review"
          : "current";

    const decision =
      new RecoveryDecision({
        decisionId:
          source.decisionId,

        organizationId,

        environmentId,

        incidentId,

        diagnosisId,

        diagnosisRevision,

        runId:
          run.runId,

        revision,

        isCurrent:
          true,

        status,

        decision:
          source.decision,

        selectedCandidateId:
          source
            .selectedCandidateId,

        selectedPlaybookId:
          source
            .selectedPlaybookId,

        confidence:
          source.confidence,

        candidates:
          source.candidates ||
          [],

        rejectedCandidates:
          source
            .rejectedCandidates ||
          [],

        reasons:
          source.reasons ||
          [],

        unknowns:
          source.unknowns ||
          [],

        policyStatus:
          source.policyStatus,

        riskLevel:
          source.riskLevel,

        approvalRequired:
          source.approvalRequired,

        approvalMode:
          source.approvalMode,

        rollbackAvailable:
          source.rollbackAvailable,

        reversibility:
          source.reversibility,

        criticResult,

        supersedesDecisionId:
          previousDecision
            ?._id ||
          null,

        generatedAt:
          source.generatedAt ||
          new Date(),

        executionAuthorized:
          false,

        metadata: {
          ...(
            source.metadata ||
            {}
          ),

          criticVersion:
            criticResult
              ?.criticVersion ||
            null,
        },
      });

    await decision.save({
      session,
    });

    return decision;
  }

  // ==========================================================================
  // INPUT
  // ==========================================================================

  assertInput({
    engineResult,
    criticResult,
    organizationId,
    environmentId,
    incidentId,
  }) {
    if (
      !engineResult
        ?.decision
    ) {
      throw Object.assign(
        new Error(
          "Recovery engine result is required"
        ),
        {
          code:
            "RECOVERY_PERSISTENCE_ENGINE_RESULT_REQUIRED",
        }
      );
    }

    if (
      !criticResult
    ) {
      throw Object.assign(
        new Error(
          "Recovery critic result is required"
        ),
        {
          code:
            "RECOVERY_PERSISTENCE_CRITIC_REQUIRED",
        }
      );
    }

    if (
      !organizationId ||
      !environmentId ||
      !incidentId
    ) {
      throw Object.assign(
        new Error(
          "Recovery persistence requires organization, environment and incident scope"
        ),
        {
          code:
            "RECOVERY_PERSISTENCE_SCOPE_REQUIRED",
        }
      );
    }

    if (
      engineResult
        ?.executionAuthorized ===
        true ||
      engineResult
        ?.decision
        ?.executionAuthorized ===
        true ||
      criticResult
        ?.executionAuthorized ===
        true
    ) {
      throw Object.assign(
        new Error(
          "Recovery persistence received unsafe execution authorization"
        ),
        {
          code:
            "RECOVERY_PERSISTENCE_UNSAFE_INPUT",
        }
      );
    }
  }
}

module.exports =
  new RecoveryDecisionPersistenceService();

module.exports
  .RecoveryDecisionPersistenceService =
  RecoveryDecisionPersistenceService;