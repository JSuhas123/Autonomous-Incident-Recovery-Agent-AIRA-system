"use strict";


const fs =
  require(
    "fs"
  );


const path =
  require(
    "path"
  );


const MIGRATION_PATH =
  path.resolve(
    __dirname,
    "../../persistence/postgres/migrations/0073_execution_history_foundation.sql"
  );


const migration =
  fs.readFileSync(
    MIGRATION_PATH,
    "utf8"
  );


describe(
  "Phase 18.7 PostgreSQL execution foundation",
  () => {

    test(
      "creates canonical Playbook execution table",
      () => {

        expect(
          migration
        )
          .toMatch(
            /CREATE TABLE IF NOT EXISTS execution\.playbook_executions/
          );


        expect(
          migration
        )
          .toMatch(
            /playbook_snapshot JSONB NOT NULL/
          );


        expect(
          migration
        )
          .toMatch(
            /playbook_checksum TEXT NOT NULL/
          );


        expect(
          migration
        )
          .toMatch(
            /playbook_version_id UUID/
          );
      }
    );


    test(
      "creates canonical Runbook execution table",
      () => {

        expect(
          migration
        )
          .toMatch(
            /CREATE TABLE IF NOT EXISTS execution\.runbook_executions/
          );


        expect(
          migration
        )
          .toMatch(
            /runbook_snapshot JSONB NOT NULL/
          );


        expect(
          migration
        )
          .toMatch(
            /runbook_checksum TEXT NOT NULL/
          );


        expect(
          migration
        )
          .toMatch(
            /runbook_version_id UUID/
          );
      }
    );


    test(
      "preserves Playbook forensic execution information",
      () => {

        const fields = [
          "incident_context",
          "resolved_mappings",
          "policy_decision",
          "approval",
          "stage_executions",
          "rollback",
          "escalation",
          "outcome",
          "audit_event_ids",
          "decision_trace_id",
          "failed_stage_id",
          "error_message",
          "error_code",
        ];


        for (
          const field
          of fields
        ) {
          expect(
            migration
          )
            .toMatch(
              new RegExp(
                `\\b${field}\\b`
              )
            );
        }
      }
    );


    test(
      "preserves Runbook forensic execution information",
      () => {

        const fields = [
          "resolved_parameters",
          "policy_decision",
          "step_attempts",
          "verification_result",
          "rollback_state",
          "pre_execution_state",
          "post_execution_state",
          "audit_event_ids",
          "decision_trace_id",
          "failed_step_id",
          "error_message",
          "error_code",
          "escalated",
          "escalation_reason",
        ];


        for (
          const field
          of fields
        ) {
          expect(
            migration
          )
            .toMatch(
              new RegExp(
                `\\b${field}\\b`
              )
            );
        }
      }
    );


    test(
      "Playbook execution status set preserves existing runtime lifecycle",
      () => {

        const statuses = [
          "CREATED",
          "EVALUATING",
          "WAITING_FOR_APPROVAL",
          "RUNNING",
          "VERIFYING",
          "SUCCEEDED",
          "FAILED",
          "ROLLBACK_PENDING",
          "ROLLING_BACK",
          "ROLLED_BACK",
          "ROLLBACK_FAILED",
          "ESCALATED",
          "CANCELLED",
        ];


        for (
          const status
          of statuses
        ) {
          expect(
            migration
          )
            .toContain(
              `'${status}'`
            );
        }
      }
    );


    test(
      "Runbook execution status set preserves existing runtime lifecycle",
      () => {

        const statuses = [
          "CREATED",
          "VALIDATING",
          "WAITING_FOR_APPROVAL",
          "RUNNING",
          "VERIFYING",
          "SUCCEEDED",
          "FAILED",
          "ROLLBACK_PENDING",
          "ROLLING_BACK",
          "ROLLED_BACK",
          "ROLLBACK_FAILED",
          "ESCALATED",
          "CANCELLED",
        ];


        for (
          const status
          of statuses
        ) {
          expect(
            migration
          )
            .toContain(
              `'${status}'`
            );
        }
      }
    );


    test(
      "execution history can never grant future authorization",
      () => {

        expect(
          migration.match(
            /execution_authorized BOOLEAN NOT NULL\s+DEFAULT FALSE/g
          )
          ?.length
        )
          .toBe(
            2
          );


        expect(
          migration.match(
            /execution_authorized = FALSE/g
          )
          ?.length
        )
          .toBeGreaterThanOrEqual(
            2
          );
      }
    );


    test(
      "Playbook executed identity and snapshot are immutable",
      () => {

        expect(
          migration
        )
          .toMatch(
            /protect_playbook_execution_identity/
          );


        expect(
          migration
        )
          .toMatch(
            /OLD\.playbook_snapshot IS DISTINCT FROM\s+NEW\.playbook_snapshot/
          );


        expect(
          migration
        )
          .toMatch(
            /OLD\.playbook_checksum IS DISTINCT FROM\s+NEW\.playbook_checksum/
          );
      }
    );


    test(
      "Runbook executed identity and snapshot are immutable",
      () => {

        expect(
          migration
        )
          .toMatch(
            /protect_runbook_execution_identity/
          );


        expect(
          migration
        )
          .toMatch(
            /OLD\.runbook_snapshot IS DISTINCT FROM\s+NEW\.runbook_snapshot/
          );


        expect(
          migration
        )
          .toMatch(
            /OLD\.runbook_checksum IS DISTINCT FROM\s+NEW\.runbook_checksum/
          );
      }
    );


    test(
      "execution scope is protected by PostgreSQL RLS",
      () => {

        expect(
          migration
        )
          .toMatch(
            /ALTER TABLE\s+execution\.playbook_executions\s+ENABLE ROW LEVEL SECURITY/
          );


        expect(
          migration
        )
          .toMatch(
            /ALTER TABLE\s+execution\.runbook_executions\s+ENABLE ROW LEVEL SECURITY/
          );


        expect(
          migration
        )
          .toContain(
            "'aira.organization_id'"
          );


        expect(
          migration
        )
          .toContain(
            "'aira.environment_id'"
          );
      }
    );


    test(
      "scope validation checks environment ownership",
      () => {

        expect(
          migration
        )
          .toMatch(
            /PLAYBOOK_EXECUTION_ENVIRONMENT_ORGANIZATION_MISMATCH/
          );


        expect(
          migration
        )
          .toMatch(
            /RUNBOOK_EXECUTION_ENVIRONMENT_ORGANIZATION_MISMATCH/
          );
      }
    );


    test(
      "incident ownership cannot cross execution environment",
      () => {

        expect(
          migration
        )
          .toMatch(
            /PLAYBOOK_EXECUTION_INCIDENT_ENVIRONMENT_MISMATCH/
          );


        expect(
          migration
        )
          .toMatch(
            /RUNBOOK_EXECUTION_INCIDENT_ENVIRONMENT_MISMATCH/
          );
      }
    );


    test(
      "Runbook execution may reference its parent Playbook execution",
      () => {

        expect(
          migration
        )
          .toMatch(
            /playbook_execution_id UUID/
          );


        expect(
          migration
        )
          .toMatch(
            /REFERENCES execution\.playbook_executions\(id\)/
          );


        expect(
          migration
        )
          .toMatch(
            /RUNBOOK_EXECUTION_PARENT_ENVIRONMENT_MISMATCH/
          );
      }
    );


    test(
      "historical effectiveness is not destroyed by Mongo TTL replication",
      () => {

        expect(
          migration
        )
          .not
          .toMatch(
            /expireAfterSeconds/
          );


        expect(
          migration
        )
          .not
          .toMatch(
            /INTERVAL\s+'90 days'/i
          );
      }
    );
  }
);