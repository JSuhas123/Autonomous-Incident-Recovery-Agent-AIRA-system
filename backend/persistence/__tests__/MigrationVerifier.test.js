"use strict";

const MigrationVerifier =
  require(
    "../migration/MigrationVerifier"
  );

describe(
  "MigrationVerifier",
  () => {
    test(
      "passes equivalent source and target records",
      async () => {
        const verificationStore = {
          record:
            jest.fn(),
        };

        const verifier =
          new MigrationVerifier({
            verificationStore,
          });

        const adapter = {
          countSource:
            jest.fn(
              async () =>
                1
            ),

          countTarget:
            jest.fn(
              async () =>
                1
            ),

          readSource:
            jest.fn(
              async () => [
                {
                  incidentId:
                    "inc-1",

                  status:
                    "open",
                },
              ]
            ),

          getSourceIdentity:
            (
              source
            ) =>
              source.incidentId,

          findTarget:
            jest.fn(
              async () => ({
                incidentId:
                  "inc-1",

                status:
                  "open",
              })
            ),

          getTargetIdentity:
            (
              target
            ) =>
              target.incidentId,
        };

        const result =
          await verifier
            .verify({
              domain:
                "incidents",

              adapter,

              sourceScope:
                {},

              repositoryScope:
                {},

              controlScope: {
                organizationId:
                  "org-uuid",

                environmentId:
                  "env-uuid",
              },
            });

        expect(
          result.passed
        )
          .toBe(
            true
          );

        expect(
          result.mismatchCount
        )
          .toBe(
            0
          );

        expect(
          verificationStore
            .record
        )
          .toHaveBeenCalledTimes(
            1
          );
      }
    );

    test(
      "detects target record missing",
      async () => {
        const verifier =
          new MigrationVerifier();

        const result =
          await verifier
            .verify({
              domain:
                "signals",

              adapter: {
                countSource:
                  async () =>
                    1,

                countTarget:
                  async () =>
                    0,

                readSource:
                  async () => [
                    {
                      signalId:
                        "sig-1",
                    },
                  ],

                getSourceIdentity:
                  (
                    source
                  ) =>
                    source.signalId,

                findTarget:
                  async () =>
                    null,
              },

              sourceScope:
                {},

              repositoryScope:
                {},

              controlScope:
                {},

              persistResult:
                false,
            });

        expect(
          result.passed
        )
          .toBe(
            false
          );

        expect(
          result.mismatches[0]
            .type
        )
          .toBe(
            "TARGET_RECORD_MISSING"
          );
      }
    );

    test(
      "detects content mismatch",
      async () => {
        const verifier =
          new MigrationVerifier();

        const result =
          await verifier
            .verify({
              domain:
                "incidents",

              adapter: {
                countSource:
                  async () =>
                    1,

                countTarget:
                  async () =>
                    1,

                readSource:
                  async () => [
                    {
                      incidentId:
                        "inc-1",

                      status:
                        "open",
                    },
                  ],

                getSourceIdentity:
                  (
                    source
                  ) =>
                    source.incidentId,

                findTarget:
                  async () => ({
                    incidentId:
                      "inc-1",

                    status:
                      "closed",
                  }),
              },

              sourceScope:
                {},

              repositoryScope:
                {},

              controlScope:
                {},

              persistResult:
                false,
            });

        expect(
          result.passed
        )
          .toBe(
            false
          );

        expect(
          result.mismatches[0]
            .type
        )
          .toBe(
            "CONTENT_MISMATCH"
          );

        expect(
          result.mismatches[0]
            .fields
        )
          .toContain(
            "status"
          );
      }
    );

    test(
      "count mismatch fails verification",
      async () => {
        const verifier =
          new MigrationVerifier();

        const result =
          await verifier
            .verify({
              domain:
                "incidents",

              adapter: {
                countSource:
                  async () =>
                    2,

                countTarget:
                  async () =>
                    1,

                readSource:
                  async () =>
                    [],
              },

              sourceScope:
                {},

              repositoryScope:
                {},

              controlScope:
                {},

              persistResult:
                false,
            });

        expect(
          result.countParity
        )
          .toBe(
            false
          );

        expect(
          result.passed
        )
          .toBe(
            false
          );
      }
    );
  }
);