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
  HumanReturnControlService,

  RETURN_CONTROL_INVARIANTS,
} =
  require(
    "../../services/humanOperations/humanReturnControlService"
  );


function activeLease(
  overrides =
    {}
) {
  return {
    id:
      "44444444-4444-4444-8444-444444444444",

    publicId:
      "lease-1",

    incidentId:
      "incident-1",

    takeoverSessionId:
      "takeover-1",

    holderUserId:
      "user-1",

    status:
      "ACTIVE",

    controlEpoch:
      7,

    executionAuthorized:
      false,

    ...overrides,
  };
}


function releasedLease(
  overrides =
    {}
) {
  return activeLease({
    status:
      "RELEASED",

    ...overrides,
  });
}


function pendingFence(
  overrides =
    {}
) {
  return {
    id:
      "55555555-5555-4555-8555-555555555555",

    publicId:
      "return-fence-1",

    incidentId:
      "incident-1",

    controlLeaseId:
      "44444444-4444-4444-8444-444444444444",

    takeoverSessionId:
      "33333333-3333-4333-8333-333333333333",

    previousControlEpoch:
      7,

    requiredControlEpoch:
      8,

    releaseOutcome:
      "RELEASED",

    state:
      "REQUIRES_FRESH_EVALUATION",

    freshAfter:
      "2030-01-01T00:15:00.000Z",

    stalePlanResumeAllowed:
      false,

    executionAuthorized:
      false,

    ...overrides,
  };
}


describe(
  "Phase 23.6 Return Control",

  () => {
    test(
      "return-control invariants permanently prohibit stale resume",

      () => {
        expect(
          RETURN_CONTROL_INVARIANTS
            .RETURN_CONTROL_IS_NOT_RESUME
        ).toBe(
          true
        );


        expect(
          RETURN_CONTROL_INVARIANTS
            .RELEASE_REQUIRES_FRESH_EVALUATION
        ).toBe(
          true
        );


        expect(
          RETURN_CONTROL_INVARIANTS
            .EXPIRY_REQUIRES_FRESH_EVALUATION
        ).toBe(
          true
        );


        expect(
          RETURN_CONTROL_INVARIANTS
            .REVOCATION_REQUIRES_FRESH_EVALUATION
        ).toBe(
          true
        );


        expect(
          RETURN_CONTROL_INVARIANTS
            .OLD_DIAGNOSIS_CANNOT_RESUME_PLAN
        ).toBe(
          true
        );


        expect(
          RETURN_CONTROL_INVARIANTS
            .OLD_RECOVERY_DECISION_CANNOT_RESUME_PLAN
        ).toBe(
          true
        );


        expect(
          RETURN_CONTROL_INVARIANTS
            .FRESH_EVALUATION_DOES_NOT_AUTHORIZE_EXECUTION
        ).toBe(
          true
        );


        expect(
          RETURN_CONTROL_INVARIANTS
            .STALE_PLAN_RESUME_PROHIBITED
        ).toBe(
          true
        );
      }
    );


    test(
      "releases authoritative ACTIVE lease and requires fresh evaluation",

      async () => {
        const lifecycleService = {
          releaseControl:
            jest
              .fn()
              .mockResolvedValue({
                lease:
                  releasedLease(),

                humanControlActive:
                  false,

                requiresFreshEvaluation:
                  true,

                stalePlanResumeAllowed:
                  false,

                executionAuthorized:
                  false,
              }),
        };


        const service =
          new HumanReturnControlService({
            takeoverRepository: {
              getActiveLeaseForIncident:
                jest
                  .fn()
                  .mockResolvedValue(
                    activeLease()
                  ),
            },

            lifecycleService,

            returnFenceRepository: {
              getPending:
                jest
                  .fn()
                  .mockResolvedValue(
                    pendingFence()
                  ),
            },
          });


        const result =
          await service
            .returnControl({
              organizationId:
                "org-1",

              environmentId:
                "env-1",

              incidentId:
                "incident-1",

              leaseId:
                "lease-1",

              actorUserId:
                "user-1",
            });


        expect(
          lifecycleService
            .releaseControl
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            leaseId:
              "lease-1",

            actorUserId:
              "user-1",
          })
        );


        expect(
          result.humanControlActive
        ).toBe(
          false
        );


        expect(
          result.requiresFreshEvaluation
        ).toBe(
          true
        );


        expect(
          result.autonomousContinuationAllowed
        ).toBe(
          false
        );


        expect(
          result.requiredControlEpoch
        ).toBe(
          8
        );


        expect(
          result.stalePlanResumeAllowed
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


    test(
      "cannot return a lease that is not the authoritative active incident lease",

      async () => {
        const lifecycleService = {
          releaseControl:
            jest.fn(),
        };


        const service =
          new HumanReturnControlService({
            takeoverRepository: {
              getActiveLeaseForIncident:
                jest
                  .fn()
                  .mockResolvedValue(
                    activeLease()
                  ),
            },

            lifecycleService,

            returnFenceRepository:
              {},
          });


        await expect(
          service.returnControl({
            organizationId:
              "org-1",

            environmentId:
              "env-1",

            incidentId:
              "incident-1",

            leaseId:
              "different-lease",

            actorUserId:
              "user-1",
          })
        ).rejects.toMatchObject({
          code:
            "CONTROL_RETURN_LEASE_MISMATCH",

          executionAuthorized:
            false,
        });


        expect(
          lifecycleService
            .releaseControl
        ).not.toHaveBeenCalled();
      }
    );


    test(
      "missing durable fence after release is treated as unsafe",

      async () => {
        const service =
          new HumanReturnControlService({
            takeoverRepository: {
              getActiveLeaseForIncident:
                jest
                  .fn()
                  .mockResolvedValue(
                    activeLease()
                  ),
            },

            lifecycleService: {
              releaseControl:
                jest
                  .fn()
                  .mockResolvedValue({
                    lease:
                      releasedLease(),

                    executionAuthorized:
                      false,
                  }),
            },

            returnFenceRepository: {
              getPending:
                jest
                  .fn()
                  .mockResolvedValue(
                    null
                  ),
            },
          });


        await expect(
          service.returnControl({
            organizationId:
              "org-1",

            environmentId:
              "env-1",

            incidentId:
              "incident-1",

            leaseId:
              "lease-1",

            actorUserId:
              "user-1",
          })
        ).rejects.toMatchObject({
          code:
            "CONTROL_RETURN_FENCE_MISSING",

          status:
            500,

          executionAuthorized:
            false,
        });
      }
    );


    test(
      "pending return fence blocks autonomous continuation",

      async () => {
        const service =
          new HumanReturnControlService({
            takeoverRepository:
              {},

            lifecycleService:
              {},

            returnFenceRepository: {
              getPending:
                jest
                  .fn()
                  .mockResolvedValue(
                    pendingFence()
                  ),

              getLatest:
                jest.fn(),
            },
          });


        await expect(
          service
            .assertAutonomousContinuationAllowed({
              organizationId:
                "org-1",

              environmentId:
                "env-1",

              incidentId:
                "incident-1",
            })
        ).rejects.toMatchObject({
          code:
            "CONTROL_RETURN_FRESH_EVALUATION_REQUIRED",

          status:
            423,

          requiredControlEpoch:
            8,

          stalePlanResumeAllowed:
            false,

          autonomousContinuationAllowed:
            false,

          executionAuthorized:
            false,
        });
      }
    );


    test(
      "caller cannot manufacture execution authority through return fence",

      async () => {
        const repository = {
          getPending:
            jest.fn(),
        };


        const service =
          new HumanReturnControlService({
            takeoverRepository:
              {},

            lifecycleService:
              {},

            returnFenceRepository:
              repository,
          });


        await expect(
          service
            .assertAutonomousContinuationAllowed({
              organizationId:
                "org-1",

              environmentId:
                "env-1",

              incidentId:
                "incident-1",

              executionAuthorized:
                true,
            })
        ).rejects.toMatchObject({
          code:
            "CONTROL_RETURN_AUTHORITY_VIOLATION",

          status:
            403,

          executionAuthorized:
            false,
        });


        expect(
          repository.getPending
        ).not.toHaveBeenCalled();
      }
    );


    test(
      "fresh diagnosis plus fresh recovery decision satisfies return fence",

      async () => {
        const repository = {
          certifyFreshEvaluation:
            jest
              .fn()
              .mockResolvedValue({
                fence:
                  pendingFence({
                    state:
                      "SATISFIED",

                    freshDiagnosisId:
                      "diagnosis-db-id",

                    freshRecoveryDecisionId:
                      "decision-db-id",
                  }),

                diagnosisId:
                  "diag-fresh",

                recoveryDecisionId:
                  "decision-fresh",

                freshEvaluationCertified:
                  true,

                stalePlanResumeAllowed:
                  false,

                executionAuthorized:
                  false,
              }),
        };


        const service =
          new HumanReturnControlService({
            takeoverRepository:
              {},

            lifecycleService:
              {},

            returnFenceRepository:
              repository,
          });


        const result =
          await service
            .certifyFreshEvaluation({
              organizationId:
                "org-1",

              environmentId:
                "env-1",

              incidentId:
                "incident-1",

              diagnosisId:
                "diag-fresh",

              recoveryDecisionId:
                "decision-fresh",
            });


        expect(
          repository
            .certifyFreshEvaluation
        ).toHaveBeenCalledWith({
          organizationId:
            "org-1",

          environmentId:
            "env-1",

          incidentId:
            "incident-1",

          diagnosisId:
            "diag-fresh",

          recoveryDecisionId:
            "decision-fresh",
        });


        expect(
          result.freshEvaluationSatisfied
        ).toBe(
          true
        );


        expect(
          result.requiresFreshEvaluation
        ).toBe(
          false
        );


        expect(
          result.autonomousContinuationAllowed
        ).toBe(
          true
        );


        expect(
          result.executionAuthorizationRequired
        ).toBe(
          true
        );


        expect(
          result.stalePlanResumeAllowed
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


    test(
      "satisfied return fence only passes this fence and never authorizes execution",

      async () => {
        const service =
          new HumanReturnControlService({
            takeoverRepository:
              {},

            lifecycleService:
              {},

            returnFenceRepository: {
              getPending:
                jest
                  .fn()
                  .mockResolvedValue(
                    null
                  ),

              getLatest:
                jest
                  .fn()
                  .mockResolvedValue(
                    pendingFence({
                      state:
                        "SATISFIED",
                    })
                  ),
            },
          });


        const result =
          await service
            .assertAutonomousContinuationAllowed({
              organizationId:
                "org-1",

              environmentId:
                "env-1",

              incidentId:
                "incident-1",
            });


        expect(
          result.allowed
        ).toBe(
          true
        );


        expect(
          result.freshEvaluationSatisfied
        ).toBe(
          true
        );


        expect(
          result.stalePlanResumeAllowed
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


    test(
      "migration creates trigger-backed durable stale-plan fence",

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

              "0093_control_return_fresh_evaluation.sql"
            ),

            "utf8"
          );


        expect(
          source
        ).toContain(
          "human_operations.control_return_fences"
        );


        expect(
          source
        ).toContain(
          "aira_create_control_return_fence"
        );


        expect(
          source
        ).toContain(
          "AFTER UPDATE OF status"
        );


        expect(
          source
        ).toContain(
          "OLD.status = 'ACTIVE'"
        );


        expect(
          source
        ).toContain(
          "'RELEASED'"
        );


        expect(
          source
        ).toContain(
          "'EXPIRED'"
        );


        expect(
          source
        ).toContain(
          "'REVOKED'"
        );


        expect(
          source
        ).toContain(
          "required_control_epoch"
        );


        expect(
          source
        ).toContain(
          "stale_plan_resume_allowed = FALSE"
        );


        expect(
          source
        ).toContain(
          "execution_authorized = FALSE"
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
      }
    );


    test(
      "fresh evaluation repository requires decision to use fresh diagnosis",

      () => {
        const source =
          fs.readFileSync(
            path.join(
              __dirname,

              "..",
              "..",

              "persistence",
              "postgres",

              "PostgresControlReturnFenceRepository.js"
            ),

            "utf8"
          );


        expect(
          source
        ).toContain(
          "diagnosis_id = $5"
        );


        expect(
          source
        ).toContain(
          "created_at >= $5"
        );


        expect(
          source
        ).toContain(
          "created_at >= $6"
        );


        expect(
          source
        ).toContain(
          "execution_authorized = FALSE"
        );


        expect(
          source
        ).toContain(
          "CONTROL_RETURN_STALE_DIAGNOSIS"
        );


        expect(
          source
        ).toContain(
          "CONTROL_RETURN_STALE_RECOVERY_DECISION"
        );
      }
    );
  }
);