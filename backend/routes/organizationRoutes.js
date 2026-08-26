"use strict";

/**
 * ============================================================================
 * AIRA PHASE 14.3 — ORGANIZATION CONTROL PLANE
 * ============================================================================
 *
 * Organization-scoped SaaS control-plane API.
 *
 * Responsibilities introduced in this stage:
 *
 * 14.3A
 *   - Read active organization
 *   - Update organization settings
 *   - Expose current caller membership / permissions
 *
 * 14.3B
 *   - List organization members
 *   - Read an individual membership
 *   - Expose canonical system roles
 *
 * Future 14.3 stages:
 *
 * 14.3C
 *   - Invitation lifecycle
 *
 * 14.3D
 *   - Membership role/status mutations
 *
 * 14.3E
 *   - Teams
 *
 * SECURITY INVARIANTS
 *
 * - organizationId always comes from authenticated context
 * - browser payloads cannot select another organization
 * - membership queries are always organization scoped
 * - permissions, not hardcoded role names, authorize routes
 * - user credential/security data is never returned
 */

const express =
  require(
    "express"
  );

const Joi =
  require(
    "joi"
  );

const {
  organizationRepository,
  organizationMembershipRepository,
  userRepository,
} =
  require(
    "../persistence/repositories"
  );

  const {
  userSessionRepository,
} =
  require(
    "../persistence/repositories"
  );

const {
  ORGANIZATION_ROLES,
} =
  require(
    "../constants/roles"
  );

const {
  createInvitation,
  listInvitations,
  resendInvitation,
  revokeInvitation,
  INVITABLE_ROLES,
} =
  require(
    "../services/identity/organizationInvitationService"
  );

const {
  listTeams,
  getTeam,
  createTeam,
  updateTeam,
  archiveTeam,
  listTeamMembers,
  addTeamMember,
  removeTeamMember,
} =
  require(
    "../services/identity/organizationTeamService"
  );

const {
  record:
    auditRecord,
} =
  require(
    "../services/identity/identityAuditService"
  );

const {
  browserOrganizationContext,
} =
  require(
    "../middleware/contextMiddleware"
  );

const {
  PERMISSIONS,
} =
  require(
    "../constants/permissions"
  );

const {
  requirePermission,
} =
  require(
    "../middleware/authorizationMiddleware"
  );

const {
  ORGANIZATION_ROLE_VALUES,
} =
  require(
    "../constants/roles"
  );

const {
  getPermissionsForRole,
} =
  require(
    "../constants/rolePermissions"
  );

const router =
  express.Router();

// ============================================================================
// VALIDATION
// ============================================================================

const updateOrganizationSchema =
  Joi.object({
    name:
      Joi.string()
        .trim()
        .min(2)
        .max(120)
        .optional(),

    settings:
      Joi.object()
        .unknown(true)
        .optional(),
  })
    .min(1)
    .unknown(false);

// ============================================================================
// SERIALIZATION
// ============================================================================

function asId(
  value
) {
  if (
    value == null
  ) {
    return null;
  }

  return (
    value
      ?.toString?.() ??
    value
  );
}

function safeOrganization(
  organization
) {
  if (
    !organization
  ) {
    return null;
  }

  return {
    id:
      asId(
        organization._id
      ),

    tenantId:
      organization.tenantId ??
      organization.tenantPublicId ??
      null,

    name:
      organization.name,

    slug:
      organization.slug,

    status:
      organization.status,

    settings:
      organization.settings ??
      {},

    metadata:
      organization.metadata ??
      {},

    createdAt:
      organization.createdAt ??
      null,

    updatedAt:
      organization.updatedAt ??
      null,
  };
}

function safeUser(
  user
) {
  if (
    !user
  ) {
    return null;
  }

  return {
    id:
      asId(
        user._id
      ),

    fullName:
      user.fullName ??
      null,

    email:
      user.email ??
      null,

    status:
      user.status ??
      null,

    lastLoginAt:
      user.lastLoginAt ??
      null,

    createdAt:
      user.createdAt ??
      null,
  };
}

function safeMembership(
  membership,
  user = null
) {
  if (
    !membership
  ) {
    return null;
  }

  return {
    id:
      asId(
        membership._id
      ),

    organizationId:
      asId(
        membership
          .organizationId
      ),

    userId:
      asId(
        membership.userId
      ),

    role:
      membership.role,

    permissions:
      getPermissionsForRole(
        membership.role
      ),

    status:
      membership.status,

    projectIds:
      (
        membership.projectIds ||
        []
      ).map(
        asId
      ),

    invitedByUserId:
      asId(
        membership
          .invitedByUserId
      ),

    joinedAt:
      membership.joinedAt ??
      null,

    suspendedAt:
      membership.suspendedAt ??
      null,

    createdAt:
      membership.createdAt ??
      null,

    updatedAt:
      membership.updatedAt ??
      null,

    user:
      safeUser(
        user
      ),
  };
}

const createTeamSchema =
  Joi.object({
    name:
      Joi.string()
        .trim()
        .min(2)
        .max(120)
        .required(),

    description:
      Joi.string()
        .trim()
        .max(1000)
        .allow(
          "",
          null
        )
        .optional(),

    metadata:
      Joi.object()
        .unknown(true)
        .default({}),
  })
    .unknown(false);


const updateTeamSchema =
  Joi.object({
    name:
      Joi.string()
        .trim()
        .min(2)
        .max(120)
        .optional(),

    description:
      Joi.string()
        .trim()
        .max(1000)
        .allow(
          "",
          null
        )
        .optional(),

    metadata:
      Joi.object()
        .unknown(true)
        .optional(),
  })
    .min(1)
    .unknown(false);


const addTeamMemberSchema =
  Joi.object({
    membershipId:
      Joi.string()
        .trim()
        .required(),
  })
    .unknown(false);

const createInvitationSchema =
  Joi.object({
    email:
      Joi.string()
        .trim()
        .lowercase()
        .email()
        .max(320)
        .required(),

    role:
      Joi.string()
        .valid(
          ...[
            ...INVITABLE_ROLES,
          ]
        )
        .required(),

    expiresInHours:
      Joi.number()
        .integer()
        .min(1)
        .max(168)
        .default(72),
  })
    .unknown(false);

const updateMembershipSchema =
  Joi.object({
    role:
      Joi.string()
        .valid(
          ...ORGANIZATION_ROLE_VALUES
        )
        .optional(),

    status:
      Joi.string()
        .valid(
          "active",
          "suspended"
        )
        .optional(),
  })
    .min(1)
    .unknown(false);

// ============================================================================
// HELPERS
// ============================================================================

function createError(
  message,
  status,
  code
) {
  const error =
    new Error(
      message
    );

  error.status =
    status;

  error.code =
    code;

  return error;
}

async function requireCurrentOrganization(
  req
) {
  const organizationId =
    req.context
      ?.organizationId;

  if (
    !organizationId
  ) {
    throw createError(
      "Organization context is required",
      400,
      "ORGANIZATION_REQUIRED"
    );
  }

  const organization =
    await organizationRepository
      .findOne({
        _id:
          organizationId,

        status:
          "active",
      });

  if (
    !organization
  ) {
    throw createError(
      "Organization not found",
      404,
      "ORGANIZATION_NOT_FOUND"
    );
  }

  return organization;
}

async function getScopedMembership(
  req,
  membershipId
) {
  if (
    !membershipId
  ) {
    throw createError(
      "Membership ID is required",
      400,
      "MEMBERSHIP_ID_REQUIRED"
    );
  }

  const membership =
    await organizationMembershipRepository
      .findOne({
        _id:
          membershipId,

        organizationId:
          req.context
            .organizationId,
      });

  if (
    !membership
  ) {
    /**
     * Intentional 404.
     *
     * Do not expose whether the supplied membership ID exists in
     * another organization.
     */
    throw createError(
      "Membership not found",
      404,
      "MEMBERSHIP_NOT_FOUND"
    );
  }

  return membership;
}

async function resolveMembershipUser(
  membership
) {
  if (
    !membership
      ?.userId
  ) {
    return null;
  }

  try {
    return (
      await userRepository
        .findById(
          membership.userId
        )
    );
  } catch {
    return null;
  }
}

// ============================================================================
// ORGANIZATION CONTEXT
// ============================================================================

router.use(
  ...browserOrganizationContext
);

// ============================================================================
// GET /api/v1/organizations/current
//
// Read the organization attached to the authenticated browser session.
// ============================================================================

router.get(
  "/current",

  requirePermission(
    PERMISSIONS
      .ORGANIZATION_READ
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      const organization =
        await requireCurrentOrganization(
          req
        );

      return res.json({
        organization:
          safeOrganization(
            organization
          ),

        context: {
          userId:
            asId(
              req.context
                .userId
            ),

          membershipId:
            asId(
              req.context
                .membershipId
            ),

          role:
            req.context
              .role,

          permissions:
            getPermissionsForRole(
              req.context
                .role
            ),
        },
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

// ============================================================================
// PATCH /api/v1/organizations/current
//
// Update SaaS organization configuration.
//
// Browser clients cannot alter:
//
// - organization ID
// - tenant ID
// - slug
// - status
// - creator
//
// Those require dedicated lifecycle operations.
// ============================================================================

router.patch(
  "/current",

  requirePermission(
    PERMISSIONS
      .ORGANIZATION_MANAGE
  ),

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
        updateOrganizationSchema
          .validate(
            req.body,
            {
              abortEarly:
                true,

              stripUnknown:
                false,
            }
          );

      if (
        error
      ) {
        throw createError(
          error
            .details?.[0]
            ?.message ||
          "Invalid organization update",
          422,
          "VALIDATION_ERROR"
        );
      }

      const organization =
        await requireCurrentOrganization(
          req
        );

      const update =
        {};

      if (
        value.name !==
        undefined
      ) {
        update.name =
          value.name;
      }

      if (
        value.settings !==
        undefined
      ) {
        /**
         * Preserve existing settings while allowing controlled
         * organization-level configuration expansion.
         */
        update.settings = {
          ...(
            organization.settings ||
            {}
          ),

          ...value.settings,
        };
      }

      await organizationRepository
        .updateOne(
          {
            _id:
              req.context
                .organizationId,
          },
          update
        );

      const updated =
        await organizationRepository
          .findById(
            req.context
              .organizationId
          );

      return res.json({
        organization:
          safeOrganization(
            updated
          ),
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

// ============================================================================
// GET /api/v1/organizations/current/roles
//
// Returns the supported system roles and their permission bundles.
//
// This is metadata, not authorization.
//
// Authorization still occurs server-side.
// ============================================================================

router.get(
  "/current/roles",

  requirePermission(
    PERMISSIONS
      .ORGANIZATION_READ
  ),

  async (
    _req,
    res,
    next
  ) => {
    try {
      return res.json({
        roles:
          ORGANIZATION_ROLE_VALUES
            .map(
              (
                role
              ) => ({
                role,

                permissions:
                  getPermissionsForRole(
                    role
                  ),
              })
            ),
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

// ============================================================================
// GET /api/v1/organizations/current/members
//
// Organization member directory.
//
// We intentionally include invited/suspended memberships.
//
// Removed memberships are hidden from the normal active directory but remain
// persisted for historical/audit purposes.
// ============================================================================

router.get(
  "/current/members",

  requirePermission(
    PERMISSIONS
      .ORGANIZATION_READ
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      await requireCurrentOrganization(
        req
      );

      const memberships =
        await organizationMembershipRepository
          .findMany({
            organizationId:
              req.context
                .organizationId,
          });

      const visibleMemberships =
        (
          memberships ||
          []
        ).filter(
          (
            membership
          ) =>
            membership.status !==
            "removed"
        );

      const members =
        await Promise.all(
          visibleMemberships
            .map(
              async (
                membership
              ) => {
                const user =
                  await resolveMembershipUser(
                    membership
                  );

                return safeMembership(
                  membership,
                  user
                );
              }
            )
        );

      return res.json({
        organizationId:
          asId(
            req.context
              .organizationId
          ),

        count:
          members.length,

        members,
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

// ============================================================================
// GET /api/v1/organizations/current/members/:membershipId
//
// Membership IDs from another tenant deliberately resolve as 404.
// ============================================================================

router.get(
  "/current/members/:membershipId",

  requirePermission(
    PERMISSIONS
      .ORGANIZATION_READ
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      const membership =
        await getScopedMembership(
          req,
          req.params
            .membershipId
        );

      if (
        membership.status ===
        "removed"
      ) {
        throw createError(
          "Membership not found",
          404,
          "MEMBERSHIP_NOT_FOUND"
        );
      }

      const user =
        await resolveMembershipUser(
          membership
        );

      return res.json({
        membership:
          safeMembership(
            membership,
            user
          ),
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

// ============================================================================
// PHASE 14.3C — INVITATIONS
// ============================================================================

// ----------------------------------------------------------------------------
// POST /current/invitations
// ----------------------------------------------------------------------------

router.post(
  "/current/invitations",

  requirePermission(
    PERMISSIONS
      .MEMBER_INVITE
  ),

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
        createInvitationSchema
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
        throw createError(
          error.details
            ?.[0]
            ?.message ||
            "Invalid invitation",
          422,
          "VALIDATION_ERROR"
        );
      }

      const result =
        await createInvitation({
          organizationId:
            req.context
              .organizationId,

          email:
            value.email,

          role:
            value.role,

          invitedByUserId:
            req.context
              .userId,

          expiresInHours:
            value
              .expiresInHours,
        });

      const response = {
        invitation:
          result.invitation,
      };

      /**
       * Until Phase 14 communication/email delivery is wired, expose the raw
       * token ONLY outside production so local development can exercise the
       * complete acceptance flow.
       */
      if (
        process.env
          .NODE_ENV !==
        "production"
      ) {
        response
          .invitationToken =
          result.token;
      }

      return res
        .status(
          201
        )
        .json(
          response
        );
    } catch (
      error
    ) {
      return next(
        error
      );
    }
  }
);

// ----------------------------------------------------------------------------
// GET /current/invitations
// ----------------------------------------------------------------------------

router.get(
  "/current/invitations",

  requirePermission(
    PERMISSIONS
      .MEMBER_READ
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      const invitations =
        await listInvitations(
          req.context
            .organizationId
        );

      return res.json({
        count:
          invitations.length,

        invitations,
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

// ----------------------------------------------------------------------------
// POST /current/invitations/:invitationId/resend
// ----------------------------------------------------------------------------

router.post(
  "/current/invitations/:invitationId/resend",

  requirePermission(
    PERMISSIONS
      .MEMBER_INVITE
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      const result =
        await resendInvitation({
          organizationId:
            req.context
              .organizationId,

          invitationId:
            req.params
              .invitationId,

          actorUserId:
            req.context
              .userId,
        });

      const response = {
        invitation:
          result.invitation,
      };

      if (
        process.env
          .NODE_ENV !==
        "production"
      ) {
        response
          .invitationToken =
          result.token;
      }

      return res.json(
        response
      );
    } catch (
      error
    ) {
      return next(
        error
      );
    }
  }
);

// ----------------------------------------------------------------------------
// DELETE /current/invitations/:invitationId
// ----------------------------------------------------------------------------

router.delete(
  "/current/invitations/:invitationId",

  requirePermission(
    PERMISSIONS
      .MEMBER_INVITE
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      const invitation =
        await revokeInvitation({
          organizationId:
            req.context
              .organizationId,

          invitationId:
            req.params
              .invitationId,

          revokedByUserId:
            req.context
              .userId,
        });

      return res.json({
        revoked:
          true,

        invitation,
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

// ============================================================================
// PHASE 14.3D — MEMBERSHIP ADMINISTRATION
// ============================================================================

async function countActiveOwners(
  organizationId
) {
  const memberships =
    await organizationMembershipRepository
      .findMany({
        organizationId,

        role:
          ORGANIZATION_ROLES
            .OWNER,

        status:
          "active",
      });

  return (
    memberships ||
    []
  ).length;
}

async function revokeOrganizationSessions(
  userId,
  organizationId,
  reason
) {
  const result =
    await userSessionRepository
      .updateMany(
        {
          userId,

          activeOrganizationId:
            organizationId,

          status:
            "active",
        },
        {
          $set: {
            status:
              "revoked",

            revokedAt:
              new Date(),

            revocationReason:
              String(
                reason ||
                "membership_changed"
              )
                .slice(
                  0,
                  200
                ),
          },
        }
      );

  return (
    result
      ?.modifiedCount ||
    0
  );
}

function assertOwnerMutationAllowed(
  req,
  targetMembership,
  nextRole,
  nextStatus
) {
  const targetIsOwner =
    targetMembership.role ===
    ORGANIZATION_ROLES
      .OWNER;

  const assigningOwner =
    nextRole ===
    ORGANIZATION_ROLES
      .OWNER &&
    !targetIsOwner;

  /**
   * Owner assignment/management is a root tenant action.
   *
   * member.manage alone is deliberately insufficient.
   */
  if (
    (
      targetIsOwner ||
      assigningOwner
    ) &&
    req.context.role !==
      ORGANIZATION_ROLES
        .OWNER
  ) {
    throw createError(
      "Only an organization owner may change owner membership",
      403,
      "OWNER_MEMBERSHIP_PROTECTED"
    );
  }

  return {
    targetIsOwner,

    ownerWouldLoseActiveStatus:
      targetIsOwner &&
      (
        (
          nextRole &&
          nextRole !==
            ORGANIZATION_ROLES
              .OWNER
        ) ||
        (
          nextStatus &&
          nextStatus !==
            "active"
        )
      ),
  };
}

// ----------------------------------------------------------------------------
// PATCH /current/members/:membershipId
// ----------------------------------------------------------------------------

router.patch(
  "/current/members/:membershipId",

  requirePermission(
    PERMISSIONS
      .MEMBER_MANAGE
  ),

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
        updateMembershipSchema
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
        throw createError(
          error.details
            ?.[0]
            ?.message ||
            "Invalid membership update",
          422,
          "VALIDATION_ERROR"
        );
      }

      const membership =
        await getScopedMembership(
          req,
          req.params
            .membershipId
        );

      if (
        membership.status ===
        "removed"
      ) {
        throw createError(
          "Removed memberships cannot be modified",
          409,
          "MEMBERSHIP_REMOVED"
        );
      }

      const {
        ownerWouldLoseActiveStatus,
      } =
        assertOwnerMutationAllowed(
          req,
          membership,
          value.role,
          value.status
        );

      if (
        ownerWouldLoseActiveStatus
      ) {
        const activeOwners =
          await countActiveOwners(
            req.context
              .organizationId
          );

        if (
          activeOwners <=
          1
        ) {
          throw createError(
            "The last active organization owner cannot be demoted or suspended",
            409,
            "LAST_OWNER_PROTECTED"
          );
        }
      }

      const update = {
        $set: {},
      };

      if (
        value.role !==
        undefined
      ) {
        update.$set.role =
          value.role;
      }

      if (
        value.status !==
        undefined
      ) {
        update.$set.status =
          value.status;

        if (
          value.status ===
          "suspended"
        ) {
          update
            .$set
            .suspendedAt =
            new Date();
        }

        if (
          value.status ===
          "active"
        ) {
          update
            .$set
            .suspendedAt =
            null;
        }
      }

      await organizationMembershipRepository
        .updateOne(
          {
            _id:
              membership._id,

            organizationId:
              req.context
                .organizationId,
          },
          update
        );

      let revokedSessions =
        0;

      /**
       * Suspension must take effect immediately.
       *
       * Role changes don't require revocation because sessionAuthMiddleware
       * reloads current membership role on every request.
       */
      if (
        value.status ===
        "suspended"
      ) {
        revokedSessions =
          await revokeOrganizationSessions(
            membership.userId,

            req.context
              .organizationId,

            "membership_suspended"
          );
      }

      const updated =
        await organizationMembershipRepository
          .findById(
            membership._id
          );

      const user =
        await resolveMembershipUser(
          updated
        );

      await auditRecord(
        "organization_membership_updated",
        "success",
        {
          userId:
            req.context
              .userId,

          organizationId:
            req.context
              .organizationId,

          metadata: {
            membershipId:
              asId(
                membership._id
              ),

            targetUserId:
              asId(
                membership.userId
              ),

            previousRole:
              membership.role,

            role:
              updated.role,

            previousStatus:
              membership.status,

            status:
              updated.status,

            revokedSessions,
          },
        }
      ).catch(
        () => {}
      );

      return res.json({
        membership:
          safeMembership(
            updated,
            user
          ),

        revokedSessions,
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

// ----------------------------------------------------------------------------
// DELETE /current/members/:membershipId
//
// Soft removal only.
// ----------------------------------------------------------------------------

router.delete(
  "/current/members/:membershipId",

  requirePermission(
    PERMISSIONS
      .MEMBER_MANAGE
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      const membership =
        await getScopedMembership(
          req,
          req.params
            .membershipId
        );

      if (
        membership.status ===
        "removed"
      ) {
        throw createError(
          "Membership not found",
          404,
          "MEMBERSHIP_NOT_FOUND"
        );
      }

      const {
        ownerWouldLoseActiveStatus,
      } =
        assertOwnerMutationAllowed(
          req,
          membership,
          membership.role,
          "removed"
        );

      if (
        ownerWouldLoseActiveStatus
      ) {
        const activeOwners =
          await countActiveOwners(
            req.context
              .organizationId
          );

        if (
          activeOwners <=
          1
        ) {
          throw createError(
            "The last active organization owner cannot be removed",
            409,
            "LAST_OWNER_PROTECTED"
          );
        }
      }

      await organizationMembershipRepository
        .updateOne(
          {
            _id:
              membership._id,

            organizationId:
              req.context
                .organizationId,
          },
          {
            $set: {
              status:
                "removed",

              suspendedAt:
                null,
            },
          }
        );

      const revokedSessions =
        await revokeOrganizationSessions(
          membership.userId,

          req.context
            .organizationId,

          "membership_removed"
        );

      await auditRecord(
        "organization_membership_removed",
        "success",
        {
          userId:
            req.context
              .userId,

          organizationId:
            req.context
              .organizationId,

          metadata: {
            membershipId:
              asId(
                membership._id
              ),

            targetUserId:
              asId(
                membership.userId
              ),

            previousRole:
              membership.role,

            revokedSessions,
          },
        }
      ).catch(
        () => {}
      );

      return res.json({
        removed:
          true,

        membershipId:
          asId(
            membership._id
          ),

        revokedSessions,
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

// ============================================================================
// PHASE 14.3E — TEAMS
// ============================================================================

// ----------------------------------------------------------------------------
// GET /current/teams
// ----------------------------------------------------------------------------

router.get(
  "/current/teams",

  requirePermission(
    PERMISSIONS
      .ORGANIZATION_READ
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      const teams =
        await listTeams(
          req.context
            .organizationId
        );

      return res.json({
        organizationId:
          asId(
            req.context
              .organizationId
          ),

        count:
          teams.length,

        teams,
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


// ----------------------------------------------------------------------------
// POST /current/teams
// ----------------------------------------------------------------------------

router.post(
  "/current/teams",

  requirePermission(
    PERMISSIONS
      .TEAM_MANAGE
  ),

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
        createTeamSchema
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
        throw createError(
          error.details
            ?.[0]
            ?.message ||
            "Invalid team",
          422,
          "VALIDATION_ERROR"
        );
      }

      const team =
        await createTeam({
          organizationId:
            req.context
              .organizationId,

          actorUserId:
            req.context
              .userId,

          name:
            value.name,

          description:
            value.description ||
            null,

          metadata:
            value.metadata ||
            {},
        });

      return res
        .status(
          201
        )
        .json({
          team,
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


// ----------------------------------------------------------------------------
// GET /current/teams/:teamId
// ----------------------------------------------------------------------------

router.get(
  "/current/teams/:teamId",

  requirePermission(
    PERMISSIONS
      .ORGANIZATION_READ
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      const team =
        await getTeam({
          organizationId:
            req.context
              .organizationId,

          teamId:
            req.params
              .teamId,
        });

      return res.json({
        team,
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


// ----------------------------------------------------------------------------
// PATCH /current/teams/:teamId
// ----------------------------------------------------------------------------

router.patch(
  "/current/teams/:teamId",

  requirePermission(
    PERMISSIONS
      .TEAM_MANAGE
  ),

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
        updateTeamSchema
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
        throw createError(
          error.details
            ?.[0]
            ?.message ||
            "Invalid team update",
          422,
          "VALIDATION_ERROR"
        );
      }

      const team =
        await updateTeam({
          organizationId:
            req.context
              .organizationId,

          teamId:
            req.params
              .teamId,

          actorUserId:
            req.context
              .userId,

          ...value,
        });

      return res.json({
        team,
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


// ----------------------------------------------------------------------------
// DELETE /current/teams/:teamId
//
// Soft archive rather than physical deletion.
// ----------------------------------------------------------------------------

router.delete(
  "/current/teams/:teamId",

  requirePermission(
    PERMISSIONS
      .TEAM_MANAGE
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      const team =
        await archiveTeam({
          organizationId:
            req.context
              .organizationId,

          teamId:
            req.params
              .teamId,

          actorUserId:
            req.context
              .userId,
        });

      return res.json({
        archived:
          true,

        team,
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


// ============================================================================
// TEAM MEMBERSHIPS
// ============================================================================

// ----------------------------------------------------------------------------
// GET /current/teams/:teamId/members
// ----------------------------------------------------------------------------

router.get(
  "/current/teams/:teamId/members",

  requirePermission(
    PERMISSIONS
      .ORGANIZATION_READ
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      const result =
        await listTeamMembers({
          organizationId:
            req.context
              .organizationId,

          teamId:
            req.params
              .teamId,
        });

      return res.json({
        team:
          result.team,

        count:
          result
            .members
            .length,

        members:
          result.members,
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


// ----------------------------------------------------------------------------
// POST /current/teams/:teamId/members
// ----------------------------------------------------------------------------

router.post(
  "/current/teams/:teamId/members",

  requirePermission(
    PERMISSIONS
      .TEAM_MANAGE
  ),

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
        addTeamMemberSchema
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
        throw createError(
          error.details
            ?.[0]
            ?.message ||
            "Invalid team membership request",
          422,
          "VALIDATION_ERROR"
        );
      }

      const member =
        await addTeamMember({
          organizationId:
            req.context
              .organizationId,

          teamId:
            req.params
              .teamId,

          membershipId:
            value
              .membershipId,

          actorUserId:
            req.context
              .userId,
        });

      return res
        .status(
          201
        )
        .json({
          member,
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


// ----------------------------------------------------------------------------
// DELETE /current/teams/:teamId/members/:membershipId
// ----------------------------------------------------------------------------

router.delete(
  "/current/teams/:teamId/members/:membershipId",

  requirePermission(
    PERMISSIONS
      .TEAM_MANAGE
  ),

  async (
    req,
    res,
    next
  ) => {
    try {
      const result =
        await removeTeamMember({
          organizationId:
            req.context
              .organizationId,

          teamId:
            req.params
              .teamId,

          membershipId:
            req.params
              .membershipId,

          actorUserId:
            req.context
              .userId,
        });

      return res.json(
        result
      );
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