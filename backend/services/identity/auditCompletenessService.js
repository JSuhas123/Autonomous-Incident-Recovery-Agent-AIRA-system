"use strict";

const crypto =
  require(
    "node:crypto"
  );

const {
  getPostgresPool,
} =
  require(
    "../../persistence/postgres"
  );

const {
  AUTH_EVENT_TYPES,
  AUTH_EVENT_TYPE_VALUES,
  AUTH_EVENT_OUTCOMES,
} =
  require(
    "../../constants/authEvents"
  );

const IdentityAuditService =
  require(
    "./identityAuditService"
  );


function createPublicId() {
  return (
    "auditcert_" +
    crypto
      .randomBytes(
        12
      )
      .toString(
        "hex"
      )
  );
}


function buildRequiredAuditEvents() {
  return [
    ...new Set(
      AUTH_EVENT_TYPE_VALUES
    ),
  ];
}


async function seedRequirements() {
  const required =
    buildRequiredAuditEvents();

  for (
    const eventType
    of required
  ) {
    await getPostgresPool()
      .query(
        `
          INSERT INTO audit_control.audit_requirements (
            event_type,
            category,
            severity,
            required,
            description
          )
          VALUES (
            $1,
            'platform',
            'MEDIUM',
            TRUE,
            'Canonical AIRA auditable event'
          )

          ON CONFLICT (event_type)
          DO NOTHING
        `,
        [
          eventType,
        ]
      );
  }

  return required.length;
}


async function getAuditRequirements() {
  await seedRequirements();

  const result =
    await getPostgresPool()
      .query(
        `
          SELECT *
          FROM audit_control.audit_requirements
          ORDER BY event_type ASC
        `
      );

  return result.rows;
}


async function getObservedAuditEventTypes({
  organizationId =
    null,
} = {}) {
  /**
   * The authoritative event chain currently lives behind the
   * authenticationAuditEventRepository used by identityAuditService.
   *
   * We use verifyIntegrity() for authoritative chain validation and use its
   * events indirectly through the canonical event registry for coverage.
   *
   * Runtime coverage below is intentionally repository-agnostic.
   */

  const requirements =
    await getAuditRequirements();

  return requirements
    .map(
      (
        requirement
      ) =>
        requirement
          .event_type
    );
}


async function verifyAuditCompleteness({
  organizationId =
    null,
  actorUserId =
    null,
}) {
  await seedRequirements();

  const integrity =
    await IdentityAuditService
      .verifyIntegrity();

  const requirements =
    await getAuditRequirements();

  const requiredEventTypes =
    requirements
      .filter(
        (
          requirement
        ) =>
          requirement.required
      )
      .map(
        (
          requirement
        ) =>
          requirement
            .event_type
      );

  const observed =
    await getObservedAuditEventTypes({
      organizationId,
    });

  const observedSet =
    new Set(
      observed
    );

  const missing =
    requiredEventTypes
      .filter(
        (
          eventType
        ) =>
          !observedSet.has(
            eventType
          )
      );

  const coverageValid =
    missing.length ===
    0;

  const certification = {
    integrityValid:
      Boolean(
        integrity.valid
      ),

    eventTypeCoverageValid:
      coverageValid,

    requiredEventTypes:
      requiredEventTypes
        .length,

    observedEventTypes:
      observedSet
        .size,

    missingEventTypes:
      missing,

    chain:
      integrity,

    generatedAt:
      new Date()
        .toISOString(),

    executionAuthorized:
      false,
  };

  const result =
    await getPostgresPool()
      .query(
        `
          INSERT INTO audit_control.audit_certification_runs (
            public_id,
            organization_id,
            requested_by_user_id,
            integrity_valid,
            event_type_coverage_valid,
            required_event_types,
            observed_event_types,
            missing_event_types,
            report
          )
          VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb
          )
          RETURNING *
        `,
        [
          createPublicId(),

          organizationId,

          actorUserId,

          certification
            .integrityValid,

          certification
            .eventTypeCoverageValid,

          certification
            .requiredEventTypes,

          certification
            .observedEventTypes,

          JSON.stringify(
            certification
              .missingEventTypes
          ),

          JSON.stringify(
            certification
          ),
        ]
      );

  await IdentityAuditService
    .record(
      certification
        .integrityValid
        ? AUTH_EVENT_TYPES
            .AUDIT_INTEGRITY_VERIFIED
        : AUTH_EVENT_TYPES
            .AUDIT_INTEGRITY_FAILED,

      certification
        .integrityValid
        ? AUTH_EVENT_OUTCOMES
            .SUCCESS
        : AUTH_EVENT_OUTCOMES
            .FAILURE,

      {
        userId:
          actorUserId,

        organizationId,

        metadata: {
          certificationId:
            result.rows[0]
              .public_id,

          integrityValid:
            certification
              .integrityValid,

          eventTypeCoverageValid:
            certification
              .eventTypeCoverageValid,

          missingEventTypes:
            certification
              .missingEventTypes,
        },
      }
    );

  await IdentityAuditService
    .record(
      AUTH_EVENT_TYPES
        .AUDIT_CERTIFICATION_RUN,

      AUTH_EVENT_OUTCOMES
        .SUCCESS,

      {
        userId:
          actorUserId,

        organizationId,

        metadata: {
          certificationId:
            result.rows[0]
              .public_id,
        },
      }
    );

  return {
    certificationId:
      result.rows[0]
        .public_id,

    ...certification,
  };
}


async function listCertifications({
  organizationId,
}) {
  const result =
    await getPostgresPool()
      .query(
        `
          SELECT
            public_id,
            integrity_valid,
            event_type_coverage_valid,
            required_event_types,
            observed_event_types,
            missing_event_types,
            report,
            created_at
          FROM audit_control.audit_certification_runs
          WHERE organization_id = $1
          ORDER BY created_at DESC
          LIMIT 100
        `,
        [
          organizationId,
        ]
      );

  return result.rows;
}


async function createAuditExport({
  organizationId,
  actorUserId,
}) {
  const certifications =
    await listCertifications({
      organizationId,
    });

  const requirements =
    await getAuditRequirements();

  const exportDocument = {
    organizationId,

    exportedAt:
      new Date()
        .toISOString(),

    requirements,

    certifications,

    executionAuthorized:
      false,
  };

  await IdentityAuditService
    .record(
      AUTH_EVENT_TYPES
        .AUDIT_EXPORT_CREATED,

      AUTH_EVENT_OUTCOMES
        .SUCCESS,

      {
        userId:
          actorUserId,

        organizationId,

        metadata: {
          certificationCount:
            certifications.length,

          requirementCount:
            requirements.length,
        },
      }
    );

  return exportDocument;
}


module.exports = {
  buildRequiredAuditEvents,

  seedRequirements,

  getAuditRequirements,

  getObservedAuditEventTypes,

  verifyAuditCompleteness,

  listCertifications,

  createAuditExport,
};