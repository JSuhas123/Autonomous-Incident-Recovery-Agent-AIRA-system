"use strict";

const {
  ExecutionPlanBuilderService,
} =
  require(
    "../executionPlanBuilderService"
  );

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

    recoveryDecisionId:
      "recovery-1",

    recoveryDecisionRevision:
      3,

    selectedCandidateId:
      "candidate-1",

    selectedPlaybookId:
      "k8s.restart.v1",

    selectedCandidate: {
      candidateId:
        "candidate-1",

      playbookId:
        "k8s.restart.v1",

      metadata: {
        actionType:
          "restart_deployment",

        resourceType:
          "deployment",

        resourceId:
          "payment-api",
      },
    },

    playbook: {
      playbookId:
        "k8s.restart.v1",

      version:
        "1.0.0",

      title:
        "Restart deployment",

      adapter:
        "kubernetes",

      requiredParameters: [
        "namespace",
        "deployment",
      ],

      steps: [
        {
          id:
            "restart",

          name:
            "Restart deployment",

          action:
            "restart_deployment",

          parameters: {
            namespace:
              "{{namespace}}",

            deployment:
              "{{deployment}}",
          },

          timeoutMs:
            30000,
        },

        {
          id:
            "wait",

          name:
            "Wait for rollout",

          action:
            "wait_rollout",

          parameters: {
            namespace:
              "{{namespace}}",

            deployment:
              "{{deployment}}",
          },

          timeoutMs:
            60000,
        },
      ],

      verificationHooks: [
        {
          id:
            "deployment-ready",

          type:
            "deployment_ready",

          description:
            "Deployment must become ready.",

          timeoutMs:
            60000,
        },
      ],

      rollback: {
        reversibility:
          "FULL",

        automaticAllowed:
          false,

        steps: [
          {
            id:
              "rollback",

            action:
              "rollback_deployment",

            parameters: {
              namespace:
                "{{namespace}}",

              deployment:
                "{{deployment}}",
            },
          },
        ],
      },
    },

    context: {
      service: {
        id:
          "payment-api",

        namespace:
          "production",

        deployment:
          "payment-api",
      },
    },

    parameters: {
      namespace:
        "production",

      deployment:
        "payment-api",
    },

    executionAuthorized:
      false,

    ...overrides,
  };
}

describe(
  "ExecutionPlanBuilderService",
  () => {
    test(
      "builds complete immutable execution plan",
      () => {
        const service =
          new ExecutionPlanBuilderService();

        const result =
          service.build(
            baseInput()
          );

        expect(
          result.playbookId
        )
          .toBe(
            "k8s.restart.v1"
          );

        expect(
          result.steps
        )
          .toHaveLength(
            2
          );

        expect(
          result.parameters
            .namespace
        )
          .toBe(
            "production"
          );

        expect(
          result
            .steps[0]
            .parameters
            .deployment
        )
          .toBe(
            "payment-api"
          );

        expect(
          result.rollbackPlan
            .available
        )
          .toBe(
            true
          );

        expect(
          result.planHash
        )
          .toMatch(
            /^planhash_/
          );

        expect(
          Object.isFrozen(
            result
          )
        )
          .toBe(
            true
          );

        expect(
          result.executionAuthorized
        )
          .toBe(
            false
          );
      }
    );

    test(
      "preserves ordered execution steps",
      () => {
        const service =
          new ExecutionPlanBuilderService();

        const result =
          service.build(
            baseInput()
          );

        expect(
          result.steps[0]
            .order
        )
          .toBe(
            1
          );

        expect(
          result.steps[1]
            .order
        )
          .toBe(
            2
          );

        expect(
          result.steps[0]
            .stepId
        )
          .toBe(
            "restart"
          );

        expect(
          result.steps[1]
            .stepId
        )
          .toBe(
            "wait"
          );
      }
    );

    test(
      "resolves playbook parameter references",
      () => {
        const service =
          new ExecutionPlanBuilderService();

        const result =
          service.build(
            baseInput()
          );

        expect(
          result
            .steps[0]
            .parameters
        )
          .toEqual({
            namespace:
              "production",

            deployment:
              "payment-api",
          });
      }
    );

    test(
      "missing required parameter fails closed",
      () => {
        const service =
          new ExecutionPlanBuilderService();

        const input =
          baseInput();

        delete input
          .parameters
          .deployment;

        delete input
          .context
          .service
          .deployment;

        expect(
          () =>
            service.build(
              input
            )
        )
          .toThrow(
            "deployment"
          );
      }
    );

    test(
      "unresolved step parameter fails closed",
      () => {
        const service =
          new ExecutionPlanBuilderService();

        const input =
          baseInput();

        input.playbook.steps[0]
          .parameters
          .cluster =
          "{{cluster}}";

        expect(
          () =>
            service.build(
              input
            )
        )
          .toThrow(
            "cluster"
          );
      }
    );

    test(
      "plan requires at least one step",
      () => {
        const service =
          new ExecutionPlanBuilderService();

        const input =
          baseInput();

        input.playbook.steps =
          [];

        expect(
          () =>
            service.build(
              input
            )
        )
          .toThrow(
            "at least one"
          );
      }
    );

    test(
      "step timeout is capped at configured maximum",
      () => {
        const service =
          new ExecutionPlanBuilderService({
            maximumStepTimeoutMs:
              10000,
          });

        const input =
          baseInput();

        input.playbook.steps[0]
          .timeoutMs =
          999999;

        const result =
          service.build(
            input
          );

        expect(
          result.steps[0]
            .timeoutMs
        )
          .toBe(
            10000
          );
      }
    );

    test(
      "builds verification hooks",
      () => {
        const service =
          new ExecutionPlanBuilderService();

        const result =
          service.build(
            baseInput()
          );

        expect(
          result
            .verificationHooks
        )
          .toHaveLength(
            1
          );

        expect(
          result
            .verificationHooks[0]
            .type
        )
          .toBe(
            "deployment_ready"
          );
      }
    );

    test(
      "builds rollback plan",
      () => {
        const service =
          new ExecutionPlanBuilderService();

        const result =
          service.build(
            baseInput()
          );

        expect(
          result.rollbackPlan
            .reversibility
        )
          .toBe(
            "FULL"
          );

        expect(
          result.rollbackPlan
            .automaticAllowed
        )
          .toBe(
            false
          );

        expect(
          result.rollbackPlan
            .steps
        )
          .toHaveLength(
            1
          );
      }
    );

    test(
      "same execution contents produce same plan hash",
      () => {
        const service =
          new ExecutionPlanBuilderService();

        const first =
          service.build({
            ...baseInput(),

            planId:
              "plan-a",
          });

        const second =
          service.build({
            ...baseInput(),

            planId:
              "plan-b",
          });

        expect(
          first.planHash
        )
          .toBe(
            second.planHash
          );
      }
    );

    test(
      "different parameters change plan hash",
      () => {
        const service =
          new ExecutionPlanBuilderService();

        const first =
          service.build(
            baseInput()
          );

        const input =
          baseInput();

        input.parameters = {
          namespace:
            "production",

          deployment:
            "different-api",
        };

        const second =
          service.build(
            input
          );

        expect(
          first.planHash
        )
          .not
          .toBe(
            second.planHash
          );
      }
    );

    test(
      "nested plan structures are immutable",
      () => {
        const service =
          new ExecutionPlanBuilderService();

        const result =
          service.build(
            baseInput()
          );

        expect(
          Object.isFrozen(
            result.steps
          )
        )
          .toBe(
            true
          );

        expect(
          Object.isFrozen(
            result.steps[0]
          )
        )
          .toBe(
            true
          );

        expect(
          Object.isFrozen(
            result.rollbackPlan
          )
        )
          .toBe(
            true
          );
      }
    );

    test(
      "never accepts upstream execution authorization",
      () => {
        const service =
          new ExecutionPlanBuilderService();

        expect(
          () =>
            service.build({
              ...baseInput(),

              executionAuthorized:
                true,
            })
        )
          .toThrow(
            "cannot receive execution authorization"
          );
      }
    );
  }
);