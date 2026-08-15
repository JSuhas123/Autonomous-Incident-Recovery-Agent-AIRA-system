"use strict";

const {
  IncidentStateVerificationService,
} =
  require(
    "../incidentStateVerificationService"
  );

const {
  VERIFICATION_DIMENSION,
  VERIFICATION_CHECK_STATUS,
} =
  require(
    "../verificationContracts"
  );

function check(
  type,
  overrides = {}
) {
  return {
    checkId:
      `check-${type}`,

    dimension:
      VERIFICATION_DIMENSION
        .INCIDENT_STATE,

    type,

    timeoutMs:
      1000,

    parameters:
      {},

    ...overrides,
  };
}

function baseInput(
  checks,
  overrides = {}
) {
  return {
    organizationId:
      "org-1",

    environmentId:
      "env-1",

    incidentId:
      "incident-1",

    executionRequestId:
      "request-1",

    incident: {
      severity:
        "critical",

      symptoms: [
        "503 errors",
      ],
    },

    verificationPlan: {
      checks,
    },

    context: {
      service: {
        id:
          "payment-api",
      },
    },

    executionAuthorized:
      false,

    ...overrides,
  };
}

describe(
  "IncidentStateVerificationService",
  () => {
    test(
      "passes resolved incident check",
      async () => {
        const service =
          new IncidentStateVerificationService();

        const result =
          await service.verify(
            baseInput([
              check(
                "incident_resolved"
              ),
            ]),
            {
              async getIncidentState() {
                return {
                  status:
                    "resolved",

                  resolved:
                    true,
                };
              },
            }
          );

        expect(
          result.checks[0]
            .status
        )
          .toBe(
            VERIFICATION_CHECK_STATUS
              .PASSED
          );
      }
    );

    test(
      "fails when incident remains active",
      async () => {
        const service =
          new IncidentStateVerificationService();

        const result =
          await service.verify(
            baseInput([
              check(
                "incident_resolved"
              ),
            ]),
            {
              async getIncidentState() {
                return {
                  status:
                    "open",

                  resolved:
                    false,
                };
              },
            }
          );

        expect(
          result.failedCount
        )
          .toBe(
            1
          );
      }
    );

    test(
      "passes when alerts are cleared",
      async () => {
        const service =
          new IncidentStateVerificationService();

        const result =
          await service.verify(
            baseInput([
              check(
                "alerts_cleared"
              ),
            ]),
            {
              async getActiveAlerts() {
                return {
                  activeCount:
                    0,
                };
              },
            }
          );

        expect(
          result.checks[0]
            .passed
        )
          .toBe(
            true
          );
      }
    );

    test(
      "fails while incident alerts remain active",
      async () => {
        const service =
          new IncidentStateVerificationService();

        const result =
          await service.verify(
            baseInput([
              check(
                "alerts_cleared"
              ),
            ]),
            {
              async getActiveAlerts() {
                return {
                  activeCount:
                    3,
                };
              },
            }
          );

        expect(
          result.checks[0]
            .failed
        )
          .toBe(
            true
          );
      }
    );

    test(
      "passes when severity drops",
      async () => {
        const service =
          new IncidentStateVerificationService();

        const result =
          await service.verify(
            baseInput([
              check(
                "severity_reduced"
              ),
            ]),
            {
              async getIncidentState() {
                return {
                  severity:
                    "medium",
                };
              },
            }
          );

        expect(
          result.checks[0]
            .passed
        )
          .toBe(
            true
          );
      }
    );

    test(
      "fails when severity does not improve",
      async () => {
        const service =
          new IncidentStateVerificationService();

        const result =
          await service.verify(
            baseInput([
              check(
                "severity_reduced"
              ),
            ]),
            {
              async getIncidentState() {
                return {
                  severity:
                    "critical",
                };
              },
            }
          );

        expect(
          result.checks[0]
            .failed
        )
          .toBe(
            true
          );
      }
    );

    test(
      "passes when original symptoms disappear",
      async () => {
        const service =
          new IncidentStateVerificationService();

        const result =
          await service.verify(
            baseInput([
              check(
                "symptoms_cleared"
              ),
            ]),
            {
              async getActiveSymptoms() {
                return {
                  activeCount:
                    0,

                  symptoms:
                    [],
                };
              },
            }
          );

        expect(
          result.checks[0]
            .passed
        )
          .toBe(
            true
          );
      }
    );

    test(
      "fails while original symptoms remain",
      async () => {
        const service =
          new IncidentStateVerificationService();

        const result =
          await service.verify(
            baseInput([
              check(
                "symptoms_cleared"
              ),
            ]),
            {
              async getActiveSymptoms() {
                return {
                  activeCount:
                    1,

                  symptoms: [
                    "503 errors",
                  ],
                };
              },
            }
          );

        expect(
          result.checks[0]
            .failed
        )
          .toBe(
            true
          );
      }
    );

    test(
      "passes when no new correlated signals appear",
      async () => {
        const service =
          new IncidentStateVerificationService();

        const result =
          await service.verify(
            baseInput([
              check(
                "no_new_correlated_signals"
              ),
            ]),
            {
              async getNewCorrelatedSignals() {
                return {
                  count:
                    0,
                };
              },
            }
          );

        expect(
          result.checks[0]
            .passed
        )
          .toBe(
            true
          );
      }
    );

    test(
      "fails when new correlated failures appear",
      async () => {
        const service =
          new IncidentStateVerificationService();

        const result =
          await service.verify(
            baseInput([
              check(
                "no_new_correlated_signals"
              ),
            ]),
            {
              async getNewCorrelatedSignals() {
                return {
                  count:
                    2,
                };
              },
            }
          );

        expect(
          result.checks[0]
            .failed
        )
          .toBe(
            true
          );
      }
    );

    test(
      "passes when incident was not superseded",
      async () => {
        const service =
          new IncidentStateVerificationService();

        const result =
          await service.verify(
            baseInput([
              check(
                "incident_not_superseded"
              ),
            ]),
            {
              async getIncidentState() {
                return {
                  superseded:
                    false,
                };
              },
            }
          );

        expect(
          result.checks[0]
            .passed
        )
          .toBe(
            true
          );
      }
    );

    test(
      "fails if incident was superseded",
      async () => {
        const service =
          new IncidentStateVerificationService();

        const result =
          await service.verify(
            baseInput([
              check(
                "incident_not_superseded"
              ),
            ]),
            {
              async getIncidentState() {
                return {
                  superseded:
                    true,

                  supersededByIncidentId:
                    "incident-2",
                };
              },
            }
          );

        expect(
          result.checks[0]
            .failed
        )
          .toBe(
            true
          );
      }
    );

    test(
      "missing provider becomes inconclusive",
      async () => {
        const service =
          new IncidentStateVerificationService();

        const result =
          await service.verify(
            baseInput([
              check(
                "alerts_cleared"
              ),
            ])
          );

        expect(
          result.checks[0]
            .status
        )
          .toBe(
            VERIFICATION_CHECK_STATUS
              .INCONCLUSIVE
          );
      }
    );

    test(
      "unsupported incident-state check becomes inconclusive",
      async () => {
        const service =
          new IncidentStateVerificationService();

        const result =
          await service.verify(
            baseInput([
              check(
                "unknown_incident_check"
              ),
            ])
          );

        expect(
          result.checks[0]
            .status
        )
          .toBe(
            VERIFICATION_CHECK_STATUS
              .INCONCLUSIVE
          );
      }
    );

    test(
      "ignores checks from other dimensions",
      async () => {
        const service =
          new IncidentStateVerificationService();

        const result =
          await service.verify(
            baseInput([
              {
                checkId:
                  "health",

                dimension:
                  VERIFICATION_DIMENSION
                    .HEALTH,

                type:
                  "service_health",
              },
            ])
          );

        expect(
          result.checkCount
        )
          .toBe(
            0
          );
      }
    );

    test(
      "never accepts execution authorization",
      async () => {
        const service =
          new IncidentStateVerificationService();

        await expect(
          service.verify({
            ...baseInput(
              []
            ),

            executionAuthorized:
              true,
          })
        )
          .rejects
          .toMatchObject({
            code:
              "INCIDENT_STATE_VERIFICATION_UNSAFE_INPUT",
          });
      }
    );
  }
);