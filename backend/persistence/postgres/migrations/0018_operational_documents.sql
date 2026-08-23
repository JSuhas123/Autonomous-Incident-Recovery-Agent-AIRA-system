CREATE SCHEMA IF NOT EXISTS operational;

CREATE TABLE IF NOT EXISTS operational.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  domain TEXT NOT NULL,

  public_id TEXT NOT NULL,

  legacy_mongo_id TEXT,

  organization_id UUID NOT NULL
    REFERENCES tenancy.organizations(id)
    ON DELETE CASCADE,

  environment_id UUID
    REFERENCES tenancy.environments(id)
    ON DELETE CASCADE,

  document JSONB NOT NULL
    DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL
    DEFAULT NOW(),

  updated_at TIMESTAMPTZ NOT NULL
    DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS
  idx_operational_documents_domain_public
ON operational.documents(
  domain,
  public_id
);

CREATE UNIQUE INDEX IF NOT EXISTS
  idx_operational_documents_domain_legacy
ON operational.documents(
  domain,
  legacy_mongo_id
)
WHERE legacy_mongo_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS
  idx_operational_documents_scope
ON operational.documents(
  organization_id,
  environment_id,
  domain,
  updated_at DESC
);

CREATE INDEX IF NOT EXISTS
  idx_operational_documents_document_gin
ON operational.documents
USING GIN(document);

ALTER TABLE operational.documents
  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS
  operational_documents_scope_policy
ON operational.documents;

CREATE POLICY operational_documents_scope_policy
ON operational.documents
USING (
  organization_id =
    tenancy.current_organization_id()

  AND

  (
    environment_id IS NULL

    OR

    environment_id =
      tenancy.current_environment_id()
  )
)
WITH CHECK (
  organization_id =
    tenancy.current_organization_id()

  AND

  (
    environment_id IS NULL

    OR

    environment_id =
      tenancy.current_environment_id()
  )
);