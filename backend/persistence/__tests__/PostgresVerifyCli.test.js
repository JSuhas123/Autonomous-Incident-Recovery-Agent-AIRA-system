"use strict";

const {
  parseArgs,
  assertArgs,
} =
  require(
    "../../scripts/postgres-verify"
  );

describe(
  "postgres-verify CLI",
  () => {
    test(
      "parses verification arguments",
      () => {
        const args =
          parseArgs([
            "--organization",
            "org-1",

            "--environment",
            "env-1",

            "--tenant",
            "tenant-1",

            "--domain",
            "incidents",

            "--sample-limit",
            "50",

            "--no-persist",
          ]);

        expect(
          args
        ).toEqual({
          organizationId:
            "org-1",

          environmentId:
            "env-1",

          tenantId:
            "tenant-1",

          domain:
            "incidents",

          sampleLimit:
            50,

          persistResult:
            false,
        });
      }
    );

    test(
      "requires organization",
      () => {
        expect(
          () =>
            assertArgs(
              {
                organizationId:
                  null,

                environmentId:
                  "env",

                domain:
                  "incidents",
              },
              {
                get:
                  jest.fn(),
              }
            )
        )
          .toThrow(
            "--organization is required"
          );
      }
    );

    test(
      "requires environment",
      () => {
        expect(
          () =>
            assertArgs(
              {
                organizationId:
                  "org",

                environmentId:
                  null,

                domain:
                  "incidents",
              },
              {
                get:
                  jest.fn(),
              }
            )
        )
          .toThrow(
            "--environment is required"
          );
      }
    );

    test(
      "requires domain",
      () => {
        expect(
          () =>
            assertArgs(
              {
                organizationId:
                  "org",

                environmentId:
                  "env",

                domain:
                  null,
              },
              {
                get:
                  jest.fn(),
              }
            )
        )
          .toThrow(
            "--domain is required"
          );
      }
    );

    test(
      "validates domain against registry",
      () => {
        const registry = {
          get:
            jest.fn(
              () => ({
                name:
                  "incidents",
              })
            ),
        };

        assertArgs(
          {
            organizationId:
              "org",

            environmentId:
              "env",

            domain:
              "incidents",

            sampleLimit:
              null,
          },
          registry
        );

        expect(
          registry.get
        )
          .toHaveBeenCalledWith(
            "incidents"
          );
      }
    );

    test(
      "rejects invalid sample limit",
      () => {
        expect(
          () =>
            assertArgs(
              {
                organizationId:
                  "org",

                environmentId:
                  "env",

                domain:
                  "incidents",

                sampleLimit:
                  0,
              },
              {
                get:
                  jest.fn(),
              }
            )
        )
          .toThrow(
            "--sample-limit must be positive"
          );
      }
    );
  }
);