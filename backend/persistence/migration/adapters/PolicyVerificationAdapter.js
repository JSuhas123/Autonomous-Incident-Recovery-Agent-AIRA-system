"use strict";

const PolicyDefinition =
  require(
    "../../../models/PolicyDefinition"
  );

const PostgresPolicyRepository =
  require(
    "../../postgres/PostgresPolicyRepository"
  );

const BackfillDocumentNormalizer =
  require(
    "../BackfillDocumentNormalizer"
  );

class PolicyVerificationAdapter {
  constructor(
    options = {}
  ) {
    this.Model =
      options.Model ||
      PolicyDefinition;

    this.repository =
      options.repository ||
      new PostgresPolicyRepository();

    this.normalizer =
      options.normalizer ||
      new BackfillDocumentNormalizer();

    this.ignoredFields = [
      "_id",
      "__v",

      "id",
      "databaseId",
      "legacyMongoId",

      "createdAt",
      "updatedAt",
      "created_at",
      "updated_at",
    ];
  }

  async countSource(
    scope
  ) {
    this.assertScope(
      scope
    );

    return this.Model
      .countDocuments({
        tenantId:
          scope.tenantId,
      });
  }

  async countTarget(
    scope
  ) {
    this.assertScope(
      scope
    );

    return this.repository
      .tenantContext
      .run(
        scope.tenantId,
        async (
          client
        ) => {
          const result =
            await client.query(
              `
                SELECT COUNT(*)::bigint AS count
                FROM policy.policies
                WHERE tenant_public_id = $1
              `,
              [
                scope.tenantId,
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

  async readSource({
    scope,
    limit = null,
  } = {}) {
    this.assertScope(
      scope
    );

    let query =
      this.Model
        .find({
          tenantId:
            scope.tenantId,
        })
        .sort({
          version:
            1,
        })
        .lean();

    if (
      Number.isInteger(
        limit
      ) &&
      limit >
        0
    ) {
      query =
        query.limit(
          limit
        );
    }

    const rows =
      await query;

    return rows.map(
      (
        row
      ) =>
        this.normalizer
          .normalize(
            row
          )
    );
  }

  getSourceIdentity(
    source
  ) {
    if (
      source?.policyId
    ) {
      return String(
        source.policyId
      );
    }

    if (
      source?.version !==
      undefined
    ) {
      return String(
        source.version
      );
    }

    return null;
  }

  async findTarget(
    scope,
    logicalId
  ) {
    this.assertScope(
      scope
    );

    return this.repository
      .tenantContext
      .run(
        scope.tenantId,
        async (
          client
        ) => {
          const result =
            await client.query(
              `
                SELECT *
                FROM policy.policies
                WHERE tenant_public_id = $1
                  AND (
                    public_id = $2
                    OR version::text = $2
                    OR database_id = $2
                    OR id::text = $2
                  )
                LIMIT 1
              `,
              [
                scope.tenantId,

                String(
                  logicalId
                ),
              ]
            );

          if (
            result.rows.length ===
            0
          ) {
            return null;
          }

          return this.mapRow(
            result.rows[0]
          );
        }
      );
  }

  mapRow(
    row
  ) {
    const document = {
      ...(
        row.document ||
        {}
      ),
    };

    return {
      ...document,

      _id:
        row.database_id ||
        row.id,

      policyId:
        row.public_id,

      tenantId:
        row.tenant_public_id,

      version:
        row.version,

      enforcementMode:
        row.enforcement_mode,

      policyYaml:
        row.policy_yaml,

      policyJson:
        row.policy_json ||
        {},

      status:
        row.status,

      createdBy:
        row.created_by,

      approvedAt:
        row.approved_at,

      approvedBy:
        row.approved_by,

      description:
        row.description,

      changeLog:
        row.change_log,

      services:
        row.services ||
        [],

      circuitBreakers:
        row.circuit_breakers ||
        [],

      blackoutWindows:
        row.blackout_windows ||
        [],

      approvals:
        row.approvals ||
        [],
    };
  }

  getTargetIdentity(
    target
  ) {
    return (
      target?.policyId ||
      target?.version ||
      null
    );
  }

  canonicalizeSource(
    value
  ) {
    return this.prepare(
      value
    );
  }

  canonicalizeTarget(
    value
  ) {
    return this.prepare(
      value
    );
  }

  prepare(
    value
  ) {
    const normalized =
      this.normalizer
        .normalize(
          value
        );

    /*
     * tenantId is verified through query ownership.
     */
    delete normalized
      .tenantId;

    return normalized;
  }

  assertScope(
    scope = {}
  ) {
    if (
      !scope.tenantId
    ) {
      throw Object.assign(
        new Error(
          "Policy verification requires tenantId"
        ),
        {
          code:
            "MIGRATION_VERIFICATION_TENANT_REQUIRED",
        }
      );
    }
  }
}

module.exports =
  PolicyVerificationAdapter;