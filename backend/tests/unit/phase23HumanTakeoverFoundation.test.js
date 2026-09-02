"use strict";

const fs = require("fs");
const path = require("path");

const {
  HUMAN_TASK_STATUS,
  TAKEOVER_SESSION_STATUS,
  CONTROL_LEASE_STATUS,
  ASSIGNMENT_STATUS,
  ACKNOWLEDGEMENT_OUTCOME,
  HUMAN_TAKEOVER_INVARIANTS,
  assertHumanTakeoverSafetyContract,
} = require("../../contracts/humanTakeover");

const migration88 = path.join(
  __dirname,
  "..",
  "..",
  "persistence",
  "postgres",
  "migrations",
  "0088_human_takeover_domain.sql"
);

describe("Phase 23.0 + 23.1 human takeover foundation", () => {
  test("safety contract is frozen", () => {
    expect(assertHumanTakeoverSafetyContract()).toBe(true);

    expect(HUMAN_TAKEOVER_INVARIANTS).toEqual(
      expect.objectContaining({
        NEVER_AUTHORIZES_EXECUTION: true,
        EXACTLY_ONE_ACTIVE_LEASE_PER_INCIDENT: true,
        POSTGRES_IS_CONTROL_AUTHORITY: true,
        RETURN_REQUIRES_REEVALUATION: true,
        STALE_PLAN_RESUME_PROHIBITED: true,
      })
    );
  });

  test("human task lifecycle exactly matches Phase 23", () => {
    expect(Object.values(HUMAN_TASK_STATUS)).toEqual([
      "OPEN",
      "ASSIGNED",
      "ACKNOWLEDGED",
      "IN_PROGRESS",
      "WAITING",
      "RESOLVED",
      "CANCELLED",
      "EXPIRED",
    ]);
  });

  test("takeover session states are explicit", () => {
    expect(Object.values(TAKEOVER_SESSION_STATUS)).toEqual([
      "REQUESTED",
      "AUTHORIZED",
      "ACTIVE",
      "RELEASING",
      "RELEASED",
      "EXPIRED",
      "REVOKED",
      "DENIED",
    ]);
  });

  test("control lease states are explicit", () => {
    expect(Object.values(CONTROL_LEASE_STATUS)).toEqual([
      "PENDING",
      "ACTIVE",
      "RELEASED",
      "EXPIRED",
      "REVOKED",
    ]);
  });

  test("assignment states are explicit", () => {
    expect(Object.values(ASSIGNMENT_STATUS)).toEqual([
      "ACTIVE",
      "REASSIGNED",
      "RELEASED",
      "EXPIRED",
    ]);
  });

  test("acknowledgement outcomes are explicit", () => {
    expect(Object.values(ACKNOWLEDGEMENT_OUTCOME)).toEqual([
      "ACKNOWLEDGED",
      "DECLINED",
      "TIMED_OUT",
    ]);
  });

  test("0088 migration contains all Phase 23.1 domain tables", () => {
    const source = fs.readFileSync(migration88, "utf8");

    for (const table of [
      "assignments",
      "acknowledgements",
      "resolutions",
      "takeover_sessions",
      "control_leases",
      "task_status_history",
      "takeover_events",
    ]) {
      expect(source).toContain(
        `human_operations.${table}`
      );
    }
  });

  test("migration upgrades legacy ESCALATED tasks to WAITING", () => {
    const source = fs.readFileSync(migration88, "utf8");

    expect(source).toContain(
      "SET status = 'WAITING'"
    );

    expect(source).toContain(
      "WHERE status = 'ESCALATED'"
    );

    expect(source).toContain(
      "'EXPIRED'"
    );
  });

  test("human task history validates Phase 23 statuses", () => {
    const source = fs.readFileSync(migration88, "utf8");

    expect(source).toContain(
      "human_task_history_status_check"
    );

    expect(source).toContain(
      "human_task_history_from_status_check"
    );
  });

  test("all human operation state is FORCE RLS protected", () => {
    const source = fs.readFileSync(migration88, "utf8");

    expect(source).toContain(
      "ENABLE ROW LEVEL SECURITY"
    );

    expect(source).toContain(
      "FORCE ROW LEVEL SECURITY"
    );

    expect(source).toContain(
      "tenancy.current_organization_id()"
    );

    expect(source).toContain(
      "tenancy.current_environment_id()"
    );
  });

  test("database forbids human takeover from authorizing AIRA", () => {
    const source = fs.readFileSync(migration88, "utf8");

    expect(source).toContain(
      "execution_authorized = FALSE"
    );

    expect(source).toContain(
      "human takeover state cannot authorize AIRA execution"
    );
  });

  test(
    "database enforces exclusive active incident control lease",
    () => {
      const source = fs.readFileSync(
        migration88,
        "utf8"
      );

      expect(source).toContain(
        "idx_human_control_lease_one_active"
      );

      expect(source).toContain(
        "WHERE status = 'ACTIVE'"
      );
    }
  );

  test(
    "database prevents multiple authoritative takeover sessions",
    () => {
      const source = fs.readFileSync(
        migration88,
        "utf8"
      );

      expect(source).toContain(
        "idx_human_takeover_one_active_session"
      );

      expect(source).toContain(
        "'AUTHORIZED'"
      );

      expect(source).toContain(
        "'RELEASING'"
      );
    }
  );

  test("database uses scope-safe composite foreign keys", () => {
    const source = fs.readFileSync(migration88, "utf8");

    expect(source).toContain(
      "human_tasks_scope_id_unique"
    );

    expect(source).toContain(
      "FOREIGN KEY (\n            organization_id,\n            environment_id,\n            task_id"
    );
  });

  test("control epoch is introduced for stale-plan fencing", () => {
    const source = fs.readFileSync(migration88, "utf8");

    expect(source).toContain(
      "control_epoch BIGINT NOT NULL DEFAULT 0"
    );

    expect(source).toContain(
      "human_control_lease_epoch_nonnegative"
    );
  });

  test(
    "PostgreSQL remains authoritative for control ownership",
    () => {
      expect(
        HUMAN_TAKEOVER_INVARIANTS
          .POSTGRES_IS_CONTROL_AUTHORITY
      ).toBe(true);

      expect(
        HUMAN_TAKEOVER_INVARIANTS
          .EXACTLY_ONE_ACTIVE_LEASE_PER_INCIDENT
      ).toBe(true);
    }
  );

  test(
    "return control explicitly prohibits stale plan resume",
    () => {
      expect(
        HUMAN_TAKEOVER_INVARIANTS
          .RETURN_REQUIRES_REEVALUATION
      ).toBe(true);

      expect(
        HUMAN_TAKEOVER_INVARIANTS
          .STALE_PLAN_RESUME_PROHIBITED
      ).toBe(true);
    }
  );
});