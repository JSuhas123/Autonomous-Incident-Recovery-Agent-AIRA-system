"use strict";


const PostgresTenantScope =
  require(
    "./PostgresTenantScope"
  );


class PostgresCertificationReadModelRepository {
  constructor(
    options = {}
  ) {
    this.scope =
      options.scope ||
      new PostgresTenantScope(
        options
      );
  }


  async listCapabilities(
    input = {}
  ) {
    requireScope(
      input
    );


    return this.scope.run(
      {
        organizationId:
          input.organizationId,

        environmentId:
          input.environmentId,
      },

      async client => {
        const result =
          await client.query(
            `
              SELECT
                capability.public_id,
                capability.capability_key,
                capability.identity_version,
                capability.fingerprint,
                capability.provider,
                capability.resource_type,
                capability.failure_mode,
                capability.recovery_strategy,
                capability.resource_capability,
                capability.playbook_id,
                capability.playbook_version,
                capability.domain,
                capability.constraints,
                capability.created_at,

                certificate.public_id
                  AS certificate_public_id,

                certificate.qualified_level,
                certificate.score,
                certificate.confidence,
                certificate.issued_at,
                certificate.expires_at,

                COALESCE(
                  latest_status.status,
                  CASE
                    WHEN certificate.public_id IS NOT NULL
                      THEN 'CERTIFIED'
                    ELSE NULL
                  END
                ) AS certificate_status

              FROM
                certification.certified_capabilities capability

              LEFT JOIN LATERAL (
                SELECT
                  c.*
                FROM
                  certification.certificates c
                WHERE
                  c.certified_capability_id =
                    capability.id
                ORDER BY
                  c.version DESC,
                  c.issued_at DESC
                LIMIT 1
              ) certificate
                ON TRUE

              LEFT JOIN LATERAL (
                SELECT
                  history.status
                FROM
                  certification.status_history history
                WHERE
                  history.certificate_id =
                    certificate.id
                ORDER BY
                  history.created_at DESC,
                  history.id DESC
                LIMIT 1
              ) latest_status
                ON TRUE

              ORDER BY
                capability.capability_key ASC,
                capability.created_at ASC
            `
          );


        return result.rows.map(
          mapCapability
        );
      }
    );
  }


  async getCapability(
    input = {}
  ) {
    requireScope(
      input
    );


    if (
      !input.capabilityKey
    ) {
      throw repositoryError(
        "CERTIFICATION_CAPABILITY_KEY_REQUIRED",

        "capabilityKey is required"
      );
    }


    return this.scope.run(
      {
        organizationId:
          input.organizationId,

        environmentId:
          input.environmentId,
      },

      async client => {
        const result =
          await client.query(
            `
              SELECT
                capability.public_id,
                capability.capability_key,
                capability.identity_version,
                capability.fingerprint,
                capability.provider,
                capability.resource_type,
                capability.failure_mode,
                capability.recovery_strategy,
                capability.resource_capability,
                capability.playbook_id,
                capability.playbook_version,
                capability.domain,
                capability.constraints,
                capability.identity_payload,
                capability.created_at,

                certificate.public_id
                  AS certificate_public_id,

                certificate.qualified_level,
                certificate.score,
                certificate.confidence,
                certificate.evidence_digest,
                certificate.certificate_payload,
                certificate.issued_at,
                certificate.expires_at,

                COALESCE(
                  latest_status.status,
                  CASE
                    WHEN certificate.public_id IS NOT NULL
                      THEN 'CERTIFIED'
                    ELSE NULL
                  END
                ) AS certificate_status

              FROM
                certification.certified_capabilities capability

              LEFT JOIN LATERAL (
                SELECT
                  c.*
                FROM
                  certification.certificates c
                WHERE
                  c.certified_capability_id =
                    capability.id
                ORDER BY
                  c.version DESC,
                  c.issued_at DESC
                LIMIT 1
              ) certificate
                ON TRUE

              LEFT JOIN LATERAL (
                SELECT
                  history.status
                FROM
                  certification.status_history history
                WHERE
                  history.certificate_id =
                    certificate.id
                ORDER BY
                  history.created_at DESC,
                  history.id DESC
                LIMIT 1
              ) latest_status
                ON TRUE

              WHERE
                capability.capability_key = $1

              ORDER BY
                capability.created_at DESC

              LIMIT 1
            `,

            [
              input.capabilityKey,
            ]
          );


        return result.rows[0]
          ? mapCapability(
              result.rows[0]
            )
          : null;
      }
    );
  }


  async listCapabilityHistory(
    input = {}
  ) {
    requireScope(
      input
    );


    if (
      !input.capabilityKey
    ) {
      throw repositoryError(
        "CERTIFICATION_CAPABILITY_KEY_REQUIRED",

        "capabilityKey is required"
      );
    }


    return this.scope.run(
      {
        organizationId:
          input.organizationId,

        environmentId:
          input.environmentId,
      },

      async client => {
        const result =
          await client.query(
            `
              SELECT
                certificate.public_id,
                certificate.qualified_level,
                certificate.score,
                certificate.confidence,
                certificate.evidence_digest,
                certificate.issued_at,
                certificate.expires_at,
                certificate.created_at,

                COALESCE(
                  latest_status.status,
                  'CERTIFIED'
                ) AS status

              FROM
                certification.certificates certificate

              INNER JOIN
                certification.certified_capabilities capability
                  ON capability.id =
                     certificate.certified_capability_id

              LEFT JOIN LATERAL (
                SELECT
                  history.status
                FROM
                  certification.status_history history
                WHERE
                  history.certificate_id =
                    certificate.id
                ORDER BY
                  history.created_at DESC,
                  history.id DESC
                LIMIT 1
              ) latest_status
                ON TRUE

              WHERE
                capability.capability_key = $1

              ORDER BY
                certificate.version DESC,
                certificate.issued_at DESC
            `,

            [
              input.capabilityKey,
            ]
          );


        return result.rows.map(
          mapCertificateHistory
        );
      }
    );
  }


  async listEvidence(
    input = {}
  ) {
    requireScope(
      input
    );


    if (
      !input.capabilityKey
    ) {
      throw repositoryError(
        "CERTIFICATION_CAPABILITY_KEY_REQUIRED",

        "capabilityKey is required"
      );
    }


    return this.scope.run(
      {
        organizationId:
          input.organizationId,

        environmentId:
          input.environmentId,
      },

      async client => {
        const result =
          await client.query(
            `
              SELECT
                evidence.public_id,
                evidence.evidence_type,
                evidence.source_type,
                evidence.source_ref,
                evidence.source_hash,
                evidence.observed_at,
                evidence.provenance,
                evidence.created_at

              FROM
                certification.evidence_links evidence

              INNER JOIN
                certification.certification_runs run
                  ON run.id =
                     evidence.certification_run_id

              INNER JOIN
                certification.certified_capabilities capability
                  ON capability.id =
                     run.certified_capability_id

              WHERE
                capability.capability_key = $1

              ORDER BY
                evidence.observed_at DESC NULLS LAST,
                evidence.created_at DESC
            `,

            [
              input.capabilityKey,
            ]
          );


        return result.rows.map(
          row =>
            Object.freeze({
              publicId:
                row.public_id,

              evidenceType:
                row.evidence_type,

              sourceType:
                row.source_type,

              sourceRef:
                row.source_ref,

              sourceHash:
                row.source_hash,

              observedAt:
                row.observed_at,

              provenance:
                row.provenance,

              createdAt:
                row.created_at,

              executionAuthorized:
                false,
            })
        );
      }
    );
  }
}


function mapCapability(
  row
) {
  return Object.freeze({
    publicId:
      row.public_id,

    capabilityKey:
      row.capability_key,

    identityVersion:
      row.identity_version,

    fingerprint:
      row.fingerprint,

    provider:
      row.provider,

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

    domain:
      row.domain,

    constraints:
      row.constraints ||
      {},

    identityPayload:
      row.identity_payload,

    certificate:
      row.certificate_public_id
        ? Object.freeze({
            publicId:
              row.certificate_public_id,

            qualifiedLevel:
              row.qualified_level,

            score:
              numericOrNull(
                row.score
              ),

            confidence:
              numericOrNull(
                row.confidence
              ),

            status:
              row.certificate_status,

            evidenceDigest:
              row.evidence_digest,

            certificatePayload:
              row.certificate_payload,

            issuedAt:
              row.issued_at,

            expiresAt:
              row.expires_at,

            executionAuthorized:
              false,
          })
        : null,

    createdAt:
      row.created_at,

    executionAuthorized:
      false,

    productionCertified:
      false,
  });
}


function mapCertificateHistory(
  row
) {
  return Object.freeze({
    publicId:
      row.public_id,

    qualifiedLevel:
      row.qualified_level,

    score:
      numericOrNull(
        row.score
      ),

    confidence:
      numericOrNull(
        row.confidence
      ),

    evidenceDigest:
      row.evidence_digest,

    status:
      row.status,

    issuedAt:
      row.issued_at,

    expiresAt:
      row.expires_at,

    createdAt:
      row.created_at,

    executionAuthorized:
      false,
  });
}


function numericOrNull(
  value
) {
  if (
    value ===
      null ||

    value ===
      undefined
  ) {
    return null;
  }


  const numeric =
    Number(
      value
    );


  return Number.isFinite(
    numeric
  )
    ? numeric
    : null;
}


function requireScope(
  input
) {
  if (
    !input.organizationId ||
    !input.environmentId
  ) {
    throw repositoryError(
      "CERTIFICATION_READ_SCOPE_REQUIRED",

      "organizationId and environmentId are required"
    );
  }
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
        "PostgresCertificationReadModelRepositoryError",

      code,

      executionAuthorized:
        false,
    }
  );
}


module.exports =
  PostgresCertificationReadModelRepository;