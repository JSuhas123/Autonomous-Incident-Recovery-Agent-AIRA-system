-- ============================================================================
-- AIRA PHASE 13.3
-- MIGRATION 0005 — ROW LEVEL SECURITY + TENANT INTEGRITY
-- ============================================================================

-- ============================================================================
-- SESSION CONTEXT HELPERS
-- ============================================================================

CREATE OR REPLACE FUNCTION tenancy.current_organization_id()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(
    current_setting(
      'aira.organization_id',
      true
    ),
    ''
  )::UUID
$$;

CREATE OR REPLACE FUNCTION tenancy.current_environment_id()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(
    current_setting(
      'aira.environment_id',
      true
    ),
    ''
  )::UUID
$$;

-- ============================================================================
-- ENABLE RLS
-- ============================================================================

ALTER TABLE resources.resources
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE resources.resource_relationships
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE signals.signals
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE signals.correlation_groups
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE incidents.incidents
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE incidents.incident_events
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE incidents.incident_lifecycle
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE incidents.diagnoses
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE agents.intelligence_runs
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE execution.recovery_decision_runs
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE execution.recovery_decisions
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE execution.authorizations
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE execution.execution_requests
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE execution.approvals
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE workflow.runtime_recovery_checkpoints
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE workflow.outbox_events
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE audit.decision_traces
  ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- FORCE RLS
-- ============================================================================

ALTER TABLE resources.resources
  FORCE ROW LEVEL SECURITY;

ALTER TABLE resources.resource_relationships
  FORCE ROW LEVEL SECURITY;

ALTER TABLE signals.signals
  FORCE ROW LEVEL SECURITY;

ALTER TABLE signals.correlation_groups
  FORCE ROW LEVEL SECURITY;

ALTER TABLE incidents.incidents
  FORCE ROW LEVEL SECURITY;

ALTER TABLE incidents.incident_events
  FORCE ROW LEVEL SECURITY;

ALTER TABLE incidents.incident_lifecycle
  FORCE ROW LEVEL SECURITY;

ALTER TABLE incidents.diagnoses
  FORCE ROW LEVEL SECURITY;

ALTER TABLE agents.intelligence_runs
  FORCE ROW LEVEL SECURITY;

ALTER TABLE execution.recovery_decision_runs
  FORCE ROW LEVEL SECURITY;

ALTER TABLE execution.recovery_decisions
  FORCE ROW LEVEL SECURITY;

ALTER TABLE execution.authorizations
  FORCE ROW LEVEL SECURITY;

ALTER TABLE execution.execution_requests
  FORCE ROW LEVEL SECURITY;

ALTER TABLE execution.approvals
  FORCE ROW LEVEL SECURITY;

ALTER TABLE workflow.runtime_recovery_checkpoints
  FORCE ROW LEVEL SECURITY;

ALTER TABLE workflow.outbox_events
  FORCE ROW LEVEL SECURITY;

ALTER TABLE audit.decision_traces
  FORCE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

CREATE POLICY resources_scope_policy
ON resources.resources
USING (
  organization_id =
    tenancy.current_organization_id()
  AND
  environment_id =
    tenancy.current_environment_id()
)
WITH CHECK (
  organization_id =
    tenancy.current_organization_id()
  AND
  environment_id =
    tenancy.current_environment_id()
);

CREATE POLICY resource_relationships_scope_policy
ON resources.resource_relationships
USING (
  organization_id =
    tenancy.current_organization_id()
  AND
  environment_id =
    tenancy.current_environment_id()
)
WITH CHECK (
  organization_id =
    tenancy.current_organization_id()
  AND
  environment_id =
    tenancy.current_environment_id()
);

CREATE POLICY signals_scope_policy
ON signals.signals
USING (
  organization_id =
    tenancy.current_organization_id()
  AND
  environment_id =
    tenancy.current_environment_id()
)
WITH CHECK (
  organization_id =
    tenancy.current_organization_id()
  AND
  environment_id =
    tenancy.current_environment_id()
);

CREATE POLICY correlation_groups_scope_policy
ON signals.correlation_groups
USING (
  organization_id =
    tenancy.current_organization_id()
  AND
  environment_id =
    tenancy.current_environment_id()
)
WITH CHECK (
  organization_id =
    tenancy.current_organization_id()
  AND
  environment_id =
    tenancy.current_environment_id()
);

CREATE POLICY incidents_scope_policy
ON incidents.incidents
USING (
  organization_id =
    tenancy.current_organization_id()
  AND
  environment_id =
    tenancy.current_environment_id()
)
WITH CHECK (
  organization_id =
    tenancy.current_organization_id()
  AND
  environment_id =
    tenancy.current_environment_id()
);

CREATE POLICY incident_events_scope_policy
ON incidents.incident_events
USING (
  organization_id =
    tenancy.current_organization_id()
  AND
  environment_id =
    tenancy.current_environment_id()
)
WITH CHECK (
  organization_id =
    tenancy.current_organization_id()
  AND
  environment_id =
    tenancy.current_environment_id()
);

CREATE POLICY lifecycle_scope_policy
ON incidents.incident_lifecycle
USING (
  organization_id =
    tenancy.current_organization_id()
  AND
  environment_id =
    tenancy.current_environment_id()
)
WITH CHECK (
  organization_id =
    tenancy.current_organization_id()
  AND
  environment_id =
    tenancy.current_environment_id()
);

CREATE POLICY diagnoses_scope_policy
ON incidents.diagnoses
USING (
  organization_id =
    tenancy.current_organization_id()
  AND
  environment_id =
    tenancy.current_environment_id()
)
WITH CHECK (
  organization_id =
    tenancy.current_organization_id()
  AND
  environment_id =
    tenancy.current_environment_id()
);

CREATE POLICY intelligence_runs_scope_policy
ON agents.intelligence_runs
USING (
  organization_id =
    tenancy.current_organization_id()
  AND
  environment_id =
    tenancy.current_environment_id()
)
WITH CHECK (
  organization_id =
    tenancy.current_organization_id()
  AND
  environment_id =
    tenancy.current_environment_id()
);

CREATE POLICY recovery_runs_scope_policy
ON execution.recovery_decision_runs
USING (
  organization_id =
    tenancy.current_organization_id()
  AND
  environment_id =
    tenancy.current_environment_id()
)
WITH CHECK (
  organization_id =
    tenancy.current_organization_id()
  AND
  environment_id =
    tenancy.current_environment_id()
);

CREATE POLICY recovery_decisions_scope_policy
ON execution.recovery_decisions
USING (
  organization_id =
    tenancy.current_organization_id()
  AND
  environment_id =
    tenancy.current_environment_id()
)
WITH CHECK (
  organization_id =
    tenancy.current_organization_id()
  AND
  environment_id =
    tenancy.current_environment_id()
);

CREATE POLICY authorizations_scope_policy
ON execution.authorizations
USING (
  organization_id =
    tenancy.current_organization_id()
  AND
  environment_id =
    tenancy.current_environment_id()
)
WITH CHECK (
  organization_id =
    tenancy.current_organization_id()
  AND
  environment_id =
    tenancy.current_environment_id()
);

CREATE POLICY execution_requests_scope_policy
ON execution.execution_requests
USING (
  organization_id =
    tenancy.current_organization_id()
  AND
  environment_id =
    tenancy.current_environment_id()
)
WITH CHECK (
  organization_id =
    tenancy.current_organization_id()
  AND
  environment_id =
    tenancy.current_environment_id()
);

CREATE POLICY approvals_scope_policy
ON execution.approvals
USING (
  organization_id =
    tenancy.current_organization_id()
  AND
  environment_id =
    tenancy.current_environment_id()
)
WITH CHECK (
  organization_id =
    tenancy.current_organization_id()
  AND
  environment_id =
    tenancy.current_environment_id()
);

CREATE POLICY runtime_checkpoint_scope_policy
ON workflow.runtime_recovery_checkpoints
USING (
  organization_id =
    tenancy.current_organization_id()
  AND
  environment_id =
    tenancy.current_environment_id()
)
WITH CHECK (
  organization_id =
    tenancy.current_organization_id()
  AND
  environment_id =
    tenancy.current_environment_id()
);

CREATE POLICY outbox_scope_policy
ON workflow.outbox_events
USING (
  organization_id IS NULL
  OR
  (
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
)
WITH CHECK (
  organization_id IS NULL
  OR
  (
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
);

CREATE POLICY decision_traces_scope_policy
ON audit.decision_traces
USING (
  organization_id =
    tenancy.current_organization_id()
  AND
  environment_id =
    tenancy.current_environment_id()
)
WITH CHECK (
  organization_id =
    tenancy.current_organization_id()
  AND
  environment_id =
    tenancy.current_environment_id()
);

-- ============================================================================
-- AUDIT EVENTS
--
-- Audit currently scopes primarily through tenant identity rather than
-- environment identity, so it intentionally receives a different RLS policy.
-- ============================================================================

ALTER TABLE audit.audit_events
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE audit.audit_events
  FORCE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION tenancy.current_tenant_public_id()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(
    current_setting(
      'aira.tenant_public_id',
      true
    ),
    ''
  )
$$;

CREATE POLICY audit_events_tenant_policy
ON audit.audit_events
USING (
  tenant_public_id =
    tenancy.current_tenant_public_id()
)
WITH CHECK (
  tenant_public_id =
    tenancy.current_tenant_public_id()
);

-- ============================================================================
-- TENANT/ENVIRONMENT CONSISTENCY TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION tenancy.assert_environment_organization()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  environment_organization UUID;
BEGIN
  SELECT organization_id
  INTO environment_organization
  FROM tenancy.environments
  WHERE id =
    NEW.environment_id;

  IF environment_organization IS NULL THEN
    RAISE EXCEPTION
      'Environment % does not exist',
      NEW.environment_id;
  END IF;

  IF environment_organization <>
     NEW.organization_id THEN
    RAISE EXCEPTION
      'Environment % does not belong to organization %',
      NEW.environment_id,
      NEW.organization_id;
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================================
-- INSTALL CONSISTENCY TRIGGERS
-- ============================================================================

CREATE TRIGGER trg_incidents_scope_integrity
BEFORE INSERT OR UPDATE
ON incidents.incidents
FOR EACH ROW
EXECUTE FUNCTION
  tenancy.assert_environment_organization();

CREATE TRIGGER trg_signals_scope_integrity
BEFORE INSERT OR UPDATE
ON signals.signals
FOR EACH ROW
EXECUTE FUNCTION
  tenancy.assert_environment_organization();

CREATE TRIGGER trg_correlation_groups_scope_integrity
BEFORE INSERT OR UPDATE
ON signals.correlation_groups
FOR EACH ROW
EXECUTE FUNCTION
  tenancy.assert_environment_organization();

CREATE TRIGGER trg_incident_events_scope_integrity
BEFORE INSERT OR UPDATE
ON incidents.incident_events
FOR EACH ROW
EXECUTE FUNCTION
  tenancy.assert_environment_organization();

CREATE TRIGGER trg_lifecycle_scope_integrity
BEFORE INSERT OR UPDATE
ON incidents.incident_lifecycle
FOR EACH ROW
EXECUTE FUNCTION
  tenancy.assert_environment_organization();

CREATE TRIGGER trg_diagnoses_scope_integrity
BEFORE INSERT OR UPDATE
ON incidents.diagnoses
FOR EACH ROW
EXECUTE FUNCTION
  tenancy.assert_environment_organization();

CREATE TRIGGER trg_intelligence_runs_scope_integrity
BEFORE INSERT OR UPDATE
ON agents.intelligence_runs
FOR EACH ROW
EXECUTE FUNCTION
  tenancy.assert_environment_organization();

CREATE TRIGGER trg_recovery_runs_scope_integrity
BEFORE INSERT OR UPDATE
ON execution.recovery_decision_runs
FOR EACH ROW
EXECUTE FUNCTION
  tenancy.assert_environment_organization();

CREATE TRIGGER trg_recovery_decisions_scope_integrity
BEFORE INSERT OR UPDATE
ON execution.recovery_decisions
FOR EACH ROW
EXECUTE FUNCTION
  tenancy.assert_environment_organization();

CREATE TRIGGER trg_authorizations_scope_integrity
BEFORE INSERT OR UPDATE
ON execution.authorizations
FOR EACH ROW
EXECUTE FUNCTION
  tenancy.assert_environment_organization();

CREATE TRIGGER trg_execution_requests_scope_integrity
BEFORE INSERT OR UPDATE
ON execution.execution_requests
FOR EACH ROW
EXECUTE FUNCTION
  tenancy.assert_environment_organization();

CREATE TRIGGER trg_approvals_scope_integrity
BEFORE INSERT OR UPDATE
ON execution.approvals
FOR EACH ROW
EXECUTE FUNCTION
  tenancy.assert_environment_organization();

CREATE TRIGGER trg_runtime_checkpoints_scope_integrity
BEFORE INSERT OR UPDATE
ON workflow.runtime_recovery_checkpoints
FOR EACH ROW
EXECUTE FUNCTION
  tenancy.assert_environment_organization();

CREATE TRIGGER trg_decision_traces_scope_integrity
BEFORE INSERT OR UPDATE
ON audit.decision_traces
FOR EACH ROW
EXECUTE FUNCTION
  tenancy.assert_environment_organization();