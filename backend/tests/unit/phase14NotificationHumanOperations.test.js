"use strict";

const fs =
  require(
    "fs"
  );

const path =
  require(
    "path"
  );

const {
  PERMISSIONS,
} =
  require(
    "../../constants/permissions"
  );

const {
  permissionRequiresEnvironment,
} =
  require(
    "../../constants/permissionScopes"
  );

const {
  ruleMatches,
  ensureSafeConfiguration,
} =
  require(
    "../../services/notifications/notificationRoutingService"
  );

const {
  HUMAN_TASK_STATUS,
  HUMAN_TASK_PRIORITY,
  HUMAN_TASK_TYPES,
} =
  require(
    "../../services/humanOperations/humanTaskService"
  );


const migration44 =
  path.join(
    __dirname,
    "..",
    "..",
    "persistence",
    "postgres",
    "migrations",
    "0044_notification_routing.sql"
  );


const migration45 =
  path.join(
    __dirname,
    "..",
    "..",
    "persistence",
    "postgres",
    "migrations",
    "0045_human_tasks.sql"
  );


describe(
  "Phase 14.10 + 14.11 notification routing and human operations",
  () => {

    test(
      "notification and human-task migrations exist",
      () => {
        expect(
          fs.existsSync(
            migration44
          )
        ).toBe(
          true
        );

        expect(
          fs.existsSync(
            migration45
          )
        ).toBe(
          true
        );
      }
    );


    test(
      "notification routing settings are organization scoped",
      () => {
        expect(
          permissionRequiresEnvironment(
            PERMISSIONS
              .NOTIFICATION_ROUTE_READ
          )
        ).toBe(
          false
        );

        expect(
          permissionRequiresEnvironment(
            PERMISSIONS
              .NOTIFICATION_ROUTE_MANAGE
          )
        ).toBe(
          false
        );
      }
    );


    test(
      "human-task permissions are environment scoped",
      () => {
        const permissions = [
          PERMISSIONS
            .HUMAN_TASK_READ,

          PERMISSIONS
            .HUMAN_TASK_CREATE,

          PERMISSIONS
            .HUMAN_TASK_ASSIGN,

          PERMISSIONS
            .HUMAN_TASK_MANAGE,

          PERMISSIONS
            .HUMAN_TASK_RESOLVE,
        ];

        for (
          const permission
          of permissions
        ) {
          expect(
            permissionRequiresEnvironment(
              permission
            )
          ).toBe(
            true
          );
        }
      }
    );


    test(
      "notification routing rule matches event and severity",
      () => {
        expect(
          ruleMatches(
            {
              event_types: [
                "human_task.created",
              ],

              severities: [
                "HIGH",
              ],
            },
            {
              eventType:
                "human_task.created",

              severity:
                "HIGH",
            }
          )
        ).toBe(
          true
        );
      }
    );


    test(
      "notification routing rule rejects wrong event",
      () => {
        expect(
          ruleMatches(
            {
              event_types: [
                "incident.escalated",
              ],

              severities: [],
            },
            {
              eventType:
                "human_task.created",

              severity:
                "HIGH",
            }
          )
        ).toBe(
          false
        );
      }
    );


    test(
      "notification configuration rejects secret material",
      () => {
        expect(
          () =>
            ensureSafeConfiguration({
              token:
                "secret-value",
            })
        ).toThrow(
          expect.objectContaining({
            code:
              "NOTIFICATION_SECRET_CONFIGURATION_FORBIDDEN",

            executionAuthorized:
              false,
          })
        );
      }
    );


    test(
      "human task lifecycle is explicit",
      () => {
        expect(
          HUMAN_TASK_STATUS
        ).toEqual(
          expect.objectContaining({
            OPEN:
              "OPEN",

            ASSIGNED:
              "ASSIGNED",

            ACKNOWLEDGED:
              "ACKNOWLEDGED",

            RESOLVED:
              "RESOLVED",

            ESCALATED:
              "ESCALATED",
          })
        );
      }
    );


    test(
      "human task priorities are explicit",
      () => {
        expect(
          HUMAN_TASK_PRIORITY
        ).toEqual(
          expect.objectContaining({
            CRITICAL:
              "CRITICAL",

            HIGH:
              "HIGH",

            MEDIUM:
              "MEDIUM",

            LOW:
              "LOW",
          })
        );
      }
    );


    test(
      "human task supports manual intervention and approvals",
      () => {
        expect(
          HUMAN_TASK_TYPES
            .MANUAL_INTERVENTION
        ).toBe(
          "MANUAL_INTERVENTION"
        );

        expect(
          HUMAN_TASK_TYPES
            .APPROVAL_REQUIRED
        ).toBe(
          "APPROVAL_REQUIRED"
        );
      }
    );


    test(
      "database prevents human tasks authorizing execution",
      () => {
        const source =
          fs.readFileSync(
            migration45,
            "utf8"
          );

        expect(
          source
        ).toContain(
          "human_task_never_authorizes_execution"
        );

        expect(
          source
        ).toContain(
          "execution_authorized = FALSE"
        );
      }
    );


    test(
      "human tasks enforce organization/environment boundary",
      () => {
        const source =
          fs.readFileSync(
            migration45,
            "utf8"
          );

        expect(
          source
        ).toContain(
          "aira_validate_human_task_scope"
        );

        expect(
          source
        ).toContain(
          "human task organization/environment mismatch"
        );
      }
    );
  }
);