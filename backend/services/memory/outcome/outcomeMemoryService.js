"use strict";


const PostgresIncidentRepository =
  require(
    "../../../persistence/postgres/PostgresIncidentRepository"
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
  outcomeMemoryBuilder,
} =
  require(
    "./outcomeMemoryBuilder"
  );


class OutcomeMemoryService {

  constructor(
    options = {}
  ) {
    this.incidentRepository =
      options.incidentRepository ||
      new PostgresIncidentRepository();

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
      outcomeMemoryBuilder;
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


  createScope({
    organizationId,
    environmentId,
    incidentId,
  }) {
    return {
      organizationId,

      environmentId,

      incidentId,
    };
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


  async loadDecisionHistory(
    scope
  ) {
    const history =
      await this
        .decisionRepository
        .findHistory(
          scope,
          {
            limit:
              100,
          }
        );


    return Array.isArray(
      history
    )
      ? history
      : [];
  }


  async loadVerificationHistory(
    scope
  ) {
    const history =
      await this
        .verificationRepository
        .findHistory(
          scope,
          {
            limit:
              100,
          }
        );


    return Array.isArray(
      history
    )
      ? history
      : [];
  }


  findDecisionForVerification({
    decisions,
    verification,
  }) {
    const recoveryDecisionId =
      verification
        ?.recoveryDecisionId;


    if (
      recoveryDecisionId
    ) {
      const exact =
        decisions.find(
          (
            decision
          ) =>
            String(
              decision.decisionId
            ) ===
            String(
              recoveryDecisionId
            )
        );


      if (
        exact
      ) {
        return exact;
      }
    }


    /**
     * Repositories return newest revision first.
     */
    return (
      decisions[0] ||
      null
    );
  }


  selectVerification(
    verifications,
    verificationId =
      null
  ) {
    if (
      verificationId
    ) {
      return (
        verifications.find(
          (
            verification
          ) =>
            String(
              verification.verificationId
            ) ===
            String(
              verificationId
            )
        ) ||
        null
      );
    }


    /**
     * findHistory() returns revisions DESC.
     */
    return (
      verifications[0] ||
      null
    );
  }


  async generate({
    organizationId,

    environmentId,

    incidentId,

    verificationId =
      null,
  }) {
    if (
      !organizationId ||
      !environmentId ||
      !incidentId
    ) {
      throw this.createError(
        "Outcome memory requires organization, environment and incident",
        "OUTCOME_MEMORY_SCOPE_REQUIRED"
      );
    }


    const scope =
      this
        .createScope({
          organizationId,

          environmentId,

          incidentId,
        });


    const [
      incident,

      decisions,

      verifications,
    ] =
      await Promise.all([
        this
          .loadIncident({
            organizationId,

            environmentId,

            incidentId,
          }),

        this
          .loadDecisionHistory(
            scope
          ),

        this
          .loadVerificationHistory(
            scope
          ),
      ]);


    if (
      !incident
    ) {
      throw this.createError(
        "Incident not found for outcome memory generation",
        "OUTCOME_MEMORY_INCIDENT_NOT_FOUND",
        404
      );
    }


    const verification =
      this
        .selectVerification(
          verifications,
          verificationId
        );


    if (
      !verification
    ) {
      throw this.createError(
        "Recovery verification is required before outcome memory generation",
        "OUTCOME_MEMORY_VERIFICATION_REQUIRED",
        422
      );
    }


    const decision =
      this
        .findDecisionForVerification({
          decisions,

          verification,
        });


    const built =
      this.builder
        .build({
          organizationId,

          environmentId,

          incident,

          decision,

          verification,
        });


    const existing =
      await this
        .memoryRepository
        .findByPublicId({
          organizationId,

          publicId:
            built.memory
              .publicId,
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
      if (
        error.code ===
          "23505"
      ) {
        const concurrent =
          await this
            .memoryRepository
            .findByPublicId({
              organizationId,

              publicId:
                built.memory
                  .publicId,
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
              "16.9",
          },
        });
    }


    /**
     * Relate outcome to the corresponding incident episode when available.
     */
    const episodicPublicId =
      (
        "mem_episode_incident_" +
        String(
          incident._id ||
          incidentId
        )
      );


    const episodicMemory =
      await this
        .memoryRepository
        .findByPublicId({
          organizationId,

          publicId:
            episodicPublicId,
        });


    if (
      episodicMemory
    ) {
      await this
        .memoryRepository
        .addRelation({
          organizationId,

          fromMemoryPublicId:
            memory.publicId,

          toMemoryPublicId:
            episodicMemory.publicId,

          relationType:
            "DERIVED_FROM",

          confidence:
            memory.confidence,

          metadata: {
            phase:
              "16.9",

            relation:
              "OUTCOME_TO_EPISODE",
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
            "OUTCOME_MEMORY_INDEX_FAILED",

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

      outcome:
        built.memory
          .content
          .outcome,

      sourceCount:
        built.sources
          .length,
    };
  }
}


const outcomeMemoryService =
  new OutcomeMemoryService();


module.exports = {
  OutcomeMemoryService,

  outcomeMemoryService,

  generateOutcomeMemory:
    outcomeMemoryService
      .generate
      .bind(
        outcomeMemoryService
      ),
};