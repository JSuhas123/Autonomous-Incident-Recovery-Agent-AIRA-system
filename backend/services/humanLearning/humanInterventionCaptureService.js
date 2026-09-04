"use strict";

/**
 * ============================================================================
 * AIRA PHASE 24.1
 * STRUCTURED HUMAN INTERVENTION CAPTURE
 * ============================================================================
 *
 * This service records what a human did.
 *
 * It does NOT decide whether the human was correct.
 *
 * Human diagnosis remains an ASSERTION.
 *
 * Human observations remain OBSERVATIONS.
 *
 * ============================================================================
 */


const {
  INTERVENTION_EVENT_TYPE,

  TRUTH_LEVEL,

  assertNoExecutionAuthority,

  humanLearningError,
} =
  require(
    "../../contracts/humanLearning"
  );


const {
  PostgresHumanLearningRepository,
} =
  require(
    "../../persistence/postgres/PostgresHumanLearningRepository"
  );


class HumanInterventionCaptureService {
  constructor(
    options = {}
  ) {
    this.repository =
      options.repository ||
      new PostgresHumanLearningRepository(
        options
      );
  }


  async startSession(
    input = {}
  ) {
    assertNoExecutionAuthority(
      input
    );


    const session =
      await this.repository
        .createSession(
          input
        );


    if (
      !session ||
      session.executionAuthorized !==
        false
    ) {
      throw humanLearningError(
        "HUMAN_LEARNING_SESSION_SAFETY_INVARIANT_FAILED",
        "Persisted intervention session violated the no-authority invariant",
        500
      );
    }


    if (
      input.recordStartEvent !==
      false
    ) {
      await this.repository
        .appendEvent({
          organizationId:
            input.organizationId,

          environmentId:
            input.environmentId,

          sessionId:
            session.publicId ||
            session.id,

          eventType:
            INTERVENTION_EVENT_TYPE
              .INVESTIGATION_STARTED,

          truthLevel:
            TRUTH_LEVEL
              .OBSERVATION,

          actorType:
            input.operatorType ||
            "HUMAN",

          actorUserId:
            input.operatorUserId ||
            null,

          summary:
            input.startSummary ||
            "Human investigation started",

          payload:
            {},

          evidenceRefs:
            [],

          executionAuthorized:
            false,
        });
    }


    return session;
  }


  async recordEvent(
    input = {}
  ) {
    assertNoExecutionAuthority(
      input
    );


    const event =
      await this.repository
        .appendEvent(
          input
        );


    if (
      !event ||
      event.executionAuthorized !==
        false
    ) {
      throw humanLearningError(
        "HUMAN_LEARNING_EVENT_SAFETY_INVARIANT_FAILED",
        "Persisted intervention event violated the no-authority invariant",
        500
      );
    }


    return event;
  }


  async completeSession(
    input = {}
  ) {
    assertNoExecutionAuthority(
      input
    );


    /*
     * Capture completion BEFORE closing the session,
     * because the repository correctly refuses writes
     * to closed sessions.
     */
    if (
      input.recordCompletionEvent !==
      false
    ) {
      await this.repository
        .appendEvent({
          organizationId:
            input.organizationId,

          environmentId:
            input.environmentId,

          sessionId:
            input.sessionId,

          eventType:
            INTERVENTION_EVENT_TYPE
              .INVESTIGATION_COMPLETED,

          truthLevel:
            TRUTH_LEVEL
              .OBSERVATION,

          actorType:
            input.actorType ||
            "HUMAN",

          actorUserId:
            input.actorUserId ||
            null,

          summary:
            input.summary ||
            "Human investigation completed",

          payload:
            input.payload ||
            {},

          evidenceRefs:
            input.evidenceRefs ||
            [],

          executionAuthorized:
            false,
        });
    }


    const session =
      await this.repository
        .completeSession(
          input
        );


    if (
      !session ||
      session.executionAuthorized !==
        false
    ) {
      throw humanLearningError(
        "HUMAN_LEARNING_SESSION_SAFETY_INVARIANT_FAILED",
        "Completed intervention session violated the no-authority invariant",
        500
      );
    }


    return session;
  }
}


module.exports = {
  HumanInterventionCaptureService,
};