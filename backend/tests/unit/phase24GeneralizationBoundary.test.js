"use strict";


const {
  LearningTenantDataScrubber,
} =
  require(
    "../../services/humanLearning/learningTenantDataScrubber"
  );


describe(
  "AIRA Phase 24.5 — tenant data scrub boundary",
  () => {
    test(
      "removes tenant identifiers, email, IP, UUID, private domain and secrets",
      () => {
        const scrubber =
          new LearningTenantDataScrubber();


        const result =
          scrubber.scrub({
            tenantIdentifiers: [
              "Acme-Customer",

              "prod-cluster-acme",
            ],

            payload: {
              organization:
                "Acme-Customer",

              operator:
                "admin@acme.example.com",

              host:
                "postgres.prod.internal",

              ip:
                "10.20.30.40",

              resourceId:
                "550e8400-e29b-41d4-a716-446655440000",

              password:
                "super-secret-value",

              nested: {
                description:
                  "restart prod-cluster-acme after database recovery",
              },
            },

            executionAuthorized:
              false,
          });


        const serialized =
          JSON.stringify(
            result.scrubbed
          );


        expect(
          serialized
        ).not.toContain(
          "Acme-Customer"
        );


        expect(
          serialized
        ).not.toContain(
          "prod-cluster-acme"
        );


        expect(
          serialized
        ).not.toContain(
          "admin@acme.example.com"
        );


        expect(
          serialized
        ).not.toContain(
          "10.20.30.40"
        );


        expect(
          serialized
        ).not.toContain(
          "550e8400-e29b-41d4-a716-446655440000"
        );


        expect(
          serialized
        ).not.toContain(
          "super-secret-value"
        );


        expect(
          result.redactionManifest
            .rawValuesRetained
        ).toBe(
          false
        );


        expect(
          result.executionAuthorized
        ).toBe(
          false
        );
      }
    );
  }
);