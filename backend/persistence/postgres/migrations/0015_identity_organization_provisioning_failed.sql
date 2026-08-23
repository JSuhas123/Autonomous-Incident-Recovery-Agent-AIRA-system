-- Phase 13.6 Block A forward migration.
-- Migration 0014 is immutable. Allow the registration retry state used by authService.

DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'tenancy.organizations'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%status%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE tenancy.organizations DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE tenancy.organizations
  ADD CONSTRAINT organizations_status_check
  CHECK (status IN ('provisioning', 'active', 'provisioning_failed', 'suspended', 'pending_deletion', 'deleted'));
