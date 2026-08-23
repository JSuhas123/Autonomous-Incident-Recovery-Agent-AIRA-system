"use strict";

const crypto =
  require(
    "node:crypto"
  );

const OperationalDocumentRepository =
  require(
    "../repositories/OperationalDocumentRepository"
  );

const PostgresTenantScope =
  require(
    "./PostgresTenantScope"
  );

class PostgresOperationalDocumentRepository
  extends OperationalDocumentRepository {
  constructor(
    options = {}
  ) {
    super();

    this.scope =
      options.scope ||
      new PostgresTenantScope(
        options
      );
  }

  async findMany(
    domain,
    filter = {},
    options = {},
    transaction = null
  ) {
    const scope =
      requireScope(
        filter
      );

    return this.scope.run(
      scope,
      async (
        client,
        resolved
      ) => {
        const rows =
          await loadScopedRows(
            client,
            resolved,
            domain
          );

        let documents =
          rows
            .map(
              mapRow
            )
            .filter(
              (
                document
              ) =>
                matchesFilter(
                  document,
                  filter
                )
            );

        documents =
          sortDocuments(
            documents,
            options.sort
          );

        if (
          Number.isFinite(
            Number(
              options.limit
            )
          ) &&
          Number(
            options.limit
          ) >
            0
        ) {
          documents =
            documents.slice(
              0,
              Number(
                options.limit
              )
            );
        }

        return documents.map(
          (
            document
          ) =>
            selectDocument(
              document,
              options.select
            )
        );
      },
      transaction
    );
  }

  async findOne(
    domain,
    filter = {},
    options = {},
    transaction = null
  ) {
    const documents =
      await this.findMany(
        domain,
        filter,
        {
          ...options,

          limit:
            1,
        },
        transaction
      );

    return (
      documents[0] ||
      null
    );
  }

  async create(
    domain,
    data,
    transaction = null
  ) {
    const scope =
      requireScope(
        data
      );

    return this.scope.run(
      scope,
      async (
        client,
        resolved
      ) => {
        const databaseId =
          normalizeId(
            data._id
          ) ||
          createDatabaseId();

        const document =
          normalizeDocument({
            ...data,

            _id:
              databaseId,

            organizationId:
              normalizeId(
                data.organizationId
              ),

            environmentId:
              normalizeId(
                data.environmentId
              ),

            createdAt:
              data.createdAt ||
              new Date(),

            updatedAt:
              data.updatedAt ||
              new Date(),
          });

        const result =
          await client.query(
            `
              INSERT INTO operational.documents (
                domain,
                public_id,
                legacy_mongo_id,
                organization_id,
                environment_id,
                document
              )
              VALUES (
                $1,
                $2,
                $3,
                $4,
                $5,
                $6::jsonb
              )
              RETURNING *
            `,
            [
              domain,

              databaseId,

              isMongoObjectId(
                data._id
              )
                ? String(
                    data._id
                  )
                : null,

              resolved
                .organizationUuid,

              resolved
                .environmentUuid,

              JSON.stringify(
                document
              ),
            ]
          );

        return mapRow(
          result.rows[0]
        );
      },
      transaction
    );
  }

  async replace(
    domain,
    filter,
    document,
    transaction = null
  ) {
    const existing =
      await this.findOne(
        domain,
        filter,
        {},
        transaction
      );

    if (!existing) {
      return null;
    }

    const scope =
      requireScope({
        ...existing,
        ...filter,
      });

    return this.scope.run(
      scope,
      async (
        client,
        resolved
      ) => {
        const next =
          normalizeDocument({
            ...document,

            _id:
              existing._id,

            organizationId:
              existing
                .organizationId,

            environmentId:
              existing
                .environmentId,

            createdAt:
              document
                .createdAt ||
              existing
                .createdAt,

            updatedAt:
              new Date(),
          });

        const result =
          await client.query(
            `
              UPDATE operational.documents

              SET
                document = $1::jsonb,
                updated_at = NOW()

              WHERE
                domain = $2

                AND organization_id = $3

                AND environment_id = $4

                AND (
                  public_id = $5
                  OR legacy_mongo_id = $5
                  OR id::text = $5
                )

              RETURNING *
            `,
            [
              JSON.stringify(
                next
              ),

              domain,

              resolved
                .organizationUuid,

              resolved
                .environmentUuid,

              String(
                existing._id
              ),
            ]
          );

        return result.rows[0]
          ? mapRow(
              result.rows[0]
            )
          : null;
      },
      transaction
    );
  }

  async updateOne(
    domain,
    filter,
    update,
    options = {},
    transaction = null
  ) {
    let existing =
      await this.findOne(
        domain,
        filter,
        {},
        transaction
      );

    if (
      !existing &&
      options.upsert
    ) {
      const base =
        extractEqualitySeed(
          filter
        );

      return this.create(
        domain,
        applyUpdate(
          base,
          update
        ),
        transaction
      );
    }

    if (!existing) {
      return null;
    }

    return this.replace(
      domain,
      {
        ...filter,

        _id:
          existing._id,
      },
      applyUpdate(
        existing,
        update
      ),
      transaction
    );
  }

  async updateMany(
    domain,
    filter,
    update,
    _options = {},
    transaction = null
  ) {
    const documents =
      await this.findMany(
        domain,
        filter,
        {},
        transaction
      );

    let modifiedCount =
      0;

    for (
      const document
      of documents
    ) {
      const saved =
        await this.replace(
          domain,
          {
            organizationId:
              document
                .organizationId,

            environmentId:
              document
                .environmentId,

            _id:
              document._id,
          },
          applyUpdate(
            document,
            update
          ),
          transaction
        );

      if (saved) {
        modifiedCount +=
          1;
      }
    }

    return {
      acknowledged:
        true,

      matchedCount:
        documents.length,

      modifiedCount,
    };
  }

  async deleteOne(
    domain,
    filter,
    transaction = null
  ) {
    const existing =
      await this.findOne(
        domain,
        filter,
        {},
        transaction
      );

    if (!existing) {
      return {
        acknowledged:
          true,

        deletedCount:
          0,
      };
    }

    const scope =
      requireScope(
        existing
      );

    return this.scope.run(
      scope,
      async (
        client,
        resolved
      ) => {
        const result =
          await client.query(
            `
              DELETE FROM operational.documents

              WHERE
                domain = $1

                AND organization_id = $2

                AND environment_id = $3

                AND (
                  public_id = $4
                  OR legacy_mongo_id = $4
                  OR id::text = $4
                )
            `,
            [
              domain,

              resolved
                .organizationUuid,

              resolved
                .environmentUuid,

              String(
                existing._id
              ),
            ]
          );

        return {
          acknowledged:
            true,

          deletedCount:
            result.rowCount,
        };
      },
      transaction
    );
  }

  async deleteMany(
    domain,
    filter,
    transaction = null
  ) {
    const documents =
      await this.findMany(
        domain,
        filter,
        {},
        transaction
      );

    let deletedCount =
      0;

    for (
      const document
      of documents
    ) {
      const result =
        await this.deleteOne(
          domain,
          {
            organizationId:
              document
                .organizationId,

            environmentId:
              document
                .environmentId,

            _id:
              document._id,
          },
          transaction
        );

      deletedCount +=
        result.deletedCount ||
        0;
    }

    return {
      acknowledged:
        true,

      deletedCount,
    };
  }

  async countDocuments(
    domain,
    filter = {},
    transaction = null
  ) {
    const documents =
      await this.findMany(
        domain,
        filter,
        {},
        transaction
      );

    return documents.length;
  }
}

async function loadScopedRows(
  client,
  resolved,
  domain
) {
  const result =
    await client.query(
      `
        SELECT *

        FROM operational.documents

        WHERE
          domain = $1

          AND organization_id = $2

          AND environment_id = $3

        ORDER BY updated_at DESC

        LIMIT 10000
      `,
      [
        domain,

        resolved
          .organizationUuid,

        resolved
          .environmentUuid,
      ]
    );

  return result.rows;
}

function mapRow(
  row
) {
  const document =
    revive(
      row.document ||
      {}
    );

  return {
    ...document,

    _id:
      document._id ||
      row.legacy_mongo_id ||
      row.public_id ||
      row.id,

    createdAt:
      document.createdAt ||
      row.created_at,

    updatedAt:
      document.updatedAt ||
      row.updated_at,
  };
}

function normalizeDocument(
  value
) {
  return JSON.parse(
    JSON.stringify(
      value
    )
  );
}

function revive(
  value
) {
  if (
    Array.isArray(
      value
    )
  ) {
    return value.map(
      revive
    );
  }

  if (
    !value ||
    typeof value !==
      "object"
  ) {
    return value;
  }

  const output = {};

  for (
    const [
      key,
      nested,
    ]
    of Object.entries(
      value
    )
  ) {
    output[key] =
      revive(
        nested
      );
  }

  return output;
}

function requireScope(
  value = {}
) {
  if (
    !value.organizationId ||
    !value.environmentId
  ) {
    throw Object.assign(
      new Error(
        "Operational document operation requires organizationId and environmentId"
      ),
      {
        code:
          "OPERATIONAL_DOCUMENT_SCOPE_REQUIRED",
      }
    );
  }

  return {
    organizationId:
      String(
        value.organizationId
      ),

    environmentId:
      String(
        value.environmentId
      ),
  };
}

function normalizeId(
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

  return String(
    value
  );
}

function createDatabaseId() {
  return crypto
    .randomBytes(
      12
    )
    .toString(
      "hex"
    );
}

function isMongoObjectId(
  value
) {
  return /^[0-9a-f]{24}$/i
    .test(
      String(
        value ||
        ""
      )
    );
}

function getPath(
  object,
  path
) {
  return String(
    path
  )
    .split(
      "."
    )
    .reduce(
      (
        current,
        part
      ) =>
        current ==
        null
          ? undefined
          : current[
              part
            ],
      object
    );
}

function setPath(
  object,
  path,
  value
) {
  const parts =
    String(
      path
    )
      .split(
        "."
      );

  let current =
    object;

  while (
    parts.length >
    1
  ) {
    const part =
      parts.shift();

    if (
      !current[
        part
      ] ||
      typeof current[
        part
      ] !==
        "object"
    ) {
      current[
        part
      ] = {};
    }

    current =
      current[
        part
      ];
  }

  current[
    parts[0]
  ] =
    value;
}

function deletePath(
  object,
  path
) {
  const parts =
    String(
      path
    )
      .split(
        "."
      );

  let current =
    object;

  while (
    parts.length >
    1
  ) {
    current =
      current?.[
        parts.shift()
      ];

    if (!current) {
      return;
    }
  }

  delete current[
    parts[0]
  ];
}

function comparable(
  value
) {
  if (
    value instanceof
      Date
  ) {
    return value.getTime();
  }

  if (
    typeof value ===
      "string"
  ) {
    const time =
      Date.parse(
        value
      );

    if (
      /^\d{4}-\d{2}-\d{2}T/
        .test(
          value
        ) &&
      !Number.isNaN(
        time
      )
    ) {
      return time;
    }
  }

  return value;
}

function equalValue(
  left,
  right
) {
  if (
    left === null ||
    left === undefined ||
    right === null ||
    right === undefined
  ) {
    return (
      left ===
      right
    );
  }

  if (
    Array.isArray(
      left
    ) &&
    !Array.isArray(
      right
    )
  ) {
    return left.some(
      (
        item
      ) =>
        String(
          item
        ) ===
        String(
          right
        )
    );
  }

  return (
    String(
      left
    ) ===
    String(
      right
    )
  );
}

function matchesCondition(
  actual,
  expected
) {
  if (
    expected instanceof
      RegExp
  ) {
    return expected.test(
      String(
        actual ||
        ""
      )
    );
  }

  if (
    !expected ||
    typeof expected !==
      "object" ||
    Array.isArray(
      expected
    )
  ) {
    return equalValue(
      actual,
      expected
    );
  }

  for (
    const [
      operator,
      value,
    ]
    of Object.entries(
      expected
    )
  ) {
    if (
      operator ===
      "$in"
    ) {
      const values =
        Array.isArray(
          value
        )
          ? value
          : [];

      const matched =
        Array.isArray(
          actual
        )
          ? actual.some(
              (
                item
              ) =>
                values.some(
                  (
                    candidate
                  ) =>
                    equalValue(
                      item,
                      candidate
                    )
                )
            )
          : values.some(
              (
                candidate
              ) =>
                equalValue(
                  actual,
                  candidate
                )
            );

      if (!matched) {
        return false;
      }
    } else if (
      operator ===
      "$nin"
    ) {
      if (
        (
          Array.isArray(
            value
          )
            ? value
            : []
        ).some(
          (
            candidate
          ) =>
            equalValue(
              actual,
              candidate
            )
        )
      ) {
        return false;
      }
    } else if (
      operator ===
      "$ne"
    ) {
      if (
        equalValue(
          actual,
          value
        )
      ) {
        return false;
      }
    } else if (
      operator ===
      "$exists"
    ) {
      if (
        Boolean(
          actual !==
          undefined
        ) !==
        Boolean(
          value
        )
      ) {
        return false;
      }
    } else if (
      operator ===
      "$gte"
    ) {
      if (
        !(
          comparable(
            actual
          ) >=
          comparable(
            value
          )
        )
      ) {
        return false;
      }
    } else if (
      operator ===
      "$gt"
    ) {
      if (
        !(
          comparable(
            actual
          ) >
          comparable(
            value
          )
        )
      ) {
        return false;
      }
    } else if (
      operator ===
      "$lte"
    ) {
      if (
        !(
          comparable(
            actual
          ) <=
          comparable(
            value
          )
        )
      ) {
        return false;
      }
    } else if (
      operator ===
      "$lt"
    ) {
      if (
        !(
          comparable(
            actual
          ) <
          comparable(
            value
          )
        )
      ) {
        return false;
      }
    } else if (
      operator ===
      "$regex"
    ) {
      const regex =
        value instanceof
          RegExp
          ? value
          : new RegExp(
              String(
                value
              ),
              expected
                .$options ||
              ""
            );

      if (
        !regex.test(
          String(
            actual ||
            ""
          )
        )
      ) {
        return false;
      }
    } else if (
      operator ===
      "$options"
    ) {
      continue;
    } else if (
      !matchesCondition(
        actual?.[
          operator
        ],
        value
      )
    ) {
      return false;
    }
  }

  return true;
}

function matchesFilter(
  document,
  filter = {}
) {
  if (
    Array.isArray(
      filter.$or
    )
  ) {
    if (
      !filter.$or.some(
        (
          candidate
        ) =>
          matchesFilter(
            document,
            candidate
          )
      )
    ) {
      return false;
    }
  }

  if (
    Array.isArray(
      filter.$and
    )
  ) {
    if (
      !filter.$and.every(
        (
          candidate
        ) =>
          matchesFilter(
            document,
            candidate
          )
      )
    ) {
      return false;
    }
  }

  for (
    const [
      key,
      expected,
    ]
    of Object.entries(
      filter
    )
  ) {
    if (
      key ===
        "$or" ||
      key ===
        "$and"
    ) {
      continue;
    }

    if (
      !matchesCondition(
        getPath(
          document,
          key
        ),
        expected
      )
    ) {
      return false;
    }
  }

  return true;
}

function sortDocuments(
  documents,
  sort
) {
  if (
    !sort ||
    typeof sort !==
      "object"
  ) {
    return documents;
  }

  const entries =
    Object.entries(
      sort
    );

  return [
    ...documents,
  ].sort(
    (
      first,
      second
    ) => {
      for (
        const [
          path,
          direction,
        ]
        of entries
      ) {
        const left =
          comparable(
            getPath(
              first,
              path
            )
          );

        const right =
          comparable(
            getPath(
              second,
              path
            )
          );

        if (
          left ===
          right
        ) {
          continue;
        }

        if (
          left ===
            undefined ||
          left ===
            null
        ) {
          return Number(
            direction
          ) >=
            0
            ? -1
            : 1;
        }

        if (
          right ===
            undefined ||
          right ===
            null
        ) {
          return Number(
            direction
          ) >=
            0
            ? 1
            : -1;
        }

        return (
          (
            left <
            right
              ? -1
              : 1
          ) *
          (
            Number(
              direction
            ) >=
              0
              ? 1
              : -1
          )
        );
      }

      return 0;
    }
  );
}

function selectDocument(
  document,
  select
) {
  if (!select) {
    return document;
  }

  const tokens =
    typeof select ===
      "string"
      ? select
          .trim()
          .split(
            /\s+/
          )
      : [];

  if (
    tokens.length ===
    0
  ) {
    return document;
  }

  const include =
    tokens.filter(
      (
        token
      ) =>
        !token.startsWith(
          "-"
        )
    );

  if (
    include.length ===
    0
  ) {
    const copy = {
      ...document,
    };

    for (
      const token
      of tokens
    ) {
      deletePath(
        copy,
        token.slice(
          1
        )
      );
    }

    return copy;
  }

  const output = {};

  if (
    document._id !==
    undefined
  ) {
    output._id =
      document._id;
  }

  for (
    const token
    of include
  ) {
    const value =
      getPath(
        document,
        token
      );

    if (
      value !==
      undefined
    ) {
      setPath(
        output,
        token,
        value
      );
    }
  }

  return output;
}

function applyUpdate(
  document,
  update = {}
) {
  const next =
    normalizeDocument(
      document
    );

  const hasOperator =
    Object.keys(
      update
    )
      .some(
        (
          key
        ) =>
          key.startsWith(
            "$"
          )
      );

  if (
    !hasOperator
  ) {
    return {
      ...next,
      ...normalizeDocument(
        update
      ),

      updatedAt:
        new Date(),
    };
  }

  for (
    const [
      path,
      value,
    ]
    of Object.entries(
      update.$set ||
      {}
    )
  ) {
    setPath(
      next,
      path,
      value
    );
  }

  for (
    const path
    of Object.keys(
      update.$unset ||
      {}
    )
  ) {
    deletePath(
      next,
      path
    );
  }

  for (
    const [
      path,
      value,
    ]
    of Object.entries(
      update.$inc ||
      {}
    )
  ) {
    setPath(
      next,
      path,
      Number(
        getPath(
          next,
          path
        ) ||
        0
      ) +
        Number(
          value ||
          0
        )
    );
  }

  for (
    const [
      path,
      value,
    ]
    of Object.entries(
      update.$push ||
      {}
    )
  ) {
    const current =
      Array.isArray(
        getPath(
          next,
          path
        )
      )
        ? [
            ...getPath(
              next,
              path
            ),
          ]
        : [];

    if (
      value &&
      typeof value ===
        "object" &&
      Array.isArray(
        value.$each
      )
    ) {
      current.push(
        ...value.$each
      );
    } else {
      current.push(
        value
      );
    }

    setPath(
      next,
      path,
      current
    );
  }

  for (
    const [
      path,
      value,
    ]
    of Object.entries(
      update.$addToSet ||
      {}
    )
  ) {
    const current =
      Array.isArray(
        getPath(
          next,
          path
        )
      )
        ? [
            ...getPath(
              next,
              path
            ),
          ]
        : [];

    const values =
      value &&
      typeof value ===
        "object" &&
      Array.isArray(
        value.$each
      )
        ? value.$each
        : [
            value,
          ];

    for (
      const candidate
      of values
    ) {
      if (
        !current.some(
          (
            item
          ) =>
            equalValue(
              item,
              candidate
            )
        )
      ) {
        current.push(
          candidate
        );
      }
    }

    setPath(
      next,
      path,
      current
    );
  }

  for (
    const [
      path,
      value,
    ]
    of Object.entries(
      update.$pull ||
      {}
    )
  ) {
    const current =
      Array.isArray(
        getPath(
          next,
          path
        )
      )
        ? [
            ...getPath(
              next,
              path
            ),
          ]
        : [];

    setPath(
      next,
      path,
      current.filter(
        (
          item
        ) =>
          !matchesCondition(
            item,
            value
          )
      )
    );
  }

  next.updatedAt =
    new Date();

  return next;
}

function extractEqualitySeed(
  filter = {}
) {
  const output = {};

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
      key.startsWith(
        "$"
      )
    ) {
      continue;
    }

    if (
      value &&
      typeof value ===
        "object" &&
      !Array.isArray(
        value
      )
    ) {
      continue;
    }

    setPath(
      output,
      key,
      value
    );
  }

  return output;
}

module.exports =
  PostgresOperationalDocumentRepository;