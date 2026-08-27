"use strict";


class SystemDnaSynthesizer {

  normalizeString(
    value
  ) {
    if (
      value ===
        null ||
      value ===
        undefined
    ) {
      return null;
    }


    const normalized =
      String(
        value
      ).trim();


    return normalized ||
      null;
  }


  publicId(
    memory
  ) {
    return (
      memory?.publicId ||
      memory?.public_id ||
      null
    );
  }


  summary(
    memory
  ) {
    return this.normalizeString(
      memory?.summary ||
      memory?.title ||
      null
    );
  }


  uniqueObjects(
    values =
      []
  ) {
    const seen =
      new Set();


    const result =
      [];


    for (
      const value
      of values
    ) {
      if (
        !value ||
        typeof value !==
          "object"
      ) {
        continue;
      }


      const key =
        JSON.stringify(
          value
        );


      if (
        seen.has(
          key
        )
      ) {
        continue;
      }


      seen.add(
        key
      );


      result.push(
        value
      );
    }


    return result;
  }


  synthesizeEpisodic(
    memories =
      []
  ) {
    return memories
      .map(
        (
          memory
        ) => ({
          memoryId:
            this.publicId(
              memory
            ),

          incidentId:
            memory.incidentPublicId ||
            memory.incidentId ||
            null,

          summary:
            this.summary(
              memory
            ),

          confidence:
            Number(
              memory.confidence ||
              0
            ),
        })
      )
      .filter(
        (
          item
        ) =>
          item.memoryId
      );
  }


  synthesizeOutcomes(
    memories =
      []
  ) {
    return memories
      .map(
        (
          memory
        ) => {
          const content =
            memory.content ||
            {};


          return {
            memoryId:
              this.publicId(
                memory
              ),

            incidentId:
              memory.incidentPublicId ||
              memory.incidentId ||
              null,

            action:
              this.normalizeString(
                content
                  ?.recoveryDecision
                  ?.action ||
                content
                  ?.recoveryDecision
                  ?.decision ||
                content
                  ?.action
              ),

            classification:
              this.normalizeString(
                content
                  ?.outcome
                  ?.classification ||
                content
                  ?.classification
              ),

            recoveryConfirmed:
              content
                ?.outcome
                ?.recoveryConfirmed ??
              content
                ?.recoveryConfirmed ??
              memory
                ?.metadata
                ?.recoveryConfirmed ??
              null,

            summary:
              this.summary(
                memory
              ),
          };
        }
      )
      .filter(
        (
          item
        ) =>
          item.memoryId
      );
  }


  synthesizeProcedures(
    memories =
      []
  ) {
    return this.uniqueObjects(
      memories
        .map(
          (
            memory
          ) => {
            const content =
              memory.content ||
              {};


            return {
              memoryId:
                this.publicId(
                  memory
                ),

              action:
                this.normalizeString(
                  content
                    ?.procedure
                    ?.action ||
                  content
                    ?.recoveryDecision
                    ?.action ||
                  content
                    ?.action
                ),

              procedure:
                content.procedure ||
                null,

              summary:
                this.summary(
                  memory
                ),

              confidence:
                Number(
                  memory.confidence ||
                  0
                ),

              trustScore:
                Number(
                  memory.trustScore ??
                  memory.trust_score ??
                  0
                ),
            };
          }
        )
        .filter(
          (
            item
          ) =>
            item.memoryId
        )
    );
  }


  synthesizeSemanticPatterns(
    memories =
      []
  ) {
    return this.uniqueObjects(
      memories
        .map(
          (
            memory
          ) => {
            const knowledge =
              memory
                ?.content
                ?.knowledge ||
              {};


            return {
              memoryId:
                this.publicId(
                  memory
                ),

              symptom:
                this.normalizeString(
                  knowledge.symptom
                ),

              cause:
                this.normalizeString(
                  knowledge.cause
                ),

              summary:
                this.summary(
                  memory
                ),

              confidence:
                Number(
                  memory.confidence ||
                  0
                ),
            };
          }
        )
        .filter(
          (
            item
          ) =>
            item.memoryId
        )
    );
  }


  synthesizeHumanGuidance(
    memories =
      []
  ) {
    return memories
      .map(
        (
          memory
        ) => {
          const human =
            memory
              ?.content
              ?.humanAction ||
            {};


          return {
            memoryId:
              this.publicId(
                memory
              ),

            actionType:
              this.normalizeString(
                human.actionType
              ),

            recommendation:
              this.normalizeString(
                human.recommendation
              ),

            finalAction:
              this.normalizeString(
                human.finalAction
              ),

            reason:
              this.normalizeString(
                human.reason ||
                memory
                  ?.content
                  ?.reason
              ),

            summary:
              this.summary(
                memory
              ),
          };
        }
      )
      .filter(
        (
          item
        ) =>
          item.memoryId
      );
  }


  synthesizeBehaviouralBaselines(
    memories =
      []
  ) {
    return memories
      .map(
        (
          memory
        ) => ({
          memoryId:
            this.publicId(
              memory
            ),

          serviceId:
            memory.servicePublicId ||
            memory.serviceId ||
            null,

          resourceId:
            memory.resourcePublicId ||
            memory.resourceId ||
            null,

          baseline:
            memory
              ?.content
              ?.baseline ||
            memory
              ?.content
              ?.behaviour ||
            memory.content ||
            {},

          summary:
            this.summary(
              memory
            ),

          confidence:
            Number(
              memory.confidence ||
              0
            ),
        })
      )
      .filter(
        (
          item
        ) =>
          item.memoryId
      );
  }


  synthesizeTraits({
    aggregation,
  }) {
    const traits =
      [];


    if (
      aggregation
        .counts
        .HUMAN >
        0
    ) {
      traits.push({
        trait:
          "HAS_HUMAN_OPERATIONAL_HISTORY",

        evidenceCount:
          aggregation
            .counts
            .HUMAN,
      });
    }


    if (
      aggregation
        .counts
        .PROCEDURAL >
        0
    ) {
      traits.push({
        trait:
          "HAS_PROVEN_RECOVERY_PROCEDURES",

        evidenceCount:
          aggregation
            .counts
            .PROCEDURAL,
      });
    }


    if (
      aggregation
        .counts
        .BEHAVIOURAL >
        0
    ) {
      traits.push({
        trait:
          "HAS_OPERATIONAL_BASELINE",

        evidenceCount:
          aggregation
            .counts
            .BEHAVIOURAL,
      });
    }


    if (
      aggregation
        .counts
        .OUTCOME >
        0
    ) {
      traits.push({
        trait:
          "HAS_RECOVERY_OUTCOME_HISTORY",

        evidenceCount:
          aggregation
            .counts
            .OUTCOME,
      });
    }


    if (
      aggregation
        .coverage
        .complete
    ) {
      traits.push({
        trait:
          "FULL_MEMORY_FAMILY_COVERAGE",

        evidenceCount:
          aggregation
            .memoryCount,
      });
    }


    return traits;
  }


  synthesize(
    aggregation
  ) {
    if (
      !aggregation ||
      !aggregation.byFamily
    ) {
      const error =
        new Error(
          "System DNA aggregation is required"
        );

      error.code =
        "SYSTEM_DNA_AGGREGATION_REQUIRED";

      error.status =
        422;

      throw error;
    }


    return {
      traits:
        this.synthesizeTraits({
          aggregation,
        }),

      episodes:
        this.synthesizeEpisodic(
          aggregation
            .byFamily
            .EPISODIC
        ),

      outcomes:
        this.synthesizeOutcomes(
          aggregation
            .byFamily
            .OUTCOME
        ),

      procedures:
        this.synthesizeProcedures(
          aggregation
            .byFamily
            .PROCEDURAL
        ),

      patterns:
        this.synthesizeSemanticPatterns(
          aggregation
            .byFamily
            .SEMANTIC
        ),

      humanGuidance:
        this.synthesizeHumanGuidance(
          aggregation
            .byFamily
            .HUMAN
        ),

      behaviouralBaselines:
        this.synthesizeBehaviouralBaselines(
          aggregation
            .byFamily
            .BEHAVIOURAL
        ),
    };
  }
}


const systemDnaSynthesizer =
  new SystemDnaSynthesizer();


module.exports = {
  SystemDnaSynthesizer,

  systemDnaSynthesizer,
};