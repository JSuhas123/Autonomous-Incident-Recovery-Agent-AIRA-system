"use strict";

const crypto =
  require(
    "node:crypto"
  );

const SignalCorrelationRepository =
  require(
    "../repositories/SignalCorrelationRepository"
  );

const PostgresTenantScope =
  require(
    "./PostgresTenantScope"
  );

const {
  normalizeId,
} =
  require(
    "./postgresDomainMapper"
  );

class PostgresSignalCorrelationRepository
  extends SignalCorrelationRepository {
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

  async upsertGroup(
    scope,
    correlationGroupId,
    update,
    transaction = null
  ) {
    return this.scope.run(
      scope,
      async (
        client,
        resolved
      ) => {
        const existing =
          await this.findRow(
            client,
            correlationGroupId
          );

        const set =
          update?.set ||
          {};

        const signalIds =
          [
            ...new Set([
              ...(
                existing
                  ?.signal_ids ||
                []
              ),

              ...(
                update
                  ?.addSignalIds ||
                []
              ),
            ]),
          ];

        const databaseId =
          existing
            ?.database_id ||
          crypto
            .randomBytes(
              12
            )
            .toString(
              "hex"
            );

        let incidentUuid =
          existing
            ?.incident_id ||
          null;

        if (
          set.incidentId
        ) {
          const incident =
            await this.scope
              .identityResolver
              .resolveIncident(
                client,
                resolved,
                set.incidentId
              );

          incidentUuid =
            incident?.id ||
            null;
        }

        const result =
          await client.query(
            `
              INSERT INTO signals.correlation_groups (
                public_id,
                database_id,
                tenant_public_id,
                organization_id,
                environment_id,
                primary_signal_id,
                service_id,
                status,
                providers,
                signal_types,
                signal_ids,
                highest_severity,
                confidence_score,
                incident_candidate,
                incident_candidate_reason,
                incident_id,
                signal_count,
                provider_count,
                evidence,
                first_observed_at,
                last_observed_at,
                routed_at,
                closed_at,
                document
              )
              VALUES (
                $1, $2, $3, $4, $5,
                $6, $7, $8, $9, $10,
                $11, $12, $13, $14, $15,
                $16, $17, $18, $19::jsonb, $20,
                $21, $22, $23, $24::jsonb
              )
              ON CONFLICT (
                organization_id,
                environment_id,
                public_id
              )
              DO UPDATE SET
                database_id =
                  EXCLUDED.database_id,
                tenant_public_id =
                  EXCLUDED.tenant_public_id,
                primary_signal_id =
                  EXCLUDED.primary_signal_id,
                service_id =
                  EXCLUDED.service_id,
                status =
                  EXCLUDED.status,
                providers =
                  EXCLUDED.providers,
                signal_types =
                  EXCLUDED.signal_types,
                signal_ids =
                  EXCLUDED.signal_ids,
                highest_severity =
                  EXCLUDED.highest_severity,
                confidence_score =
                  EXCLUDED.confidence_score,
                incident_candidate =
                  EXCLUDED.incident_candidate,
                incident_candidate_reason =
                  EXCLUDED.incident_candidate_reason,
                incident_id =
                  EXCLUDED.incident_id,
                signal_count =
                  EXCLUDED.signal_count,
                provider_count =
                  EXCLUDED.provider_count,
                evidence =
                  EXCLUDED.evidence,
                first_observed_at =
                  EXCLUDED.first_observed_at,
                last_observed_at =
                  EXCLUDED.last_observed_at,
                routed_at =
                  EXCLUDED.routed_at,
                closed_at =
                  EXCLUDED.closed_at,
                document =
                  EXCLUDED.document
              RETURNING *
            `,
            [
              correlationGroupId,

              databaseId,

              set.tenantId ||
                existing
                  ?.tenant_public_id ||
                null,

              resolved.organizationUuid,

              resolved.environmentUuid,

              set.primarySignalId ||
                existing
                  ?.primary_signal_id ||
                null,

              normalizeId(
                set.serviceId ||
                existing
                  ?.service_id
              ),

              set.status ||
                existing
                  ?.status ||
                "forming",

              set.providers ||
                existing
                  ?.providers ||
                [],

              set.signalTypes ||
                existing
                  ?.signal_types ||
                [],

              signalIds,

              set.highestSeverity ||
                existing
                  ?.highest_severity ||
                "unknown",

              set.confidenceScore ??
                existing
                  ?.confidence_score ??
                0,

              set.incidentCandidate ??
                existing
                  ?.incident_candidate ??
                false,

              set.incidentCandidateReason ??
                existing
                  ?.incident_candidate_reason ??
                null,

              incidentUuid,

              set.signalCount ??
                signalIds.length,

              set.providerCount ??
                (
                  set.providers ||
                  existing
                    ?.providers ||
                  []
                ).length,

              JSON.stringify(
                set.evidence ||
                existing
                  ?.evidence ||
                []
              ),

              set.firstObservedAt ||
                existing
                  ?.first_observed_at ||
                new Date(),

              set.lastObservedAt ||
                existing
                  ?.last_observed_at ||
                new Date(),

              set.routedAt ||
                existing
                  ?.routed_at ||
                null,

              set.closedAt ||
                existing
                  ?.closed_at ||
                null,

              JSON.stringify({
                ...(
                  existing
                    ?.document ||
                  {}
                ),

                ...set,

                correlationGroupId,

                signalIds,

                _id:
                  databaseId,
              }),
            ]
          );

        return mapGroup(
          result.rows[0],
          scope
        );
      },
      transaction
    );
  }

  async findGroup(
    scope,
    correlationGroupId,
    transaction = null
  ) {
    return this.scope.run(
      scope,
      async (
        client
      ) => {
        const row =
          await this.findRow(
            client,
            correlationGroupId
          );

        return row
          ? mapGroup(
              row,
              scope
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
    const scope = {
      organizationId:
        filter.organizationId,

      environmentId:
        filter.environmentId,
    };

    return this.scope.run(
      scope,
      async (
        client
      ) => {
        let row =
          null;

        if (
          filter._id
        ) {
          const result =
            await client.query(
              `
                SELECT *
                FROM signals.correlation_groups
                WHERE
                  database_id = $1
                  OR id::text = $1
                LIMIT 1
              `,
              [
                normalizeId(
                  filter._id
                ),
              ]
            );

          row =
            result.rows[0] ||
            null;
        } else if (
          filter.correlationGroupId
        ) {
          row =
            await this.findRow(
              client,
              filter
                .correlationGroupId
            );
        }

        if (!row) {
          return {
            acknowledged:
              true,

            matchedCount:
              0,

            modifiedCount:
              0,
          };
        }

        const set =
          update?.$set ||
          {};

        const group =
          mapGroup(
            row,
            scope
          );

        Object.assign(
          group,
          set
        );

        await this.upsertGroup(
          scope,
          group.correlationGroupId,
          {
            set:
              group,

            addSignalIds:
              [],
          },
          {
            kind:
              "postgres",

            client,
          }
        );

        return {
          acknowledged:
            true,

          matchedCount:
            1,

          modifiedCount:
            1,
        };
      },
      transaction
    );
  }

  async findRow(
    client,
    correlationGroupId
  ) {
    const result =
      await client.query(
        `
          SELECT *
          FROM signals.correlation_groups
          WHERE public_id = $1
          LIMIT 1
        `,
        [
          correlationGroupId,
        ]
      );

    return result.rows[0] ||
      null;
  }
}

function mapGroup(
  row,
  scope
) {
  return {
    ...(
      row.document ||
      {}
    ),

    _id:
      row.database_id ||
      row.id,

    organizationId:
      normalizeId(
        scope.organizationId
      ),

    environmentId:
      normalizeId(
        scope.environmentId
      ),

    tenantId:
      row.tenant_public_id,

    correlationGroupId:
      row.public_id,

    status:
      row.status,

    signalIds:
      row.signal_ids ||
      [],

    primarySignalId:
      row.primary_signal_id,

    serviceId:
      row.service_id,

    providers:
      row.providers ||
      [],

    signalTypes:
      row.signal_types ||
      [],

    highestSeverity:
      row.highest_severity,

    confidenceScore:
      Number(
        row.confidence_score ||
        0
      ),

    incidentCandidate:
      row.incident_candidate,

    incidentCandidateReason:
      row.incident_candidate_reason,

    signalCount:
      row.signal_count,

    providerCount:
      row.provider_count,

    evidence:
      row.evidence ||
      [],

    firstObservedAt:
      row.first_observed_at,

    lastObservedAt:
      row.last_observed_at,

    routedAt:
      row.routed_at,

    closedAt:
      row.closed_at,

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,
  };
}

module.exports =
  PostgresSignalCorrelationRepository;