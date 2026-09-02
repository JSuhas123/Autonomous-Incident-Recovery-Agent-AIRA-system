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
  REALITY_ARTIFACT_KIND,

  REALITY_VISIBILITY,
} =
  require(
    "../../constants/reality"
  );


const {
  buildStorageKey,

  sha256,
} =
  require(
    "../../services/reality/S3RealityObjectStore"
  );


const {
  RealityEvidenceStoreService,
} =
  require(
    "../../services/reality/realityEvidenceStoreService"
  );


const migration95 =
  path.join(
    __dirname,
    "..",
    "..",
    "persistence",
    "postgres",
    "migrations",
    "0095_reality_case_artifacts.sql"
  );


describe(
  "Phase 23R.2 evidence store + object storage",

  () => {
    test(
      "migration stores metadata, not evidence bodies",

      () => {
        const source =
          fs.readFileSync(
            migration95,
            "utf8"
          );


        expect(
          source
        ).toContain(
          "CREATE TABLE IF NOT EXISTS\n    reality.case_artifacts"
        );


        expect(
          source
        ).toContain(
          "content_hash TEXT NOT NULL"
        );


        expect(
          source
        ).toContain(
          "storage_bucket TEXT NOT NULL"
        );


        expect(
          source
        ).toContain(
          "storage_key TEXT NOT NULL"
        );


        expect(
          source
        ).not.toContain(
          "artifact_body BYTEA"
        );


        expect(
          source
        ).not.toContain(
          "raw_content BYTEA"
        );
      }
    );


    test(
      "artifact metadata is tenant scoped, forced RLS, and never authoritative ground truth",

      () => {
        const source =
          fs.readFileSync(
            migration95,
            "utf8"
          );


        expect(
          source
        ).toContain(
          "FORCE ROW LEVEL SECURITY"
        );


        expect(
          source
        ).toContain(
          "trusted_ground_truth = FALSE"
        );


        expect(
          source
        ).toContain(
          "execution_authorized = FALSE"
        );
      }
    );


    test(
      "storage keys are tenant scoped and content addressed",

      () => {
        const body =
          Buffer.from(
            "evidence"
          );


        const contentHash =
          sha256(
            body
          );


        expect(
          buildStorageKey({
            organizationId:
              "org/a",

            environmentId:
              "env b",

            contentHash,
          })
        ).toBe(
          `reality/org%2Fa/env%20b/sha256/${contentHash.slice(0, 2)}/${contentHash}`
        );
      }
    );


    test(
      "storeArtifact hashes object content and registers only metadata",

      async () => {
        const body =
          Buffer.from(
            "log line 1\nlog line 2\n"
          );


        const objectStore = {
          putImmutable:
            jest
              .fn()
              .mockResolvedValue({
                created:
                  true,

                bucket:
                  "aira-reality-evidence",

                key:
                  "reality/org/env/sha256/aa/hash",

                contentHash:
                  sha256(
                    body
                  ),

                byteSize:
                  body.length,

                etag:
                  "\"etag\"",

                contentType:
                  "text/plain",
              }),
        };


        const repository = {
          registerArtifact:
            jest
              .fn()
              .mockResolvedValue({
                created:
                  true,

                duplicate:
                  false,

                artifact: {
                  artifactId:
                    "logs-1",
                },

                executionAuthorized:
                  false,
              }),
        };


        const service =
          new RealityEvidenceStoreService({
            repository,

            objectStore,
          });


        const result =
          await service
            .storeArtifact({
              organizationId:
                "org",

              environmentId:
                "env",

              caseId:
                "case-1",

              artifactId:
                "logs-1",

              artifactKind:
                REALITY_ARTIFACT_KIND
                  .LOG,

              body,

              mediaType:
                "text/plain",
            });


        expect(
          result.executionAuthorized
        ).toBe(
          false
        );


        const persisted =
          repository
            .registerArtifact
            .mock
            .calls[0][0];


        expect(
          persisted.contentHash
        ).toBe(
          sha256(
            body
          )
        );


        expect(
          persisted.byteSize
        ).toBe(
          body.length
        );


        expect(
          persisted.body
        ).toBeUndefined();


        expect(
          persisted.trustedGroundTruth
        ).toBe(
          false
        );


        expect(
          persisted.executionAuthorized
        ).toBe(
          false
        );
      }
    );


    test(
      "replay reads only EVIDENCE and verifies object bytes",

      async () => {
        const body =
          Buffer.from(
            "verified evidence"
          );


        const repository = {
          getReplayArtifact:
            jest
              .fn()
              .mockResolvedValue({
                artifactId:
                  "metric-1",

                channel:
                  REALITY_VISIBILITY
                    .EVIDENCE,

                contentHash:
                  sha256(
                    body
                  ),

                storageKey:
                  "key",

                executionAuthorized:
                  false,
              }),
        };


        const objectStore = {
          getVerified:
            jest
              .fn()
              .mockResolvedValue({
                body,

                contentHash:
                  sha256(
                    body
                  ),

                byteSize:
                  body.length,
              }),
        };


        const service =
          new RealityEvidenceStoreService({
            repository,

            objectStore,
          });


        const result =
          await service
            .getReplayArtifactContent({
              organizationId:
                "org",

              environmentId:
                "env",

              artifactId:
                "metric-1",
            });


        expect(
          result.verified
        ).toBe(
          true
        );


        expect(
          result.body.equals(
            body
          )
        ).toBe(
          true
        );


        expect(
          result.executionAuthorized
        ).toBe(
          false
        );
      }
    );


    test(
      "sealed evaluation artifacts cannot pass through replay service",

      async () => {
        const service =
          new RealityEvidenceStoreService({
            repository: {
              getReplayArtifact:
                jest
                  .fn()
                  .mockResolvedValue({
                    artifactId:
                      "sealed-1",

                    channel:
                      REALITY_VISIBILITY
                        .SEALED_EVALUATION,

                    contentHash:
                      "a".repeat(
                        64
                      ),

                    storageKey:
                      "sealed-key",
                  }),
            },


            objectStore: {
              getVerified:
                jest.fn(),
            },
          });


        await expect(
          service
            .getReplayArtifactContent({
              organizationId:
                "org",

              environmentId:
                "env",

              artifactId:
                "sealed-1",
            })
        ).rejects.toMatchObject({
          code:
            "REALITY_SEALED_ARTIFACT_REPLAY_FORBIDDEN",

          executionAuthorized:
            false,
        });
      }
    );
  }
);