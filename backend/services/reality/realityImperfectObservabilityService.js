"use strict";


const crypto =
  require(
    "node:crypto"
  );


const REALITY_IMPERFECT_OBSERVABILITY_VERSION =
  "23R.11.0";


const IMPERFECT_OBSERVABILITY_PROFILE =
  Object.freeze({
    CLEAN:
      "CLEAN",

    DEGRADED:
      "DEGRADED",

    SEVERE:
      "SEVERE",
  });


const PROFILE_CONFIG =
  Object.freeze({
    CLEAN:
      Object.freeze({
        dropEvery:
          0,

        duplicateEvery:
          0,

        delayEvery:
          0,

        delayMs:
          0,

        staleEvery:
          0,

        clockSkewEvery:
          0,

        clockSkewMs:
          0,

        reorderWindow:
          0,
      }),

    DEGRADED:
      Object.freeze({
        dropEvery:
          7,

        duplicateEvery:
          5,

        delayEvery:
          3,

        delayMs:
          15000,

        staleEvery:
          6,

        clockSkewEvery:
          5,

        clockSkewMs:
          5000,

        reorderWindow:
          2,
      }),

    SEVERE:
      Object.freeze({
        dropEvery:
          4,

        duplicateEvery:
          3,

        delayEvery:
          2,

        delayMs:
          45000,

        staleEvery:
          3,

        clockSkewEvery:
          2,

        clockSkewMs:
          20000,

        reorderWindow:
          3,
      }),
  });


const FORBIDDEN_KEYS =
  new Set([
    "sealedEvaluation",

    "evaluationRubric",

    "groundTruth",

    "knownFault",

    "expectedDiagnosis",

    "acceptableDiagnoses",

    "expectedRecoveryFamily",

    "rootCause",
  ]);


const AUTHORITY_KEYS =
  new Set([
    "executionAuthorized",

    "productionAuthorized",

    "authorizationGranted",
  ]);


function realismError(
  code,
  message,
  status =
    422
) {
  return Object.assign(
    new Error(
      message
    ),
    {
      code,

      status,

      executionAuthorized:
        false,

      productionCertified:
        false,
    }
  );
}


function requireObject(
  value,
  field
) {
  if (
    !value ||

    typeof value !==
      "object" ||

    Array.isArray(
      value
    )
  ) {
    throw realismError(
      "REALITY_IMPERFECT_OBSERVABILITY_OBJECT_REQUIRED",

      `${field} must be an object`
    );
  }


  return value;
}


function requireNonnegativeInteger(
  value,
  field
) {
  const parsed =
    Number(
      value
    );


  if (
    !Number.isSafeInteger(
      parsed
    ) ||

    parsed <
      0
  ) {
    throw realismError(
      "REALITY_IMPERFECT_OBSERVABILITY_INTEGER_INVALID",

      `${field} must be a non-negative integer`
    );
  }


  return parsed;
}


function findForbiddenField(
  value,
  path =
    "root"
) {
  if (
    !value ||

    typeof value !==
      "object"
  ) {
    return null;
  }


  if (
    Array.isArray(
      value
    )
  ) {
    for (
      let index = 0;
      index < value.length;
      index += 1
    ) {
      const found =
        findForbiddenField(
          value[
            index
          ],

          `${path}[${index}]`
        );


      if (
        found
      ) {
        return found;
      }
    }


    return null;
  }


  for (
    const [
      key,
      child,
    ]
    of Object.entries(
      value
    )
  ) {
    if (
      FORBIDDEN_KEYS.has(
        key
      )
    ) {
      return (
        `${path}.${key}`
      );
    }


    if (
      AUTHORITY_KEYS.has(
        key
      ) &&

      child ===
        true
    ) {
      return (
        `${path}.${key}`
      );
    }


    const nested =
      findForbiddenField(
        child,

        `${path}.${key}`
      );


    if (
      nested
    ) {
      return nested;
    }
  }


  return null;
}


function deterministicNumber(
  seed,
  eventId,
  salt
) {
  const digest =
    crypto
      .createHash(
        "sha256"
      )
      .update(
        (
          `${seed}\0` +
          `${eventId}\0` +
          `${salt}`
        )
      )
      .digest();


  return digest
    .readUInt32BE(
      0
    );
}


function clone(
  value
) {
  return JSON.parse(
    JSON.stringify(
      value
    )
  );
}


function shouldApply(
  {
    seed,

    eventId,

    salt,

    every,
  }
) {
  if (
    every <=
      0
  ) {
    return false;
  }


  return (
    deterministicNumber(
      seed,
      eventId,
      salt
    ) %
      every ===
    0
  );
}


function applyWindowedReorder(
  events,
  windowSize,
  seed
) {
  if (
    windowSize <=
      1 ||

    events.length <=
      1
  ) {
    return events;
  }


  const output =
    [];


  for (
    let start = 0;
    start < events.length;
    start += windowSize
  ) {
    const window =
      events.slice(
        start,
        start +
          windowSize
      );


    window.sort(
      (
        left,
        right
      ) => {
        const leftRank =
          deterministicNumber(
            seed,
            left.eventId,
            "reorder"
          );


        const rightRank =
          deterministicNumber(
            seed,
            right.eventId,
            "reorder"
          );


        return (
          leftRank -
          rightRank
        );
      }
    );


    output.push(
      ...window
    );
  }


  return output;
}


function buildImperfectObservabilityPlan(
  input =
    {}
) {
  const caseResult =
    requireObject(
      input.caseResult,
      "caseResult"
    );


  const realityCase =
    requireObject(
      caseResult.realityCase,
      "caseResult.realityCase"
    );


  const forbidden =
    findForbiddenField(
      caseResult
    );


  if (
    forbidden
  ) {
    throw realismError(
      "REALITY_IMPERFECT_OBSERVABILITY_CONTEXT_FORBIDDEN",

      (
        "Replay-visible case contains forbidden " +
        "evaluator or authority data at " +
        forbidden
      ),

      403
    );
  }


  if (
    realityCase
      .sealing
      ?.groundTruthAgentVisible !==
      false
  ) {
    throw realismError(
      "REALITY_IMPERFECT_OBSERVABILITY_SEALING_REQUIRED",

      (
        "Imperfect-observability planning " +
        "requires sealed ground truth"
      ),

      403
    );
  }


  const profile =
    input.profile ||
    IMPERFECT_OBSERVABILITY_PROFILE
      .DEGRADED;


  const config =
    PROFILE_CONFIG[
      profile
    ];


  if (
    !config
  ) {
    throw realismError(
      "REALITY_IMPERFECT_OBSERVABILITY_PROFILE_UNKNOWN",

      (
        "Unknown imperfect-observability " +
        `profile: ${profile}`
      )
    );
  }


  const seed =
    requireNonnegativeInteger(
      (
        input.seed ??

        realityCase
          .replayConfiguration
          ?.seed ??

        0
      ),

      "seed"
    );


  if (
    !Array.isArray(
      realityCase.timeline
    )
  ) {
    throw realismError(
      "REALITY_IMPERFECT_OBSERVABILITY_TIMELINE_REQUIRED",

      "RealityCase timeline is required"
    );
  }


  const operations =
    [];


  const transformed =
    [];


  realityCase.timeline
    .forEach(
      (
        rawEvent,
        index
      ) => {
        const event =
          clone(
            rawEvent
          );


        const eventId =
          String(
            event.eventId ||
            `event_${index}`
          );


        event.eventId =
          eventId;


        if (
          shouldApply({
            seed,

            eventId,

            salt:
              "drop",

            every:
              config.dropEvery,
          })
        ) {
          operations.push({
            eventId,

            operation:
              "DROP",
          });


          return;
        }


        if (
          shouldApply({
            seed,

            eventId,

            salt:
              "delay",

            every:
              config.delayEvery,
          })
        ) {
          event.offsetMs =
            Number(
              event.offsetMs ||
              0
            ) +
            config.delayMs;


          operations.push({
            eventId,

            operation:
              "DELAY",

            delayMs:
              config.delayMs,
          });
        }


        if (
          shouldApply({
            seed,

            eventId,

            salt:
              "stale",

            every:
              config.staleEvery,
          })
        ) {
          event.observability =
            {
              ...(
                event.observability ||
                {}
              ),

              stale:
                true,
            };


          operations.push({
            eventId,

            operation:
              "MARK_STALE",
          });
        }


        if (
          shouldApply({
            seed,

            eventId,

            salt:
              "clock-skew",

            every:
              config.clockSkewEvery,
          })
        ) {
          const direction =
            deterministicNumber(
              seed,
              eventId,
              "clock-skew-direction"
            ) %
              2 ===
            0
              ? -1
              : 1;


          const skewMs =
            direction *
            config.clockSkewMs;


          event.offsetMs =
            Math.max(
              0,

              Number(
                event.offsetMs ||
                0
              ) +
                skewMs
            );


          event.observability =
            {
              ...(
                event.observability ||
                {}
              ),

              clockSkewMs:
                skewMs,
            };


          operations.push({
            eventId,

            operation:
              "CLOCK_SKEW",

            skewMs,
          });
        }


        transformed.push(
          event
        );


        if (
          shouldApply({
            seed,

            eventId,

            salt:
              "duplicate",

            every:
              config.duplicateEvery,
          })
        ) {
          const duplicate =
            {
              ...clone(
                event
              ),

              eventId:
                (
                  `${eventId}` +
                  "__duplicate"
                ),

              duplicateOfEventId:
                eventId,

              observability:
                {
                  ...(
                    event.observability ||
                    {}
                  ),

                  duplicate:
                    true,
                },
            };


          transformed.push(
            duplicate
          );


          operations.push({
            eventId,

            operation:
              "DUPLICATE",
          });
        }
      }
    );


  const reordered =
    applyWindowedReorder(
      transformed,

      config.reorderWindow,

      seed
    );


  const schedule =
    reordered.map(
      (
        event,
        deliveryIndex
      ) => ({
        ...event,

        deliveryIndex,

        observabilityProfile:
          profile,
      })
    );


  return {
    version:
      REALITY_IMPERFECT_OBSERVABILITY_VERSION,

    profile,

    seed,

    originalEventCount:
      realityCase.timeline.length,

    deliveredEventCount:
      schedule.length,

    operations,

    schedule,

    guarantees: {
      deterministicForSameSeed:
        true,

      evaluationChannelModified:
        false,

      groundTruthAgentVisible:
        false,

      executionAuthorityCreated:
        false,
    },

    groundTruthAgentVisible:
      false,

    executionAuthorized:
      false,

    productionCertified:
      false,
  };
}


module.exports = {
  REALITY_IMPERFECT_OBSERVABILITY_VERSION,

  IMPERFECT_OBSERVABILITY_PROFILE,

  PROFILE_CONFIG,

  FORBIDDEN_KEYS,

  AUTHORITY_KEYS,

  findForbiddenField,

  buildImperfectObservabilityPlan,
};