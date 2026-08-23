"use strict";

const ApprovalRequestModule =
  require(
    "../../../models/ApprovalRequest"
  );

const PostgresApprovalRepository =
  require(
    "../../postgres/PostgresApprovalRepository"
  );

const BackfillDocumentNormalizer =
  require(
    "../BackfillDocumentNormalizer"
  );

function resolveModel(
  moduleValue
) {
  if (
    typeof moduleValue ===
      "function"
  ) {
    return moduleValue;
  }

  const candidate =
    Object.values(
      moduleValue ||
      {}
    )
      .find(
        (
          value
        ) =>
          typeof value ===
            "function" &&
          value.modelName
      );

  if (
    candidate
  ) {
    return candidate;
  }

  throw Object.assign(
    new Error(
      "Unable to resolve ApprovalRequest Mongo model"
    ),
    {
      code:
        "MIGRATION_APPROVAL_MODEL_RESOLUTION_FAILED",
    }
  );
}

class ApprovalVerificationAdapter {
  constructor(
    options = {}
  ) {
    this.Model =
      options.Model ||
      resolveModel(
        ApprovalRequestModule
      );

    this.repository =
      options.repository ||
      new PostgresApprovalRepository();

    this.normalizer =
      options.normalizer ||
      new BackfillDocumentNormalizer();

    this.ignoredFields = [
      "_id",
      "__v",

      "id",
      "databaseId",
      "legacyMongoId",

      "organizationId",
      "environmentId",
      "tenantId",

      "createdAt",
      "updatedAt",
      "created_at",
      "updated_at",
    ];
  }

  async countSource(
    scope
  ) {
    return this.Model
      .countDocuments(
        this.buildMongoScope(
          scope
        )
      );
  }

  async countTarget(
    scope
  ) {
    return this.repository
      .scope
      .run(
        scope,
        async (
          client,
          resolved
        ) => {
          const result =
            await client.query(
              `
                SELECT COUNT(*)::bigint AS count
                FROM execution.approvals
                WHERE organization_id = $1
                  AND environment_id = $2
              `,
              [
                resolved.organizationUuid,
                resolved.environmentUuid,
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
    let query =
      this.Model
        .find(
          this.buildMongoScope(
            scope
          )
        )
        .sort({
          _id:
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
    return source
      ?.approvalId
      ? String(
          source.approvalId
        )
      : null;
  }

  async findTarget(
    scope,
    logicalId
  ) {
    return this.repository
      .findByApprovalId(
        logicalId,
        {
          organizationId:
            scope.organizationId,

          environmentId:
            scope.environmentId,
        }
      );
  }

  getTargetIdentity(
    target
  ) {
    return target
      ?.approvalId
      ? String(
          target.approvalId
        )
      : null;
  }

  canonicalizeSource(
    source
  ) {
    return this
      .prepareCanonical(
        source
      );
  }

  canonicalizeTarget(
    target
  ) {
    return this
      .prepareCanonical(
        target
      );
  }

  prepareCanonical(
    value
  ) {
    const normalized =
      this.normalizer
        .normalize(
          value
        );

    delete normalized.organizationId;
    delete normalized.environmentId;
    delete normalized.tenantId;
    delete normalized.legacyMongoId;

    return normalized;
  }

  buildMongoScope(
    scope = {}
  ) {
    if (
      !scope.organizationId ||
      !scope.environmentId
    ) {
      throw Object.assign(
        new Error(
          "Approval verification requires organization/environment scope"
        ),
        {
          code:
            "MIGRATION_VERIFICATION_SCOPE_REQUIRED",
        }
      );
    }

    return {
      organizationId:
        scope.organizationId,

      environmentId:
        scope.environmentId,
    };
  }
}

module.exports =
  ApprovalVerificationAdapter;