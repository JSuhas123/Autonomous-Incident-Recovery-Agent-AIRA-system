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
  buildIncidentHandoffPackage,

  contentHash,

  HANDOFF_INVARIANTS,
} =
  require(
    "../../services/humanOperations/incidentHandoffPackageBuilder"
  );


const {
  IncidentHandoffPackageService,
} =
  require(
    "../../services/humanOperations/incidentHandoffPackageService"
  );


function detailFixture(
  overrides =
    {}
) {
  return {
    incident: {
      _id:
        "incident-1",

      organizationId:
        "org-1",

      environmentId:
        "env-1",

      title:
        "API latency",

      status:
        "OPEN",

      severity:
        "CRITICAL",

      source:
        "prometheus",

      providers: [
        "prometheus",
      ],

      createdAt:
        "2030-01-01T00:00:00.000Z",

      ...overrides,
    },

    evidence: {
      signalCount:
        2,

      embeddedEvidenceCount:
        1,

      providerCount:
        1,

      providers: [
        "prometheus",
      ],

      signals: [
        {
          signalId:
            "sig-1",

          metric:
            "latency",
        },
      ],
    },

    impact: {
      summary: {
        affectedServiceCount:
          1,

        userFacingImpact:
          true,
      },
    },

    correlation: {
      correlationGroupId:
        "corr-1",
    },

    timeline: [
      {
        type:
          "INCIDENT_CREATED",
      },
    ],

    events: [
      {
        eventType:
          "INCIDENT_CREATED",
      },
    ],
  };
}


function escalationFixture(
  overrides =
    {}
) {
  return {
    id:
      "11111111-1111-4111-8111-111111111111",

    publicId:
      "esc-1",

    incidentId:
      "incident-1",

    taskId:
      "task-1",

    decision:
      "ESCALATE",

    reasonCode:
      "RECOVERY_UNSAFE",

    severity:
      "CRITICAL",

    triggerSource:
      "RECOVERY_ENGINE",

    status:
      "WAITING_ACK",

    acknowledgementDeadline:
      "2030-01-01T00:15:00.000Z",

    routingSnapshot: {
      target:
        "primary-on-call",
    },

    executionAuthorized:
      false,

    ...overrides,
  };
}


function taskFixture(
  overrides =
    {}
) {
  return {
    id:
      "22222222-2222-4222-8222-222222222222",

    publicId:
      "task-1",

    incidentId:
      "incident-1",

    escalationId:
      "esc-1",

    taskType:
      "MANUAL_INTERVENTION",

    title:
      "Review unsafe recovery",

    description:
      "AIRA stopped before unsafe recovery",

    priority:
      "CRITICAL",

    status:
      "ASSIGNED",

    acknowledgementRequired:
      true,

    autonomousRecoveryBlocked:
      true,

    recommendedActions: [
      "Inspect database health",
      "Confirm replica state",
    ],

    controlEpoch:
      0,

    executionAuthorized:
      false,

    ...overrides,
  };
}


describe(
  "Phase 23.4 Incident Handoff Package",

  () => {
    test(
      "handoff safety contract is information-only",

      () => {
        expect(
          HANDOFF_INVARIANTS
            .INFORMATION_ONLY
        ).toBe(
          true
        );


        expect(
          HANDOFF_INVARIANTS
            .HANDOFF_IS_NOT_ACKNOWLEDGEMENT
        ).toBe(
          true
        );


        expect(
          HANDOFF_INVARIANTS
            .HANDOFF_IS_NOT_TAKEOVER
        ).toBe(
          true
        );


        expect(
          HANDOFF_INVARIANTS
            .HANDOFF_IS_NOT_CONTROL
        ).toBe(
          true
        );


        expect(
          HANDOFF_INVARIANTS
            .HANDOFF_NEVER_AUTHORIZES_EXECUTION
        ).toBe(
          true
        );


        expect(
          HANDOFF_INVARIANTS
            .STALE_PLAN_RESUME_PROHIBITED
        ).toBe(
          true
        );
      }
    );


    test(
      "builds complete operator handoff from canonical AIRA state",

      () => {
        const result =
          buildIncidentHandoffPackage({
            detail:
              detailFixture(),

            diagnosis: {
              diagnosisId:
                "diag-1",

              revision:
                2,

              confidence: {
                overallConfidence:
                  0.91,
              },

              rootCause:
                "Database connection exhaustion",

              hypotheses: [
                {
                  name:
                    "connection pool saturation",
                },
              ],
            },

            recoveryDecision: {
              decisionId:
                "decision-1",

              revision:
                3,

              decision:
                "DO_NOT_EXECUTE",

              reason:
                "risk too high",

              approvalRequired:
                true,

              executionAuthorized:
                false,
            },

            verification: {
              verificationId:
                "verify-1",

              revision:
                1,

              decision:
                "NOT_RECOVERED",

              recoveryConfirmed:
                false,

              incidentClosureEligible:
                false,

              overallScore:
                0.4,

              executionAuthorized:
                false,
            },

            escalation:
              escalationFixture(),

            task:
              taskFixture(),

            taskHistory: [
              {
                fromStatus:
                  "OPEN",

                toStatus:
                  "ASSIGNED",
              },
            ],

            generatedAt:
              "2030-01-01T00:05:00.000Z",
          });


        expect(
          result.purpose
        ).toBe(
          "HUMAN_INCIDENT_HANDOFF"
        );


        expect(
          result
            .incident
            .incidentId
        ).toBe(
          "incident-1"
        );


        expect(
          result
            .investigation
            .diagnosis
            .rootCause
        ).toBe(
          "Database connection exhaustion"
        );


        expect(
          result
            .recovery
            .decision
        ).toBe(
          "DO_NOT_EXECUTE"
        );


        expect(
          result
            .verification
            .recoveryConfirmed
        ).toBe(
          false
        );


        expect(
          result
            .escalation
            .reasonCode
        ).toBe(
          "RECOVERY_UNSAFE"
        );


        expect(
          result
            .humanTask
            .recommendedActions
        ).toEqual([
          "Inspect database health",
          "Confirm replica state",
        ]);


        expect(
          result
            .operatorBrief
            .stalePlanResumeAllowed
        ).toBe(
          false
        );


        expect(
          result
            .operatorBrief
            .freshEvaluationRequiredOnReturn
        ).toBe(
          true
        );


        expect(
          result
            .executionAuthorized
        ).toBe(
          false
        );
      }
    );


    test(
      "semantic content hash ignores generation timestamp",

      () => {
        const first =
          buildIncidentHandoffPackage({
            detail:
              detailFixture(),

            escalation:
              escalationFixture(),

            task:
              taskFixture(),

            generatedAt:
              "2030-01-01T00:00:00.000Z",
          });


        const second =
          buildIncidentHandoffPackage({
            detail:
              detailFixture(),

            escalation:
              escalationFixture(),

            task:
              taskFixture(),

            generatedAt:
              "2030-01-01T01:00:00.000Z",
          });


        expect(
          contentHash(
            first
          )
        ).toBe(
          contentHash(
            second
          )
        );
      }
    );


    test(
      "operational change creates a different semantic hash",

      () => {
        const first =
          buildIncidentHandoffPackage({
            detail:
              detailFixture(),

            escalation:
              escalationFixture(),

            task:
              taskFixture({
                status:
                  "ASSIGNED",
              }),
          });


        const second =
          buildIncidentHandoffPackage({
            detail:
              detailFixture(),

            escalation:
              escalationFixture(),

            task:
              taskFixture({
                status:
                  "ACKNOWLEDGED",
              }),
          });


        expect(
          contentHash(
            first
          )
        ).not.toBe(
          contentHash(
            second
          )
        );
      }
    );


    test(
      "service reloads canonical state and persists handoff revision",

      async () => {
        const handoffRepository = {
          createRevision:
            jest
              .fn()
              .mockImplementation(
                async (
                  input
                ) => ({
                  created:
                    true,

                  duplicate:
                    false,

                  superseded:
                    false,

                  handoff: {
                    publicId:
                      "handoff-1",

                    revision:
                      1,

                    contentHash:
                      input.contentHash,

                    package:
                      input.package,

                    executionAuthorized:
                      false,
                  },
                })
              ),
        };


        const service =
          new IncidentHandoffPackageService({
            incidentDetailService: {
              getDetail:
                jest
                  .fn()
                  .mockResolvedValue(
                    detailFixture()
                  ),
            },

            diagnosisRepository: {
              findCurrent:
                jest
                  .fn()
                  .mockResolvedValue({
                    diagnosisId:
                      "diag-1",

                    rootCause:
                      "Database connection exhaustion",

                    confidence:
                      0.9,
                  }),
            },

            recoveryDecisionRepository: {
              findCurrent:
                jest
                  .fn()
                  .mockResolvedValue({
                    decisionId:
                      "decision-1",

                    decision:
                      "DO_NOT_EXECUTE",

                    executionAuthorized:
                      false,
                  }),
            },

            verificationRepository: {
              findCurrent:
                jest
                  .fn()
                  .mockResolvedValue({
                    verificationId:
                      "verification-1",

                    recoveryConfirmed:
                      false,

                    executionAuthorized:
                      false,
                  }),
            },

            escalationRepository: {
              getEscalation:
                jest
                  .fn()
                  .mockResolvedValue(
                    escalationFixture()
                  ),
            },

            humanOperationsRepository: {
              getTask:
                jest
                  .fn()
                  .mockResolvedValue(
                    taskFixture()
                  ),

              listTaskHistory:
                jest
                  .fn()
                  .mockResolvedValue([
                    {
                      toStatus:
                        "ASSIGNED",
                    },
                  ]),
            },

            handoffRepository,
          });


        const result =
          await service
            .generate({
              organizationId:
                "org-1",

              environmentId:
                "env-1",

              incidentId:
                "incident-1",

              escalationId:
                "esc-1",

              generatedAt:
                "2030-01-01T00:05:00.000Z",
            });


        expect(
          handoffRepository
            .createRevision
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            incidentId:
              "incident-1",

            escalationId:
              "esc-1",

            taskId:
              "task-1",

            schemaVersion:
              "23.4.1",
          })
        );


        expect(
          result.created
        ).toBe(
          true
        );


        expect(
          result.revision
        ).toBe(
          1
        );


        expect(
          result
            .package
            .operatorBrief
            .whyAiraStopped
        ).toBe(
          "RECOVERY_UNSAFE"
        );


        expect(
          result.executionAuthorized
        ).toBe(
          false
        );


        expect(
          result.humanControlGranted
        ).toBe(
          false
        );
      }
    );


    test(
      "service rejects escalation from another incident",

      async () => {
        const service =
          new IncidentHandoffPackageService({
            incidentDetailService: {
              getDetail:
                jest
                  .fn()
                  .mockResolvedValue(
                    detailFixture()
                  ),
            },

            diagnosisRepository: {
              findCurrent:
                jest
                  .fn()
                  .mockResolvedValue(
                    null
                  ),
            },

            recoveryDecisionRepository: {
              findCurrent:
                jest
                  .fn()
                  .mockResolvedValue(
                    null
                  ),
            },

            verificationRepository: {
              findCurrent:
                jest
                  .fn()
                  .mockResolvedValue(
                    null
                  ),
            },

            escalationRepository: {
              getEscalation:
                jest
                  .fn()
                  .mockResolvedValue(
                    escalationFixture({
                      incidentId:
                        "incident-other",
                    })
                  ),
            },

            humanOperationsRepository:
              {},

            handoffRepository:
              {},
          });


        await expect(
          service.generate({
            organizationId:
              "org-1",

            environmentId:
              "env-1",

            incidentId:
              "incident-1",

            escalationId:
              "esc-1",
          })
        ).rejects.toMatchObject({
          code:
            "INCIDENT_HANDOFF_INCIDENT_ESCALATION_MISMATCH",

          executionAuthorized:
            false,
        });
      }
    );


    test(
      "migration creates revisioned RLS-protected handoff domain",

      () => {
        const source =
          fs.readFileSync(
            path.join(
              __dirname,

              "..",
              "..",

              "persistence",
              "postgres",
              "migrations",

              "0092_incident_handoff_packages.sql"
            ),

            "utf8"
          );


        expect(
          source
        ).toContain(
          "human_operations.incident_handoff_packages"
        );


        expect(
          source
        ).toContain(
          "revision INTEGER NOT NULL"
        );


        expect(
          source
        ).toContain(
          "WHERE is_current = TRUE"
        );


        expect(
          source
        ).toContain(
          "ENABLE ROW LEVEL SECURITY"
        );


        expect(
          source
        ).toContain(
          "FORCE ROW LEVEL SECURITY"
        );


        expect(
          source
        ).toContain(
          "execution_authorized = FALSE"
        );
      }
    );
  }
);