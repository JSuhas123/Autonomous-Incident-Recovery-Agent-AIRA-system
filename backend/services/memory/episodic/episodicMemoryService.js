"use strict";


const PostgresIncidentRepository =
  require(
    "../../../persistence/postgres/PostgresIncidentRepository"
  );


const PostgresIncidentDiagnosisRepository =
  require(
    "../../../persistence/postgres/PostgresIncidentDiagnosisRepository"
  );


const PostgresRecoveryDecisionRepository =
  require(
    "../../../persistence/postgres/PostgresRecoveryDecisionRepository"
  );


const PostgresRecoveryVerificationRepository =
  require(
    "../../../persistence/postgres/PostgresRecoveryVerificationRepository"
  );


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
  episodicMemoryBuilder,
} =
  require(
    "./episodicMemoryBuilder"
  );


class EpisodicMemoryService {

  constructor(
    options = {}
  ) {
    this.incidentRepository =
      options.incidentRepository ||
      new PostgresIncidentRepository();

    this.diagnosisRepository =
      options.diagnosisRepository ||
      new PostgresIncidentDiagnosisRepository();

    this.decisionRepository =
      options.decisionRepository ||
      new PostgresRecoveryDecisionRepository();

    this.verificationRepository =
      options.verificationRepository ||
      new PostgresRecoveryVerificationRepository();

    this.memoryRepository =
      options.memoryRepository ||
      new PostgresMemoryRepository();

    this.indexService =
      options.indexService ||
      memoryIndexService;

    this.builder =
      options.builder ||
      episodicMemoryBuilder;
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


  async loadIncident({
    organizationId,
    environmentId,
    incidentId,
  }) {
    return this
      .incidentRepository
      .findOne({
        organizationId,

        environmentId,

        _id:
          incidentId,
      });
  }


  async loadDiagnosisHistory({
    organizationId,
    environmentId,
    incidentId,
  }) {
    try {
      const result =
        await this
          .diagnosisRepository
          .findHistory({
            organizationId,

            environmentId,

            incidentId,
          });


      return Array.isArray(
        result
      )
        ? result
        : [];

    } catch (
      error
    ) {
      if (
        error.code ===
          "DIAGNOSIS_NOT_FOUND"
      ) {
        return [];
      }


      throw error;
    }
  }


  async loadDecisionHistory({
    organizationId,
    environmentId,
    incidentId,
  }) {
    try {
      const result =
        await this
          .decisionRepository
          .findHistory({
            organizationId,

            environmentId,

            incidentId,
          });


      return Array.isArray(
        result
      )
        ? result
        : [];

    } catch (
      error
    ) {
      if (
        error.code ===
          "RECOVERY_DECISION_NOT_FOUND"
      ) {
        return [];
      }


      throw error;
    }
  }


  async loadVerificationHistory({
    organizationId,
    environmentId,
    incidentId,
  }) {
    try {
      const result =
        await this
          .verificationRepository
          .findHistory({
            organizationId,

            environmentId,

            incidentId,
          });


      return Array.isArray(
        result
      )
        ? result
        : [];

    } catch (
      error
    ) {
      if (
        error.code ===
          "RECOVERY_VERIFICATION_NOT_FOUND"
      ) {
        return [];
      }


      throw error;
    }
  }


  async generate({
    organizationId,
    environmentId,
    incidentId,
    requireClosed =
      true,
  }) {
    if (
      !organizationId ||
      !environmentId ||
      !incidentId
    ) {
      throw this.createError(
        "Episodic memory generation requires organization, environment and incident",
        "EPISODIC_MEMORY_SCOPE_REQUIRED"
      );
    }


    const incident =
      await this
        .loadIncident({
          organizationId,

          environmentId,

          incidentId,
        });


    if (
      !incident
    ) {
      throw this.createError(
        "Incident not found for episodic memory generation",
        "EPISODIC_MEMORY_INCIDENT_NOT_FOUND",
        404
      );
    }


    const lifecycleState =
      incident.lifecycleState ||
      incident.status;


    if (
      requireClosed &&
      lifecycleState !==
        "CLOSED"
    ) {
      throw this.createError(
        `Incident must be CLOSED before episodic memory generation. Current state: ${lifecycleState}`,
        "EPISODIC_MEMORY_INCIDENT_NOT_CLOSED"
      );
    }


    const publicId =
      this.builder
        .buildPublicId(
          incident._id ||
          incident.publicId ||
          incidentId
        );


    /**
     * One canonical episode per incident.
     *
     * Repeated closure events / retries therefore do not create duplicate
     * memories or duplicate vector identities.
     */
    const existing =
      await this
        .memoryRepository
        .findByPublicId({
          organizationId,

          publicId,
        });


    if (
      existing
    ) {
      return {
        created:
          false,

        duplicate:
          true,

        memory:
          existing,

        indexed:
          false,
      };
    }


    const [
      diagnoses,

      decisions,

      verifications,
    ] =
      await Promise.all([
        this
          .loadDiagnosisHistory({
            organizationId,

            environmentId,

            incidentId,
          }),

        this
          .loadDecisionHistory({
            organizationId,

            environmentId,

            incidentId,
          }),

        this
          .loadVerificationHistory({
            organizationId,

            environmentId,

            incidentId,
          }),
      ]);


    const built =
      this.builder
        .build({
          organizationId,

          environmentId,

          incident,

          diagnoses,

          decisions,

          verifications,
        });


    let memory;


    try {
      memory =
        await this
          .memoryRepository
          .createMemory(
            built.memory
          );

    } catch (
      error
    ) {
      /**
       * Concurrent duplicate generation must also converge onto the same
       * canonical episode.
       */
      if (
        error.code ===
          "23505"
      ) {
        const concurrent =
          await this
            .memoryRepository
            .findByPublicId({
              organizationId,

              publicId,
            });


        if (
          concurrent
        ) {
          return {
            created:
              false,

            duplicate:
              true,

            memory:
              concurrent,

            indexed:
              false,
          };
        }
      }


      throw error;
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
              "16.8",
          },
        });
    }


    /**
     * Re-read after source insertion because addSource() updates source_count.
     */
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
      /**
       * PostgreSQL creation is authoritative.
       *
       * Qdrant failure must never roll back or invalidate canonical memory.
       * Phase 16.6 index_operations preserves indexing failure/retry state.
       */
      indexing = {
        indexed:
          false,

        error: {
          code:
            error.code ||
            "EPISODIC_MEMORY_INDEX_FAILED",

          message:
            error.message,
        },
      };
    }


    return {
      created:
        true,

      duplicate:
        false,

      memory:
        canonical ||
        memory,

      indexed:
        indexing
          ?.indexed ===
        true,

      indexing,

      sourceCount:
        built.sources
          .length,
    };
  }
}


const episodicMemoryService =
  new EpisodicMemoryService();


module.exports = {
  EpisodicMemoryService,

  episodicMemoryService,

  generateEpisodicMemory:
    episodicMemoryService
      .generate
      .bind(
        episodicMemoryService
      ),
};