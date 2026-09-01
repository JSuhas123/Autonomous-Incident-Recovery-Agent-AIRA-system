"use strict";


const crypto =
  require(
    "node:crypto"
  );


const PostgresTenantScope =
  require(
    "./PostgresTenantScope"
  );


class PostgresRecoveryCertificationRepository {
  constructor(
    options = {}
  ) {
    this.scope =
      options.scope ||
      new PostgresTenantScope(
        options
      );
  }


  /*
   * ==========================================================================
   * CERTIFIED CAPABILITY
   * ==========================================================================
   */


  async createCertifiedCapability(
    input,
    transaction =
      null
  ) {
    requireScope(
      input
    );


    requireValue(
      input.publicId,
      "publicId",
      "CERTIFICATION_CAPABILITY_PUBLIC_ID_REQUIRED"
    );


    requireValue(
      input.capabilityKey,
      "capabilityKey",
      "CERTIFICATION_CAPABILITY_KEY_REQUIRED"
    );


    requireValue(
      input.identityVersion,
      "identityVersion",
      "CERTIFICATION_IDENTITY_VERSION_REQUIRED"
    );


    requireValue(
      input.fingerprint,
      "fingerprint",
      "CERTIFICATION_FINGERPRINT_REQUIRED"
    );


    return this.scope.run(
      scopeOf(
        input
      ),

      async (
        client,
        resolved
      ) => {
        const result =
          await client.query(
            `
              INSERT INTO
                certification.certified_capabilities (
                  public_id,

                  organization_id,
                  environment_id,

                  capability_key,

                  identity_version,
                  fingerprint,

                  provider,
                  resource_type,

                  failure_mode,
                  recovery_strategy,

                  resource_capability,

                  playbook_id,
                  playbook_version,

                  domain,

                  constraints,
                  identity_payload,

                  execution_authorized
                )
              VALUES (
                $1,

                $2,
                $3,

                $4,

                $5,
                $6,

                $7,
                $8,

                $9,
                $10,

                $11,

                $12,
                $13,

                $14,

                $15::jsonb,
                $16::jsonb,

                FALSE
              )

              RETURNING *
            `,
            [
              input.publicId,

              resolved
                .organizationUuid,

              resolved
                .environmentUuid,

              input.capabilityKey,

              input.identityVersion,

              input.fingerprint,

              input.provider,

              input.resourceType,

              input.failureMode,

              input.recoveryStrategy,

              input.resourceCapability,

              input.playbookId,

              String(
                input.playbookVersion
              ),

              input.domain,

              JSON.stringify(
                input.constraints ||
                  {}
              ),

              JSON.stringify(
                input.identityPayload ||
                  {}
              ),
            ]
          );


        return mapCapability(
          result.rows[0],
          resolved
        );
      },

      transaction
    );
  }


  async getCertifiedCapability(
    input,
    transaction =
      null
  ) {
    requireScope(
      input
    );


    requireValue(
      input.capabilityId,
      "capabilityId",
      "CERTIFICATION_CAPABILITY_ID_REQUIRED"
    );


    return this.scope.run(
      scopeOf(
        input
      ),

      async (
        client,
        resolved
      ) => {
        const result =
          await client.query(
            `
              SELECT *
              FROM
                certification.certified_capabilities

              WHERE
                public_id = $1

              LIMIT 1
            `,
            [
              input.capabilityId,
            ]
          );


        return result.rows[0]
          ? mapCapability(
              result.rows[0],
              resolved
            )
          : null;
      },

      transaction
    );
  }


  /*
   * ==========================================================================
   * CERTIFICATION RUN
   * ==========================================================================
   */


  async createCertificationRun(
    input,
    transaction =
      null
  ) {
    requireScope(
      input
    );


    requireValue(
      input.capabilityId,
      "capabilityId",
      "CERTIFICATION_CAPABILITY_ID_REQUIRED"
    );


    requireValue(
      input.evaluatorVersion,
      "evaluatorVersion",
      "CERTIFICATION_EVALUATOR_VERSION_REQUIRED"
    );


    const publicId =
      input.publicId ||
      generateId(
        "certrun"
      );


    return this.scope.run(
      scopeOf(
        input
      ),

      async (
        client,
        resolved
      ) => {
        const result =
          await client.query(
            `
              INSERT INTO
                certification.certification_runs (
                  public_id,

                  organization_id,
                  environment_id,

                  capability_id,

                  status,

                  evaluator_version,

                  evidence_window_start,
                  evidence_window_end,

                  evidence_summary,

                  started_at,

                  execution_authorized
                )

              SELECT
                $1,

                $2,
                $3,

                c.id,

                $5,

                $6,

                $7,
                $8,

                $9::jsonb,

                $10,

                FALSE

              FROM
                certification.certified_capabilities c

              WHERE
                c.public_id = $4

                AND

                c.organization_id = $2

                AND

                c.environment_id = $3

              RETURNING *
            `,
            [
              publicId,

              resolved
                .organizationUuid,

              resolved
                .environmentUuid,

              input.capabilityId,

              input.status ||
                "DRAFT",

              input.evaluatorVersion,

              input.evidenceWindowStart ||
                null,

              input.evidenceWindowEnd ||
                null,

              JSON.stringify(
                input.evidenceSummary ||
                  {}
              ),

              input.startedAt ||
                null,
            ]
          );


        if (
          !result.rows[0]
        ) {
          throw repositoryError(
            "CERTIFICATION_CAPABILITY_NOT_FOUND",

            `Certified capability ${input.capabilityId} was not found in tenant scope`
          );
        }


        return mapCertificationRun(
          result.rows[0],
          resolved
        );
      },

      transaction
    );
  }


  async updateCertificationRunStatus(
    input,
    transaction =
      null
  ) {
    requireScope(
      input
    );


    requireValue(
      input.certificationRunId,
      "certificationRunId",
      "CERTIFICATION_RUN_ID_REQUIRED"
    );


    requireValue(
      input.status,
      "status",
      "CERTIFICATION_RUN_STATUS_REQUIRED"
    );


    return this.scope.run(
      scopeOf(
        input
      ),

      async (
        client,
        resolved
      ) => {
        const result =
          await client.query(
            `
              UPDATE
                certification.certification_runs

              SET
                status = $2,

                evidence_summary =
                  COALESCE(
                    $3::jsonb,
                    evidence_summary
                  ),

                started_at =
                  COALESCE(
                    $4,
                    started_at
                  ),

                completed_at =
                  COALESCE(
                    $5,
                    completed_at
                  )

              WHERE
                public_id = $1

              RETURNING *
            `,
            [
              input.certificationRunId,

              input.status,

              input.evidenceSummary ===
              undefined
                ? null
                : JSON.stringify(
                    input.evidenceSummary
                  ),

              input.startedAt ||
                null,

              input.completedAt ||
                null,
            ]
          );


        return result.rows[0]
          ? mapCertificationRun(
              result.rows[0],
              resolved
            )
          : null;
      },

      transaction
    );
  }


  /*
   * ==========================================================================
   * EVIDENCE
   * ==========================================================================
   */


  async appendEvidenceLink(
    input,
    transaction =
      null
  ) {
    requireScope(
      input
    );


    requireValue(
      input.certificationRunId,
      "certificationRunId",
      "CERTIFICATION_RUN_ID_REQUIRED"
    );


    requireValue(
      input.evidenceType,
      "evidenceType",
      "CERTIFICATION_EVIDENCE_TYPE_REQUIRED"
    );


    requireValue(
      input.sourceType,
      "sourceType",
      "CERTIFICATION_EVIDENCE_SOURCE_TYPE_REQUIRED"
    );


    requireValue(
      input.sourceRef,
      "sourceRef",
      "CERTIFICATION_EVIDENCE_SOURCE_REF_REQUIRED"
    );


    const publicId =
      input.publicId ||
      generateId(
        "certevd"
      );


    return this.scope.run(
      scopeOf(
        input
      ),

      async (
        client,
        resolved
      ) => {
        const result =
          await client.query(
            `
              INSERT INTO
                certification.evidence_links (
                  public_id,

                  organization_id,
                  environment_id,

                  certification_run_id,

                  evidence_type,

                  source_type,
                  source_ref,
                  source_hash,

                  observed_at,

                  provenance,

                  execution_authorized
                )

              SELECT
                $1,

                $2,
                $3,

                r.id,

                $5,

                $6,
                $7,
                $8,

                $9,

                $10::jsonb,

                FALSE

              FROM
                certification.certification_runs r

              WHERE
                r.public_id = $4

                AND

                r.organization_id = $2

                AND

                r.environment_id = $3

              RETURNING *
            `,
            [
              publicId,

              resolved
                .organizationUuid,

              resolved
                .environmentUuid,

              input.certificationRunId,

              input.evidenceType,

              input.sourceType,

              input.sourceRef,

              input.sourceHash ||
                null,

              input.observedAt ||
                null,

              JSON.stringify(
                input.provenance ||
                  {}
              ),
            ]
          );


        if (
          !result.rows[0]
        ) {
          throw repositoryError(
            "CERTIFICATION_RUN_NOT_FOUND",

            "Certification run was not found in tenant scope"
          );
        }


        return exposeNonAuthorizing(
          result.rows[0],
          resolved
        );
      },

      transaction
    );
  }


  /*
   * ==========================================================================
   * METRICS
   * ==========================================================================
   */


  async appendMetricSnapshot(
    input,
    transaction =
      null
  ) {
    requireScope(
      input
    );


    requireValue(
      input.certificationRunId,
      "certificationRunId",
      "CERTIFICATION_RUN_ID_REQUIRED"
    );


    requireValue(
      input.metricKey,
      "metricKey",
      "CERTIFICATION_METRIC_KEY_REQUIRED"
    );


    requireFiniteNumber(
      input.value,
      "value",
      "CERTIFICATION_METRIC_VALUE_REQUIRED"
    );


    const publicId =
      input.publicId ||
      generateId(
        "certmetric"
      );


    return this.scope.run(
      scopeOf(
        input
      ),

      async (
        client,
        resolved
      ) => {
        const result =
          await client.query(
            `
              INSERT INTO
                certification.metric_snapshots (
                  public_id,

                  organization_id,
                  environment_id,

                  certification_run_id,

                  metric_key,

                  value,

                  numerator,
                  denominator,

                  sample_count,

                  unit,

                  confidence_lower,
                  confidence_upper,

                  metadata,

                  execution_authorized
                )

              SELECT
                $1,

                $2,
                $3,

                r.id,

                $5,

                $6,

                $7,
                $8,

                $9,

                $10,

                $11,
                $12,

                $13::jsonb,

                FALSE

              FROM
                certification.certification_runs r

              WHERE
                r.public_id = $4

                AND

                r.organization_id = $2

                AND

                r.environment_id = $3

              RETURNING *
            `,
            [
              publicId,

              resolved
                .organizationUuid,

              resolved
                .environmentUuid,

              input.certificationRunId,

              input.metricKey,

              input.value,

              input.numerator ??
                null,

              input.denominator ??
                null,

              input.sampleCount ??
                0,

              input.unit ||
                null,

              input.confidenceLower ??
                null,

              input.confidenceUpper ??
                null,

              JSON.stringify(
                input.metadata ||
                  {}
              ),
            ]
          );


        if (
          !result.rows[0]
        ) {
          throw repositoryError(
            "CERTIFICATION_RUN_NOT_FOUND",

            "Certification run was not found in tenant scope"
          );
        }


        return exposeNonAuthorizing(
          result.rows[0],
          resolved
        );
      },

      transaction
    );
  }


  /*
   * ==========================================================================
   * AUTONOMY EVALUATION
   * ==========================================================================
   */


  async appendAutonomyEvaluation(
    input,
    transaction =
      null
  ) {
    requireScope(
      input
    );


    requireValue(
      input.certificationRunId,
      "certificationRunId",
      "CERTIFICATION_RUN_ID_REQUIRED"
    );


    requireValue(
      input.requestedLevel,
      "requestedLevel",
      "CERTIFICATION_REQUESTED_LEVEL_REQUIRED"
    );


    requireValue(
      input.evidenceLevel,
      "evidenceLevel",
      "CERTIFICATION_EVIDENCE_LEVEL_REQUIRED"
    );


    requireValue(
      input.domainCeiling,
      "domainCeiling",
      "CERTIFICATION_DOMAIN_CEILING_REQUIRED"
    );


    requireValue(
      input.qualifiedLevel,
      "qualifiedLevel",
      "CERTIFICATION_QUALIFIED_LEVEL_REQUIRED"
    );


    requireValue(
      input.evaluatorVersion,
      "evaluatorVersion",
      "CERTIFICATION_EVALUATOR_VERSION_REQUIRED"
    );


    const publicId =
      input.publicId ||
      generateId(
        "certeval"
      );


    return this.scope.run(
      scopeOf(
        input
      ),

      async (
        client,
        resolved
      ) => {
        const result =
          await client.query(
            `
              INSERT INTO
                certification.autonomy_evaluations (
                  public_id,

                  organization_id,
                  environment_id,

                  certification_run_id,

                  requested_level,
                  evidence_level,
                  domain_ceiling,
                  qualified_level,

                  eligible,

                  score,
                  confidence,

                  reasons,

                  evaluator_version,
                  evaluated_at,

                  execution_authorized
                )

              SELECT
                $1,

                $2,
                $3,

                r.id,

                $5,
                $6,
                $7,
                $8,

                $9,

                $10,
                $11,

                $12::jsonb,

                $13,
                $14,

                FALSE

              FROM
                certification.certification_runs r

              WHERE
                r.public_id = $4

                AND

                r.organization_id = $2

                AND

                r.environment_id = $3

              RETURNING *
            `,
            [
              publicId,

              resolved
                .organizationUuid,

              resolved
                .environmentUuid,

              input.certificationRunId,

              input.requestedLevel,

              input.evidenceLevel,

              input.domainCeiling,

              input.qualifiedLevel,

              input.eligible ===
                true,

              input.score ??
                null,

              input.confidence ??
                null,

              JSON.stringify(
                input.reasons ||
                  []
              ),

              input.evaluatorVersion,

              input.evaluatedAt ||
                new Date(),
            ]
          );


        if (
          !result.rows[0]
        ) {
          throw repositoryError(
            "CERTIFICATION_RUN_NOT_FOUND",

            "Certification run was not found in tenant scope"
          );
        }


        return exposeNonAuthorizing(
          result.rows[0],
          resolved
        );
      },

      transaction
    );
  }


  /*
   * ==========================================================================
   * CERTIFICATES
   * ==========================================================================
   */


  async issueCertificate(
    input,
    transaction =
      null
  ) {
    requireScope(
      input
    );


    requireValue(
      input.certificationRunId,
      "certificationRunId",
      "CERTIFICATION_RUN_ID_REQUIRED"
    );


    requireValue(
      input.capabilityId,
      "capabilityId",
      "CERTIFICATION_CAPABILITY_ID_REQUIRED"
    );


    requireValue(
      input.qualifiedLevel,
      "qualifiedLevel",
      "CERTIFICATION_QUALIFIED_LEVEL_REQUIRED"
    );


    requireValue(
      input.evidenceDigest,
      "evidenceDigest",
      "CERTIFICATION_EVIDENCE_DIGEST_REQUIRED"
    );


    const publicId =
      input.publicId ||
      generateId(
        "cert"
      );


    return this.scope.run(
      scopeOf(
        input
      ),

      async (
        client,
        resolved
      ) => {
        const result =
          await client.query(
            `
              INSERT INTO
                certification.certificates (
                  public_id,

                  organization_id,
                  environment_id,

                  capability_id,
                  certification_run_id,

                  certificate_version,

                  qualified_level,

                  score,
                  confidence,

                  evidence_digest,

                  certificate_payload,

                  issued_at,
                  expires_at,

                  execution_authorized
                )

              SELECT
                $1,

                $2,
                $3,

                c.id,
                r.id,

                $6,

                $7,

                $8,
                $9,

                $10,

                $11::jsonb,

                $12,
                $13,

                FALSE

              FROM
                certification.certified_capabilities c

              JOIN
                certification.certification_runs r
              ON
                r.capability_id =
                    c.id

                AND

                r.organization_id =
                    c.organization_id

                AND

                r.environment_id =
                    c.environment_id

              WHERE
                c.public_id =
                    $4

                AND

                r.public_id =
                    $5

                AND

                c.organization_id =
                    $2

                AND

                c.environment_id =
                    $3

              RETURNING *
            `,
            [
              publicId,

              resolved
                .organizationUuid,

              resolved
                .environmentUuid,

              input.capabilityId,

              input.certificationRunId,

              input.certificateVersion ||
                1,

              input.qualifiedLevel,

              input.score ??
                null,

              input.confidence ??
                null,

              input.evidenceDigest,

              JSON.stringify(
                input.certificatePayload ||
                  {}
              ),

              input.issuedAt ||
                new Date(),

              input.expiresAt ||
                null,
            ]
          );


        if (
          !result.rows[0]
        ) {
          throw repositoryError(
            "CERTIFICATION_LINEAGE_NOT_FOUND",

            "Capability and certification run lineage was not found in tenant scope"
          );
        }


        return mapCertificate(
          result.rows[0],
          resolved
        );
      },

      transaction
    );
  }


  async getCertificate(
    input,
    transaction =
      null
  ) {
    requireScope(
      input
    );


    requireValue(
      input.certificateId,
      "certificateId",
      "CERTIFICATE_ID_REQUIRED"
    );


    return this.scope.run(
      scopeOf(
        input
      ),

      async (
        client,
        resolved
      ) => {
        const result =
          await client.query(
            `
              SELECT *
              FROM
                certification.certificates

              WHERE
                public_id = $1

              LIMIT 1
            `,
            [
              input.certificateId,
            ]
          );


        return result.rows[0]
          ? mapCertificate(
              result.rows[0],
              resolved
            )
          : null;
      },

      transaction
    );
  }


  async getLatestCertificateForCapability(
    input,
    transaction =
      null
  ) {
    requireScope(
      input
    );


    requireValue(
      input.capabilityId,
      "capabilityId",
      "CERTIFICATION_CAPABILITY_ID_REQUIRED"
    );


    return this.scope.run(
      scopeOf(
        input
      ),

      async (
        client,
        resolved
      ) => {
        const result =
          await client.query(
            `
              SELECT
                cert.*

              FROM
                certification.certificates cert

              JOIN
                certification.certified_capabilities cap
              ON
                cap.id =
                    cert.capability_id

                AND

                cap.organization_id =
                    cert.organization_id

                AND

                cap.environment_id =
                    cert.environment_id

              WHERE
                cap.public_id =
                    $1

              ORDER BY
                cert.certificate_version DESC

              LIMIT 1
            `,
            [
              input.capabilityId,
            ]
          );


        return result.rows[0]
          ? mapCertificate(
              result.rows[0],
              resolved
            )
          : null;
      },

      transaction
    );
  }


  /*
   * ==========================================================================
   * CERTIFICATE CONSTRAINTS
   * ==========================================================================
   */


  async appendCertificateConstraint(
    input,
    transaction =
      null
  ) {
    requireScope(
      input
    );


    requireValue(
      input.certificateId,
      "certificateId",
      "CERTIFICATE_ID_REQUIRED"
    );


    requireValue(
      input.constraintKey,
      "constraintKey",
      "CERTIFICATE_CONSTRAINT_KEY_REQUIRED"
    );


    requireValue(
      input.operator,
      "operator",
      "CERTIFICATE_CONSTRAINT_OPERATOR_REQUIRED"
    );


    const publicId =
      input.publicId ||
      generateId(
        "certconstraint"
      );


    return this.scope.run(
      scopeOf(
        input
      ),

      async (
        client,
        resolved
      ) => {
        const result =
          await client.query(
            `
              INSERT INTO
                certification.certificate_constraints (
                  public_id,

                  organization_id,
                  environment_id,

                  certificate_id,

                  constraint_key,

                  operator,

                  constraint_value,

                  execution_authorized
                )

              SELECT
                $1,

                $2,
                $3,

                c.id,

                $5,

                $6,

                $7::jsonb,

                FALSE

              FROM
                certification.certificates c

              WHERE
                c.public_id =
                    $4

                AND

                c.organization_id =
                    $2

                AND

                c.environment_id =
                    $3

              RETURNING *
            `,
            [
              publicId,

              resolved
                .organizationUuid,

              resolved
                .environmentUuid,

              input.certificateId,

              input.constraintKey,

              input.operator,

              JSON.stringify(
                input.constraintValue
              ),
            ]
          );


        if (
          !result.rows[0]
        ) {
          throw repositoryError(
            "CERTIFICATE_NOT_FOUND",

            "Certificate was not found in tenant scope"
          );
        }


        return exposeNonAuthorizing(
          result.rows[0],
          resolved
        );
      },

      transaction
    );
  }


  /*
   * ==========================================================================
   * CERTIFICATE STATUS
   * ==========================================================================
   */


  async appendCertificateStatus(
    input,
    transaction =
      null
  ) {
    requireScope(
      input
    );


    requireValue(
      input.certificateId,
      "certificateId",
      "CERTIFICATE_ID_REQUIRED"
    );


    requireValue(
      input.status,
      "status",
      "CERTIFICATE_STATUS_REQUIRED"
    );


    requireValue(
      input.source,
      "source",
      "CERTIFICATE_STATUS_SOURCE_REQUIRED"
    );


    const publicId =
      input.publicId ||
      generateId(
        "certstatus"
      );


    return this.scope.run(
      scopeOf(
        input
      ),

      async (
        client,
        resolved
      ) => {
        const result =
          await client.query(
            `
              INSERT INTO
                certification.status_history (
                  public_id,

                  organization_id,
                  environment_id,

                  certificate_id,

                  status,

                  reason_code,
                  reason,

                  source,

                  recorded_at,

                  execution_authorized
                )

              SELECT
                $1,

                $2,
                $3,

                c.id,

                $5,

                $6,
                $7,

                $8,

                $9,

                FALSE

              FROM
                certification.certificates c

              WHERE
                c.public_id =
                    $4

                AND

                c.organization_id =
                    $2

                AND

                c.environment_id =
                    $3

              RETURNING *
            `,
            [
              publicId,

              resolved
                .organizationUuid,

              resolved
                .environmentUuid,

              input.certificateId,

              input.status,

              input.reasonCode ||
                null,

              input.reason ||
                null,

              input.source,

              input.recordedAt ||
                new Date(),
            ]
          );


        if (
          !result.rows[0]
        ) {
          throw repositoryError(
            "CERTIFICATE_NOT_FOUND",

            "Certificate was not found in tenant scope"
          );
        }


        return exposeNonAuthorizing(
          result.rows[0],
          resolved
        );
      },

      transaction
    );
  }


  /*
   * ==========================================================================
   * REVOCATION
   * ==========================================================================
   */


  async revokeCertificate(
    input,
    transaction =
      null
  ) {
    requireScope(
      input
    );


    requireValue(
      input.certificateId,
      "certificateId",
      "CERTIFICATE_ID_REQUIRED"
    );


    requireValue(
      input.reasonCode,
      "reasonCode",
      "CERTIFICATE_REVOCATION_REASON_CODE_REQUIRED"
    );


    requireValue(
      input.reason,
      "reason",
      "CERTIFICATE_REVOCATION_REASON_REQUIRED"
    );


    requireValue(
      input.source,
      "source",
      "CERTIFICATE_REVOCATION_SOURCE_REQUIRED"
    );


    const publicId =
      input.publicId ||
      generateId(
        "certrevoke"
      );


    return this.scope.run(
      scopeOf(
        input
      ),

      async (
        client,
        resolved
      ) => {
        const result =
          await client.query(
            `
              INSERT INTO
                certification.revocations (
                  public_id,

                  organization_id,
                  environment_id,

                  certificate_id,

                  reason_code,
                  reason,

                  source,

                  revoked_at,

                  execution_authorized
                )

              SELECT
                $1,

                $2,
                $3,

                c.id,

                $5,
                $6,

                $7,

                $8,

                FALSE

              FROM
                certification.certificates c

              WHERE
                c.public_id =
                    $4

                AND

                c.organization_id =
                    $2

                AND

                c.environment_id =
                    $3

              RETURNING *
            `,
            [
              publicId,

              resolved
                .organizationUuid,

              resolved
                .environmentUuid,

              input.certificateId,

              input.reasonCode,

              input.reason,

              input.source,

              input.revokedAt ||
                new Date(),
            ]
          );


        if (
          !result.rows[0]
        ) {
          throw repositoryError(
            "CERTIFICATE_NOT_FOUND",

            "Certificate was not found in tenant scope"
          );
        }


        return exposeNonAuthorizing(
          result.rows[0],
          resolved
        );
      },

      transaction
    );
  }
}


/*
 * ============================================================================
 * MAPPERS
 * ============================================================================
 */


function mapCapability(
  row,
  resolved
) {
  return {
    ...exposeNonAuthorizing(
      row,
      resolved
    ),

    capabilityKey:
      row.capability_key,

    identityVersion:
      row.identity_version,

    fingerprint:
      row.fingerprint,

    resourceType:
      row.resource_type,

    failureMode:
      row.failure_mode,

    recoveryStrategy:
      row.recovery_strategy,

    resourceCapability:
      row.resource_capability,

    playbookId:
      row.playbook_id,

    playbookVersion:
      row.playbook_version,

    identityPayload:
      row.identity_payload ||
      {},
  };
}


function mapCertificationRun(
  row,
  resolved
) {
  return {
    ...exposeNonAuthorizing(
      row,
      resolved
    ),

    capabilityId:
      row.capability_id,

    evaluatorVersion:
      row.evaluator_version,

    evidenceWindowStart:
      row.evidence_window_start,

    evidenceWindowEnd:
      row.evidence_window_end,

    evidenceSummary:
      row.evidence_summary ||
      {},

    startedAt:
      row.started_at,

    completedAt:
      row.completed_at,
  };
}


function mapCertificate(
  row,
  resolved
) {
  return {
    ...exposeNonAuthorizing(
      row,
      resolved
    ),

    capabilityId:
      row.capability_id,

    certificationRunId:
      row.certification_run_id,

    certificateVersion:
      Number(
        row.certificate_version
      ),

    qualifiedLevel:
      row.qualified_level,

    evidenceDigest:
      row.evidence_digest,

    certificatePayload:
      row.certificate_payload ||
      {},

    issuedAt:
      row.issued_at,

    expiresAt:
      row.expires_at,
  };
}


function exposeNonAuthorizing(
  row,
  resolved
) {
  return {
    ...row,

    publicId:
      row.public_id,

    organizationId:
      resolved
        ?.applicationOrganizationId ||
      row.organization_id,

    environmentId:
      resolved
        ?.applicationEnvironmentId ||
      row.environment_id,

    canonicalOrganizationId:
      row.organization_id,

    canonicalEnvironmentId:
      row.environment_id,

    executionAuthorized:
      false,
  };
}


/*
 * ============================================================================
 * HELPERS
 * ============================================================================
 */


function scopeOf(
  input
) {
  requireScope(
    input
  );


  return {
    organizationId:
      input.organizationId,

    environmentId:
      input.environmentId,
  };
}


function requireScope(
  input
) {
  if (
    !input
      ?.organizationId ||
    !input
      ?.environmentId
  ) {
    throw repositoryError(
      "CERTIFICATION_SCOPE_REQUIRED",

      "organizationId and environmentId are required"
    );
  }
}


function requireValue(
  value,
  fieldName,
  code
) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    throw repositoryError(
      code,

      `${fieldName} is required`
    );
  }
}


function requireFiniteNumber(
  value,
  fieldName,
  code
) {
  if (
    typeof value !==
      "number" ||

    !Number.isFinite(
      value
    )
  ) {
    throw repositoryError(
      code,

      `${fieldName} must be a finite number`
    );
  }
}


function generateId(
  prefix
) {
  return `${prefix}_${crypto.randomUUID()}`;
}


function repositoryError(
  code,
  message
) {
  return Object.assign(
    new Error(
      message
    ),

    {
      name:
        "PostgresRecoveryCertificationRepositoryError",

      code,

      executionAuthorized:
        false,
    }
  );
}


module.exports =
  PostgresRecoveryCertificationRepository;