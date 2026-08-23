"use strict";

const CorrelationTopologyRepository =
  require(
    "../repositories/CorrelationTopologyRepository"
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

class PostgresCorrelationTopologyRepository
  extends CorrelationTopologyRepository {
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

  async hasServiceDependency(
    scope,
    firstServiceId,
    secondServiceId,
    transaction = null
  ) {
    if (
      !firstServiceId ||
      !secondServiceId
    ) {
      return false;
    }

    return this.scope.run(
      scope,
      async (
        client
      ) => {
        const result =
          await client.query(
            `
              SELECT 1
              FROM resources.service_dependencies
              WHERE
                active = TRUE
                AND (
                  (
                    source_service_id = $1
                    AND target_service_id = $2
                  )
                  OR
                  (
                    source_service_id = $2
                    AND target_service_id = $1
                  )
                )
              LIMIT 1
            `,
            [
              normalizeId(
                firstServiceId
              ),

              normalizeId(
                secondServiceId
              ),
            ]
          );

        return result.rows.length >
          0;
      },
      transaction
    );
  }

  async hasResourceRelationship(
    scope,
    firstNode,
    secondNode,
    transaction = null
  ) {
    if (
      !firstNode?.id ||
      !firstNode?.type ||
      !secondNode?.id ||
      !secondNode?.type
    ) {
      return false;
    }

    return this.scope.run(
      scope,
      async (
        client
      ) => {
        const result =
          await client.query(
            `
              SELECT 1
              FROM resources.correlation_resource_relationships
              WHERE
                active = TRUE
                AND (
                  (
                    source_type = $1
                    AND source_id = $2
                    AND target_type = $3
                    AND target_id = $4
                  )
                  OR
                  (
                    source_type = $3
                    AND source_id = $4
                    AND target_type = $1
                    AND target_id = $2
                  )
                )
              LIMIT 1
            `,
            [
              firstNode.type,

              normalizeId(
                firstNode.id
              ),

              secondNode.type,

              normalizeId(
                secondNode.id
              ),
            ]
          );

        return result.rows.length >
          0;
      },
      transaction
    );
  }
}

module.exports =
  PostgresCorrelationTopologyRepository;