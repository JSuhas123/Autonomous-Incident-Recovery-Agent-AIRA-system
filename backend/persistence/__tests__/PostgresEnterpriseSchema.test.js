"use strict";

const fs =
  require(
    "node:fs"
  );

const path =
  require(
    "node:path"
  );

const migrationsDirectory =
  path.join(
    __dirname,
    "../postgres/migrations"
  );

function readMigration(
  filename
) {
  return fs
    .readFileSync(
      path.join(
        migrationsDirectory,
        filename
      ),
      "utf8"
    );
}

describe(
  "Phase 13.3 PostgreSQL Enterprise Schema",
  () => {
    test(
      "all enterprise migrations exist",
      () => {
        for (
          const filename
          of [
            "0001_platform_foundation.sql",

            "0002_incidents_and_signals.sql",

            "0003_intelligence_recovery_execution.sql",

            "0004_policy_approval_audit_workflow.sql",

            "0005_tenant_rls_and_integrity.sql",
          ]
        ) {
          expect(
            fs.existsSync(
              path.join(
                migrationsDirectory,
                filename
              )
            )
          ).toBe(
            true
          );
        }
      }
    );

    test(
      "incident and signal schemas contain canonical tenant scope",
      () => {
        const sql =
          readMigration(
            "0002_incidents_and_signals.sql"
          );

        expect(
          sql
        ).toContain(
          "organization_id UUID NOT NULL"
        );

        expect(
          sql
        ).toContain(
          "environment_id UUID NOT NULL"
        );

        expect(
          sql
        ).toContain(
          "CREATE TABLE IF NOT EXISTS incidents.incidents"
        );

        expect(
          sql
        ).toContain(
          "CREATE TABLE IF NOT EXISTS signals.signals"
        );
      }
    );

    test(
      "critical reasoning persistence cannot authorize execution",
      () => {
        const sql =
          readMigration(
            "0003_intelligence_recovery_execution.sql"
          );

        expect(
          sql
        ).toContain(
          "intelligence_runs_never_authorize_execution"
        );

        expect(
          sql
        ).toContain(
          "diagnoses_never_authorize_execution"
        );

        expect(
          sql
        ).toContain(
          "recovery_decisions_never_authorize_execution"
        );

        expect(
          sql
        ).toContain(
          "runtime_checkpoint_never_authorizes_execution"
        );
      }
    );

    test(
      "audit table is database-level immutable",
      () => {
        const sql =
          readMigration(
            "0004_policy_approval_audit_workflow.sql"
          );

        expect(
          sql
        ).toContain(
          "audit.prevent_audit_mutation"
        );

        expect(
          sql
        ).toContain(
          "BEFORE UPDATE"
        );

        expect(
          sql
        ).toContain(
          "BEFORE DELETE"
        );
      }
    );

    test(
      "tenant-owned operational tables enable row level security",
      () => {
        const sql =
          readMigration(
            "0005_tenant_rls_and_integrity.sql"
          );

        expect(
          sql
        ).toContain(
          "ENABLE ROW LEVEL SECURITY"
        );

        expect(
          sql
        ).toContain(
          "FORCE ROW LEVEL SECURITY"
        );

        expect(
          sql
        ).toContain(
          "tenancy.current_organization_id()"
        );

        expect(
          sql
        ).toContain(
          "tenancy.current_environment_id()"
        );
      }
    );

    test(
      "environment and organization consistency is database enforced",
      () => {
        const sql =
          readMigration(
            "0005_tenant_rls_and_integrity.sql"
          );

        expect(
          sql
        ).toContain(
          "tenancy.assert_environment_organization"
        );
      }
    );

    test(
      "workflow tables preserve claim and idempotency primitives",
      () => {
        const executionSql =
          readMigration(
            "0003_intelligence_recovery_execution.sql"
          );

        const workflowSql =
          readMigration(
            "0004_policy_approval_audit_workflow.sql"
          );

        expect(
          executionSql
        ).toContain(
          "owner_claim_token"
        );

        expect(
          executionSql
        ).toContain(
          "owner_lease_expires_at"
        );

        expect(
          workflowSql
        ).toContain(
          "idempotency_key"
        );

        expect(
          workflowSql
        ).toContain(
          "owner_claim_token"
        );
      }
    );
  }
);