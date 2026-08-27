"use strict";


const CONFLICT_TYPES =
  Object.freeze({
    ACTION_CONFLICT:
      "ACTION_CONFLICT",

    OUTCOME_CONFLICT:
      "OUTCOME_CONFLICT",

    HUMAN_OVERRIDE_CONFLICT:
      "HUMAN_OVERRIDE_CONFLICT",

    SEMANTIC_CONTRADICTION:
      "SEMANTIC_CONTRADICTION",

    LIFECYCLE_CONFLICT:
      "LIFECYCLE_CONFLICT",
  });


const CONFLICT_SEVERITY =
  Object.freeze({
    LOW:
      "LOW",

    MEDIUM:
      "MEDIUM",

    HIGH:
      "HIGH",

    CRITICAL:
      "CRITICAL",
  });


class MemoryConflictResolver {

  normalizeString(
    value
  ) {
    if (
      value === null ||
      value === undefined
    ) {
      return null;
    }


    const normalized =
      String(
        value
      )
        .trim()
        .toLowerCase();


    return normalized ||
      null;
  }


  memoryType(
    memory
  ) {
    return String(
      memory?.memoryType ||
      memory?.memory_type ||
      ""
    )
      .trim()
      .toUpperCase();
  }


  publicId(
    memory
  ) {
    return (
      memory?.publicId ||
      memory?.public_id ||
      memory?.id ||
      null
    );
  }


  getProcedureAction(
    memory
  ) {
    return this.normalizeString(
      memory
        ?.content
        ?.procedure
        ?.action ||
      memory
        ?.content
        ?.recoveryDecision
        ?.action ||
      memory
        ?.content
        ?.recoveryDecision
        ?.decision ||
      null
    );
  }


  getHumanActionType(
    memory
  ) {
    return String(
      memory
        ?.content
        ?.humanAction
        ?.actionType ||
      ""
    )
      .trim()
      .toUpperCase();
  }


  getHumanRecommendation(
    memory
  ) {
    return this.normalizeString(
      memory
        ?.content
        ?.humanAction
        ?.recommendation ||
      null
    );
  }


  getHumanFinalAction(
    memory
  ) {
    return this.normalizeString(
      memory
        ?.content
        ?.humanAction
        ?.finalAction ||
      null
    );
  }


  getOutcomeClassification(
    memory
  ) {
    return String(
      memory
        ?.content
        ?.outcome
        ?.classification ||
      ""
    )
      .trim()
      .toUpperCase();
  }


  getSemanticEvidence(
    memory
  ) {
    const knowledge =
      memory
        ?.content
        ?.knowledge ||
      {};


    return {
      symptom:
        this.normalizeString(
          knowledge.symptom
        ),

      cause:
        this.normalizeString(
          knowledge.cause
        ),

      contradictingMemoryIds:
        Array.isArray(
          memory
            ?.content
            ?.contradictingMemoryIds
        )
          ? memory
              .content
              .contradictingMemoryIds
          : [],
    };
  }


  detectActionConflict(
    left,
    right
  ) {
    const leftType =
      this.memoryType(
        left
      );


    const rightType =
      this.memoryType(
        right
      );


    const procedure =
      leftType ===
        "PROCEDURAL"
        ? left
        : rightType ===
            "PROCEDURAL"
          ? right
          : null;


    const human =
      leftType ===
        "HUMAN"
        ? left
        : rightType ===
            "HUMAN"
          ? right
          : null;


    if (
      !procedure ||
      !human
    ) {
      return null;
    }


    const procedureAction =
      this.getProcedureAction(
        procedure
      );


    const humanActionType =
      this.getHumanActionType(
        human
      );


    const humanRecommendation =
      this.getHumanRecommendation(
        human
      );


    if (
      !procedureAction
    ) {
      return null;
    }


    if (
      humanActionType ===
        "REJECTED" &&
      humanRecommendation &&
      humanRecommendation ===
        procedureAction
    ) {
      return {
        type:
          CONFLICT_TYPES
            .HUMAN_OVERRIDE_CONFLICT,

        severity:
          CONFLICT_SEVERITY
            .HIGH,

        leftMemoryId:
          this.publicId(
            left
          ),

        rightMemoryId:
          this.publicId(
            right
          ),

        subject:
          procedureAction,

        message:
          (
            `Historical procedural evidence supports "${procedureAction}", ` +
            "but a human operator previously rejected that action."
          ),

        requiresHumanReview:
          true,
      };
    }


    if (
      humanActionType ===
        "MODIFIED"
    ) {
      const finalAction =
        this.getHumanFinalAction(
          human
        );


      if (
        humanRecommendation ===
          procedureAction &&
        finalAction &&
        finalAction !==
          procedureAction
      ) {
        return {
          type:
            CONFLICT_TYPES
              .ACTION_CONFLICT,

          severity:
            CONFLICT_SEVERITY
              .MEDIUM,

          leftMemoryId:
            this.publicId(
              left
            ),

          rightMemoryId:
            this.publicId(
              right
            ),

          subject:
            procedureAction,

          message:
            (
              `Procedural memory recommends "${procedureAction}", ` +
              `while human history modified it to "${finalAction}".`
            ),

          requiresHumanReview:
            true,
        };
      }
    }


    return null;
  }


  detectOutcomeConflict(
    left,
    right
  ) {
    const leftAction =
      this.getProcedureAction(
        left
      );


    const rightAction =
      this.getProcedureAction(
        right
      );


    const leftOutcome =
      this.getOutcomeClassification(
        left
      );


    const rightOutcome =
      this.getOutcomeClassification(
        right
      );


    if (
      !leftAction ||
      !rightAction ||
      leftAction !==
        rightAction
    ) {
      return null;
    }


    if (
      !leftOutcome ||
      !rightOutcome
    ) {
      return null;
    }


    const opposing =
      (
        leftOutcome ===
          "SUCCESS" &&
        rightOutcome ===
          "FAILED"
      ) ||
      (
        leftOutcome ===
          "FAILED" &&
        rightOutcome ===
          "SUCCESS"
      );


    if (
      !opposing
    ) {
      return null;
    }


    return {
      type:
        CONFLICT_TYPES
          .OUTCOME_CONFLICT,

      severity:
        CONFLICT_SEVERITY
          .MEDIUM,

      leftMemoryId:
        this.publicId(
          left
        ),

      rightMemoryId:
        this.publicId(
          right
        ),

      subject:
        leftAction,

      message:
        (
          `Conflicting recovery outcomes exist for "${leftAction}": ` +
          `${leftOutcome} versus ${rightOutcome}.`
        ),

      requiresHumanReview:
        false,
    };
  }


  detectSemanticConflict(
    left,
    right
  ) {
    const leftType =
      this.memoryType(
        left
      );


    const rightType =
      this.memoryType(
        right
      );


    if (
      leftType !==
        "SEMANTIC" ||
      rightType !==
        "SEMANTIC"
    ) {
      return null;
    }


    const leftSemantic =
      this.getSemanticEvidence(
        left
      );


    const rightSemantic =
      this.getSemanticEvidence(
        right
      );


    if (
      !leftSemantic.symptom ||
      !leftSemantic.cause ||
      !rightSemantic.symptom ||
      !rightSemantic.cause
    ) {
      return null;
    }


    if (
      leftSemantic.symptom !==
        rightSemantic.symptom
    ) {
      return null;
    }


    if (
      leftSemantic.cause ===
        rightSemantic.cause
    ) {
      return null;
    }


    return {
      type:
        CONFLICT_TYPES
          .SEMANTIC_CONTRADICTION,

      severity:
        CONFLICT_SEVERITY
          .MEDIUM,

      leftMemoryId:
        this.publicId(
          left
        ),

      rightMemoryId:
        this.publicId(
          right
        ),

      subject:
        leftSemantic.symptom,

      message:
        (
          `Competing semantic explanations exist for "${leftSemantic.symptom}": ` +
          `"${leftSemantic.cause}" versus "${rightSemantic.cause}".`
        ),

      requiresHumanReview:
        false,
    };
  }


  detectLifecycleConflict(
    left,
    right
  ) {
    const leftStatus =
      String(
        left?.status ||
        ""
      )
        .trim()
        .toUpperCase();


    const rightStatus =
      String(
        right?.status ||
        ""
      )
        .trim()
        .toUpperCase();


    if (
      leftStatus ===
        "REVOKED" ||
      rightStatus ===
        "REVOKED"
    ) {
      return {
        type:
          CONFLICT_TYPES
            .LIFECYCLE_CONFLICT,

        severity:
          CONFLICT_SEVERITY
            .CRITICAL,

        leftMemoryId:
          this.publicId(
            left
          ),

        rightMemoryId:
          this.publicId(
            right
          ),

        subject:
          "memory-lifecycle",

        message:
          "A revoked memory entered conflict evaluation.",

        requiresHumanReview:
          false,
      };
    }


    return null;
  }


  detectPair(
    left,
    right
  ) {
    const detectors = [
      this.detectLifecycleConflict
        .bind(
          this
        ),

      this.detectActionConflict
        .bind(
          this
        ),

      this.detectOutcomeConflict
        .bind(
          this
        ),

      this.detectSemanticConflict
        .bind(
          this
        ),
    ];


    for (
      const detector
      of detectors
    ) {
      const conflict =
        detector(
          left,
          right
        );


      if (
        conflict
      ) {
        return conflict;
      }
    }


    return null;
  }


  resolve(
    memories =
      []
  ) {
    if (
      !Array.isArray(
        memories
      )
    ) {
      const error =
        new Error(
          "Memories must be an array"
        );

      error.code =
        "MEMORY_CONFLICT_MEMORIES_INVALID";

      error.status =
        422;

      throw error;
    }


    const conflicts =
      [];


    for (
      let leftIndex = 0;
      leftIndex <
        memories.length;
      leftIndex +=
        1
    ) {
      for (
        let rightIndex =
          leftIndex +
          1;
        rightIndex <
          memories.length;
        rightIndex +=
          1
      ) {
        const conflict =
          this.detectPair(
            memories[
              leftIndex
            ],
            memories[
              rightIndex
            ]
          );


        if (
          conflict
        ) {
          conflicts.push(
            conflict
          );
        }
      }
    }


    const requiresHumanReview =
      conflicts.some(
        (
          conflict
        ) =>
          conflict
            .requiresHumanReview ===
          true
      );


    const critical =
      conflicts.some(
        (
          conflict
        ) =>
          conflict.severity ===
          CONFLICT_SEVERITY
            .CRITICAL
      );


    return {
      hasConflicts:
        conflicts.length >
        0,

      conflictCount:
        conflicts.length,

      conflicts,

      requiresHumanReview,

      critical,

      safety: {
        executionAuthorized:
          false,

        grantsExecutionPermission:
          false,

        automaticConflictResolution:
          false,
      },
    };
  }
}


const memoryConflictResolver =
  new MemoryConflictResolver();


module.exports = {
  CONFLICT_TYPES,

  CONFLICT_SEVERITY,

  MemoryConflictResolver,

  memoryConflictResolver,
};