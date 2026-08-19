"use strict";

const MongoCorrelationTopologyRepository =
  require(
    "../mongo/MongoCorrelationTopologyRepository"
  );

describe(
  "MongoCorrelationTopologyRepository",
  () => {
    const repository =
      new MongoCorrelationTopologyRepository();

    test(
      "invalid service identifiers fail closed",
      async () => {
        const result =
          await repository
            .hasServiceDependency(
              {
                organizationId:
                  "org-1",

                environmentId:
                  "env-1",
              },
              "invalid",
              "also-invalid"
            );

        expect(
          result
        ).toBe(
          false
        );
      }
    );

    test(
      "invalid resource identifiers fail closed",
      async () => {
        const result =
          await repository
            .hasResourceRelationship(
              {
                organizationId:
                  "org-1",

                environmentId:
                  "env-1",
              },
              {
                type:
                  "resource",

                id:
                  "invalid",
              },
              {
                type:
                  "service",

                id:
                  "invalid",
              }
            );

        expect(
          result
        ).toBe(
          false
        );
      }
    );
  }
);