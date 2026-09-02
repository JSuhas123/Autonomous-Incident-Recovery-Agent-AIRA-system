"use strict";

/**
 * ============================================================================
 * AIRA PHASE 23.1F
 * DURABLE HUMAN CONTROL LEASE EXPIRY CERTIFICATION
 * ============================================================================
 *
 * Safety law:
 *
 * CONTROL LEASE EXPIRY MUST BE DURABLE.
 *
 * An expired human control lease must never return to ACTIVE merely because
 * an expiry error caused the surrounding PostgreSQL transaction to roll back.
 *
 * Required result:
 *
 * ACTIVE
 *   ↓
 * expires_at passes
 *   ↓
 * heartbeat
 *   ↓
 * HUMAN_CONTROL_LEASE_EXPIRED
 *   ↓
 * PostgreSQL COMMITTED state = EXPIRED
 *   ↓
 * takeover session = EXPIRED
 *   ↓
 * no ACTIVE lease remains
 *   ↓
 * execution_authorized = FALSE
 *
 * ============================================================================
 */


const path =
  require(
    "node:path"
  );


require(
  "dotenv"
).config({
  path:
    path.resolve(
      __dirname,
      "../.env"
    ),
});


const crypto =
  require(
    "node:crypto"
  );


const {
  getPostgresPool,
  closePostgresPool,
} = require(
  "../persistence/postgres"
);


const PostgresTenantScope =
  require(
    "../persistence/postgres/PostgresTenantScope"
  );


const PostgresHumanOperationsRepository =
  require(
    "../persistence/postgres/PostgresHumanOperationsRepository"
  );


const PostgresHumanTakeoverRepository =
  require(
    "../persistence/postgres/PostgresHumanTakeoverRepository"
  );


const {
  HumanTakeoverLifecycleService,
} = require(
  "../services/humanOperations/humanTakeoverLifecycleService"
);


const {
  CONTROL_LEASE_STATUS,
  TAKEOVER_SESSION_STATUS,
} = require(
  "../constants/humanTakeover"
);


const {
  resolveCanonicalScope,
  resolveOperator,
  cleanupCertificationOperator,
  cleanup,
} = require(
  "./certify-phase23-1-live"
);


const CONFIG =
  Object.freeze({
    organizationId:
      process.env
        .PHASE23_ORGANIZATION_ID ||
      "aira-dev-org",

    environmentId:
      process.env
        .PHASE23_ENVIRONMENT_ID ||
      "env_aira_development",
  });


function pass(
  label,
  details = ""
) {
  console.log(
    `PASS  ${label}${
      details
        ? ` — ${details}`
        : ""
    }`
  );
}


function fail(
  label,
  details = ""
) {
  console.error(
    `FAIL  ${label}${
      details
        ? ` — ${details}`
        : ""
    }`
  );
}


function assertCondition(
  condition,
  code,
  message
) {
  if (
    condition
  ) {
    return;
  }


  throw Object.assign(
    new Error(
      message
    ),
    {
      code,
    }
  );
}


function randomId(
  prefix
) {
  return [
    prefix,
    crypto
      .randomBytes(
        10
      )
      .toString(
        "hex"
      ),
  ].join(
    "_"
  );
}


function sleep(
  milliseconds
) {
  return new Promise(
    (
      resolve
    ) => {
      setTimeout(
        resolve,
        milliseconds
      );
    }
  );
}


async function readLeaseState({
  scope,
  leaseId,
}) {
  return scope.run(
    {
      organizationId:
        CONFIG.organizationId,

      environmentId:
        CONFIG.environmentId,
    },

    async (
      client
    ) => {
      const result =
        await client.query(
          `
            SELECT
              id,
              public_id,
              incident_id,
              takeover_session_id,
              status,
              holder_user_id,
              lease_version,
              acquired_at,
              heartbeat_at,
              expires_at,
              released_at,
              revoked_at,
              execution_authorized

            FROM
              human_operations.control_leases

            WHERE
              public_id = $1
              OR
              id::text = $1

            LIMIT 1
          `,
          [
            String(
              leaseId
            ),
          ]
        );


      return result.rows[0] ||
        null;
    }
  );
}


async function readSessionState({
  scope,
  sessionId,
}) {
  return scope.run(
    {
      organizationId:
        CONFIG.organizationId,

      environmentId:
        CONFIG.environmentId,
    },

    async (
      client
    ) => {
      const result =
        await client.query(
          `
            SELECT
              id,
              public_id,
              incident_id,
              status,
              execution_authorized

            FROM
              human_operations.takeover_sessions

            WHERE
              public_id = $1
              OR
              id::text = $1

            LIMIT 1
          `,
          [
            String(
              sessionId
            ),
          ]
        );


      return result.rows[0] ||
        null;
    }
  );
}


async function countActiveLeases({
  scope,
  incidentId,
}) {
  return scope.run(
    {
      organizationId:
        CONFIG.organizationId,

      environmentId:
        CONFIG.environmentId,
    },

    async (
      client
    ) => {
      const result =
        await client.query(
          `
            SELECT
              COUNT(*)::integer
                AS count

            FROM
              human_operations.control_leases

            WHERE
              incident_id = $1

              AND
              status = 'ACTIVE'
          `,
          [
            incidentId,
          ]
        );


      return Number(
        result.rows[0]
          ?.count ||
        0
      );
    }
  );
}


async function main() {
  console.log("");
  console.log(
    "=============================================================="
  );
  console.log(
    "AIRA PHASE 23.1F — DURABLE LEASE EXPIRY CERTIFICATION"
  );
  console.log(
    "=============================================================="
  );

  console.log(
    "LEASE EXPIRY MUST COMMIT BEFORE EXPIRY ERROR RETURNS"
  );

  console.log(
    "EXPIRED LEASE != ACTIVE CONTROL"
  );

  console.log(
    "LEASE EXPIRY != EXECUTION AUTHORIZATION"
  );

  console.log(
    "STALE PLAN RESUME: PROHIBITED"
  );

  console.log("");


  const pool =
    getPostgresPool();


  const scope =
    new PostgresTenantScope({
      pool,
    });


  const humanRepository =
    new PostgresHumanOperationsRepository({
      scope,
    });


  const takeoverRepository =
    new PostgresHumanTakeoverRepository({
      scope,
    });


  const lifecycle =
    new HumanTakeoverLifecycleService({
      humanOperationsRepository:
        humanRepository,

      takeoverRepository,
    });


  const incidentId =
    randomId(
      "phase23_expiry_incident"
    );


  let operator =
    null;


  let task =
    null;


  let session =
    null;


  let lease =
    null;


  try {
    const health =
      await pool.query(
        `
          SELECT
            current_database()
              AS database,

            current_user
              AS username
        `
      );


    pass(
      "PostgreSQL connection",
      [
        `database=${health.rows[0].database}`,
        `user=${health.rows[0].username}`,
      ].join(
        " "
      )
    );


    const resolvedScope =
      await resolveCanonicalScope(
        pool
      );


    pass(
      "Canonical tenant",
      `${CONFIG.organizationId} / ${CONFIG.environmentId}`
    );


    operator =
      await resolveOperator(
        pool,
        resolvedScope.organization_uuid
      );


    pass(
      "Certification operator",
      operator.user_id
    );


    /*
     * ------------------------------------------------------------------------
     * HUMAN TASK
     * ------------------------------------------------------------------------
     */

    task =
      await humanRepository.createTask({
        organizationId:
          CONFIG.organizationId,

        environmentId:
          CONFIG.environmentId,

        publicId:
          randomId(
            "phase23_expiry_task"
          ),

        incidentId,

        taskType:
          "MANUAL_INTERVENTION",

        title:
          "Phase 23.1F durable lease-expiry certification",

        description:
          "Temporary task for human-control lease expiry certification",

        priority:
          "CRITICAL",

        source:
          "PHASE23_LEASE_EXPIRY_CERTIFICATION",

        acknowledgementRequired:
          true,

        autonomousRecoveryBlocked:
          true,

        metadata: {
          phase:
            "23.1F",

          certification:
            true,

          executionAuthorized:
            false,
        },
      });


    assertCondition(
      Boolean(
        task?.id
      ),

      "PHASE23_EXPIRY_TASK_FAILED",

      "Could not create Phase 23.1F HumanTask"
    );


    pass(
      "HumanTask",
      task.publicId ||
        task.id
    );


    /*
     * ------------------------------------------------------------------------
     * TAKEOVER REQUEST
     * ------------------------------------------------------------------------
     */

    const request =
      await lifecycle.requestTakeover({
        organizationId:
          CONFIG.organizationId,

        environmentId:
          CONFIG.environmentId,

        incidentId,

        taskId:
          task.publicId ||
          task.id,

        actorUserId:
          operator.user_id,

        reason:
          "Phase 23.1F expiry certification",

        controlEpoch:
          1,

        metadata: {
          phase:
            "23.1F",

          executionAuthorized:
            false,
        },
      });


    session =
      request.session;


    assertCondition(
      session?.status ===
        TAKEOVER_SESSION_STATUS.REQUESTED,

      "PHASE23_EXPIRY_SESSION_REQUEST_FAILED",

      `Expected REQUESTED session, got ${session?.status}`
    );


    pass(
      "Takeover request",
      "REQUESTED"
    );


    /*
     * ------------------------------------------------------------------------
     * AUTHORIZE
     * ------------------------------------------------------------------------
     */

    const authorization =
      await lifecycle.authorizeTakeover({
        organizationId:
          CONFIG.organizationId,

        environmentId:
          CONFIG.environmentId,

        sessionId:
          session.publicId ||
          session.id,

        actorUserId:
          operator.user_id,

        metadata: {
          phase:
            "23.1F",

          executionAuthorized:
            false,
        },
      });


    session =
      authorization.session;


    assertCondition(
      session.status ===
        TAKEOVER_SESSION_STATUS.AUTHORIZED,

      "PHASE23_EXPIRY_SESSION_AUTHORIZE_FAILED",

      `Expected AUTHORIZED session, got ${session.status}`
    );


    pass(
      "Takeover authorization",
      "AUTHORIZED != CONTROL"
    );


    /*
     * ------------------------------------------------------------------------
     * VERY SHORT LEASE
     * ------------------------------------------------------------------------
     */

    lease =
      await takeoverRepository.acquireControlLease({
        organizationId:
          CONFIG.organizationId,

        environmentId:
          CONFIG.environmentId,

        sessionId:
          session.publicId ||
          session.id,

        holderUserId:
          operator.user_id,

        leaseDurationMs:
          100,

        metadata: {
          phase:
            "23.1F",

          purpose:
            "DURABLE_EXPIRY_CERTIFICATION",

          executionAuthorized:
            false,
        },
      });


    assertCondition(
      lease.status ===
        CONTROL_LEASE_STATUS.ACTIVE,

      "PHASE23_EXPIRY_LEASE_NOT_ACTIVE",

      `Expected ACTIVE lease, got ${lease.status}`
    );


    assertCondition(
      lease.executionAuthorized ===
        false,

      "PHASE23_EXPIRY_LEASE_AUTHORITY_LEAK",

      "Control lease unexpectedly authorized execution"
    );


    pass(
      "Short control lease",
      "ACTIVE"
    );


    /*
     * Wait safely past expiry.
     */
    await sleep(
      300
    );


    /*
     * ------------------------------------------------------------------------
     * HEARTBEAT EXPIRED LEASE
     * ------------------------------------------------------------------------
     */

    let heartbeatError =
      null;


    try {
      await takeoverRepository.heartbeatLease({
        organizationId:
          CONFIG.organizationId,

        environmentId:
          CONFIG.environmentId,

        leaseId:
          lease.publicId ||
          lease.id,

        holderUserId:
          operator.user_id,

        leaseDurationMs:
          1000,
      });
    } catch (
      error
    ) {
      heartbeatError =
        error;
    }


    assertCondition(
      Boolean(
        heartbeatError
      ),

      "PHASE23_EXPIRED_HEARTBEAT_ACCEPTED",

      "Heartbeat unexpectedly accepted an already-expired lease"
    );


    assertCondition(
      heartbeatError.code ===
        "HUMAN_CONTROL_LEASE_EXPIRED",

      "PHASE23_EXPIRY_ERROR_CODE_INVALID",

      [
        "Expected HUMAN_CONTROL_LEASE_EXPIRED.",
        `Received=${heartbeatError.code || "NONE"}`,
        `message=${heartbeatError.message || "NONE"}`,
      ].join(
        " "
      )
    );


    pass(
      "Expired heartbeat",
      "HUMAN_CONTROL_LEASE_EXPIRED"
    );


    /*
     * ------------------------------------------------------------------------
     * DURABILITY CHECK
     * ------------------------------------------------------------------------
     */

    const durableLease =
      await readLeaseState({
        scope,

        leaseId:
          lease.publicId ||
          lease.id,
      });


    assertCondition(
      Boolean(
        durableLease
      ),

      "PHASE23_EXPIRED_LEASE_MISSING",

      "Expired control lease disappeared"
    );


    assertCondition(
      durableLease.status ===
        CONTROL_LEASE_STATUS.EXPIRED,

      "PHASE23_EXPIRY_NOT_DURABLE",

      [
        "Expired heartbeat returned an expiry error,",
        "but PostgreSQL did not retain EXPIRED state.",
        `databaseStatus=${durableLease.status}`,
        "This indicates transaction rollback erased the expiry transition.",
      ].join(
        " "
      )
    );


    assertCondition(
      durableLease.execution_authorized ===
        false,

      "PHASE23_EXPIRED_LEASE_AUTHORITY_LEAK",

      "Expired lease contains execution_authorized=true"
    );


    pass(
      "Durable lease state",
      "EXPIRED committed"
    );


    /*
     * ------------------------------------------------------------------------
     * SESSION MUST ALSO EXPIRE
     * ------------------------------------------------------------------------
     */

    const durableSession =
      await readSessionState({
        scope,

        sessionId:
          session.publicId ||
          session.id,
      });


    assertCondition(
      Boolean(
        durableSession
      ),

      "PHASE23_EXPIRED_SESSION_MISSING",

      "Takeover session disappeared after lease expiry"
    );


    assertCondition(
      durableSession.status ===
        TAKEOVER_SESSION_STATUS.EXPIRED,

      "PHASE23_SESSION_EXPIRY_NOT_DURABLE",

      [
        "Lease expired but takeover session was not durably EXPIRED.",
        `sessionStatus=${durableSession.status}`,
      ].join(
        " "
      )
    );


    assertCondition(
      durableSession.execution_authorized ===
        false,

      "PHASE23_EXPIRED_SESSION_AUTHORITY_LEAK",

      "Expired takeover session authorized execution"
    );


    pass(
      "Takeover session expiry",
      "EXPIRED committed"
    );


    /*
     * ------------------------------------------------------------------------
     * NO ACTIVE LEASE MAY REMAIN
     * ------------------------------------------------------------------------
     */

    const activeCount =
      await countActiveLeases({
        scope,
        incidentId,
      });


    assertCondition(
      activeCount ===
        0,

      "PHASE23_EXPIRED_ACTIVE_LEASE_REMAINS",

      `${activeCount} ACTIVE control leases remain after expiry`
    );


    pass(
      "Active control after expiry",
      "NONE"
    );


    /*
     * ------------------------------------------------------------------------
     * GET ACTIVE CONTROL MUST ALSO RETURN FALSE
     * ------------------------------------------------------------------------
     */

    const activeControl =
      await lifecycle.getActiveControl({
        organizationId:
          CONFIG.organizationId,

        environmentId:
          CONFIG.environmentId,

        incidentId,
      });


    assertCondition(
      activeControl.active ===
        false,

      "PHASE23_EXPIRED_CONTROL_VISIBLE",

      "Expired lease is still reported as active human control"
    );


    assertCondition(
      activeControl.executionAuthorized ===
        false,

      "PHASE23_EXPIRED_CONTROL_AUTHORIZED",

      "Expired human control unexpectedly authorized execution"
    );


    pass(
      "Lifecycle active-control view",
      "inactive"
    );


    console.log("");
    console.log(
      "=============================================================="
    );
    console.log(
      "PHASE 23.1F — DURABLE LEASE EXPIRY: PASS"
    );
    console.log(
      "=============================================================="
    );

    console.log(
      "Expired heartbeat rejected:      PASS"
    );

    console.log(
      "Lease EXPIRED committed:         PASS"
    );

    console.log(
      "Session EXPIRED committed:       PASS"
    );

    console.log(
      "Active leases after expiry:      0"
    );

    console.log(
      "Human control after expiry:      FALSE"
    );

    console.log(
      "Execution authorization:         FALSE"
    );

    console.log(
      "Fresh evaluation required:       TRUE"
    );

    console.log(
      "Stale plan resume:               PROHIBITED"
    );

    console.log(
      "=============================================================="
    );

    console.log("");
  } catch (
    error
  ) {
    console.error("");
    console.error(
      "=============================================================="
    );
    console.error(
      "PHASE 23.1F — DURABLE LEASE EXPIRY: FAIL"
    );
    console.error(
      "=============================================================="
    );


    fail(
      error.code ||
        "UNEXPECTED_ERROR",

      error.message ||
        String(
          error
        )
    );


    if (
      error.stack
    ) {
      console.error(
        error.stack
      );
    }


    process.exitCode =
      1;
  } finally {
    /*
     * Remove Phase-23 human-operation fixture rows.
     */
    try {
      await cleanup({
        scope,
        incidentId,

        taskDatabaseId:
          task?.id ||
          null,
      });


      pass(
        "Human-operation cleanup",
        "temporary rows removed"
      );
    } catch (
      cleanupError
    ) {
      console.error(
        "WARN  Phase 23.1F cleanup failed:",
        cleanupError.message ||
          cleanupError
      );


      process.exitCode =
        1;
    }


    /*
     * Remove temporary certification identity if one was created.
     */
    try {
      await cleanupCertificationOperator({
        pool,
        operator,
      });


      if (
        operator
          ?.certification_fixture
      ) {
        pass(
          "Certification operator cleanup",
          "temporary identity removed"
        );
      }
    } catch (
      operatorCleanupError
    ) {
      console.error(
        "WARN  Phase 23.1F operator cleanup failed:",
        operatorCleanupError.message ||
          operatorCleanupError
      );


      process.exitCode =
        1;
    }


    try {
      await closePostgresPool();
    } catch (
      closeError
    ) {
      console.error(
        "WARN  PostgreSQL pool close failed:",
        closeError.message ||
          closeError
      );


      process.exitCode =
        1;
    }
  }
}


if (
  require.main ===
  module
) {
  main().catch(
    async (
      error
    ) => {
      console.error(
        error.stack ||
          error
      );


      process.exitCode =
        1;


      try {
        await closePostgresPool();
      } catch {
        // Best effort.
      }
    }
  );
}


module.exports = {
  CONFIG,

  readLeaseState,
  readSessionState,
  countActiveLeases,

  main,
};