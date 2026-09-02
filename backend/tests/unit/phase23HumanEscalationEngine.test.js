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
  ESCALATION_DECISION,
  ESCALATION_REASON,
  ESCALATION_STATUS,
  ON_CALL_TARGET_TYPE,
  ESCALATION_TRIGGER_SOURCE,
  ESCALATION_INVARIANTS,
} = require(
  "../../constants/humanEscalation"
);


const {
  HumanEscalationDecisionService,
} = require(
  "../../services/humanOperations/humanEscalationDecisionService"
);


const PostgresHumanEscalationRepository =
  require(
    "../../persistence/postgres/PostgresHumanEscalationRepository"
  );


describe(
  "Phase 23.2 human escalation engine",
  () => {
    let service;


    beforeEach(
      () => {
        service =
          new HumanEscalationDecisionService();
      }
    );


    test(
      "escalation domain never authorizes execution",
      () => {
        expect(
          ESCALATION_INVARIANTS
            .NEVER_AUTHORIZES_EXECUTION
        ).toBe(
          true
        );


        expect(
          ESCALATION_INVARIANTS
            .ROUTING_NEVER_GRANTS_CONTROL
        ).toBe(
          true
        );


        expect(
          ESCALATION_INVARIANTS
            .ACKNOWLEDGEMENT_NEVER_GRANTS_CONTROL
        ).toBe(
          true
        );
      }
    );


    test(
      "defines canonical escalation states",
      () => {
        expect(
          Object.values(
            ESCALATION_STATUS
          )
        ).toEqual([
          "DECIDED",
          "ROUTED",
          "WAITING_ACK",
          "ACKNOWLEDGED",
          "RESOLVED",
          "EXPIRED",
          "FAILED",
          "CANCELLED",
        ]);
      }
    );


    test(
      "defines canonical on-call target types",
      () => {
        expect(
          Object.values(
            ON_CALL_TARGET_TYPE
          )
        ).toEqual([
          "USER",
          "TEAM",
          "INTEGRATION",
        ]);
      }
    );


    test(
      "unsafe recovery escalates even without configured policy",
      () => {
        const result =
          service.evaluate({
            context: {
              incidentId:
                "incident-1",

              reasonCode:
                ESCALATION_REASON
                  .RECOVERY_UNSAFE,

              triggerSource:
                ESCALATION_TRIGGER_SOURCE
                  .RECOVERY_ENGINE,

              severity:
                "critical",
            },

            policies: [],

            targets: [],
          });


        expect(
          result.decision
        ).toBe(
          ESCALATION_DECISION
            .ESCALATE
        );


        expect(
          result.createHumanTask
        ).toBe(
          true
        );


        expect(
          result.autonomousRecoveryBlocked
        ).toBe(
          true
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
      "verification failure escalates",
      () => {
        const result =
          service.evaluate({
            context: {
              incidentId:
                "incident-2",

              reasonCode:
                ESCALATION_REASON
                  .VERIFICATION_FAILED,

              triggerSource:
                ESCALATION_TRIGGER_SOURCE
                  .VERIFICATION_ENGINE,
            },
          });


        expect(
          result.decision
        ).toBe(
          ESCALATION_DECISION
            .ESCALATE
        );
      }
    );


    test(
      "manual escalation always escalates",
      () => {
        const result =
          service.evaluate({
            context: {
              incidentId:
                "incident-3",

              reasonCode:
                ESCALATION_REASON
                  .MANUAL_ESCALATION,

              triggerSource:
                ESCALATION_TRIGGER_SOURCE
                  .HUMAN_OPERATOR,
            },
          });


        expect(
          result.decision
        ).toBe(
          ESCALATION_DECISION
            .ESCALATE
        );
      }
    );


    test(
      "policy escalation without policy does not invent escalation",
      () => {
        const result =
          service.evaluate({
            context: {
              incidentId:
                "incident-4",

              reasonCode:
                ESCALATION_REASON
                  .POLICY_ESCALATION,

              triggerSource:
                ESCALATION_TRIGGER_SOURCE
                  .SYSTEM_POLICY,
            },

            policies: [],
          });


        expect(
          result.decision
        ).toBe(
          ESCALATION_DECISION
            .NO_ESCALATION
        );


        expect(
          result.executionAuthorized
        ).toBe(
          false
        );
      }
    );


    test(
      "lowest priority-number matching policy wins deterministically",
      () => {
        const result =
          service.evaluate({
            context: {
              incidentId:
                "incident-5",

              reasonCode:
                ESCALATION_REASON
                  .POLICY_ESCALATION,

              triggerSource:
                ESCALATION_TRIGGER_SOURCE
                  .SYSTEM_POLICY,

              severity:
                "critical",
            },

            policies: [
              {
                publicId:
                  "policy-b",

                policyKey:
                  "secondary",

                enabled:
                  true,

                priority:
                  200,

                matchConditions: {
                  severityIn: [
                    "CRITICAL",
                  ],
                },
              },

              {
                publicId:
                  "policy-a",

                policyKey:
                  "primary",

                enabled:
                  true,

                priority:
                  10,

                matchConditions: {
                  severityIn: [
                    "CRITICAL",
                  ],
                },
              },
            ],
          });


        expect(
          result.decision
        ).toBe(
          ESCALATION_DECISION
            .ESCALATE
        );


        expect(
          result
            .matchedPolicy
            .policyKey
        ).toBe(
          "primary"
        );
      }
    );


    test(
      "disabled policy cannot match",
      () => {
        const result =
          service.evaluate({
            context: {
              incidentId:
                "incident-6",

              reasonCode:
                ESCALATION_REASON
                  .POLICY_ESCALATION,

              triggerSource:
                ESCALATION_TRIGGER_SOURCE
                  .SYSTEM_POLICY,

              severity:
                "critical",
            },

            policies: [
              {
                policyKey:
                  "disabled",

                enabled:
                  false,

                priority:
                  1,

                matchConditions: {
                  severityIn: [
                    "CRITICAL",
                  ],
                },
              },
            ],
          });


        expect(
          result.decision
        ).toBe(
          ESCALATION_DECISION
            .NO_ESCALATION
        );
      }
    );


    test(
      "severity filter is enforced",
      () => {
        const result =
          service.evaluate({
            context: {
              incidentId:
                "incident-7",

              reasonCode:
                ESCALATION_REASON
                  .POLICY_ESCALATION,

              triggerSource:
                ESCALATION_TRIGGER_SOURCE
                  .SYSTEM_POLICY,

              severity:
                "warning",
            },

            policies: [
              {
                policyKey:
                  "critical-only",

                enabled:
                  true,

                matchConditions: {
                  severityIn: [
                    "CRITICAL",
                  ],
                },
              },
            ],
          });


        expect(
          result.decision
        ).toBe(
          ESCALATION_DECISION
            .NO_ESCALATION
        );
      }
    );


    test(
      "risk threshold is enforced",
      () => {
        const policy = {
          policyKey:
            "high-risk",

          enabled:
            true,

          matchConditions: {
            minRiskScore:
              0.8,
          },
        };


        const below =
          service.evaluate({
            context: {
              incidentId:
                "incident-risk-low",

              reasonCode:
                ESCALATION_REASON
                  .POLICY_ESCALATION,

              triggerSource:
                ESCALATION_TRIGGER_SOURCE
                  .SYSTEM_POLICY,

              riskScore:
                0.4,
            },

            policies: [
              policy,
            ],
          });


        const above =
          service.evaluate({
            context: {
              incidentId:
                "incident-risk-high",

              reasonCode:
                ESCALATION_REASON
                  .POLICY_ESCALATION,

              triggerSource:
                ESCALATION_TRIGGER_SOURCE
                  .SYSTEM_POLICY,

              riskScore:
                0.95,
            },

            policies: [
              policy,
            ],
          });


        expect(
          below.decision
        ).toBe(
          ESCALATION_DECISION
            .NO_ESCALATION
        );


        expect(
          above.decision
        ).toBe(
          ESCALATION_DECISION
            .ESCALATE
        );
      }
    );


    test(
      "low-confidence policy is deterministic",
      () => {
        const result =
          service.evaluate({
            context: {
              incidentId:
                "incident-confidence",

              reasonCode:
                ESCALATION_REASON
                  .POLICY_ESCALATION,

              triggerSource:
                ESCALATION_TRIGGER_SOURCE
                  .SYSTEM_POLICY,

              confidence:
                0.45,
            },

            policies: [
              {
                policyKey:
                  "low-confidence",

                enabled:
                  true,

                matchConditions: {
                  maxConfidence:
                    0.6,
                },
              },
            ],
          });


        expect(
          result.decision
        ).toBe(
          ESCALATION_DECISION
            .ESCALATE
        );


        expect(
          result.deterministic
        ).toBe(
          true
        );
      }
    );


    test(
      "preferred target key is selected",
      () => {
        const result =
          service.evaluate({
            context: {
              incidentId:
                "incident-target",

              reasonCode:
                ESCALATION_REASON
                  .POLICY_ESCALATION,

              triggerSource:
                ESCALATION_TRIGGER_SOURCE
                  .SYSTEM_POLICY,
            },

            policies: [
              {
                publicId:
                  "policy-target",

                policyKey:
                  "route-sre",

                priority:
                  1,

                enabled:
                  true,

                matchConditions: {
                  targetKeys: [
                    "primary-sre",
                  ],
                },
              },
            ],

            targets: [
              {
                publicId:
                  "target-general",

                targetKey:
                  "general",

                enabled:
                  true,

                priority:
                  1,
              },

              {
                publicId:
                  "target-sre",

                targetKey:
                  "primary-sre",

                targetType:
                  ON_CALL_TARGET_TYPE
                    .TEAM,

                enabled:
                  true,

                priority:
                  100,

                channels: [
                  "PAGERDUTY",
                ],
              },
            ],
          });


        expect(
          result
            .selectedTarget
            .targetKey
        ).toBe(
          "primary-sre"
        );


        expect(
          result.executionAuthorized
        ).toBe(
          false
        );
      }
    );


    test(
      "routing falls back to deterministic target priority",
      () => {
        const result =
          service.evaluate({
            context: {
              incidentId:
                "incident-target-priority",

              reasonCode:
                ESCALATION_REASON
                  .RECOVERY_FAILED,

              triggerSource:
                ESCALATION_TRIGGER_SOURCE
                  .RECOVERY_ENGINE,
            },

            targets: [
              {
                publicId:
                  "target-b",

                targetKey:
                  "secondary",

                enabled:
                  true,

                priority:
                  50,
              },

              {
                publicId:
                  "target-a",

                targetKey:
                  "primary",

                enabled:
                  true,

                priority:
                  10,
              },
            ],
          });


        expect(
          result
            .selectedTarget
            .targetKey
        ).toBe(
          "primary"
        );
      }
    );


    test(
      "repository class exists",
      () => {
        expect(
          typeof PostgresHumanEscalationRepository
        ).toBe(
          "function"
        );
      }
    );


    test(
      "migration enables and forces RLS",
      () => {
        const migrationPath =
          path.join(
            __dirname,
            "..",
            "..",
            "persistence",
            "postgres",
            "migrations",
            "0089_human_escalation_engine.sql"
          );


        const source =
          fs.readFileSync(
            migrationPath,
            "utf8"
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


    test(
      "migration contains canonical escalation tables",
      () => {
        const migrationPath =
          path.join(
            __dirname,
            "..",
            "..",
            "persistence",
            "postgres",
            "migrations",
            "0089_human_escalation_engine.sql"
          );


        const source =
          fs.readFileSync(
            migrationPath,
            "utf8"
          );


        expect(
          source
        ).toContain(
          "human_operations.escalation_policies"
        );


        expect(
          source
        ).toContain(
          "human_operations.on_call_targets"
        );


        expect(
          source
        ).toContain(
          "human_operations.escalations"
        );
      }
    );
  }
);