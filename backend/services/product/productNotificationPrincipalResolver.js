"use strict";


const PostgresTenantScope =
  require(
    "../../persistence/postgres/PostgresTenantScope"
  );


function createError(
  message,
  code,
  status = 400
) {
  return Object.assign(
    new Error(
      message
    ),
    {
      code,
      status,

      executionAuthorized:
        false,
    }
  );
}


class ProductNotificationPrincipalResolver {
  constructor(
    options = {}
  ) {
    this.scope =
      options.scope ||
      new PostgresTenantScope({
        pool:
          options.pool ||
          null,
      });
  }


  async resolve({
    organizationId,
    environmentId,
    userId,
    membershipId,
  }) {
    if (
      !organizationId ||
      !environmentId ||
      !userId ||
      !membershipId
    ) {
      throw createError(
        "Complete product notification principal context is required",
        "PRODUCT_NOTIFICATION_PRINCIPAL_CONTEXT_REQUIRED",
        400
      );
    }


    return this.scope.run(
      {
        organizationId,
        environmentId,
      },

      async (
        client,
        resolved
      ) => {
        /*
         * The authenticated browser/session layer may expose:
         *
         * - PostgreSQL UUID
         * - public_id
         * - legacy_mongo_id
         *
         * Product notification persistence uses physical PostgreSQL UUID
         * foreign keys.
         *
         * Resolve BOTH the user and membership under the already-resolved
         * organization boundary.
         */
        const result =
          await client.query(
            `
              SELECT
                  u.id
                      AS user_uuid,

                  u.public_id
                      AS user_public_id,

                  m.id
                      AS membership_uuid,

                  m.public_id
                      AS membership_public_id,

                  m.role
                      AS membership_role,

                  m.status
                      AS membership_status

              FROM
                  identity.organization_memberships m

              JOIN
                  identity.users u

              ON
                  u.id =
                      m.user_id

              WHERE
                  m.organization_id =
                      $1

                  AND

                  (
                      u.id::text =
                          $2

                      OR

                      u.public_id =
                          $2

                      OR

                      u.legacy_mongo_id =
                          $2
                  )

                  AND

                  (
                      m.id::text =
                          $3

                      OR

                      m.public_id =
                          $3

                      OR

                      m.legacy_mongo_id =
                          $3
                  )

                  AND

                  m.status =
                      'active'

              LIMIT 1
            `,
            [
              resolved.organizationUuid,

              String(
                userId
              ),

              String(
                membershipId
              ),
            ]
          );


        const row =
          result.rows[0];


        if (
          !row
        ) {
          throw createError(
            "Authenticated notification principal could not be resolved inside the organization",
            "PRODUCT_NOTIFICATION_PRINCIPAL_NOT_FOUND",
            403
          );
        }


        return {
          organizationId:
            resolved.organizationUuid,

          environmentId:
            resolved.environmentUuid,

          userId:
            row.user_uuid,

          membershipId:
            row.membership_uuid,

          userPublicId:
            row.user_public_id,

          membershipPublicId:
            row.membership_public_id,

          role:
            row.membership_role,

          status:
            row.membership_status,

          executionAuthorized:
            false,
        };
      }
    );
  }
}


const productNotificationPrincipalResolver =
  new ProductNotificationPrincipalResolver();


module.exports =
  productNotificationPrincipalResolver;


module.exports
  .ProductNotificationPrincipalResolver =
  ProductNotificationPrincipalResolver;