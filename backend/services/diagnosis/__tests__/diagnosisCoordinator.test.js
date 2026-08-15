"use strict";

const {
  DiagnosisCoordinator,
} =
  require(
    "../diagnosisCoordinator"
  );

const {
  AGENT_STATUS,
} =
  require(
    "../../../agents/v2/contracts/agentContracts"
  );

function agent(
  result,
  options = {}
) {
  return {
    version:
      options.version ||
      "test",

    async execute() {
      return {
        status:
          options.status ||
          AGENT_STATUS
            .SUCCESS,

        result,

        startedAt:
          new Date(),

        completedAt:
          new Date(),

        durationMs:
          1,

        confidence:
          options.confidence ??
          0.8,

        evidenceUsed:
          [],

        warnings:
          [],

        fallbackUsed:
          false,
      };
    },
  };
}

describe(
  "DiagnosisCoordinator",
  () => {

    test(
      "runs complete diagnosis pipeline",
      async () => {
        const contextService = {
          async build() {
            return {
              incidentId:
                "incident-1",

              organizationId:
                "507f1f77bcf86cd799439011",

              environmentId:
                "507f1f77bcf86cd799439012",

              tenantId:
                "tenant-1",

              correlationId:
                "correlation-1",

              incident: {
                title:
                  "Database outage",

                severity:
                  "critical",
              },

              service: {
                id:
                  "database",

                criticality:
                  "critical",
              },

              evidence: {
                completeness:
                  1,

                items: [
                  {
                    id:
                      "trace:db",
                  },

                  {
                    id:
                      "log:db",
                  },

                  {
                    id:
                      "metric:db",
                  },
                ],

                missingEvidence:
                  [],

                conflicts:
                  [],
              },

              symptoms:
                [],

              findings:
                [],

              contradictions:
                [],

              unknowns:
                [],
            };
          },
        };

        const coordinator =
          new DiagnosisCoordinator({
            contextService,

            investigationAgent:
              agent({
                evidencePackage: {
                  completeness:
                    1,

                  items: [
                    {
                      id:
                        "trace:db",
                    },

                    {
                      id:
                        "log:db",
                    },

                    {
                      id:
                        "metric:db",
                    },
                  ],

                  missingEvidence:
                    [],

                  conflicts:
                    [],
                },

                findings:
                  [],
              }),

            symptomAgent:
              agent({
                symptoms: [
                  {
                    id:
                      "symptom:db",

                    type:
                      "service_unavailable",

                    title:
                      "Database unavailable",

                    confidence:
                      0.9,

                    evidenceIds: [
                      "trace:db",
                    ],
                  },
                ],

                findings:
                  [],

                unknowns:
                  [],

                symptomConfidence:
                  0.9,
              }),

            topologyAgent:
              agent({
                topologyConfidence:
                  0.9,

                affectedServices: [
                  "payment",
                ],

                findings:
                  [],

                unknowns:
                  [],
              }),

            changeAgent:
              agent({
                changeConfidence:
                  0.8,

                suspiciousChanges:
                  [],

                findings:
                  [],

                contradictions:
                  [],

                unknowns:
                  [],
              }),

            historicalAgent:
              agent({
                historyConfidence:
                  0.8,

                recurrenceDetected:
                  false,

                findings:
                  [],

                contradictions:
                  [],

                unknowns:
                  [],
              }),

            rootCauseAgent:
              agent({
                hypotheses: [
                  {
                    id:
                      "hypothesis:db",

                    rootCause:
                      "Database unavailable",

                    category:
                      "database",

                    confidence:
                      0.9,

                    evidenceSupporting: [
                      "trace:db",
                      "log:db",
                      "metric:db",
                    ],

                    evidenceAgainst:
                      [],
                  },
                ],

                primaryHypothesis: {
                  id:
                    "hypothesis:db",

                  rootCause:
                    "Database unavailable",

                  category:
                    "database",

                  confidence:
                    0.9,

                  evidenceSupporting: [
                    "trace:db",
                    "log:db",
                    "metric:db",
                  ],
                },

                outcome:
                  "ROOT_CAUSE_IDENTIFIED",

                diagnosisConfidence:
                  0.9,

                findings:
                  [],

                unknowns:
                  [],
              }),

            riskAgent:
              agent({
                riskScore:
                  0.9,

                riskLevel:
                  "CRITICAL",

                riskConfidence:
                  0.9,

                findings:
                  [],

                unknowns:
                  [],
              }),

            verificationAgent:
              agent({
                verificationStatus:
                  "VERIFIED",

                verificationConfidence:
                  0.9,

                acceptedHypothesisId:
                  "hypothesis:db",

                hypothesisReviews:
                  [],

                findings:
                  [],

                contradictions:
                  [],

                unknowns:
                  [],
              }),
          });

        const result =
          await coordinator
            .diagnose(
              {
                organizationId:
                  "507f1f77bcf86cd799439011",

                environmentId:
                  "507f1f77bcf86cd799439012",
              },

              "507f1f77bcf86cd799439013"
            );

        expect(
          result.diagnosis
        )
          .toBeDefined();

        expect(
          result
            .diagnosis
            .primaryHypothesis
            .rootCause
        )
          .toBe(
            "Database unavailable"
          );

        expect(
          result
            .diagnosis
            .executionAuthorized
        )
          .toBe(
            false
          );

        expect(
          result
            .confidence
            .confidence
        )
          .toBeGreaterThan(
            0.7
          );

        expect(
          result.agentTrace
        )
          .toHaveLength(
            8
          );
      }
    );

    test(
      "fails when critical agent fails",
      async () => {
        const coordinator =
          new DiagnosisCoordinator({
            contextService: {
              async build() {
                return {
                  incidentId:
                    "incident-1",

                  organizationId:
                    "org",

                  environmentId:
                    "env",

                  tenantId:
                    "tenant",

                  incident: {
                    title:
                      "failure",
                  },

                  evidence: {
                    completeness:
                      0,

                    items:
                      [],
                  },

                  findings:
                    [],

                  contradictions:
                    [],

                  unknowns:
                    [],
                };
              },
            },

            investigationAgent:
              agent(
                null,
                {
                  status:
                    AGENT_STATUS
                      .FAILED,
                }
              ),
          });

        await expect(
          coordinator
            .diagnose(
              {
                organizationId:
                  "org",

                environmentId:
                  "env",
              },

              "incident"
            )
        )
          .rejects
          .toMatchObject({
            code:
              "DIAGNOSIS_CRITICAL_AGENT_FAILED",
          });
      }
    );

    test(
      "never authorizes execution",
      async () => {
        const contextService = {
          async build() {
            return {
              incidentId:
                "incident-safe",

              organizationId:
                "org",

              environmentId:
                "env",

              tenantId:
                "tenant",

              incident: {
                title:
                  "unknown",
              },

              evidence: {
                completeness:
                  0.1,

                items:
                  [],

                missingEvidence: [
                  "metrics",
                ],
              },

              findings:
                [],

              contradictions:
                [],

              unknowns:
                [],
            };
          },
        };

        const emptyAgent =
          agent({
            findings:
              [],

            unknowns:
              [],
          });

        const coordinator =
          new DiagnosisCoordinator({
            contextService,

            investigationAgent:
              agent({
                evidencePackage: {
                  completeness:
                    0.1,

                  items:
                    [],

                  missingEvidence: [
                    "metrics",
                  ],

                  conflicts:
                    [],
                },
              }),

            symptomAgent:
              agent({
                symptoms:
                  [],

                symptomConfidence:
                  0,
              }),

            topologyAgent:
              emptyAgent,

            changeAgent:
              emptyAgent,

            historicalAgent:
              emptyAgent,

            rootCauseAgent:
              agent({
                hypotheses:
                  [],

                outcome:
                  "INSUFFICIENT_EVIDENCE",

                diagnosisConfidence:
                  0,
              }),

            riskAgent:
              emptyAgent,

            verificationAgent:
              agent({
                verificationStatus:
                  "INCONCLUSIVE",

                verificationConfidence:
                  0,

                hypothesisReviews:
                  [],
              }),
          });

        const result =
          await coordinator
            .diagnose(
              {
                organizationId:
                  "org",

                environmentId:
                  "env",
              },

              "incident"
            );

        expect(
          result
            .executionAuthorized
        )
          .toBe(
            false
          );

        expect(
          result
            .diagnosis
            .executionAuthorized
        )
          .toBe(
            false
          );

        expect(
          result
            .diagnosis
            .recommendedNextStep
            .executionAuthorized
        )
          .toBe(
            false
          );
      }
    );
  }
);