"use strict";

const express =
  require("express");

const Joi =
  require("joi");

const {
  acceptInvitation,
} =
  require(
    "../services/identity/organizationInvitationService"
  );

const router =
  express.Router();

const acceptanceSchema =
  Joi.object({
    fullName:
      Joi.string()
        .trim()
        .min(2)
        .max(120)
        .optional(),

    password:
      Joi.string()
        .min(12)
        .max(256)
        .optional(),
  })
    .unknown(false);

/**
 * ============================================================================
 * POST /api/v1/organization-invitations/:token/accept
 * ============================================================================
 *
 * Public bearer-token endpoint.
 *
 * Existing AIRA users:
 *   token is enough; they sign in normally afterwards.
 *
 * Brand-new users:
 *   fullName + password are required.
 *
 * No browser session is required because possession of the high-entropy,
 * single-use token is the invitation authentication factor.
 */

router.post(
  "/:token/accept",

  async (
    req,
    res,
    next
  ) => {
    try {
      const {
        error,
        value,
      } =
        acceptanceSchema
          .validate(
            req.body ||
              {},
            {
              abortEarly:
                false,

              stripUnknown:
                false,
            }
          );

      if (
        error
      ) {
        return res
          .status(
            422
          )
          .json({
            error:
              "Invalid invitation acceptance request",

            code:
              "VALIDATION_ERROR",

            details:
              error.details.map(
                (
                  detail
                ) => ({
                  field:
                    detail.path.join(
                      "."
                    ),

                  message:
                    detail.message,
                })
              ),
          });
      }

      const rawToken =
        String(
          req.params
            .token ||
          ""
        )
          .trim();

      if (
        !rawToken.startsWith(
          "aira_inv_"
        )
      ) {
        return res
          .status(
            404
          )
          .json({
            error:
              "Invitation is invalid",

            code:
              "INVITATION_INVALID",
          });
      }

      const result =
        await acceptInvitation({
          rawToken,

          fullName:
            value.fullName ||
            null,

          password:
            value.password ||
            null,
        });

      return res.json({
        accepted:
          true,

        organizationId:
          result
            .organizationId,

        membershipId:
          result
            .membershipId,

        role:
          result.role,

        alreadyMember:
          result
            .alreadyMember,

        /**
         * Do not automatically issue a browser session here.
         *
         * Existing/new users authenticate through the normal login flow.
         */
        next:
          "login",
      });
    } catch (
      error
    ) {
      return next(
        error
      );
    }
  }
);

module.exports =
  router;