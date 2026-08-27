"use strict";


const {
  getPostgresPool,
} =
  require(
    "./postgresPool"
  );


class PostgresSystemDnaRepository {

  constructor(
    options =
      {}
  ) {
    this.pool =
      options.pool ||
      getPostgresPool();
  }


  async resolveOrganization(
    organizationId
  ) {
    const result =
      await this.pool
        .query(
          `
            SELECT
              id,
              public_id

            FROM tenancy.organizations

            WHERE
              public_id = $1
              OR id::text = $1

            LIMIT 1
          `,
          [
            organizationId,
          ]
        );


    return (
      result.rows[0] ||
      null
    );
  }


  async findActive({
    organizationId,

    scopeType,

    environmentPublicId =
      null,

    serviceId =
      null,

    resourceId =
      null,
  }) {
    const organization =
      await this
        .resolveOrganization(
          organizationId
        );


    if (
      !organization
    ) {
      return null;
    }


    const result =
      await this.pool
        .query(
          `
            SELECT *

            FROM memory.system_dna_snapshots

            WHERE
              organization_id =
                $1

              AND scope_type =
                $2

              AND environment_public_id
                IS NOT DISTINCT FROM
                $3

              AND service_id
                IS NOT DISTINCT FROM
                $4

              AND resource_id
                IS NOT DISTINCT FROM
                $5

              AND status =
                'ACTIVE'

            ORDER BY
              created_at DESC

            LIMIT 1
          `,
          [
            organization.id,
            scopeType,
            environmentPublicId,
            serviceId,
            resourceId,
          ]
        );


    return (
      result.rows[0] ||
      null
    );
  }


  async supersedeActive({
    organizationId,

    scopeType,

    environmentPublicId =
      null,

    serviceId =
      null,

    resourceId =
      null,
  }) {
    const organization =
      await this
        .resolveOrganization(
          organizationId
        );


    if (
      !organization
    ) {
      return 0;
    }


    const result =
      await this.pool
        .query(
          `
            UPDATE memory.system_dna_snapshots

            SET
              status =
                'SUPERSEDED',

              updated_at =
                now()

            WHERE
              organization_id =
                $1

              AND scope_type =
                $2

              AND environment_public_id
                IS NOT DISTINCT FROM
                $3

              AND service_id
                IS NOT DISTINCT FROM
                $4

              AND resource_id
                IS NOT DISTINCT FROM
                $5

              AND status =
                'ACTIVE'
          `,
          [
            organization.id,
            scopeType,
            environmentPublicId,
            serviceId,
            resourceId,
          ]
        );


    return result.rowCount;
  }


  async createSnapshot({
    organizationId,

    dna,

    trust,
  }) {
    const organization =
      await this
        .resolveOrganization(
          organizationId
        );


    if (
      !organization
    ) {
      const error =
        new Error(
          "Organization not found for System DNA snapshot"
        );

      error.code =
        "SYSTEM_DNA_ORGANIZATION_NOT_FOUND";

      error.status =
        404;

      throw error;
    }


    const publicId =
      `dna_${dna.scopeType.toLowerCase()}_${dna.fingerprint.slice(
        0,
        24
      )}`;


    const result =
      await this.pool
        .query(
          `
            INSERT INTO
              memory.system_dna_snapshots
            (
              public_id,

              organization_id,

              tenant_public_id,

              scope_type,

              environment_id,

              environment_public_id,

              service_id,

              resource_id,

              fingerprint,

              version,

              confidence,

              trust_score,

              evidence_count,

              family_count,

              complete_family_coverage,

              dna,

              provenance,

              metadata
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
              $15,
              $16::jsonb,
              $17::jsonb,
              $18::jsonb
            )

            RETURNING *
          `,
          [
            publicId,

            organization.id,

            dna.tenantPublicId,

            dna.scopeType,

            dna.environmentId ||
              null,

            dna.environmentPublicId ||
              null,

            dna.serviceId ||
              null,

            dna.resourceId ||
              null,

            dna.fingerprint,

            dna.version,

            dna.confidence,

            trust.score,

            dna.evidenceCount,

            dna
              ?.metadata
              ?.familyCoverage ||
              0,

            Boolean(
              dna
                ?.metadata
                ?.completeFamilyCoverage
            ),

            JSON.stringify(
              dna
            ),

            JSON.stringify(
              trust.provenance ||
              {}
            ),

            JSON.stringify({
              phase:
                "16.15",

              executionAuthorized:
                false,
            }),
          ]
        );


    return result.rows[0];
  }
}


module.exports =
  PostgresSystemDnaRepository;