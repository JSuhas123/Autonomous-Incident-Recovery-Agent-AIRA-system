-- ============================================================
-- AIRA PHASE 13.5
-- MIGRATION 0013 — MONGODB -> POSTGRESQL MIGRATION CONTROL PLANE
-- ============================================================

CREATE SCHEMA IF NOT EXISTS migration;

-- ============================================================
-- MIGRATION STATE
--
-- One row represents migration state for one logical domain
-- inside one organization/environment scope.
-- ============================================================

CREATE TABLE IF NOT EXISTS migration.domain_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  organization_id UUID NOT NULL
    REFERENCES tenancy.organizations(id)
    ON DELETE CASCADE,

  environment_id UUID NOT NULL
    REFERENCES tenancy.environments(id)
    ON DELETE CASCADE,

  domain TEXT NOT NULL,

  phase TEXT NOT NULL DEFAULT 'pending',

  source_backend TEXT NOT NULL DEFAULT 'mongo',

  target_backend TEXT NOT NULL DEFAULT 'postgres',

  read_backend TEXT NOT NULL DEFAULT 'mongo',

  shadow_reads_enabled BOOLEAN NOT NULL DEFAULT FALSE,

  backfill_complete BOOLEAN NOT NULL DEFAULT FALSE,

  verification_complete BOOLEAN NOT NULL DEFAULT FALSE,

  cutover_complete BOOLEAN NOT NULL DEFAULT FALSE,

  rollback_allowed BOOLEAN NOT NULL DEFAULT TRUE,

  started_at TIMESTAMPTZ,

  backfill_completed_at TIMESTAMPTZ,

  verified_at TIMESTAMPTZ,

  cutover_at TIMESTAMPTZ,

  rollback_deadline TIMESTAMPTZ,

  last_error TEXT,

  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT migration_domain_state_scope_unique
    UNIQUE (
      organization_id,
      environment_id,
      domain
    ),

  CONSTRAINT migration_domain_state_phase_check
    CHECK (
      phase IN (
        'pending',
        'backfilling',
        'backfilled',
        'verifying',
        'verified',
        'shadow',
        'cutover',
        'rollback',
        'retired',
        'failed'
      )
    ),

  CONSTRAINT migration_domain_state_source_check
    CHECK (
      source_backend IN (
        'mongo',
        'postgres'
      )
    ),

  CONSTRAINT migration_domain_state_target_check
    CHECK (
      target_backend IN (
        'mongo',
        'postgres'
      )
    ),

  CONSTRAINT migration_domain_state_read_backend_check
    CHECK (
      read_backend IN (
        'mongo',
        'postgres'
      )
    ),

  CONSTRAINT migration_domain_state_backends_different
    CHECK (
      source_backend <> target_backend
    )
);

CREATE INDEX IF NOT EXISTS
  idx_migration_domain_state_scope
ON migration.domain_state (
  organization_id,
  environment_id
);

CREATE INDEX IF NOT EXISTS
  idx_migration_domain_state_phase
ON migration.domain_state (
  phase
);

CREATE INDEX IF NOT EXISTS
  idx_migration_domain_state_read_backend
ON migration.domain_state (
  read_backend
);

-- ============================================================
-- BACKFILL CHECKPOINTS
--
-- Stores resumable progress for every domain.
--
-- cursor_value is intentionally TEXT because Mongo ObjectIds,
-- timestamps, logical IDs and compound cursors can all be
-- represented safely without coupling the control plane to a
-- specific source model.
-- ============================================================

CREATE TABLE IF NOT EXISTS migration.checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  organization_id UUID NOT NULL
    REFERENCES tenancy.organizations(id)
    ON DELETE CASCADE,

  environment_id UUID NOT NULL
    REFERENCES tenancy.environments(id)
    ON DELETE CASCADE,

  domain TEXT NOT NULL,

  cursor_value TEXT,

  batch_number BIGINT NOT NULL DEFAULT 0,

  scanned_count BIGINT NOT NULL DEFAULT 0,

  migrated_count BIGINT NOT NULL DEFAULT 0,

  skipped_count BIGINT NOT NULL DEFAULT 0,

  failed_count BIGINT NOT NULL DEFAULT 0,

  source_high_watermark TEXT,

  completed BOOLEAN NOT NULL DEFAULT FALSE,

  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT migration_checkpoint_scope_unique
    UNIQUE (
      organization_id,
      environment_id,
      domain
    ),

  CONSTRAINT migration_checkpoint_counts_nonnegative
    CHECK (
      batch_number >= 0
      AND scanned_count >= 0
      AND migrated_count >= 0
      AND skipped_count >= 0
      AND failed_count >= 0
    )
);

CREATE INDEX IF NOT EXISTS
  idx_migration_checkpoints_scope
ON migration.checkpoints (
  organization_id,
  environment_id
);

CREATE INDEX IF NOT EXISTS
  idx_migration_checkpoints_incomplete
ON migration.checkpoints (
  organization_id,
  environment_id,
  completed
)
WHERE completed = FALSE;

-- ============================================================
-- MIGRATION HISTORY
--
-- Immutable-ish operator history for state transitions.
-- Application code should INSERT events, never UPDATE them.
-- ============================================================

CREATE TABLE IF NOT EXISTS migration.history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  organization_id UUID NOT NULL
    REFERENCES tenancy.organizations(id)
    ON DELETE CASCADE,

  environment_id UUID NOT NULL
    REFERENCES tenancy.environments(id)
    ON DELETE CASCADE,

  domain TEXT NOT NULL,

  event_type TEXT NOT NULL,

  previous_phase TEXT,

  next_phase TEXT,

  source_backend TEXT,

  target_backend TEXT,

  details JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS
  idx_migration_history_scope_domain
ON migration.history (
  organization_id,
  environment_id,
  domain,
  created_at DESC
);

-- ============================================================
-- VERIFICATION RESULTS
--
-- Phase 13.5C will populate this table.
-- Creating it now keeps the control-plane schema coherent.
-- ============================================================

CREATE TABLE IF NOT EXISTS migration.verification_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  organization_id UUID NOT NULL
    REFERENCES tenancy.organizations(id)
    ON DELETE CASCADE,

  environment_id UUID NOT NULL
    REFERENCES tenancy.environments(id)
    ON DELETE CASCADE,

  domain TEXT NOT NULL,

  verification_type TEXT NOT NULL,

  source_count BIGINT,

  target_count BIGINT,

  checked_count BIGINT NOT NULL DEFAULT 0,

  mismatch_count BIGINT NOT NULL DEFAULT 0,

  passed BOOLEAN NOT NULL DEFAULT FALSE,

  details JSONB NOT NULL DEFAULT '{}'::jsonb,

  verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT migration_verification_counts_nonnegative
    CHECK (
      checked_count >= 0
      AND mismatch_count >= 0
    )
);

CREATE INDEX IF NOT EXISTS
  idx_migration_verification_scope
ON migration.verification_results (
  organization_id,
  environment_id,
  domain,
  verified_at DESC
);

-- ============================================================
-- UPDATED_AT TRIGGERS
-- Reuse AIRA's existing common timestamp function.
-- ============================================================

DROP TRIGGER IF EXISTS
  trg_migration_domain_state_updated_at
ON migration.domain_state;

CREATE TRIGGER
  trg_migration_domain_state_updated_at
BEFORE UPDATE
ON migration.domain_state
FOR EACH ROW
EXECUTE FUNCTION
  public.aira_set_updated_at();


DROP TRIGGER IF EXISTS
  trg_migration_checkpoints_updated_at
ON migration.checkpoints;

CREATE TRIGGER
  trg_migration_checkpoints_updated_at
BEFORE UPDATE
ON migration.checkpoints
FOR EACH ROW
EXECUTE FUNCTION
  public.aira_set_updated_at();