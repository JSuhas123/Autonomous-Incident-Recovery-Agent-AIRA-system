"use strict";

const IncidentRepository =
  require(
    "../repositories/IncidentRepository"
  );

const PostgresTenantScope =
  require(
    "./PostgresTenantScope"
  );

const {
  normalizeId,
  createApplicationId,
  serializeDocument,
  reviveDocument,
  translatePostgresError,
} =
  require(
    "./postgresDomainMapper"
  );

const FILTER_COLUMNS = {
  serviceId:
    "service_id",

  monitorId:
    "monitor_id",

  fingerprint:
    "fingerprint",

  status:
    "status",

  correlationGroupId:
    "correlation_group_id",

  sourceEventId:
    "source_event_id",

  signalFingerprint:
    "signal_fingerprint",

  severity:
    "severity",

  source:
    "source",
};

class PostgresIncidentRepository
  extends IncidentRepository {
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

  async findOne(
    filter = {},
    transaction = null
  ) {
    const context =
      requireScope(
        filter
      );

    return this.scope.run(
      context,
      async (
        client,
        resolved
      ) => {
        const {
          where,
          values,
        } =
          this.buildFilter(
            filter,
            resolved
          );

        const result =
          await client.query(
            `
              SELECT *
              FROM incidents.incidents
              WHERE ${where}
              ORDER BY created_at DESC
              LIMIT 1
            `,
            values
          );

        if (
          result.rows.length ===
          0
        ) {
          return null;
        }

        return mapIncident(
          result.rows[0],
          context
        );
      },
      transaction
    );
  }

  async findMany(
    filter = {},
    transaction = null
  ) {
    const context =
      requireScope(
        filter
      );

    return this.scope.run(
      context,
      async (
        client,
        resolved
      ) => {
        const {
          where,
          values,
        } =
          this.buildFilter(
            filter,
            resolved
          );

        const result =
          await client.query(
            `
              SELECT *
              FROM incidents.incidents
              WHERE ${where}
              ORDER BY created_at ASC
            `,
            values
          );

        return result.rows.map(
          (
            row
          ) =>
            mapIncident(
              row,
              context
            )
        );
      },
      transaction
    );
  }

  async create(
    data,
    transaction = null
  ) {
    const context =
      requireScope(
        data
      );

    return this.scope.run(
      context,
      async (
        client,
        resolved
      ) => {
        const publicId =
          normalizeId(
            data._id
          ) ||
          createApplicationId();

        const document =
          serializeDocument({
            ...data,

            _id:
              publicId,

            organizationId:
              normalizeId(
                data.organizationId
              ),

            environmentId:
              normalizeId(
                data.environmentId
              ),

            serviceId:
              normalizeId(
                data.serviceId
              ),

            monitorId:
              normalizeId(
                data.monitorId
              ),
          });

        try {
          const result =
            await client.query(
              `
                INSERT INTO incidents.incidents (
                  public_id,
                  legacy_mongo_id,
                  tenant_public_id,
                  organization_id,
                  environment_id,
                  service_id,
                  monitor_id,
                  source,
                  source_event_id,
                  detection_method,
                  correlation_group_id,
                  primary_signal_id,
                  signal_ids,
                  signal_fingerprint,
                  providers,
                  provider_count,
                  evidence_count,
                  correlation_confidence,
                  fingerprint,
                  title,
                  description,
                  severity,
                  status,
                  impact,
                  started_at,
                  detected_at,
                  acknowledged_at,
                  resolved_at,
                  closed_at,
                  last_observed_at,
                  last_signal_at,
                  occurrence_count,
                  reopen_count,
                  last_reopened_at,
                  assigned_to,
                  assigned_at,
                  resolution,
                  resolution_type,
                  tags,
                  analysis_status,
                  analysis_started_at,
                  analysis_completed_at,
                  metadata,
                  document
                )
                VALUES (
                  $1,  $2,  $3,  $4,  $5,
                  $6,  $7,  $8,  $9,  $10,
                  $11, $12, $13, $14, $15,
                  $16, $17, $18, $19, $20,
                  $21, $22, $23, $24, $25,
                  $26, $27, $28, $29, $30,
                  $31, $32, $33, $34, $35,
                  $36, $37, $38, $39, $40,
                  $41, $42, $43::jsonb, $44::jsonb
                )
                RETURNING *
              `,
              buildIncidentValues(
                data,
                document,
                publicId,
                resolved
              )
            );

          return mapIncident(
            result.rows[0],
            context
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
  incident,
  transaction = null
) {
  if (
    !incident?._id ||
    !incident.organizationId ||
    !incident.environmentId
  ) {
    throw Object.assign(
      new Error(
        "PostgresIncidentRepository.save() requires a persisted incident with scope"
      ),
      {
        code:
          "INVALID_INCIDENT_DOCUMENT",
      }
    );
  }

  const context = {
    organizationId:
      incident.organizationId,

    environmentId:
      incident.environmentId,
  };

  return this.scope.run(
    context,
    async (
      client,
      resolved
    ) => {
      const document =
        serializeDocument(
          incident
        );

      const incidentId =
        normalizeId(
          incident._id
        );

      const values = [
        incident.tenantId ||
          null,

        normalizeId(
          incident.serviceId
        ),

        normalizeId(
          incident.monitorId
        ),

        incident.source ||
          null,

        incident.sourceEventId ||
          null,

        incident.detectionMethod ||
          null,

        incident.correlationGroupId ||
          null,

        incident.primarySignalId ||
          null,

        (
          incident.signalIds ||
          []
        ).map(
          normalizeId
        ),

        incident.signalFingerprint ||
          null,

        incident.providers ||
          [],

        Number(
          incident.providerCount ||
          0
        ),

        Number(
          incident.evidenceCount ||
          0
        ),

        incident
          .correlationConfidence ??
          null,

        incident.fingerprint ||
          null,

        incident.title ||
          null,

        incident.description ||
          null,

        incident.severity ||
          "warning",

        incident.status ||
          "open",

        incident.impact ||
          null,

        incident.startedAt ||
          null,

        incident.detectedAt ||
          null,

        incident.acknowledgedAt ||
          null,

        incident.resolvedAt ||
          null,

        incident.closedAt ||
          null,

        incident.lastObservedAt ||
          null,

        incident.lastSignalAt ||
          null,

        Number(
          incident.occurrenceCount ||
          0
        ),

        Number(
          incident.reopenCount ||
          0
        ),

        incident.lastReopenedAt ||
          null,

        normalizeId(
          incident.assignedTo
        ),

        incident.assignedAt ||
          null,

        incident.resolution ||
          null,

        incident.resolutionType ||
          null,

        incident.tags ||
          [],

        incident.analysisStatus ||
          null,

        incident.analysisStartedAt ||
          null,

        incident.analysisCompletedAt ||
          null,

        JSON.stringify(
          incident.metadata ||
          {}
        ),

        JSON.stringify(
          document
        ),

        resolved.organizationUuid,

        resolved.environmentUuid,

        incidentId,
      ];

      try {
        const result =
          await client.query(
            `
              UPDATE incidents.incidents
              SET
                tenant_public_id = $1,
                service_id = $2,
                monitor_id = $3,
                source = $4,
                source_event_id = $5,
                detection_method = $6,
                correlation_group_id = $7,
                primary_signal_id = $8,
                signal_ids = $9,
                signal_fingerprint = $10,
                providers = $11,
                provider_count = $12,
                evidence_count = $13,
                correlation_confidence = $14,
                fingerprint = $15,
                title = $16,
                description = $17,
                severity = $18,
                status = $19,
                impact = $20,
                started_at = $21,
                detected_at = $22,
                acknowledged_at = $23,
                resolved_at = $24,
                closed_at = $25,
                last_observed_at = $26,
                last_signal_at = $27,
                occurrence_count = $28,
                reopen_count = $29,
                last_reopened_at = $30,
                assigned_to = $31,
                assigned_at = $32,
                resolution = $33,
                resolution_type = $34,
                tags = $35,
                analysis_status = $36,
                analysis_started_at = $37,
                analysis_completed_at = $38,
                metadata = $39::jsonb,
                document = $40::jsonb
              WHERE
                organization_id = $41
                AND environment_id = $42
                AND (
                  public_id = $43
                  OR legacy_mongo_id = $43
                  OR id::text = $43
                )
              RETURNING *
            `,
            values
          );

        if (
          result.rows.length ===
          0
        ) {
          return null;
        }

        return mapIncident(
          result.rows[0],
          context
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

  buildFilter(
    filter,
    resolved
  ) {
    const clauses = [
      "organization_id = $1",
      "environment_id = $2",
    ];

    const values = [
      resolved.organizationUuid,
      resolved.environmentUuid,
    ];

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
          "organizationId" ||
        key ===
          "environmentId"
      ) {
        continue;
      }

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
            public_id = $${index}
            OR legacy_mongo_id = $${index}
            OR id::text = $${index}
          )`
        );

        continue;
      }

      const column =
        FILTER_COLUMNS[
          key
        ];

      if (!column) {
        throw Object.assign(
          new Error(
            `Unsupported PostgreSQL incident filter: ${key}`
          ),
          {
            code:
              "POSTGRES_INCIDENT_FILTER_UNSUPPORTED",

            field:
              key,
          }
        );
      }

      if (
        value &&
        typeof value ===
          "object" &&
        !Array.isArray(
          value
        )
      ) {
        if (
          Array.isArray(
            value.$in
          )
        ) {
          const index =
            values.push(
              value.$in.map(
                normalizeId
              )
            );

          clauses.push(
            `${column} = ANY($${index}::text[])`
          );

          continue;
        }

        throw Object.assign(
          new Error(
            `Unsupported PostgreSQL incident operator for ${key}`
          ),
          {
            code:
              "POSTGRES_INCIDENT_OPERATOR_UNSUPPORTED",

            field:
              key,
          }
        );
      }

      const index =
        values.push(
          normalizeId(
            value
          )
        );

      clauses.push(
        `${column} = $${index}`
      );
    }

    return {
      where:
        clauses.join(
          "\nAND "
        ),

      values,
    };
  }
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
        "PostgreSQL incident operations require organizationId and environmentId"
      ),
      {
        code:
          "POSTGRES_INCIDENT_SCOPE_REQUIRED",
      }
    );
  }

  return {
    organizationId:
      value.organizationId,

    environmentId:
      value.environmentId,
  };
}

function buildIncidentValues(
  incident,
  document,
  publicId,
  resolved
) {
  return [
    publicId,

    incident
      .legacyMongoId ||
      null,

    incident.tenantId ||
      null,

    resolved
      .organizationUuid,

    resolved
      .environmentUuid,

    normalizeId(
      incident.serviceId
    ),

    normalizeId(
      incident.monitorId
    ),

    incident.source ||
      null,

    incident.sourceEventId ||
      null,

    incident.detectionMethod ||
      null,

    incident.correlationGroupId ||
      null,

    incident.primarySignalId ||
      null,

    (
      incident.signalIds ||
      []
    ).map(
      normalizeId
    ),

    incident.signalFingerprint ||
      null,

    incident.providers ||
      [],

    Number(
      incident.providerCount ||
      0
    ),

    Number(
      incident.evidenceCount ||
      0
    ),

    incident
      .correlationConfidence ??
      null,

    incident.fingerprint ||
      null,

    incident.title ||
      null,

    incident.description ||
      null,

    incident.severity ||
      "warning",

    incident.status ||
      "open",

    incident.impact ||
      null,

    incident.startedAt ||
      null,

    incident.detectedAt ||
      null,

    incident.acknowledgedAt ||
      null,

    incident.resolvedAt ||
      null,

    incident.closedAt ||
      null,

    incident.lastObservedAt ||
      null,

    incident.lastSignalAt ||
      null,

    Number(
      incident.occurrenceCount ||
      0
    ),

    Number(
      incident.reopenCount ||
      0
    ),

    incident.lastReopenedAt ||
      null,

    normalizeId(
      incident.assignedTo
    ),

    incident.assignedAt ||
      null,

    incident.resolution ||
      null,

    incident.resolutionType ||
      null,

    incident.tags ||
      [],

    incident.analysisStatus ||
      null,

    incident.analysisStartedAt ||
      null,

    incident.analysisCompletedAt ||
      null,

    JSON.stringify(
      incident.metadata ||
      {}
    ),

    JSON.stringify(
      document
    ),
  ];
}

function mapIncident(
  row,
  context
) {
  const document =
    reviveDocument(
      row.document ||
      {}
    );

  return {
    ...document,

    _id:
      row.public_id,

    organizationId:
      document.organizationId ||
      normalizeId(
        context.organizationId
      ),

    environmentId:
      document.environmentId ||
      normalizeId(
        context.environmentId
      ),

    tenantId:
      row.tenant_public_id ??
      document.tenantId ??
      null,

    serviceId:
      row.service_id ??
      document.serviceId ??
      null,

    monitorId:
      row.monitor_id ??
      document.monitorId ??
      null,

    fingerprint:
      row.fingerprint,

    status:
      row.status,

    severity:
      row.severity,

    occurrenceCount:
      row.occurrence_count,

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,
  };
}

module.exports =
  PostgresIncidentRepository;