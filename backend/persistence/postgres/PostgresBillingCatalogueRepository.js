"use strict";

const {
  getPostgresPool,
} =
  require(
    "./postgresPool"
  );


class PostgresBillingCatalogueRepository {

  constructor(
    options = {}
  ) {
    this.pool =
      options.pool ||
      getPostgresPool();
  }


  async query(
    text,
    values = []
  ) {
    return this.pool
      .query(
        text,
        values
      );
  }


  async findPlanVersionForSubscription(
    subscription
  ) {
    if (
      subscription
        ?.planVersionId
    ) {
      const result =
        await this.query(
          `
            SELECT
              pv.id,
              pv.version_code,
              pv.status,

              p.code AS
                plan_code,

              p.name AS
                plan_name

            FROM billing.plan_versions pv

            JOIN billing.plans p
              ON p.id =
                pv.plan_id

            WHERE
              pv.id = $1

            LIMIT 1
          `,
          [
            subscription
              .planVersionId,
          ]
        );


      if (
        result.rows[0]
      ) {
        return result
          .rows[0];
      }
    }


    const result =
      await this.query(
        `
          SELECT
            pv.id,
            pv.version_code,
            pv.status,

            p.code AS
              plan_code,

            p.name AS
              plan_name

          FROM billing.plans p

          JOIN billing.plan_versions pv
            ON pv.plan_id =
              p.id

          WHERE
            p.code = $1
            AND pv.status =
              'active'

          ORDER BY
            pv.effective_at DESC

          LIMIT 1
        `,
        [
          subscription
            ?.plan,
        ]
      );


    return (
      result.rows[0] ||
      null
    );
  }


  async getEffectiveEntitlements(
    organizationId
  ) {
    const result =
      await this.query(
        `
          SELECT
            entitlement_key,
            value_type,
            boolean_value,
            integer_value,
            text_value,
            json_value,
            overridden

          FROM
            billing.effective_entitlements

          WHERE
            organization_id = (
              SELECT id
              FROM tenancy.organizations
              WHERE
                id::text = $1
                OR public_id = $1
                OR legacy_mongo_id = $1
              LIMIT 1
            )

          ORDER BY
            entitlement_key ASC
        `,
        [
          String(
            organizationId
          ),
        ]
      );


    return result
      .rows;
  }


  async getMeterDefinitions() {
    const result =
      await this.query(
        `
          SELECT
            id,
            meter_code,
            version,
            name,
            description,
            unit,
            aggregation_type,
            billable,
            economic,
            status,
            metadata,
            created_at

          FROM
            billing.meter_definitions

          WHERE
            status =
              'active'

          ORDER BY
            meter_code ASC,
            version DESC
        `
      );


    return result
      .rows;
  }


  async getMeterDefinition(
    meterCode
  ) {
    const result =
      await this.query(
        `
          SELECT
            id,
            meter_code,
            version,
            name,
            description,
            unit,
            aggregation_type,
            billable,
            economic,
            status,
            metadata,
            created_at

          FROM
            billing.meter_definitions

          WHERE
            meter_code = $1
            AND status =
              'active'

          ORDER BY
            version DESC

          LIMIT 1
        `,
        [
          meterCode,
        ]
      );


    return (
      result.rows[0] ||
      null
    );
  }
}


module.exports =
  PostgresBillingCatalogueRepository;