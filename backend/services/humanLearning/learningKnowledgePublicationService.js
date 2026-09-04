"use strict";


const {
  humanLearningError,
} = require(
  "../../contracts/humanLearning"
);


const {
  assertReviewCannotAuthorize,
} = require(
  "../../contracts/humanLearningReview"
);


class LearningKnowledgePublicationService {
  constructor(
    options = {}
  ) {
    this.candidateRepository =
      options.candidateRepository;

    this.publicationRepository =
      options.publicationRepository;

    this.playbookRepository =
      options.playbookRepository;

    this.runbookRepository =
      options.runbookRepository;

    /*
     * Extension point for canonical Phase-18 knowledge types
     * that do not use Playbook/Runbook repositories.
     *
     * No adapter may create a second canonical knowledge store.
     */
    this.canonicalAdapters =
      options.canonicalAdapters ||
      {};
  }


  async publish(
    input = {}
  ) {
    assertReviewCannotAuthorize(
      input
    );


    const candidate =
      input.candidate ||

      await this.candidateRepository
        .getCandidate({
          organizationId:
            input.organizationId,

          environmentId:
            input.environmentId,

          candidateId:
            input.candidateId,
        });


    if (
      !candidate
    ) {
      throw humanLearningError(
        "HUMAN_LEARNING_CANDIDATE_NOT_FOUND",

        "Learning candidate not found",

        404
      );
    }


    if (
      candidate.candidateState !==
        "APPROVED"
    ) {
      throw humanLearningError(
        "HUMAN_LEARNING_PUBLICATION_REQUIRES_APPROVAL",

        "Only APPROVED candidates may be published",

        409
      );
    }


    if (
      candidate.executionAuthorized ===
        true
    ) {
      throw humanLearningError(
        "HUMAN_LEARNING_PUBLICATION_AUTHORITY_VIOLATION",

        "Candidate contains forbidden execution authority",

        500
      );
    }


    if (
      candidate.knowledgeScope ===
        "GLOBAL"
      ||
      input.targetScope ===
        "GLOBAL"
    ) {
      throw humanLearningError(
        "HUMAN_LEARNING_GLOBAL_PUBLICATION_REQUIRES_CONTROLLED_IMPORT",

        (
          "GLOBAL knowledge must be published through " +
          "the controlled platform global importer"
        ),

        403
      );
    }


    const targetScope =
      input.targetScope ||

      candidate.knowledgeScope;


    if (
      ![
        "ORGANIZATION",
        "ENVIRONMENT",
      ].includes(
        targetScope
      )
    ) {
      throw humanLearningError(
        "HUMAN_LEARNING_PUBLICATION_SCOPE_INVALID",

        "Tenant publication requires ORGANIZATION or ENVIRONMENT scope",

        409
      );
    }


    const canonical =
      await this.#publishCanonical({
        ...input,

        candidate,

        targetScope,
      });


    const publication =
      await this.publicationRepository
        .recordPublication({
          organizationId:
            input.organizationId,

          environmentId:
            input.environmentId,

          candidateId:
            input.candidateId,

          reviewDecisionId:
            input.reviewDecisionId,

          validationRunId:
            input.validationRunId,

          targetScope,

          targetKnowledgeType:
            candidate.candidateType,

          canonicalDefinitionPublicId:
            canonical.definitionPublicId,

          canonicalVersionPublicId:
            canonical.versionPublicId,

          canonicalKnowledgeKey:
            canonical.knowledgeKey,

          publicationVersion:
            canonical.version,

          provenance: {
            phase:
              "24.8",

            candidateId:
              input.candidateId,

            sourceBundleId:
              candidate.sourceBundleId ||
              null,

            sourceIncidentId:
              candidate.sourceIncidentId ||
              null,

            validationRunId:
              input.validationRunId ||
              null,

            reviewDecisionId:
              input.reviewDecisionId,

            canonicalStore:
              "POSTGRES_PHASE18_KNOWLEDGE",

            executionAuthorized:
              false,
          },

          executionAuthorized:
            false,
        });


    await this.candidateRepository
      .transitionCandidate({
        organizationId:
          input.organizationId,

        environmentId:
          input.environmentId,

        candidateId:
          input.candidateId,

        nextState:
          "PUBLISHED",

        reason:
          (
            "Approved candidate published into " +
            "canonical Phase 18 knowledge"
          ),

        actorType:
          "SYSTEM",

        actorId:
          "phase24-knowledge-publication",

        executionAuthorized:
          false,
      });


    return {
      publication,

      canonical,

      candidateState:
        "PUBLISHED",

      knowledgePublished:
        true,

      executionAuthorized:
        false,
    };
  }


  async #publishCanonical(
    input
  ) {
    const {
      candidate,
    } = input;


    if (
      candidate.candidateType ===
      "RUNBOOK"
    ) {
      return this.#publishRunbook(
        input
      );
    }


    if (
      candidate.candidateType ===
      "PLAYBOOK"
    ) {
      return this.#publishPlaybook(
        input
      );
    }


    const adapter =
      this.canonicalAdapters[
        candidate.candidateType
      ];


    if (
      !adapter
      ||
      typeof adapter.publish !==
        "function"
    ) {
      throw humanLearningError(
        "HUMAN_LEARNING_CANONICAL_ADAPTER_REQUIRED",

        (
          `No canonical Phase 18 publisher exists for ` +
          `${candidate.candidateType}`
        ),

        409
      );
    }


    const result =
      await adapter.publish({
        ...input,

        executionAuthorized:
          false,
      });


    if (
      result.executionAuthorized ===
        true
    ) {
      throw humanLearningError(
        "HUMAN_LEARNING_CANONICAL_ADAPTER_AUTHORITY_VIOLATION",

        "Canonical publication adapter returned execution authority",

        500
      );
    }


    return result;
  }


  async #publishRunbook(
    input
  ) {
    if (
      !this.runbookRepository
    ) {
      throw humanLearningError(
        "HUMAN_LEARNING_RUNBOOK_REPOSITORY_REQUIRED",

        "Phase 18 Runbook repository is required",

        500
      );
    }


    const payload =
      input.candidate.candidatePayload ||
      {};


    const runbook =
      payload.runbook;


    if (
      !runbook
      ||
      !runbook.runbookId
      ||
      !runbook.semver
    ) {
      throw humanLearningError(
        "HUMAN_LEARNING_RUNBOOK_PAYLOAD_INVALID",

        (
          "RUNBOOK publication requires a canonical " +
          "Phase 18 runbook payload"
        ),

        409
      );
    }


    let definition =
      await this.runbookRepository
        .getDefinitionByKey({
          organizationId:
            input.organizationId,

          environmentId:
            input.environmentId,

          runbookId:
            runbook.runbookId,
        });


    if (
      !definition
    ) {
      definition =
        await this.runbookRepository
          .createDefinition({
            organizationId:
              input.organizationId,

            environmentId:
              input.environmentId,

            scopeType:
              input.targetScope,

            runbookId:
              runbook.runbookId,

            name:
              runbook.name,

            description:
              runbook.description,

            ownerType:
              "TENANT",

            sourceType:
              "API",

            metadata: {
              phase24CandidateId:
                input.candidateId,
            },
          });
    }


    const version =
      await this.runbookRepository
        .createVersion({
          organizationId:
            input.organizationId,

          environmentId:
            input.environmentId,

          runbook,
        });


    return {
      type:
        "RUNBOOK",

      definitionPublicId:
        definition.publicId,

      versionPublicId:
        version.publicId,

      knowledgeKey:
        runbook.runbookId,

      version:
        runbook.semver,

      executionAuthorized:
        false,
    };
  }


  async #publishPlaybook(
    input
  ) {
    if (
      !this.playbookRepository
    ) {
      throw humanLearningError(
        "HUMAN_LEARNING_PLAYBOOK_REPOSITORY_REQUIRED",

        "Phase 18 Playbook repository is required",

        500
      );
    }


    const payload =
      input.candidate.candidatePayload ||
      {};


    const playbook =
      payload.playbook;


    if (
      !playbook
      ||
      !playbook.playbookId
      ||
      !playbook.semver
    ) {
      throw humanLearningError(
        "HUMAN_LEARNING_PLAYBOOK_PAYLOAD_INVALID",

        (
          "PLAYBOOK publication requires a canonical " +
          "Phase 18 playbook payload"
        ),

        409
      );
    }


    let definition =
      await this.playbookRepository
        .getDefinitionByKey({
          organizationId:
            input.organizationId,

          environmentId:
            input.environmentId,

          playbookId:
            playbook.playbookId,
        });


    if (
      !definition
    ) {
      definition =
        await this.playbookRepository
          .createDefinition({
            organizationId:
              input.organizationId,

            environmentId:
              input.environmentId,

            scopeType:
              input.targetScope,

            playbookId:
              playbook.playbookId,

            name:
              playbook.name,

            description:
              playbook.description,

            ownerType:
              "TENANT",

            sourceType:
              "API",

            metadata: {
              phase24CandidateId:
                input.candidateId,
            },
          });
    }


    const version =
      await this.playbookRepository
        .createVersion({
          organizationId:
            input.organizationId,

          environmentId:
            input.environmentId,

          playbook,
        });


    return {
      type:
        "PLAYBOOK",

      definitionPublicId:
        definition.publicId,

      versionPublicId:
        version.publicId,

      knowledgeKey:
        playbook.playbookId,

      version:
        playbook.semver,

      executionAuthorized:
        false,
    };
  }
}


module.exports = {
  LearningKnowledgePublicationService,
};