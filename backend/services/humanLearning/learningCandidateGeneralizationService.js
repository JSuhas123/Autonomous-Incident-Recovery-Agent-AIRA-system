"use strict";


const {
  humanLearningError,
} =
  require(
    "../../contracts/humanLearning"
  );


const {
  assertGeneralizationCannotAuthorize,
} =
  require(
    "../../contracts/humanLearningGeneralization"
  );


const {
  digest,
} =
  require(
    "./learningTenantDataScrubber"
  );


class LearningCandidateGeneralizationService {
  constructor(
    options = {}
  ) {
    this.candidateRepository =
      options.candidateRepository;

    this.generalizationRepository =
      options.generalizationRepository;

    this.scopeService =
      options.scopeService;

    this.scrubber =
      options.scrubber;

    this.isolationService =
      options.isolationService;
  }


  assertDependencies()
  {
    const required = [
      [
        "candidateRepository",
        this.candidateRepository,
      ],

      [
        "generalizationRepository",
        this.generalizationRepository,
      ],

      [
        "scopeService",
        this.scopeService,
      ],

      [
        "scrubber",
        this.scrubber,
      ],

      [
        "isolationService",
        this.isolationService,
      ],
    ];


    for (
      const [
        name,
        dependency,
      ]
      of required
    ) {
      if (
        !dependency
      ) {
        throw humanLearningError(
          "HUMAN_LEARNING_GENERALIZATION_DEPENDENCY_REQUIRED",

          `${name} is required`,

          500
        );
      }
    }
  }


  async generalize(
    input = {}
  ) {
    assertGeneralizationCannotAuthorize(
      input
    );


    this.assertDependencies();


    const candidate =
      input.candidate ||

      await this
        .candidateRepository
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


    this.scopeService
      .assertEligibleForGeneralization(
        candidate
      );


    const request =
      await this
        .generalizationRepository
        .createRequest({
          organizationId:
            input.organizationId,

          environmentId:
            input.environmentId,

          candidateId:
            input.candidateId,

          reason:
            input.reason ||
            "Explicit tenant-to-global generalization request",

          requestedByType:
            input.requestedByType ||
            "SYSTEM",

          requestedById:
            input.requestedById ||
            "phase24-generalization",

          metadata: {
            phase:
              "24.5",

            sourceScope:
              candidate.knowledgeScope,

            targetScope:
              "GLOBAL",

            directMutation:
              false,
          },

          executionAuthorized:
            false,
        });


    await this
      .generalizationRepository
      .updateRequestStatus({
        organizationId:
          input.organizationId,

        environmentId:
          input.environmentId,

        generalizationRequestId:
          request.publicId,

        status:
          "PROCESSING",

        executionAuthorized:
          false,
      });


    const tenantIdentifiers = [
      ...(input.tenantIdentifiers || []),

      input.organizationId,

      input.environmentId,

      candidate.organizationId,

      candidate.environmentId,
    ]
      .filter(
        Boolean
      );


    const sourceIdentifiers = [
      candidate.publicId,

      candidate.id,

      request.publicId,
    ]
      .filter(
        Boolean
      );


    const titleResult =
      this.scrubber.scrub({
        payload: {
          value:
            candidate.title ||
            "",
        },

        tenantIdentifiers,

        executionAuthorized:
          false,
      });


    const summaryResult =
      this.scrubber.scrub({
        payload: {
          value:
            candidate.summary ||
            "",
        },

        tenantIdentifiers,

        executionAuthorized:
          false,
      });


    const payloadResult =
      this.scrubber.scrub({
        payload:
          candidate.candidatePayload ||
          {},

        tenantIdentifiers,

        executionAuthorized:
          false,
      });


    const generalizedCandidate =
      this.scopeService
        .buildGlobalProposal({
          sourceCandidate:
            candidate,

          scrubbedTitle:
            titleResult
              .scrubbed
              .value,

          scrubbedSummary:
            summaryResult
              .scrubbed
              .value,

          scrubbedPayload:
            payloadResult
              .scrubbed,

          executionAuthorized:
            false,
        });


    const artifactDigest =
      digest(
        generalizedCandidate
      );


    const generalizedCandidatePublicId =
      `lgcand_${artifactDigest.slice(
        0,
        24
      )}`;


    const isolation =
      this.isolationService
        .evaluate({
          generalizedCandidate,

          tenantIdentifiers,

          sourceIdentifiers,

          executionAuthorized:
            false,
        });


    const redactionManifest = {
      title:
        titleResult
          .redactionManifest,

      summary:
        summaryResult
          .redactionManifest,

      payload:
        payloadResult
          .redactionManifest,

      rawTenantPayloadIncluded:
        false,
    };


    const leakageFindings =
      isolation
        .checks
        .flatMap(
          (
            check
          ) =>
            check.findings
              .map(
                (
                  finding
                ) => ({
                  checkType:
                    check.checkType,

                  ...finding,
                })
              )
        );


    const artifact =
      await this
        .generalizationRepository
        .createArtifact({
          organizationId:
            input.organizationId,

          environmentId:
            input.environmentId,

          generalizationRequestId:
            request.publicId,

          generalizedCandidatePublicId,

          artifactDigest,

          candidateType:
            candidate.candidateType,

          generalizedCandidate,

          redactionManifest,

          leakageFindings,

          status:
            isolation.passed
              ? "BOUNDARY_CLEAN"
              : "BOUNDARY_REJECTED",

          executionAuthorized:
            false,
        });


    for (
      const check
      of isolation.checks
    ) {
      await this
        .generalizationRepository
        .recordIsolationCheck({
          organizationId:
            input.organizationId,

          environmentId:
            input.environmentId,

          generalizationRequestId:
            request.publicId,

          artifactId:
            artifact.publicId,

          checkType:
            check.checkType,

          passed:
            check.passed,

          findings:
            check.findings,

          metrics: {
            findingCount:
              check.findings.length,
          },

          executionAuthorized:
            false,
        });
    }


    const finalStatus =
      isolation.passed
        ? "BOUNDARY_REVIEW_PENDING"
        : "BOUNDARY_REJECTED";


    await this
      .generalizationRepository
      .updateRequestStatus({
        organizationId:
          input.organizationId,

        environmentId:
          input.environmentId,

        generalizationRequestId:
          request.publicId,

        status:
          finalStatus,

        metadata: {
          artifactPublicId:
            artifact.publicId,

          artifactDigest,

          isolationPass:
            isolation.passed,
        },

        executionAuthorized:
          false,
      });


    return {
      generalizationRequestId:
        request.publicId,

      artifactId:
        artifact.publicId,

      generalizedCandidatePublicId,

      passed:
        isolation.passed,

      status:
        finalStatus,

      sourceCandidateState:
        candidate.candidateState,

      sourceCandidateScope:
        candidate.knowledgeScope,

      sourceCandidateMutated:
        false,

      generalizedCandidate,

      redactionManifest,

      isolation,

      publicationEligible:
        false,

      requiresIndependentValidation:
        true,

      executionAuthorized:
        false,
    };
  }
}


module.exports = {
  LearningCandidateGeneralizationService,
};