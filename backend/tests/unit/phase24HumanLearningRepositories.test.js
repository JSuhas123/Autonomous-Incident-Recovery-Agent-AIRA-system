"use strict";


const fs =
  require(
    "node:fs"
  );


const path =
  require(
    "node:path"
  );


const {
  PostgresHumanLearningRepository,
} =
  require(
    "../../persistence/postgres/PostgresHumanLearningRepository"
  );


const {
  PostgresLearningCandidateRepository,
} =
  require(
    "../../persistence/postgres/PostgresLearningCandidateRepository"
  );


describe(
  "AIRA Phase 24 Batch 1 — PostgreSQL repository boundaries",
  () => {
    test(
      "repositories are tenant-scoped rather than using direct unscoped pool access",
      () => {
        const learningSource =
          fs.readFileSync(
            path.join(
              __dirname,

              "../../persistence/postgres/PostgresHumanLearningRepository.js"
            ),

            "utf8"
          );


        const candidateSource =
          fs.readFileSync(
            path.join(
              __dirname,

              "../../persistence/postgres/PostgresLearningCandidateRepository.js"
            ),

            "utf8"
          );


        expect(
          learningSource
        ).toMatch(
          /PostgresTenantScope/
        );


        expect(
          candidateSource
        ).toMatch(
          /PostgresTenantScope/
        );


        expect(
          learningSource
        ).not.toMatch(
          /getPostgresPool/
        );


        expect(
          candidateSource
        ).not.toMatch(
          /getPostgresPool/
        );
      }
    );


    test(
      "human learning repository rejects authority before any SQL",
      async () => {
        const tenantScope = {
          run:
            jest.fn(),
        };


        const repository =
          new PostgresHumanLearningRepository({
            tenantScope,
          });


        await expect(
          repository.createSession({
            executionAuthorized:
              true,
          })
        ).rejects.toMatchObject({
          code:
            "HUMAN_LEARNING_EXECUTION_AUTHORITY_FORBIDDEN",

          executionAuthorized:
            false,
        });


        expect(
          tenantScope.run
        ).not.toHaveBeenCalled();
      }
    );


    test(
      "candidate repository rejects direct GLOBAL creation before SQL",
      async () => {
        const tenantScope = {
          run:
            jest.fn(),
        };


        const repository =
          new PostgresLearningCandidateRepository({
            tenantScope,
          });


        await expect(
          repository.createCandidate({
            organizationId:
              "org_test",

            environmentId:
              "env_test",

            sourceBundleId:
              "lsrc_001",

            candidateType:
              "FAILURE_MODE",

            knowledgeScope:
              "GLOBAL",

            title:
              "unsafe",

            candidateDigest:
              "a".repeat(
                64
              ),

            generatedBy:
              "test",

            generatorVersion:
              "1",
          })
        ).rejects.toMatchObject({
          code:
            "HUMAN_LEARNING_GLOBAL_BIRTH_FORBIDDEN",
        });


        expect(
          tenantScope.run
        ).not.toHaveBeenCalled();
      }
    );


    test(
      "candidate repository rejects authority before tenant scope execution",
      async () => {
        const tenantScope = {
          run:
            jest.fn(),
        };


        const repository =
          new PostgresLearningCandidateRepository({
            tenantScope,
          });


        await expect(
          repository.createCandidate({
            executionAuthorized:
              true,
          })
        ).rejects.toMatchObject({
          code:
            "HUMAN_LEARNING_EXECUTION_AUTHORITY_FORBIDDEN",
        });


        expect(
          tenantScope.run
        ).not.toHaveBeenCalled();
      }
    );
  }
);