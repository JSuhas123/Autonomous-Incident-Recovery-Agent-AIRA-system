-- ============================================================================
-- AIRA PHASE 14.3C
-- ORGANIZATION INVITATION CONTROL PLANE
-- ============================================================================
--
-- Security properties:
--
-- - plaintext invitation tokens are NEVER persisted
-- - tokens are single-use
-- - invitations expire
-- - invitations can be revoked
-- - email ownership is normalized
-- - organization ownership is immutable
-- - invitation role is immutable after issue; resend creates a fresh token
-- ============================================================================

CREATE TABLE IF NOT EXISTS identity.organization_invitations (
  id UUID PRIMARY KEY
    DEFAULT gen_random_uuid(),

  public_id TEXT NOT NULL,

  organization_id UUID NOT NULL
    REFERENCES tenancy.organizations(id)
    ON DELETE CASCADE,

  email TEXT NOT NULL,

  normalized_email TEXT NOT NULL,

  role TEXT NOT NULL,

  token_hash TEXT NOT NULL,

  invited_by_user_id UUID NOT NULL
    REFERENCES identity.users(id)
    ON DELETE RESTRICT,

  expires_at TIMESTAMPTZ NOT NULL,

  accepted_at TIMESTAMPTZ,

  accepted_by_user_id UUID
    REFERENCES identity.users(id)
    ON DELETE SET NULL,

  revoked_at TIMESTAMPTZ,

  revoked_by_user_id UUID
    REFERENCES identity.users(id)
    ON DELETE SET NULL,

  superseded_at TIMESTAMPTZ,

  metadata JSONB NOT NULL
    DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL
    DEFAULT NOW(),

  updated_at TIMESTAMPTZ NOT NULL
    DEFAULT NOW(),

  CONSTRAINT organization_invitations_public_unique
    UNIQUE (public_id),

  CONSTRAINT organization_invitations_token_hash_unique
    UNIQUE (token_hash),

  CONSTRAINT organization_invitations_role_check
    CHECK (
      role IN (
        'admin',
        'platform_engineer',
        'developer',
        'security_analyst',
        'auditor',
        'viewer'
      )
    ),

  CONSTRAINT organization_invitations_state_check
    CHECK (
      NOT (
        accepted_at IS NOT NULL
        AND revoked_at IS NOT NULL
      )
    )
);

CREATE INDEX IF NOT EXISTS
  idx_org_invitations_org_created
ON identity.organization_invitations (
  organization_id,
  created_at DESC
);

CREATE INDEX IF NOT EXISTS
  idx_org_invitations_email
ON identity.organization_invitations (
  normalized_email
);

CREATE INDEX IF NOT EXISTS
  idx_org_invitations_expiry
ON identity.organization_invitations (
  expires_at
);

CREATE INDEX IF NOT EXISTS
  idx_org_invitations_org_email_active
ON identity.organization_invitations (
  organization_id,
  normalized_email
)
WHERE
  accepted_at IS NULL
  AND revoked_at IS NULL
  AND superseded_at IS NULL;

DROP TRIGGER IF EXISTS
  trg_organization_invitations_updated_at
ON identity.organization_invitations;

CREATE TRIGGER
  trg_organization_invitations_updated_at
BEFORE UPDATE
ON identity.organization_invitations
FOR EACH ROW
EXECUTE FUNCTION
  public.aira_set_updated_at();