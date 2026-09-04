"use strict";


const {
  HumanLearningSourceBundleService,

  sha256,
} =
  require(
    "../../services/humanLearning/humanLearningSourceBundleService"
  );


const {
  LearningCandidateService,

  candidateDigest,
} =
  require(
    "../../services/humanLearning/learningCandidateService"
  );


const {
  KNOWLEDGE_CANDIDATE_STATE,

  KNOWLEDGE_SCOPE,

  TRUTH_LEVEL,
} =
  require(
    "../../contracts/humanLearning"
  );


describe(
  "AIRA Phase 24.2 — candidate knowledge boundary",
  () => {
    test(
      "freezes deterministic source material from a completed session",
      async () => {
        const events = [
          {
            sequenceNumber:
              1,

            eventType:
              "EVIDENCE_OBSERVED",

            truthLevel:
              "OBSERVATION",

            summary:
              "cpu high",

            payload: {
              cpu:
                97,
            },

            evidenceRefs: [
              "metric_1",
            ],
          },

          {
            sequenceNumber:
              2,

            eventType:
              "DIAGNOSIS_DECLARED",

            truthLevel:
              "ASSERTION",

            summary:
              "suspected leak",

            payload: {
              diagnosis:
                "memory leak",
            },

            evidenceRefs:
              [],
          },
        ];


        const repository = {
          getSession:
            jest
              .fn()
              .mockResolvedValue({
                id:
                  "db-session",

                publicId:
                  "hint_001",

                incidentId:
                  "inc_001",

                status:
                  "COMPLETED",

                executionAuthorized:
                  false,
              }),

          listEvents:
            jest
              .fn()
              .mockResolvedValue(
                events
              ),

          createSourceBundle:
            jest
              .fn()
              .mockImplementation(
                async (
                  input
                ) => ({
                  publicId:
                    "lsrc_001",

                  ...input,

                  executionAuthorized:
                    false,
                })
              ),
        };


        const service =
          new HumanLearningSourceBundleService({
            repository,
          });


        const result =
          await service
            .freeze({
              organizationId:
                "org_test",

              environmentId:
                "env_test",

              sessionId:
                "hint_001",
            });


        expect(
          result.sourceDigest
        ).toMatch(
          /^[0-9a-f]{64}$/
        );


        expect(
          result.observationPayload
        ).toHaveLength(
          1
        );


        expect(
          result.assertionPayload
        ).toHaveLength(
          1
        );


        expect(
          result.diagnosisPayload
        ).toHaveLength(
          1
        );


        expect(
          sha256({
            b:
              2,

            a:
              1,
          })
        ).toBe(
          sha256({
            a:
              1,

            b:
              2,
          })
        );
      }
    );


    test(
      "refuses to freeze an unfinished human intervention",
      async () => {
        const repository = {
          getSession:
            jest
              .fn()
              .mockResolvedValue({
                publicId:
                  "hint_001",

                status:
                  "OPEN",

                executionAuthorized:
                  false,
              }),
        };


        const service =
          new HumanLearningSourceBundleService({
            repository,
          });


        await expect(
          service.freeze({
            organizationId:
              "org_test",

            environmentId:
              "env_test",

            sessionId:
              "hint_001",
          })
        ).rejects.toMatchObject({
          code:
            "HUMAN_LEARNING_SOURCE_SESSION_NOT_COMPLETED",
        });
      }
    );


    test(
      "creates candidate as CANDIDATE then immediately quarantines it",
      async () => {
        const repository = {
          createCandidate:
            jest
              .fn()
              .mockResolvedValue({
                id:
                  "db-candidate",

                publicId:
                  "lcand_001",

                candidateState:
                  KNOWLEDGE_CANDIDATE_STATE
                    .GENERATED,

                truthLevel:
                  TRUTH_LEVEL
                    .CANDIDATE,

                executionAuthorized:
                  false,
              }),

          transitionCandidate:
            jest
              .fn()
              .mockResolvedValue({
                publicId:
                  "lcand_001",

                candidateState:
                  KNOWLEDGE_CANDIDATE_STATE
                    .QUARANTINED,

                truthLevel:
                  TRUTH_LEVEL
                    .CANDIDATE,

                executionAuthorized:
                  false,
              }),
        };


        const service =
          new LearningCandidateService({
            repository,
          });


        const result =
          await service
            .createQuarantinedCandidate({
              organizationId:
                "org_test",

              environmentId:
                "env_test",

              sourceBundleId:
                "lsrc_001",

              sourceDigest:
                "a".repeat(
                  64
                ),

              candidateType:
                "FAILURE_MODE",

              knowledgeScope:
                KNOWLEDGE_SCOPE
                  .ENVIRONMENT,

              title:
                "Pod crash after invalid configuration",

              candidatePayload: {
                signal:
                  "CrashLoopBackOff",
              },

              generatedBy:
                "phase24-test-generator",

              generatorVersion:
                "1.0.0",
            });


        expect(
          result.candidateState
        ).toBe(
          "QUARANTINED"
        );


        expect(
          repository.transitionCandidate
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            toState:
              "QUARANTINED",

            executionAuthorized:
              false,
          })
        );
      }
    );


    test(
      "tenant-derived candidate cannot be born GLOBAL",
      async () => {
        const service =
          new LearningCandidateService({
            repository:
              {},
          });


        await expect(
          service.createQuarantinedCandidate({
            knowledgeScope:
              KNOWLEDGE_SCOPE
                .GLOBAL,
          })
        ).rejects.toMatchObject({
          code:
            "HUMAN_LEARNING_GLOBAL_BIRTH_FORBIDDEN",
        });
      }
    );


    test(
      "human candidate cannot declare itself validated knowledge",
      async () => {
        const service =
          new LearningCandidateService({
            repository:
              {},
          });


        await expect(
          service.createQuarantinedCandidate({
            truthLevel:
              TRUTH_LEVEL
                .VALIDATED_KNOWLEDGE,
          })
        ).rejects.toMatchObject({
          code:
            "HUMAN_LEARNING_CANDIDATE_TRUTH_FORBIDDEN",
        });
      }
    );


    test(
      "candidate digest is canonical and deterministic",
      () => {
        const base = {
          sourceDigest:
            "a".repeat(
              64
            ),

          candidateType:
            "EVIDENCE_PATTERN",

          knowledgeScope:
            "ENVIRONMENT",

          title:
            "pattern",

          candidatePayload: {
            b:
              2,

            a:
              1,
          },

          generatedBy:
            "test",

          generatorVersion:
            "1",
        };


        expect(
          candidateDigest(
            base
          )
        ).toBe(
          candidateDigest({
            ...base,

            candidatePayload: {
              a:
                1,

              b:
                2,
            },
          })
        );
      }
    );
  }
);