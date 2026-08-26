"use strict";

const crypto =
  require(
    "crypto"
  );

const {
  getPostgresPool,
} =
  require(
    "../../persistence/postgres/postgresPool"
  );

const {
  organizationMembershipRepository,
  userRepository,
} =
  require(
    "../../persistence/repositories"
  );

const {
  record:
    auditRecord,
} =
  require(
    "./identityAuditService"
  );

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

  error.executionAuthorized =
    false;

  return error;
}

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

function createPublicId() {
  return (
    "team_" +
    crypto
      .randomBytes(
        10
      )
      .toString(
        "hex"
      )
  );
}

function slugify(
  value
) {
  return String(
    value ||
    ""
  )
    .trim()
    .toLowerCase()
    .replace(
      /[^a-z0-9]+/g,
      "-"
    )
    .replace(
      /^-+|-+$/g,
      ""
    )
    .slice(
      0,
      80
    );
}

function serializeTeam(
  row
) {
  if (
    !row
  ) {
    return null;
  }

  return {
    id:
      row.public_id,

    internalId:
      row.id,

    organizationId:
      row.organization_id,

    name:
      row.name,

    slug:
      row.slug,

    description:
      row.description,

    status:
      row.status,

    createdByUserId:
      row.created_by_user_id,

    metadata:
      row.metadata ||
      {},

    memberCount:
      Number(
        row.member_count ||
        0
      ),

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,

    archivedAt:
      row.archived_at,
  };
}

function serializeUser(
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
      user.fullName ||
      null,

    email:
      user.email ||
      null,

    status:
      user.status ||
      null,
  };
}

function serializeTeamMember(
  teamMembership,
  membership,
  user
) {
  return {
    id:
      teamMembership.id,

    teamId:
      teamMembership.team_id,

    organizationId:
      teamMembership
        .organization_id,

    membershipId:
      asId(
        membership?._id
      ),

    userId:
      asId(
        membership?.userId
      ),

    role:
      membership?.role ||
      null,

    membershipStatus:
      membership?.status ||
      null,

    addedByUserId:
      teamMembership
        .added_by_user_id,

    addedAt:
      teamMembership
        .created_at,

    user:
      serializeUser(
        user
      ),
  };
}

function getPool() {
  return getPostgresPool();
}

// ============================================================================
// TEAM LOOKUP
// ============================================================================

async function requireTeam(
  organizationId,
  teamId,
  {
    includeArchived =
      false,
  } = {}
) {
  if (
    !organizationId ||
    !teamId
  ) {
    throw createError(
      "Organization and team are required",
      400,
      "TEAM_CONTEXT_REQUIRED"
    );
  }

  const pool =
    getPool();

  const parameters = [
    organizationId,
    teamId,
  ];

  let statusSql =
    "";

  if (
    !includeArchived
  ) {
    statusSql =
      "AND status = 'active'";
  }

  const result =
    await pool.query(
      `
        SELECT *
        FROM tenancy.teams
        WHERE
          organization_id = $1
          AND (
            public_id = $2
            OR id::text = $2
          )
          ${statusSql}
        LIMIT 1
      `,
      parameters
    );

  if (
    !result.rows[0]
  ) {
    /**
     * Intentional organization-scoped 404.
     *
     * Never disclose whether a team identifier exists under another tenant.
     */
    throw createError(
      "Team not found",
      404,
      "TEAM_NOT_FOUND"
    );
  }

  return result.rows[0];
}

// ============================================================================
// LIST
// ============================================================================

async function listTeams(
  organizationId
) {
  const pool =
    getPool();

  const result =
    await pool.query(
      `
        SELECT
          t.*,

          COUNT(
            tm.id
          )::integer
            AS member_count

        FROM
          tenancy.teams t

        LEFT JOIN
          tenancy.team_memberships tm
        ON
          tm.team_id = t.id
          AND
          tm.organization_id =
            t.organization_id

        WHERE
          t.organization_id = $1
          AND
          t.status = 'active'

        GROUP BY
          t.id

        ORDER BY
          t.name ASC
      `,
      [
        organizationId,
      ]
    );

  return result.rows.map(
    serializeTeam
  );
}

// ============================================================================
// READ
// ============================================================================

async function getTeam({
  organizationId,
  teamId,
}) {
  const team =
    await requireTeam(
      organizationId,
      teamId
    );

  const pool =
    getPool();

  const count =
    await pool.query(
      `
        SELECT
          COUNT(*)::integer
            AS member_count
        FROM
          tenancy.team_memberships
        WHERE
          organization_id = $1
          AND
          team_id = $2
      `,
      [
        organizationId,
        team.id,
      ]
    );

  team.member_count =
    count.rows[0]
      ?.member_count ||
    0;

  return serializeTeam(
    team
  );
}

// ============================================================================
// CREATE
// ============================================================================

async function createTeam({
  organizationId,
  actorUserId,
  name,
  description =
    null,
  metadata =
    {},
}) {
  const normalizedName =
    String(
      name ||
      ""
    ).trim();

  if (
    !normalizedName
  ) {
    throw createError(
      "Team name is required",
      422,
      "TEAM_NAME_REQUIRED"
    );
  }

  const slug =
    slugify(
      normalizedName
    );

  if (
    !slug
  ) {
    throw createError(
      "Team name cannot produce a valid slug",
      422,
      "TEAM_SLUG_INVALID"
    );
  }

  const pool =
    getPool();

  const duplicate =
    await pool.query(
      `
        SELECT
          id
        FROM
          tenancy.teams
        WHERE
          organization_id = $1
          AND
          slug = $2
          AND
          status = 'active'
        LIMIT 1
      `,
      [
        organizationId,
        slug,
      ]
    );

  if (
    duplicate.rows[0]
  ) {
    throw createError(
      "A team with this name already exists",
      409,
      "TEAM_ALREADY_EXISTS"
    );
  }

  let result;

  try {
    result =
      await pool.query(
        `
          INSERT INTO tenancy.teams (
            public_id,
            organization_id,
            name,
            slug,
            description,
            created_by_user_id,
            metadata
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7::jsonb
          )
          RETURNING *
        `,
        [
          createPublicId(),
          organizationId,
          normalizedName,
          slug,
          description
            ? String(
                description
              ).trim()
            : null,
          actorUserId,
          JSON.stringify(
            metadata ||
            {}
          ),
        ]
      );
  } catch (
    error
  ) {
    if (
      error.code ===
      "23505"
    ) {
      throw createError(
        "A team with this name already exists",
        409,
        "TEAM_ALREADY_EXISTS"
      );
    }

    throw error;
  }

  const team =
    result.rows[0];

  await auditRecord(
    "organization_team_created",
    "success",
    {
      userId:
        actorUserId,

      organizationId,

      metadata: {
        teamId:
          team.public_id,

        teamName:
          team.name,
      },
    }
  ).catch(
    () => {}
  );

  return serializeTeam(
    team
  );
}

// ============================================================================
// UPDATE
// ============================================================================

async function updateTeam({
  organizationId,
  teamId,
  actorUserId,
  name,
  description,
  metadata,
}) {
  const existing =
    await requireTeam(
      organizationId,
      teamId
    );

  const updates =
    [];

  const values = [
    organizationId,
    existing.id,
  ];

  let parameter =
    values.length + 1;

  if (
    name !==
    undefined
  ) {
    const normalizedName =
      String(
        name
      ).trim();

    const slug =
      slugify(
        normalizedName
      );

    if (
      !normalizedName ||
      !slug
    ) {
      throw createError(
        "Valid team name is required",
        422,
        "TEAM_NAME_INVALID"
      );
    }

    updates.push(
      `name = $${parameter++}`
    );

    values.push(
      normalizedName
    );

    updates.push(
      `slug = $${parameter++}`
    );

    values.push(
      slug
    );
  }

  if (
    description !==
    undefined
  ) {
    updates.push(
      `description = $${parameter++}`
    );

    values.push(
      description
        ? String(
            description
          ).trim()
        : null
    );
  }

  if (
    metadata !==
    undefined
  ) {
    updates.push(
      `metadata = $${parameter++}::jsonb`
    );

    values.push(
      JSON.stringify(
        metadata ||
        {}
      )
    );
  }

  if (
    updates.length ===
    0
  ) {
    return getTeam({
      organizationId,
      teamId,
    });
  }

  let result;

  try {
    result =
      await getPool()
        .query(
          `
            UPDATE
              tenancy.teams
            SET
              ${updates.join(
                ", "
              )}
            WHERE
              organization_id = $1
              AND
              id = $2
              AND
              status = 'active'
            RETURNING *
          `,
          values
        );
  } catch (
    error
  ) {
    if (
      error.code ===
      "23505"
    ) {
      throw createError(
        "A team with this name already exists",
        409,
        "TEAM_ALREADY_EXISTS"
      );
    }

    throw error;
  }

  if (
    !result.rows[0]
  ) {
    throw createError(
      "Team not found",
      404,
      "TEAM_NOT_FOUND"
    );
  }

  await auditRecord(
    "organization_team_updated",
    "success",
    {
      userId:
        actorUserId,

      organizationId,

      metadata: {
        teamId:
          existing.public_id,

        previousName:
          existing.name,

        name:
          result.rows[0]
            .name,
      },
    }
  ).catch(
    () => {}
  );

  return serializeTeam(
    result.rows[0]
  );
}

// ============================================================================
// ARCHIVE
// ============================================================================

async function archiveTeam({
  organizationId,
  teamId,
  actorUserId,
}) {
  const existing =
    await requireTeam(
      organizationId,
      teamId
    );

  const result =
    await getPool()
      .query(
        `
          UPDATE
            tenancy.teams
          SET
            status =
              'archived',

            archived_at =
              NOW()

          WHERE
            organization_id = $1
            AND
            id = $2
            AND
            status = 'active'

          RETURNING *
        `,
        [
          organizationId,
          existing.id,
        ]
      );

  if (
    !result.rows[0]
  ) {
    throw createError(
      "Team not found",
      404,
      "TEAM_NOT_FOUND"
    );
  }

  /**
   * An archived team no longer has operational membership.
   *
   * We retain the team row for audit/history but remove its active
   * assignment edges.
   */
  await getPool()
    .query(
      `
        DELETE FROM
          tenancy.team_memberships
        WHERE
          organization_id = $1
          AND
          team_id = $2
      `,
      [
        organizationId,
        existing.id,
      ]
    );

  await auditRecord(
    "organization_team_archived",
    "success",
    {
      userId:
        actorUserId,

      organizationId,

      metadata: {
        teamId:
          existing.public_id,

        teamName:
          existing.name,
      },
    }
  ).catch(
    () => {}
  );

  return serializeTeam(
    result.rows[0]
  );
}

// ============================================================================
// MEMBER LIST
// ============================================================================

async function listTeamMembers({
  organizationId,
  teamId,
}) {
  const team =
    await requireTeam(
      organizationId,
      teamId
    );

  const result =
    await getPool()
      .query(
        `
          SELECT
            *
          FROM
            tenancy.team_memberships
          WHERE
            organization_id = $1
            AND
            team_id = $2
          ORDER BY
            created_at ASC
        `,
        [
          organizationId,
          team.id,
        ]
      );

  const members =
    [];

  for (
    const teamMembership
    of result.rows
  ) {
    const membership =
      await organizationMembershipRepository
        .findOne({
          _id:
            teamMembership
              .membership_id,

          organizationId,
        });

    if (
      !membership
    ) {
      continue;
    }

    let user =
      null;

    if (
      membership.userId
    ) {
      user =
        await userRepository
          .findById(
            membership.userId
          )
          .catch(
            () => null
          );
    }

    members.push(
      serializeTeamMember(
        teamMembership,
        membership,
        user
      )
    );
  }

  return {
    team:
      serializeTeam(
        team
      ),

    members,
  };
}

// ============================================================================
// ADD MEMBER
// ============================================================================

async function addTeamMember({
  organizationId,
  teamId,
  membershipId,
  actorUserId,
}) {
  const team =
    await requireTeam(
      organizationId,
      teamId
    );

  const membership =
    await organizationMembershipRepository
      .findOne({
        _id:
          membershipId,

        organizationId,
      });

  if (
    !membership
  ) {
    throw createError(
      "Organization membership not found",
      404,
      "MEMBERSHIP_NOT_FOUND"
    );
  }

  if (
    membership.status !==
    "active"
  ) {
    throw createError(
      "Only active organization members may join a team",
      409,
      "TEAM_MEMBERSHIP_REQUIRES_ACTIVE_MEMBER"
    );
  }

  let result;

  try {
    result =
      await getPool()
        .query(
          `
            INSERT INTO
              tenancy.team_memberships (
                organization_id,
                team_id,
                membership_id,
                added_by_user_id
              )

            VALUES (
              $1,
              $2,
              $3,
              $4
            )

            RETURNING *
          `,
          [
            organizationId,
            team.id,
            asId(
              membership._id
            ),
            actorUserId,
          ]
        );
  } catch (
    error
  ) {
    if (
      error.code ===
      "23505"
    ) {
      throw createError(
        "Member already belongs to this team",
        409,
        "TEAM_MEMBERSHIP_EXISTS"
      );
    }

    throw error;
  }

  let user =
    null;

  if (
    membership.userId
  ) {
    user =
      await userRepository
        .findById(
          membership.userId
        )
        .catch(
          () => null
        );
  }

  await auditRecord(
    "organization_team_member_added",
    "success",
    {
      userId:
        actorUserId,

      organizationId,

      metadata: {
        teamId:
          team.public_id,

        membershipId:
          asId(
            membership._id
          ),

        targetUserId:
          asId(
            membership.userId
          ),
      },
    }
  ).catch(
    () => {}
  );

  return serializeTeamMember(
    result.rows[0],
    membership,
    user
  );
}

// ============================================================================
// REMOVE MEMBER
// ============================================================================

async function removeTeamMember({
  organizationId,
  teamId,
  membershipId,
  actorUserId,
}) {
  const team =
    await requireTeam(
      organizationId,
      teamId
    );

  /**
   * Resolve the membership under the same organization before touching
   * team_memberships.
   */
  const membership =
    await organizationMembershipRepository
      .findOne({
        _id:
          membershipId,

        organizationId,
      });

  if (
    !membership
  ) {
    throw createError(
      "Team member not found",
      404,
      "TEAM_MEMBER_NOT_FOUND"
    );
  }

  const result =
    await getPool()
      .query(
        `
          DELETE FROM
            tenancy.team_memberships

          WHERE
            organization_id = $1
            AND
            team_id = $2
            AND
            membership_id = $3

          RETURNING *
        `,
        [
          organizationId,
          team.id,
          asId(
            membership._id
          ),
        ]
      );

  if (
    !result.rows[0]
  ) {
    throw createError(
      "Team member not found",
      404,
      "TEAM_MEMBER_NOT_FOUND"
    );
  }

  await auditRecord(
    "organization_team_member_removed",
    "success",
    {
      userId:
        actorUserId,

      organizationId,

      metadata: {
        teamId:
          team.public_id,

        membershipId:
          asId(
            membership._id
          ),

        targetUserId:
          asId(
            membership.userId
          ),
      },
    }
  ).catch(
    () => {}
  );

  return {
    removed:
      true,

    teamId:
      team.public_id,

    membershipId:
      asId(
        membership._id
      ),
  };
}

module.exports = {
  listTeams,
  getTeam,
  createTeam,
  updateTeam,
  archiveTeam,

  listTeamMembers,
  addTeamMember,
  removeTeamMember,

  slugify,
};