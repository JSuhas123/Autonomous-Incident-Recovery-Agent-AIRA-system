"use strict";

const crypto =
  require(
    "node:crypto"
  );

const PolicyRepository =
  require(
    "../repositories/PolicyRepository"
  );

const PostgresTenantContext =
  require(
    "./PostgresTenantContext"
  );

const {
  normalizeId,
  serializeDocument,
  reviveDocument,
  translatePostgresError,
} =
  require(
    "./postgresDomainMapper"
  );

class PostgresPolicyRepository
  extends PolicyRepository {
  constructor(
    options = {}
  ) {
    super();

    this.tenantContext =
      options.tenantContext ||
      new PostgresTenantContext(
        options
      );
  }

  async findActiveForTenant(
    tenantId,
    version = null,
    transaction = null
  ) {
    return this.tenantContext.run(
      tenantId,
      async (
        client
      ) => {
        const values = [
          tenantId,
        ];

        let versionClause =
          "";

        if (
          version !==
            null &&
          version !==
            undefined
        ) {
          values.push(
            version
          );

          versionClause =
            "AND version = $2";
        }

        const result =
          await client.query(
            `
              SELECT *
              FROM policy.policies
              WHERE
                tenant_public_id = $1
                AND status = 'active'
                ${versionClause}
              ORDER BY version DESC
              LIMIT 1
            `,
            values
          );

        return result.rows[0]
          ? mapPolicy(
              result.rows[0]
            )
          : null;
      },
      transaction
    );
  }

  async findOne(
    filter,
    transaction = null
  ) {
    const tenantId =
      requireTenant(
        filter
      );

    return this.tenantContext.run(
      tenantId,
      async (
        client
      ) => {
        const {
          where,
          values,
        } =
          buildFilter(
            filter
          );

        const result =
          await client.query(
            `
              SELECT *
              FROM policy.policies
              WHERE ${where}
              LIMIT 1
            `,
            values
          );

        return result.rows[0]
          ? mapPolicy(
              result.rows[0]
            )
          : null;
      },
      transaction
    );
  }

  async list(
    filter,
    {
      sort = {
        version:
          -1,
      },

      limit = 100,
    } = {},
    transaction = null
  ) {
    const tenantId =
      requireTenant(
        filter
      );

    const safeLimit =
      Math.min(
        Math.max(
          Number(
            limit
          ) ||
          100,
          1
        ),
        500
      );

    return this.tenantContext.run(
      tenantId,
      async (
        client
      ) => {
        const {
          where,
          values,
        } =
          buildFilter(
            filter
          );

        const direction =
          Number(
            sort.version
          ) >=
          0
            ? "ASC"
            : "DESC";

        values.push(
          safeLimit
        );

        const result =
          await client.query(
            `
              SELECT *
              FROM policy.policies
              WHERE ${where}
              ORDER BY version ${direction}
              LIMIT $${values.length}
            `,
            values
          );

        return result.rows.map(
          mapPolicy
        );
      },
      transaction
    );
  }

  async create(
    data,
    transaction = null
  ) {
    const tenantId =
      requireTenant(
        data
      );

    return this.tenantContext.run(
      tenantId,
      async (
        client
      ) => {
        const databaseId =
          normalizeId(
            data._id
          ) ||
          crypto
            .randomBytes(
              12
            )
            .toString(
              "hex"
            );

        const publicId =
          data.policyId ||
          `policy-${tenantId}-${data.version}`;

        const document =
          serializeDocument({
            ...data,

            _id:
              databaseId,
          });

        try {
          const result =
            await client.query(
              `
                INSERT INTO policy.policies (
                  public_id,
                  database_id,
                  tenant_public_id,
                  name,
                  version,
                  enforcement_mode,
                  policy_yaml,
                  policy_json,
                  status,
                  created_by,
                  approved_at,
                  approved_by,
                  description,
                  change_log,
                  services,
                  circuit_breakers,
                  blackout_windows,
                  approvals,
                  metadata,
                  document
                )
                VALUES (
                  $1, $2, $3, $4, $5,
                  $6, $7, $8::jsonb, $9, $10,
                  $11, $12, $13, $14, $15::jsonb,
                  $16::jsonb, $17::jsonb, $18::jsonb, $19::jsonb, $20::jsonb
                )
                RETURNING *
              `,
              [
                publicId,

                databaseId,

                tenantId,

                data.name ||
                  "default",

                data.version,

                data.enforcementMode ||
                  "strict",

                data.policyYaml,

                JSON.stringify(
                  data.policyJson ||
                  {}
                ),

                data.status ||
                  "draft",

                data.createdBy ||
                  null,

                data.approvedAt ||
                  null,

                data.approvedBy ||
                  null,

                data.description ||
                  null,

                data.changeLog ||
                  "",

                JSON.stringify(
                  data.services ||
                  []
                ),

                JSON.stringify(
                  data.circuitBreakers ||
                  []
                ),

                JSON.stringify(
                  data.blackoutWindows ||
                  []
                ),

                JSON.stringify(
                  data.approvals ||
                  []
                ),

                JSON.stringify(
                  data.metadata ||
                  {}
                ),

                JSON.stringify(
                  document
                ),
              ]
            );

          return mapPolicy(
            result.rows[0]
          );
        } catch (
          error
        ) {
          throw translatePostgresError(
            error
          );
        }
      },
      transaction
    );
  }

  async save(
    policy,
    transaction = null
  ) {
    const tenantId =
      requireTenant(
        policy
      );

    return this.tenantContext.run(
      tenantId,
      async (
        client
      ) => {
        const document =
          serializeDocument(
            policy
          );

        const result =
          await client.query(
            `
              UPDATE policy.policies
              SET
                enforcement_mode = $1,
                policy_yaml = $2,
                policy_json = $3::jsonb,
                status = $4,
                created_by = $5,
                approved_at = $6,
                approved_by = $7,
                description = $8,
                change_log = $9,
                services = $10::jsonb,
                circuit_breakers = $11::jsonb,
                blackout_windows = $12::jsonb,
                approvals = $13::jsonb,
                document = $14::jsonb
              WHERE
                tenant_public_id = $15
                AND version = $16
              RETURNING *
            `,
            [
              policy.enforcementMode ||
                "strict",

              policy.policyYaml,

              JSON.stringify(
                policy.policyJson ||
                {}
              ),

              policy.status,

              policy.createdBy ||
                null,

              policy.approvedAt ||
                null,

              policy.approvedBy ||
                null,

              policy.description ||
                null,

              policy.changeLog ||
                "",

              JSON.stringify(
                policy.services ||
                []
              ),

              JSON.stringify(
                policy.circuitBreakers ||
                []
              ),

              JSON.stringify(
                policy.blackoutWindows ||
                []
              ),

              JSON.stringify(
                policy.approvals ||
                []
              ),

              JSON.stringify(
                document
              ),

              tenantId,

              policy.version,
            ]
          );

        return result.rows[0]
          ? mapPolicy(
              result.rows[0]
            )
          : null;
      },
      transaction
    );
  }

  async updateOne(
    filter,
    update,
    transaction = null
  ) {
    const existing =
      await this.findOne(
        filter,
        transaction
      );

    if (!existing) {
      return null;
    }

    Object.assign(
      existing,
      update.$set ||
      update
    );

    return this.save(
      existing,
      transaction
    );
  }
}

function buildFilter(
  filter
) {
  const clauses = [];
  const values = [];

  const fields = {
    tenantId:
      "tenant_public_id",

    version:
      "version",

    status:
      "status",
  };

  for (
    const [
      key,
      value,
    ]
    of Object.entries(
      filter
    )
  ) {
    if (
      key ===
      "_id"
    ) {
      const index =
        values.push(
          normalizeId(
            value
          )
        );

      clauses.push(
        `(
          database_id = $${index}
          OR id::text = $${index}
        )`
      );

      continue;
    }

    const column =
      fields[key];

    if (!column) {
      throw Object.assign(
        new Error(
          `Unsupported PostgreSQL policy filter: ${key}`
        ),
        {
          code:
            "POSTGRES_POLICY_FILTER_UNSUPPORTED",
        }
      );
    }

    const index =
      values.push(
        value
      );

    clauses.push(
      `${column} = $${index}`
    );
  }

  return {
    where:
      clauses.join(
        " AND "
      ),

    values,
  };
}

function mapPolicy(
  row
) {
  const document =
    reviveDocument(
      row.document ||
      {}
    );

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

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,
  };
}

function requireTenant(
  value = {}
) {
  const tenantId =
    typeof value ===
      "string"
      ? value
      : value.tenantId;

  if (!tenantId) {
    throw Object.assign(
      new Error(
        "Policy PostgreSQL operation requires tenantId"
      ),
      {
        code:
          "POSTGRES_POLICY_TENANT_REQUIRED",
      }
    );
  }

  return tenantId;
}

module.exports =
  PostgresPolicyRepository;