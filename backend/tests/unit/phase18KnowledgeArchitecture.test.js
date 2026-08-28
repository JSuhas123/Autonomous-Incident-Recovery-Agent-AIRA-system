"use strict";


const {
  KNOWLEDGE_DOMAINS,

  KNOWLEDGE_DOMAIN_VALUES,

  isKnownKnowledgeDomain,

  isValidKnowledgeDomain,
} =
  require(
    "../../constants/knowledgeDomains"
  );


const {
  KNOWLEDGE_SCOPE,

  KNOWLEDGE_LIFECYCLE,

  KNOWLEDGE_EVIDENCE_TYPE,

  KNOWLEDGE_SAFETY,
} =
  require(
    "../../constants/knowledge"
  );


const {
  validateFailureMode,

  assertValidFailureMode,
} =
  require(
    "../../contracts/knowledge/failureModeContract"
  );


function buildFailureMode(
  overrides = {}
) {
  return {
    failureModeId:
      "FM-POSTGRES-CONNECTION-EXHAUSTION",

    semver:
      "1.0.0",

    name:
      "PostgreSQL connection exhaustion",

    description:
      "PostgreSQL has insufficient available connections for dependent applications.",

    domain:
      KNOWLEDGE_DOMAINS
        .DATABASE_POSTGRES,

    scope: {
      scopeType:
        KNOWLEDGE_SCOPE
          .GLOBAL,

      organizationId:
        null,

      environmentId:
        null,
    },

    resourceTypes: [
      "postgres.database",
    ],

    severity:
      "HIGH",

    lifecycle:
      KNOWLEDGE_LIFECYCLE
        .DRAFT,

    triggers: [
      {
        id:
          "connections-near-limit",

        description:
          "Active PostgreSQL connections are near max_connections.",

        evidenceType:
          KNOWLEDGE_EVIDENCE_TYPE
            .METRIC,

        required:
          false,
      },
    ],

    symptoms: [
      {
        id:
          "connection-acquisition-timeout",

        description:
          "Applications experience database connection acquisition timeouts.",

        evidenceType:
          KNOWLEDGE_EVIDENCE_TYPE
            .LOG,

        required:
          true,
      },
    ],

    evidenceRequirementIds: [
      "EVR-POSTGRES-ACTIVE-CONNECTIONS",
      "EVR-POSTGRES-MAX-CONNECTIONS",
    ],

    investigationStepIds: [
      "INV-POSTGRES-CONNECTIONS",
    ],

    hypothesisIds: [
      "HYP-POSTGRES-CONNECTION-LEAK",
    ],

    playbooks: [],

    requiredCapabilities: [
      "READ_STATE",
      "READ_METRICS",
    ],

    risk: {
      level:
        "HIGH",

      blastRadius:
        "database",

      reversible:
        false,

      dataLossPotential:
        "UNKNOWN",
    },

    policyRequirements: [
      "policy.production.database-recovery",
    ],

    rollback: {
      required:
        false,

      strategy:
        null,
    },

    verification: {
      required:
        true,

      requirementIds: [
        "VERIFY-POSTGRES-CONNECTION-HEADROOM",
      ],
    },

    escalation: {
      required:
        true,

      reasons: [
        "EVIDENCE_INSUFFICIENT",
        "RECOVERY_FAILED",
      ],
    },

    provenance: {
      source:
        "aira-system",

      sourceVersion:
        "18.0",

      importedFrom:
        null,
    },

    metadata: {},

    ...overrides,
  };
}


describe(
  "Phase 18.0–18.2 Knowledge Architecture",
  () => {

    test(
      "defines the initial production knowledge domains",
      () => {

        expect(
          KNOWLEDGE_DOMAIN_VALUES
        )
          .toContain(
            "kubernetes"
          );


        expect(
          KNOWLEDGE_DOMAIN_VALUES
        )
          .toContain(
            "database.postgres"
          );


        expect(
          KNOWLEDGE_DOMAIN_VALUES
        )
          .toContain(
            "database.mongodb"
          );


        expect(
          KNOWLEDGE_DOMAIN_VALUES
        )
          .toContain(
            "messaging.rabbitmq"
          );
      }
    );


    test(
      "keeps MongoDB as a supported customer knowledge domain",
      () => {

        expect(
          isKnownKnowledgeDomain(
            "database.mongodb"
          )
        )
          .toBe(
            true
          );
      }
    );


    test(
      "allows future robotics knowledge domains without core redesign",
      () => {

        expect(
          isValidKnowledgeDomain(
            "robotics.amr"
          )
        )
          .toBe(
            true
          );


        expect(
          isValidKnowledgeDomain(
            "robotics.lidar"
          )
        )
          .toBe(
            true
          );
      }
    );


    test(
      "accepts a canonical global FailureMode",
      () => {

        const result =
          validateFailureMode(
            buildFailureMode()
          );


        expect(
          result.error
        )
          .toBeUndefined();


        expect(
          result.value
            .failureModeId
        )
          .toBe(
            "FM-POSTGRES-CONNECTION-EXHAUSTION"
          );


        expect(
          result.value
            .safety
            .executionAuthorized
        )
          .toBe(
            false
          );
      }
    );


    test(
      "defaults FailureMode safety to evidence-only and non-authorizing",
      () => {

        const validated =
          assertValidFailureMode(
            buildFailureMode()
          );


        expect(
          validated
            .safety
            .evidenceOnly
        )
          .toBe(
            true
          );


        expect(
          validated
            .safety
            .executionAuthorized
        )
          .toBe(
            false
          );


        expect(
          validated
            .safety
            .grantsExecutionPermission
        )
          .toBe(
            false
          );


        expect(
          validated
            .safety
            .bypassesPolicy
        )
          .toBe(
            false
          );
      }
    );


    test(
      "rejects any FailureMode that attempts to authorize execution",
      () => {

        const result =
          validateFailureMode(
            buildFailureMode({
              safety: {
                ...KNOWLEDGE_SAFETY,

                executionAuthorized:
                  true,
              },
            })
          );


        expect(
          result.error
        )
          .toBeDefined();
      }
    );


    test(
      "rejects unknown ResourceTypes",
      () => {

        const result =
          validateFailureMode(
            buildFailureMode({
              resourceTypes: [
                "THIS IS NOT A RESOURCE TYPE",
              ],
            })
          );


        expect(
          result.error
        )
          .toBeDefined();
      }
    );


    test(
      "rejects unknown Phase 17 capabilities",
      () => {

        const result =
          validateFailureMode(
            buildFailureMode({
              requiredCapabilities: [
                "DO_ANYTHING_WITHOUT_AUTHORIZATION",
              ],
            })
          );


        expect(
          result.error
        )
          .toBeDefined();
      }
    );


    test(
      "GLOBAL knowledge cannot carry tenant ownership",
      () => {

        const result =
          validateFailureMode(
            buildFailureMode({
              scope: {
                scopeType:
                  KNOWLEDGE_SCOPE
                    .GLOBAL,

                organizationId:
                  "aira-dev-org",

                environmentId:
                  null,
              },
            })
          );


        expect(
          result.error
        )
          .toBeDefined();
      }
    );


    test(
      "ORGANIZATION knowledge requires organization and forbids environment",
      () => {

        const valid =
          validateFailureMode(
            buildFailureMode({
              scope: {
                scopeType:
                  KNOWLEDGE_SCOPE
                    .ORGANIZATION,

                organizationId:
                  "aira-dev-org",

                environmentId:
                  null,
              },
            })
          );


        expect(
          valid.error
        )
          .toBeUndefined();


        const invalid =
          validateFailureMode(
            buildFailureMode({
              scope: {
                scopeType:
                  KNOWLEDGE_SCOPE
                    .ORGANIZATION,

                organizationId:
                  "aira-dev-org",

                environmentId:
                  "env_aira_development",
              },
            })
          );


        expect(
          invalid.error
        )
          .toBeDefined();
      }
    );


    test(
      "ENVIRONMENT knowledge requires both organization and environment",
      () => {

        const valid =
          validateFailureMode(
            buildFailureMode({
              scope: {
                scopeType:
                  KNOWLEDGE_SCOPE
                    .ENVIRONMENT,

                organizationId:
                  "aira-dev-org",

                environmentId:
                  "env_aira_development",
              },
            })
          );


        expect(
          valid.error
        )
          .toBeUndefined();


        const invalid =
          validateFailureMode(
            buildFailureMode({
              scope: {
                scopeType:
                  KNOWLEDGE_SCOPE
                    .ENVIRONMENT,

                organizationId:
                  "aira-dev-org",

                environmentId:
                  null,
              },
            })
          );


        expect(
          invalid.error
        )
          .toBeDefined();
      }
    );


    test(
      "rejects arbitrary fields from the canonical FailureMode",
      () => {

        const result =
          validateFailureMode(
            buildFailureMode({
              arbitraryProductionCommand:
                "rm -rf /",
            })
          );


        expect(
          result.error
        )
          .toBeDefined();
      }
    );


    test(
      "assertValidFailureMode exposes a stable contract error code",
      () => {

        expect(
          () =>
            assertValidFailureMode({
              invalid:
                true,
            })
        )
          .toThrow();


        try {
          assertValidFailureMode({
            invalid:
              true,
          });
        } catch (
          error
        ) {
          expect(
            error.code
          )
            .toBe(
              "FAILURE_MODE_CONTRACT_INVALID"
            );
        }
      }
    );
  }
);