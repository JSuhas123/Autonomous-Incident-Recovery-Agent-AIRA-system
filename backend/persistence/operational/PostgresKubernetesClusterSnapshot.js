"use strict";

const crypto =
  require(
    "node:crypto"
  );

const {
  getPostgresPool,
} =
  require(
    "../postgres/postgresPool"
  );

class PostgresKubernetesClusterSnapshot {
  static async create(
    data = {}
  ) {
    if (!data.tenantId) {
      throw Object.assign(
        new Error(
          "Kubernetes cluster snapshot requires tenantId"
        ),
        {
          code:
            "KUBERNETES_SNAPSHOT_TENANT_REQUIRED",
        }
      );
    }

    if (!data.organizationId) {
      throw Object.assign(
        new Error(
          "Kubernetes cluster snapshot requires organizationId"
        ),
        {
          code:
            "KUBERNETES_SNAPSHOT_ORGANIZATION_REQUIRED",
        }
      );
    }

    if (!data.integrationId) {
      throw Object.assign(
        new Error(
          "Kubernetes cluster snapshot requires integrationId"
        ),
        {
          code:
            "KUBERNETES_SNAPSHOT_INTEGRATION_REQUIRED",
        }
      );
    }

    const pool =
      getPostgresPool();

    const id =
      crypto.randomUUID();

    const discoveredAt =
      data.discoveredAt ||
      new Date();

    const summary = {
      namespaces:
        Number(
          data.summary?.namespaces ||
          0
        ),

      deployments:
        Number(
          data.summary?.deployments ||
          0
        ),

      pods:
        Number(
          data.summary?.pods ||
          0
        ),

      services:
        Number(
          data.summary?.services ||
          0
        ),

      replicaSets:
        Number(
          data.summary?.replicaSets ||
          0
        ),

      nodes:
        Number(
          data.summary?.nodes ||
          0
        ),

      unhealthyPods:
        Number(
          data.summary?.unhealthyPods ||
          0
        ),

      unhealthyNodes:
        Number(
          data.summary?.unhealthyNodes ||
          0
        ),
    };

    const result =
      await pool.query(
        `
          INSERT INTO inventory.kubernetes_cluster_snapshots (
            id,
            tenant_id,
            organization_id,
            environment_id,
            integration_id,
            discovered_at,
            summary,
            duration_ms,
            success,
            error,
            created_at,
            updated_at
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7::jsonb,
            $8,
            $9,
            $10,
            NOW(),
            NOW()
          )
          RETURNING *
        `,
        [
          id,
          String(data.tenantId),
          String(data.organizationId),

          data.environmentId
            ? String(
                data.environmentId
              )
            : null,

          String(data.integrationId),

          discoveredAt,

          JSON.stringify(
            summary
          ),

          data.durationMs ??
            null,

          data.success !==
            false,

          data.error ??
            null,
        ]
      );

    const row =
      result.rows[0];

    return {
      _id:
        row.id,

      id:
        row.id,

      tenantId:
        row.tenant_id,

      organizationId:
        row.organization_id,

      environmentId:
        row.environment_id,

      integrationId:
        row.integration_id,

      discoveredAt:
        row.discovered_at,

      summary:
        row.summary ||
        summary,

      durationMs:
        row.duration_ms,

      success:
        row.success,

      error:
        row.error,

      createdAt:
        row.created_at,

      updatedAt:
        row.updated_at,
    };
  }
}

module.exports =
  PostgresKubernetesClusterSnapshot;