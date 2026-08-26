-- ============================================================================
-- AIRA PHASE 14.3E
-- ORGANIZATION TEAMS + TEAM MEMBERSHIPS
-- ============================================================================
--
-- Organization
--     |
--     +-- organization_memberships
--     |
--     +-- teams
--             |
--             +-- team_memberships
--
-- SECURITY INVARIANTS
--
-- - every team belongs to exactly one organization
-- - every team membership carries the same organization boundary
-- - only ACTIVE organization memberships can be added at application layer
-- - cross-organization team membership is structurally prevented
-- - team deletion cascades team memberships only
-- - deleting a team never deletes organization memberships/users
-- ============================================================================


-- ============================================================================
-- TEAMS
-- ============================================================================

CREATE TABLE IF NOT EXISTS tenancy.teams (
    id UUID PRIMARY KEY
        DEFAULT gen_random_uuid(),

    public_id TEXT NOT NULL,

    organization_id UUID NOT NULL
        REFERENCES tenancy.organizations(id)
        ON DELETE CASCADE,

    name TEXT NOT NULL,

    slug TEXT NOT NULL,

    description TEXT,

    status TEXT NOT NULL
        DEFAULT 'active',

    created_by_user_id UUID
        REFERENCES identity.users(id)
        ON DELETE SET NULL,

    metadata JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    archived_at TIMESTAMPTZ,

    CONSTRAINT teams_public_id_unique
        UNIQUE (public_id),

    CONSTRAINT teams_status_check
        CHECK (
            status IN (
                'active',
                'archived'
            )
        ),

    CONSTRAINT teams_name_nonempty
        CHECK (
            length(trim(name)) > 0
        ),

    CONSTRAINT teams_slug_nonempty
        CHECK (
            length(trim(slug)) > 0
        ),

    CONSTRAINT teams_org_slug_unique
        UNIQUE (
            organization_id,
            slug
        )
);


CREATE INDEX IF NOT EXISTS
    idx_teams_organization
ON tenancy.teams (
    organization_id,
    status,
    created_at DESC
);


CREATE INDEX IF NOT EXISTS
    idx_teams_created_by
ON tenancy.teams (
    created_by_user_id
);


-- ============================================================================
-- TEAM MEMBERSHIPS
-- ============================================================================

CREATE TABLE IF NOT EXISTS tenancy.team_memberships (
    id UUID PRIMARY KEY
        DEFAULT gen_random_uuid(),

    organization_id UUID NOT NULL
        REFERENCES tenancy.organizations(id)
        ON DELETE CASCADE,

    team_id UUID NOT NULL
        REFERENCES tenancy.teams(id)
        ON DELETE CASCADE,

    membership_id UUID NOT NULL
        REFERENCES identity.organization_memberships(id)
        ON DELETE CASCADE,

    added_by_user_id UUID
        REFERENCES identity.users(id)
        ON DELETE SET NULL,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    CONSTRAINT team_memberships_unique
        UNIQUE (
            team_id,
            membership_id
        )
);


CREATE INDEX IF NOT EXISTS
    idx_team_memberships_team
ON tenancy.team_memberships (
    organization_id,
    team_id
);


CREATE INDEX IF NOT EXISTS
    idx_team_memberships_membership
ON tenancy.team_memberships (
    organization_id,
    membership_id
);


-- ============================================================================
-- CROSS-ORGANIZATION PROTECTION
--
-- PostgreSQL cannot express the full relationship using only the separate
-- foreign keys above, because team_id and membership_id each point to records
-- that themselves carry organization ownership.
--
-- This trigger makes organization equality authoritative at the DB layer too.
-- ============================================================================

CREATE OR REPLACE FUNCTION
    tenancy.aira_validate_team_membership_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    team_org UUID;
    membership_org UUID;
BEGIN
    SELECT
        organization_id
    INTO
        team_org
    FROM
        tenancy.teams
    WHERE
        id = NEW.team_id;

    IF team_org IS NULL THEN
        RAISE EXCEPTION
            'team does not exist';
    END IF;

    SELECT
        organization_id
    INTO
        membership_org
    FROM
        identity.organization_memberships
    WHERE
        id = NEW.membership_id;

    IF membership_org IS NULL THEN
        RAISE EXCEPTION
            'organization membership does not exist';
    END IF;

    IF team_org <> NEW.organization_id THEN
        RAISE EXCEPTION
            'team organization mismatch';
    END IF;

    IF membership_org <> NEW.organization_id THEN
        RAISE EXCEPTION
            'membership organization mismatch';
    END IF;

    RETURN NEW;
END;
$$;


DROP TRIGGER IF EXISTS
    trg_team_membership_scope
ON tenancy.team_memberships;


CREATE TRIGGER
    trg_team_membership_scope
BEFORE INSERT OR UPDATE
ON tenancy.team_memberships
FOR EACH ROW
EXECUTE FUNCTION
    tenancy.aira_validate_team_membership_scope();


-- ============================================================================
-- UPDATED-AT TRIGGER
-- ============================================================================

DROP TRIGGER IF EXISTS
    trg_teams_updated_at
ON tenancy.teams;


CREATE TRIGGER
    trg_teams_updated_at
BEFORE UPDATE
ON tenancy.teams
FOR EACH ROW
EXECUTE FUNCTION
    public.aira_set_updated_at();