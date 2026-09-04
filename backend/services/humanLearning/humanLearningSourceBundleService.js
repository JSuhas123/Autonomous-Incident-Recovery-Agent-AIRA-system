"use strict";

/**
 * ============================================================================
 * AIRA PHASE 24.1
 * HUMAN LEARNING SOURCE BUNDLE SERVICE
 * ============================================================================
 *
 * A source bundle is an immutable/frozen representation of the human
 * intervention timeline used as input to candidate generation.
 *
 * Candidate generators must consume this bundle rather than mutable
 * incident state.
 *
 * ============================================================================
 */


const crypto =
  require(
    "node:crypto"
  );


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


function canonicalize(
  value
) {
  if (
    Array.isArray(
      value
    )
  ) {
    return value.map(
      canonicalize
    );
  }


  if (
    value &&
    typeof value ===
      "object"
  ) {
    return Object
      .keys(
        value
      )
      .sort()
      .reduce(
        (
          output,
          key
        ) => {
          output[
            key
          ] =
            canonicalize(
              value[
                key
              ]
            );


          return output;
        },
        {}
      );
  }


  return value;
}


function sha256(
  value
) {
  return crypto
    .createHash(
      "sha256"
    )
    .update(
      JSON.stringify(
        canonicalize(
          value
        )
      )
    )
    .digest(
      "hex"
    );
}


function eventProjection(
  event
) {
  return {
    sequenceNumber:
      event.sequenceNumber,

    eventType:
      event.eventType,

    truthLevel:
      event.truthLevel,

    summary:
      event.summary ||
      null,

    payload:
      event.payload ||
      {},

    evidenceRefs:
      event.evidenceRefs ||
      [],

    occurredAt:
      event.occurredAt ||
      null,
  };
}


class HumanLearningSourceBundleService {
  constructor(
    options = {}
  ) {
    this.repository =
      options.repository ||
      new PostgresHumanLearningRepository(
        options
      );
  }


  async freeze(
    input = {}
  ) {
    assertNoExecutionAuthority(
      input
    );


    const session =
      await this.repository
        .getSession(
          input
        );


    if (
      !session
    ) {
      throw humanLearningError(
        "HUMAN_LEARNING_SESSION_NOT_FOUND",
        "Intervention session not found",
        404
      );
    }


    if (
      session.status !==
      "COMPLETED"
    ) {
      throw humanLearningError(
        "HUMAN_LEARNING_SOURCE_SESSION_NOT_COMPLETED",
        "Only completed intervention sessions can become frozen learning sources",
        409
      );
    }


    const events =
      await this.repository
        .listEvents(
          input
        );


    if (
      !events.length
    ) {
      throw humanLearningError(
        "HUMAN_LEARNING_SOURCE_EVENTS_REQUIRED",
        "A completed intervention session must contain events before freezing"
      );
    }


    const projected =
      events.map(
        eventProjection
      );


    const observations =
      projected.filter(
        (
          event
        ) =>
          event.truthLevel ===
          TRUTH_LEVEL
            .OBSERVATION
      );


    const assertions =
      projected.filter(
        (
          event
        ) =>
          event.truthLevel ===
          TRUTH_LEVEL
            .ASSERTION
      );


    const diagnosis =
      projected.filter(
        (
          event
        ) =>
          event.eventType ===
          INTERVENTION_EVENT_TYPE
            .DIAGNOSIS_DECLARED
      );


    const actions =
      projected.filter(
        (
          event
        ) =>
          [
            INTERVENTION_EVENT_TYPE
              .ACTION_PROPOSED,

            INTERVENTION_EVENT_TYPE
              .ACTION_ATTEMPTED,

            INTERVENTION_EVENT_TYPE
              .ACTION_REJECTED,

            INTERVENTION_EVENT_TYPE
              .ACTION_FAILED,

            INTERVENTION_EVENT_TYPE
              .ACTION_SUCCEEDED,

            INTERVENTION_EVENT_TYPE
              .MITIGATION_APPLIED,

            INTERVENTION_EVENT_TYPE
              .ROOT_FIX_APPLIED,
          ].includes(
            event.eventType
          )
      );


    const verification =
      projected.filter(
        (
          event
        ) =>
          event.eventType ===
          INTERVENTION_EVENT_TYPE
            .VERIFICATION_PERFORMED
      );


    const outcomes =
      projected.filter(
        (
          event
        ) =>
          event.eventType ===
          INTERVENTION_EVENT_TYPE
            .OUTCOME_DECLARED
      );


    const digestMaterial = {
      version:
        1,

      interventionSessionId:
        session.publicId ||
        session.id,

      incidentId:
        session.incidentId,

      events:
        projected,
    };


    const sourceDigest =
      sha256(
        digestMaterial
      );


    const bundle =
      await this.repository
        .createSourceBundle({
          organizationId:
            input.organizationId,

          environmentId:
            input.environmentId,

          sessionId:
            input.sessionId,

          bundleVersion:
            1,

          observationPayload:
            observations,

          assertionPayload:
            assertions,

          diagnosisPayload:
            diagnosis,

          actionPayload:
            actions,

          verificationPayload:
            verification,

          outcomePayload:
            outcomes,

          provenance: {
            interventionSessionId:
              session.publicId ||
              session.id,

            incidentId:
              session.incidentId,

            eventCount:
              projected.length,

            frozenBy:
              "humanLearningSourceBundleService",
          },

          sourceDigest,

          executionAuthorized:
            false,
        });


    if (
      !bundle ||
      bundle.executionAuthorized !==
        false
    ) {
      throw humanLearningError(
        "HUMAN_LEARNING_SOURCE_SAFETY_INVARIANT_FAILED",
        "Frozen learning source violated the no-authority invariant",
        500
      );
    }


    return bundle;
  }
}


module.exports = {
  HumanLearningSourceBundleService,

  canonicalize,

  sha256,
};