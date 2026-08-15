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
          2,

        confidence:
          options.confidence ??
          0.8,

        evidenceUsed:
          options.evidenceUsed ||
          [],

        warnings:
          options.warnings ||
          [],

        fallbackUsed:
          Boolean(
            options.fallbackUsed
          ),
      };
    },
  };
}

describe(
  "Phase 6 Diagnosis E2E",
  () => {

    test(
      "trusted diagnosis reaches playbook evaluation but never execution",
      async () => {
        const contextService = {
          async build() {
            return {
              incidentId:
                "incident-e2e-1",

              organizationId:
                "507f1f77bcf86cd799439011",

              environmentId:
                "507f1f77bcf86cd799439012",

              tenantId:
                "tenant-1",

              correlationId:
                "correlation-e2e-1",

              incident: {
                title:
                  "Payment API unavailable",

                severity:
                  "critical",

                status:
                  "open",

                serviceId:
                  "payment-api",
              },

              service: {
                id:
                  "payment-api",

                name:
                  "payment-api",

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

                    type:
                      "TRACE",

                    summary:
                      "Payment API requests fail while waiting for database.",
                  },

                  {
                    id:
                      "log:db",

                    type:
                      "LOG",

                    summary:
                      "Database connection pool exhausted.",
                  },

                  {
                    id:
                      "metric:db",

                    type:
                      "METRIC",

                    summary:
                      "Database active connections at configured maximum.",
                  },
                ],

                missingEvidence:
                  [],

                conflicts:
                  [],
              },

              symptoms:
                [],

              signals:
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

                      type:
                        "TRACE",

                      summary:
                        "Payment API requests fail while waiting for database.",
                    },

                    {
                      id:
                        "log:db",

                      type:
                        "LOG",

                      summary:
                        "Database connection pool exhausted.",
                    },

                    {
                      id:
                        "metric:db",

                      type:
                        "METRIC",

                      summary:
                        "Database active connections at configured maximum.",
                    },
                  ],

                  missingEvidence:
                    [],

                  conflicts:
                    [],
                },

                findings:
                  [],

                unknowns:
                  [],
              }),

            symptomAgent:
              agent({
                symptoms: [
                  {
                    id:
                      "symptom:http",

                    type:
                      "service_unavailable",

                    title:
                      "Payment API returning failures",

                    severity:
                      "critical",

                    confidence:
                      0.95,

                    evidenceIds: [
                      "trace:db",
                    ],
                  },
                ],

                symptomConfidence:
                  0.95,

                findings:
                  [],

                unknowns:
                  [],
              }),

            topologyAgent:
              agent({
                scope:
                  "multi_service",

                rootService: {
                  id:
                    "payment-api",

                  name:
                    "payment-api",
                },

                affectedServices: [
                  "payment-api",
                  "checkout-api",
                ],

                affectedResources: [
                  "postgres-primary",
                ],

                suspiciousResources: [
                  {
                    id:
                      "postgres-primary",

                    name:
                      "postgres-primary",

                    criticality:
                      "critical",

                    healthStatus:
                      "degraded",
                  },
                ],

                topologyConfidence:
                  0.95,

                findings:
                  [],

                unknowns:
                  [],
              }),

            changeAgent:
              agent({
                changes:
                  [],

                relevantChanges:
                  [],

                suspiciousChanges:
                  [],

                changeConfidence:
                  0.7,

                findings:
                  [],

                contradictions:
                  [],

                unknowns:
                  [],
              }),

            historicalAgent:
              agent({
                similarIncidents:
                  [],

                recurrenceDetected:
                  false,

                recurringFingerprint:
                  false,

                historyConfidence:
                  0.7,

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
                      "hypothesis:db-pool",

                    rank:
                      1,

                    rootCause:
                      "Database connection pool exhaustion",

                    title:
                      "Database connection pool exhaustion",

                    category:
                      "capacity",

                    confidence:
                      0.95,

                    status:
                      "SUPPORTED",

                    evidenceSupporting: [
                      "trace:db",
                      "log:db",
                      "metric:db",
                    ],

                    evidenceAgainst:
                      [],

                    contradictions:
                      [],

                    explanation:
                      "Database connections reached the configured maximum, causing payment requests to fail.",
                  },
                ],

                primaryHypothesis: {
                  id:
                    "hypothesis:db-pool",

                  rank:
                    1,

                  rootCause:
                    "Database connection pool exhaustion",

                  title:
                    "Database connection pool exhaustion",

                  category:
                    "capacity",

                  confidence:
                    0.95,

                  status:
                    "SUPPORTED",

                  evidenceSupporting: [
                    "trace:db",
                    "log:db",
                    "metric:db",
                  ],

                  evidenceAgainst:
                    [],
                },

                outcome:
                  "ROOT_CAUSE_IDENTIFIED",

                diagnosisConfidence:
                  0.95,

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

                impactLevel:
                  "SEVERE",

                riskConfidence:
                  0.9,

                customerImpact: {
                  score:
                    0.9,
                },

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
                  0.95,

                acceptedHypothesisId:
                  "hypothesis:db-pool",

                hypothesisReviews: [
                  {
                    hypothesisId:
                      "hypothesis:db-pool",

                    verdict:
                      "VERIFIED",

                    defensibleConfidence:
                      0.95,

                    validSupportingEvidence: [
                      "trace:db",
                      "log:db",
                      "metric:db",
                    ],

                    validContradictingEvidence:
                      [],

                    issues:
                      [],
                  },
                ],

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

              "incident-e2e-1"
            );

        expect(
          result
            .diagnosis
            .primaryHypothesis
            .rootCause
        )
          .toBe(
            "Database connection pool exhaustion"
          );

        expect(
          result
            .confidence
            .decision
        )
          .toBe(
            "TRUSTED"
          );

        expect(
          result
            .safetyGate
            .decision
        )
          .toBe(
            "ALLOW_EVALUATION"
          );

        expect(
          result
            .diagnosis
            .recommendedNextStep
            .type
        )
          .toBe(
            "EVALUATE_PLAYBOOK"
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

        expect(
          result
            .executionAuthorized
        )
          .toBe(
            false
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
      "ambiguous diagnosis is blocked from playbook evaluation",
      async () => {
        const contextService = {
          async build() {
            return {
              incidentId:
                "incident-e2e-2",

              organizationId:
                "507f1f77bcf86cd799439011",

              environmentId:
                "507f1f77bcf86cd799439012",

              tenantId:
                "tenant-1",

              incident: {
                title:
                  "Intermittent API failures",

                severity:
                  "warning",

                status:
                  "open",
              },

              service: {
                id:
                  "api",

                name:
                  "api",
              },

              evidence: {
                completeness:
                  0.55,

                items: [
                  {
                    id:
                      "metric:latency",

                    type:
                      "METRIC",
                  },

                  {
                    id:
                      "log:timeout",

                    type:
                      "LOG",
                  },
                ],

                missingEvidence: [
                  "traces",
                ],

                conflicts:
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
        };

        const coordinator =
          new DiagnosisCoordinator({
            contextService,

            investigationAgent:
              agent({
                evidencePackage: {
                  completeness:
                    0.55,

                  items: [
                    {
                      id:
                        "metric:latency",

                      type:
                        "METRIC",
                    },

                    {
                      id:
                        "log:timeout",

                      type:
                        "LOG",
                    },
                  ],

                  missingEvidence: [
                    "traces",
                  ],

                  conflicts:
                    [],
                },
              }),

            symptomAgent:
              agent({
                symptoms: [
                  {
                    id:
                      "symptom:latency",

                    type:
                      "high_latency",

                    severity:
                      "warning",

                    confidence:
                      0.6,
                  },
                ],

                symptomConfidence:
                  0.6,
              }),

            topologyAgent:
              agent({
                topologyConfidence:
                  0.5,

                affectedServices: [
                  "api",
                ],

                suspiciousResources:
                  [],
              }),

            changeAgent:
              agent({
                changeConfidence:
                  0.5,

                suspiciousChanges:
                  [],
              }),

            historicalAgent:
              agent({
                historyConfidence:
                  0.4,

                recurrenceDetected:
                  false,
              }),

            rootCauseAgent:
              agent({
                hypotheses: [
                  {
                    id:
                      "hypothesis:db",

                    rootCause:
                      "Database latency",

                    category:
                      "database",

                    confidence:
                      0.61,

                    evidenceSupporting: [
                      "metric:latency",
                    ],

                    evidenceAgainst:
                      [],
                  },

                  {
                    id:
                      "hypothesis:network",

                    rootCause:
                      "Network degradation",

                    category:
                      "network",

                    confidence:
                      0.58,

                    evidenceSupporting: [
                      "log:timeout",
                    ],

                    evidenceAgainst:
                      [],
                  },
                ],

                primaryHypothesis: {
                  id:
                    "hypothesis:db",

                  rootCause:
                    "Database latency",

                  confidence:
                    0.61,
                },

                outcome:
                  "MULTIPLE_PLAUSIBLE_CAUSES",

                diagnosisConfidence:
                  0.6,
              }),

            riskAgent:
              agent({
                riskScore:
                  0.4,

                riskLevel:
                  "MODERATE",

                riskConfidence:
                  0.6,
              }),

            verificationAgent:
              agent({
                verificationStatus:
                  "DOWNGRADED",

                verificationConfidence:
                  0.55,

                acceptedHypothesisId:
                  "hypothesis:db",

                hypothesisReviews: [
                  {
                    hypothesisId:
                      "hypothesis:db",

                    defensibleConfidence:
                      0.58,

                    verdict:
                      "DOWNGRADED",
                  },

                  {
                    hypothesisId:
                      "hypothesis:network",

                    defensibleConfidence:
                      0.55,

                    verdict:
                      "DOWNGRADED",
                  },
                ],

                contradictions:
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

              "incident-e2e-2"
            );

        expect(
          result
            .safetyGate
            .canEvaluatePlaybook
        )
          .toBe(
            false
          );

        expect(
          result
            .diagnosis
            .recommendedNextStep
            .type
        )
          .not
          .toBe(
            "EVALUATE_PLAYBOOK"
          );

        expect(
          [
            "MANUAL_REVIEW",
            "HOLD_FOR_MORE_EVIDENCE",
          ]
        )
          .toContain(
            result
              .safetyGate
              .decision
          );

        expect(
          result
            .executionAuthorized
        )
          .toBe(
            false
          );
      }
    );

    test(
      "unknown failure remains safely unresolved",
      async () => {
        const contextService = {
          async build() {
            return {
              incidentId:
                "incident-e2e-3",

              organizationId:
                "507f1f77bcf86cd799439011",

              environmentId:
                "507f1f77bcf86cd799439012",

              tenantId:
                "tenant-1",

              incident: {
                title:
                  "Unknown failure",

                severity:
                  "warning",

                status:
                  "open",
              },

              evidence: {
                completeness:
                  0.1,

                items:
                  [],

                missingEvidence: [
                  "metrics",
                  "logs",
                  "traces",
                ],

                conflicts:
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
        };

        const emptyAgent =
          agent({
            findings:
              [],

            contradictions:
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
                    "logs",
                    "traces",
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

                primaryHypothesis:
                  null,

                outcome:
                  "INSUFFICIENT_EVIDENCE",

                diagnosisConfidence:
                  0,

                unknowns: [
                  "Root cause cannot be determined from current evidence.",
                ],
              }),

            riskAgent:
              emptyAgent,

            verificationAgent:
              agent({
                verificationStatus:
                  "INCONCLUSIVE",

                verificationConfidence:
                  0,

                acceptedHypothesisId:
                  null,

                hypothesisReviews:
                  [],

                unknowns: [
                  "No hypothesis could be verified.",
                ],
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

              "incident-e2e-3"
            );

        expect(
          result
            .diagnosis
            .outcome
        )
          .toBe(
            "INSUFFICIENT_EVIDENCE"
          );

        expect(
          result
            .safetyGate
            .decision
        )
          .toBe(
            "HOLD_FOR_MORE_EVIDENCE"
          );

        expect(
          result
            .diagnosis
            .recommendedNextStep
            .type
        )
          .toBe(
            "COLLECT_MORE_EVIDENCE"
          );

        expect(
          result
            .safetyGate
            .canEvaluatePlaybook
        )
          .toBe(
            false
          );

        expect(
          result
            .executionAuthorized
        )
          .toBe(
            false
          );
      }
    );
  }
);