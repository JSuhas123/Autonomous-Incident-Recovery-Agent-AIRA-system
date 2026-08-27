"use strict";


const PostgresMemoryRepository =
  require(
    "../../../persistence/postgres/PostgresMemoryRepository"
  );


const {
  memoryIndexService,
} =
  require(
    "../vector/memoryIndexService"
  );


const {
  semanticMemoryBuilder,
} =
  require(
    "./semanticMemoryBuilder"
  );


class SemanticMemoryService {

  constructor(
    options = {}
  ) {
    this.memoryRepository =
      options.memoryRepository ||
      new PostgresMemoryRepository();

    this.indexService =
      options.indexService ||
      memoryIndexService;

    this.builder =
      options.builder ||
      semanticMemoryBuilder;
  }


  createError(
    message,
    code,
    status =
      422
  ) {
    const error =
      new Error(
        message
      );

    error.code =
      code;

    error.status =
      status;

    return error;
  }


  extractSemanticEvidence(
    memory
  ) {
    const explicit =
      memory
        ?.content
        ?.semanticEvidence ||
      memory
        ?.metadata
        ?.semanticEvidence ||
      null;


    if (
      !explicit
    ) {
      return [];
    }


    const values =
      Array.isArray(
        explicit
      )
        ? explicit
        : [
            explicit,
          ];


    return values
      .filter(
        (
          item
        ) =>
          item &&
          item.symptom &&
          item.cause
      )
      .map(
        (
          item
        ) => ({
          memoryId:
            memory.id,

          publicId:
            memory.publicId,

          environmentId:
            memory.environmentId,

          serviceId:
            memory.serviceId,

          symptom:
            item.symptom,

          cause:
            item.cause,

          contradicts:
            item.contradicts ===
              true,

          confidence:
            item.confidence ??
            memory.confidence,

          trustScore:
            item.trustScore ??
            memory.trustScore,

          observedAt:
            memory.observedAt ||
            memory.updatedAt ||
            memory.createdAt,
        })
      );
  }


  semanticKey(
    evidence
  ) {
    return [
      String(
        evidence.symptom
      )
        .trim()
        .toLowerCase(),

      String(
        evidence.cause
      )
        .trim()
        .toLowerCase(),
    ]
      .join(
        "|"
      );
  }


  groupEvidence(
    evidence
  ) {
    const groups =
      new Map();


    for (
      const item
      of evidence
    ) {
      const key =
        this
          .semanticKey(
            item
          );


      if (
        !groups.has(
          key
        )
      ) {
        groups.set(
          key,
          []
        );
      }


      groups
        .get(
          key
        )
        .push(
          item
        );
    }


    return groups;
  }


  async loadSourceMemories({
    organizationId,

    environmentId =
      null,

    serviceId =
      null,

    limit =
      1000,
  }) {
    const memories =
      await this
        .memoryRepository
        .listMemories({
          organizationId,

          environmentId,

          statuses: [
            "ACTIVE",
          ],

          memoryTypes: [
            "EPISODIC",
            "OUTCOME",
            "PROCEDURAL",
          ],

          limit,
        });


    if (
      !serviceId
    ) {
      return memories;
    }


    return memories.filter(
      (
        memory
      ) =>
        !memory.serviceId ||
        String(
          memory.serviceId
        ) ===
        String(
          serviceId
        )
    );
  }


  async persistSemanticMemory({
    organizationId,

    built,
  }) {
    const existing =
      await this
        .memoryRepository
        .findByPublicId({
          organizationId,

          publicId:
            built.memory
              .publicId,
        });


    let memory;


    if (
      existing
    ) {
      memory =
        await this
          .memoryRepository
          .updateMemory({
            organizationId,

            publicId:
              existing.publicId,

            patch: {
              title:
                built.memory.title,

              summary:
                built.memory.summary,

              content:
                built.memory.content,

              confidence:
                built.memory.confidence,

              trustScore:
                built.memory.trustScore,

              importance:
                built.memory.importance,

              evidenceCount:
                built.memory.evidenceCount,

              observationCount:
                built.memory.observationCount,

              observedAt:
                built.memory.observedAt,

              metadata:
                built.memory.metadata,

              schemaVersion:
                built.memory.schemaVersion,
            },

            changeReason:
              "Semantic memory re-synthesized from current evidence",

            changedByType:
              "MEMORY_SYNTHESIS",
          });

    } else {
      memory =
        await this
          .memoryRepository
          .createMemory(
            built.memory
          );
    }


    for (
      const source
      of built.sources
    ) {
      await this
        .memoryRepository
        .addSource({
          organizationId,

          memoryPublicId:
            memory.publicId,

          sourceType:
            source.sourceType,

          sourceId:
            source.sourceId,

          evidenceRole:
            source.evidenceRole,

          observedAt:
            source.observedAt,

          metadata: {
            phase:
              "16.11",
          },
        });
    }


    for (
      const evidence
      of built
        .statistics
        .evidence
    ) {
      if (
        !evidence.publicId
      ) {
        continue;
      }


      await this
        .memoryRepository
        .addRelation({
          organizationId,

          fromMemoryPublicId:
            memory.publicId,

          toMemoryPublicId:
            evidence.publicId,

          relationType:
            evidence.contradicts
              ? "CONTRADICTS"
              : "DERIVED_FROM",

          confidence:
            evidence.confidence,

          metadata: {
            phase:
              "16.11",

            relation:
              evidence.contradicts
                ? "SEMANTIC_CONTRADICTION"
                : "SEMANTIC_EVIDENCE",
          },
        });
    }


    const canonical =
      await this
        .memoryRepository
        .findByPublicId({
          organizationId,

          publicId:
            memory.publicId,
        });


    let indexing =
      null;


    try {
      indexing =
        await this
          .indexService
          .indexMemory({
            organizationId,

            publicId:
              memory.publicId,
          });

    } catch (
      error
    ) {
      indexing = {
        indexed:
          false,

        error: {
          code:
            error.code ||
            "SEMANTIC_MEMORY_INDEX_FAILED",

          message:
            error.message,
        },
      };
    }


    return {
      created:
        !existing,

      updated:
        Boolean(
          existing
        ),

      memory:
        canonical ||
        memory,

      indexed:
        indexing
          ?.indexed ===
        true,

      indexing,
    };
  }


  async synthesize({
    organizationId,

    environmentId =
      null,

    serviceId =
      null,

    minimumEvidence =
      3,

    minimumConsistency =
      0.75,
  }) {
    if (
      !organizationId
    ) {
      throw this.createError(
        "Organization required for semantic synthesis",
        "SEMANTIC_MEMORY_ORGANIZATION_REQUIRED"
      );
    }


    const memories =
      await this
        .loadSourceMemories({
          organizationId,

          environmentId,

          serviceId,
        });


    const evidence =
      memories
        .flatMap(
          (
            memory
          ) =>
            this
              .extractSemanticEvidence(
                memory
              )
        );


    if (
      evidence.length ===
        0
    ) {
      return {
        synthesized:
          false,

        reason:
          "NO_SEMANTIC_EVIDENCE",

        semantics:
          [],
      };
    }


    const groups =
      this
        .groupEvidence(
          evidence
        );


    const semantics =
      [];

    const rejected =
      [];


    for (
      const group
      of groups.values()
    ) {
      const first =
        group[0];


      const built =
        this.builder
          .build({
            organizationId,

            environmentId,

            serviceId,

            symptom:
              first.symptom,

            cause:
              first.cause,

            evidence:
              group,

            minimumEvidence,

            minimumConsistency,
          });


      if (
        !built.eligible
      ) {
        rejected.push({
          symptom:
            first.symptom,

          cause:
            first.cause,

          reason:
            built.reason,

          statistics:
            built.statistics,
        });


        continue;
      }


      const persisted =
        await this
          .persistSemanticMemory({
            organizationId,

            built,
          });


      semantics.push({
        symptom:
          first.symptom,

        cause:
          first.cause,

        statistics:
          built.statistics,

        ...persisted,
      });
    }


    return {
      synthesized:
        semantics.length >
        0,

      evidenceCount:
        evidence.length,

      semantics,

      rejected,
    };
  }
}


const semanticMemoryService =
  new SemanticMemoryService();


module.exports = {
  SemanticMemoryService,

  semanticMemoryService,

  synthesizeSemanticMemories:
    semanticMemoryService
      .synthesize
      .bind(
        semanticMemoryService
      ),
};