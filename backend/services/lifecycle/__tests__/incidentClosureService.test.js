"use strict";

const {
  IncidentClosureService,
} =
  require(
    "../incidentClosureService"
  );

const {
  INCIDENT_LIFECYCLE_STATE,
  CLOSURE_DECISION,
} =
  require(
    "../incidentLifecycleContracts"
  );

function eligibility() {
  return {
    decision:
      CLOSURE_DECISION
        .ELIGIBLE,

    eligible:
      true,

    reason:
      "Recovery remained stable.",
  };
}

function baseInput(
  overrides = {}
) {
  return {
    organizationId:
      "org-1",

    environmentId:
      "env-1",

    incidentId:
      "incident-1",

    verificationId:
      "verification-1",

    closureEligibility:
      eligibility(),

    stabilityResult: {
      result:
        "STABLE",

      completed:
        true,
    },

    actor: {
      type:
        "SYSTEM",

      id:
        "aira",
    },

    executionAuthorized:
      false,

    ...overrides,
  };
}

function incident(
  state
) {
  return {
    lifecycleState:
      state,

    status:
      state,

    save:
      jest.fn(
        async () => {}
      ),
  };
}

describe(
  "IncidentClosureService",
  () => {
    test(
      "marks stable observed incident resolved",
      async () => {
        const doc =
          incident(
            INCIDENT_LIFECYCLE_STATE
              .STABILITY_OBSERVATION
          );

        const service =
          new IncidentClosureService();

        const result =
          await service.markResolved(
            {
              ...baseInput(),

              incident:
                doc,
            }
          );

        expect(
          result.resolved
        )
          .toBe(
            true
          );

        expect(
          result.closed
        )
          .toBe(
            false
          );

        expect(
          doc.lifecycleState
        )
          .toBe(
            INCIDENT_LIFECYCLE_STATE
              .RESOLVED
          );

        expect(
          doc.save
        )
          .toHaveBeenCalled();
      }
    );

    test(
      "resolved incident may close",
      async () => {
        const doc =
          incident(
            INCIDENT_LIFECYCLE_STATE
              .RESOLVED
          );

        const service =
          new IncidentClosureService();

        const result =
          await service.close({
            ...baseInput(),

            incident:
              doc,
          });

        expect(
          result.closed
        )
          .toBe(
            true
          );

        expect(
          doc.lifecycleState
        )
          .toBe(
            INCIDENT_LIFECYCLE_STATE
              .CLOSED
          );
      }
    );

    test(
      "cannot close directly from recovered",
      async () => {
        const service =
          new IncidentClosureService();

        await expect(
          service.close({
            ...baseInput(),

            incident:
              incident(
                INCIDENT_LIFECYCLE_STATE
                  .RECOVERED
              ),
          })
        )
          .rejects
          .toMatchObject({
            code:
              "INCIDENT_CLOSURE_STATE_INVALID",
          });
      }
    );

    test(
      "cannot resolve without eligibility",
      async () => {
        const service =
          new IncidentClosureService();

        await expect(
          service.markResolved({
            ...baseInput(),

            closureEligibility: {
              decision:
                CLOSURE_DECISION
                  .NOT_ELIGIBLE,

              eligible:
                false,
            },

            incident:
              incident(
                INCIDENT_LIFECYCLE_STATE
                  .STABILITY_OBSERVATION
              ),
          })
        )
          .rejects
          .toMatchObject({
            code:
              "INCIDENT_CLOSURE_NOT_ELIGIBLE",
          });
      }
    );

    test(
      "finalize resolves then closes incident",
      async () => {
        const doc =
          incident(
            INCIDENT_LIFECYCLE_STATE
              .STABILITY_OBSERVATION
          );

        const service =
          new IncidentClosureService();

        const result =
          await service.finalize({
            ...baseInput(),

            incident:
              doc,
          });

        expect(
          result.closed
        )
          .toBe(
            true
          );

        expect(
          doc.lifecycleState
        )
          .toBe(
            INCIDENT_LIFECYCLE_STATE
              .CLOSED
          );

        expect(
          doc.save
        )
          .toHaveBeenCalledTimes(
            2
          );
      }
    );

    test(
      "already closed incident is safe no-op",
      async () => {
        const service =
          new IncidentClosureService();

        const result =
          await service.close({
            ...baseInput(),

            incident:
              incident(
                INCIDENT_LIFECYCLE_STATE
                  .CLOSED
              ),
          });

        expect(
          result.noOp
        )
          .toBe(
            true
          );

        expect(
          result.closed
        )
          .toBe(
            true
          );
      }
    );

    test(
      "finalize already closed incident is safe no-op",
      async () => {
        const service =
          new IncidentClosureService();

        const result =
          await service.finalize({
            ...baseInput(),

            incident:
              incident(
                INCIDENT_LIFECYCLE_STATE
                  .CLOSED
              ),
          });

        expect(
          result.noOp
        )
          .toBe(
            true
          );
      }
    );

    test(
      "uses external incident provider",
      async () => {
        const doc =
          incident(
            INCIDENT_LIFECYCLE_STATE
              .RESOLVED
          );

        const saveIncident =
          jest.fn();

        const service =
          new IncidentClosureService();

        const result =
          await service.close(
            baseInput(),
            {
              getIncident:
                jest.fn(
                  async () =>
                    doc
                ),

              saveIncident,
            }
          );

        expect(
          result.closed
        )
          .toBe(
            true
          );

        expect(
          saveIncident
        )
          .toHaveBeenCalledWith(
            doc
          );
      }
    );

    test(
      "missing incident is rejected",
      async () => {
        const service =
          new IncidentClosureService();

        await expect(
          service.close(
            baseInput(),
            {
              getIncident:
                jest.fn(
                  async () =>
                    null
                ),
            }
          )
        )
          .rejects
          .toMatchObject({
            code:
              "INCIDENT_NOT_FOUND",
          });
      }
    );

    test(
      "never authorizes infrastructure execution",
      async () => {
        const service =
          new IncidentClosureService();

        const result =
          await service.close({
            ...baseInput(),

            incident:
              incident(
                INCIDENT_LIFECYCLE_STATE
                  .RESOLVED
              ),
          });

        expect(
          result.executionAuthorized
        )
          .toBe(
            false
          );
      }
    );

    test(
      "rejects unsafe execution authorization",
      async () => {
        const service =
          new IncidentClosureService();

        await expect(
          service.close({
            ...baseInput(),

            incident:
              incident(
                INCIDENT_LIFECYCLE_STATE
                  .RESOLVED
              ),

            executionAuthorized:
              true,
          })
        )
          .rejects
          .toMatchObject({
            code:
              "INCIDENT_CLOSURE_UNSAFE_INPUT",
          });
      }
    );
  }
);