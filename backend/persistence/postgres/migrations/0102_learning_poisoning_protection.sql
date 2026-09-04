-- ============================================================================
-- AIRA PHASE 24.6
-- HUMAN LEARNING POISONING PROTECTION
--
-- RETRIEVED CONTENT != SYSTEM INSTRUCTION
-- HUMAN ASSERTION != VERIFIED FACT
-- SERVICE RESTORED != ROOT CAUSE CORRECTED
-- MITIGATION != ROOT FIX
-- POISONING PASS != EXECUTION AUTHORITY
-- ============================================================================

BEGIN;


CREATE TABLE IF NOT EXISTS
    learning.evidence_trust_assessments (
        id UUID PRIMARY KEY
            DEFAULT gen_random_uuid(),

        public_id TEXT NOT NULL
            UNIQUE
            DEFAULT (
                'letrust_' ||
                replace(
                    gen_random_uuid()::text,
                    '-',
                    ''
                )
            ),

        organization_id UUID NOT NULL
            REFERENCES tenancy.organizations(id)
            ON DELETE CASCADE,

        environment_id UUID NOT NULL
            REFERENCES tenancy.environments(id)
            ON DELETE CASCADE,

        candidate_id UUID NOT NULL,

        content_channel TEXT NOT NULL,

        trust_level TEXT NOT NULL,

        trusted BOOLEAN NOT NULL,

        reasons JSONB NOT NULL
            DEFAULT '[]'::jsonb,

        metadata JSONB NOT NULL
            DEFAULT '{}'::jsonb,

        execution_authorized BOOLEAN NOT NULL
            DEFAULT FALSE,

        created_at TIMESTAMPTZ NOT NULL
            DEFAULT NOW(),

        CONSTRAINT learning_evidence_trust_candidate_fk
            FOREIGN KEY (
                organization_id,
                environment_id,
                candidate_id
            )
            REFERENCES learning.knowledge_candidates (
                organization_id,
                environment_id,
                id
            )
            ON DELETE CASCADE,

        CONSTRAINT learning_evidence_channel_check
            CHECK (
                content_channel IN (
                    'SYSTEM_POLICY',
                    'OPERATOR_ASSERTION',
                    'RETRIEVED_EVIDENCE',
                    'TOOL_OUTPUT',
                    'MODEL_INTERPRETATION',
                    'VALIDATED_FACT'
                )
            ),

        CONSTRAINT learning_evidence_trust_level_check
            CHECK (
                trust_level IN (
                    'UNTRUSTED',
                    'LOW',
                    'MEDIUM',
                    'HIGH',
                    'VERIFIED'
                )
            ),

        CONSTRAINT learning_evidence_trust_reasons_array
            CHECK (
                jsonb_typeof(reasons) =
                    'array'
            ),

        CONSTRAINT learning_evidence_trust_metadata_object
            CHECK (
                jsonb_typeof(metadata) =
                    'object'
            ),

        CONSTRAINT learning_evidence_trust_never_authorizes
            CHECK (
                execution_authorized =
                    FALSE
            ),

        UNIQUE (
            organization_id,
            environment_id,
            id
        )
    );


CREATE TABLE IF NOT EXISTS
    learning.poisoning_findings (
        id UUID PRIMARY KEY
            DEFAULT gen_random_uuid(),

        public_id TEXT NOT NULL
            UNIQUE
            DEFAULT (
                'lpoison_' ||
                replace(
                    gen_random_uuid()::text,
                    '-',
                    ''
                )
            ),

        organization_id UUID NOT NULL
            REFERENCES tenancy.organizations(id)
            ON DELETE CASCADE,

        environment_id UUID NOT NULL
            REFERENCES tenancy.environments(id)
            ON DELETE CASCADE,

        candidate_id UUID NOT NULL,

        poisoning_class TEXT NOT NULL,

        detected BOOLEAN NOT NULL,

        severity TEXT NOT NULL,

        evidence JSONB NOT NULL
            DEFAULT '[]'::jsonb,

        reason TEXT NOT NULL,

        execution_authorized BOOLEAN NOT NULL
            DEFAULT FALSE,

        created_at TIMESTAMPTZ NOT NULL
            DEFAULT NOW(),

        CONSTRAINT learning_poisoning_candidate_fk
            FOREIGN KEY (
                organization_id,
                environment_id,
                candidate_id
            )
            REFERENCES learning.knowledge_candidates (
                organization_id,
                environment_id,
                id
            )
            ON DELETE CASCADE,

        CONSTRAINT learning_poisoning_class_check
            CHECK (
                poisoning_class IN (
                    'BAD_HUMAN_RESOLUTION',
                    'INCORRECT_RCA',
                    'MALICIOUS_OPERATOR_CONTENT',
                    'PROMPT_INJECTION',
                    'RETRIEVED_EVIDENCE_POISONING',
                    'FALSE_SUCCESS',
                    'TEMPORARY_MITIGATION',
                    'CONTRADICTORY_EVIDENCE',
                    'UNSUPPORTED_CAUSAL_CLAIM',
                    'SECRET_EXFILTRATION',
                    'CROSS_TENANT_CONTAMINATION',
                    'RUNBOOK_INSTRUCTION_INJECTION'
                )
            ),

        CONSTRAINT learning_poisoning_severity_check
            CHECK (
                severity IN (
                    'LOW',
                    'MEDIUM',
                    'HIGH',
                    'CRITICAL'
                )
            ),

        CONSTRAINT learning_poisoning_evidence_array
            CHECK (
                jsonb_typeof(evidence) =
                    'array'
            ),

        CONSTRAINT learning_poisoning_never_authorizes
            CHECK (
                execution_authorized =
                    FALSE
            )
    );


CREATE TABLE IF NOT EXISTS
    learning.outcome_verifications (
        id UUID PRIMARY KEY
            DEFAULT gen_random_uuid(),

        public_id TEXT NOT NULL
            UNIQUE
            DEFAULT (
                'lout_' ||
                replace(
                    gen_random_uuid()::text,
                    '-',
                    ''
                )
            ),

        organization_id UUID NOT NULL
            REFERENCES tenancy.organizations(id)
            ON DELETE CASCADE,

        environment_id UUID NOT NULL
            REFERENCES tenancy.environments(id)
            ON DELETE CASCADE,

        candidate_id UUID NOT NULL,

        service_restored BOOLEAN NOT NULL
            DEFAULT FALSE,

        root_cause_corrected BOOLEAN NOT NULL
            DEFAULT FALSE,

        stability_window_pass BOOLEAN NOT NULL
            DEFAULT FALSE,

        recurrence_check_pass BOOLEAN NOT NULL
            DEFAULT FALSE,

        metrics_normalized BOOLEAN NOT NULL
            DEFAULT FALSE,

        dependency_health_pass BOOLEAN NOT NULL
            DEFAULT FALSE,

        independent_verification_pass BOOLEAN NOT NULL
            DEFAULT FALSE,

        root_cause_evidence_pass BOOLEAN NOT NULL
            DEFAULT FALSE,

        false_success_detected BOOLEAN NOT NULL
            DEFAULT FALSE,

        temporary_mitigation_detected BOOLEAN NOT NULL
            DEFAULT FALSE,

        evidence JSONB NOT NULL
            DEFAULT '{}'::jsonb,

        execution_authorized BOOLEAN NOT NULL
            DEFAULT FALSE,

        created_at TIMESTAMPTZ NOT NULL
            DEFAULT NOW(),

        CONSTRAINT learning_outcome_candidate_fk
            FOREIGN KEY (
                organization_id,
                environment_id,
                candidate_id
            )
            REFERENCES learning.knowledge_candidates (
                organization_id,
                environment_id,
                id
            )
            ON DELETE CASCADE,

        CONSTRAINT learning_outcome_evidence_object
            CHECK (
                jsonb_typeof(evidence) =
                    'object'
            ),

        CONSTRAINT learning_outcome_never_authorizes
            CHECK (
                execution_authorized =
                    FALSE
            )
    );


ALTER TABLE
    learning.evidence_trust_assessments
ENABLE ROW LEVEL SECURITY;

ALTER TABLE
    learning.evidence_trust_assessments
FORCE ROW LEVEL SECURITY;


ALTER TABLE
    learning.poisoning_findings
ENABLE ROW LEVEL SECURITY;

ALTER TABLE
    learning.poisoning_findings
FORCE ROW LEVEL SECURITY;


ALTER TABLE
    learning.outcome_verifications
ENABLE ROW LEVEL SECURITY;

ALTER TABLE
    learning.outcome_verifications
FORCE ROW LEVEL SECURITY;


CREATE POLICY
    learning_evidence_trust_scope
ON learning.evidence_trust_assessments
FOR ALL
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

    AND

    execution_authorized =
        FALSE
);


CREATE POLICY
    learning_poisoning_findings_scope
ON learning.poisoning_findings
FOR ALL
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

    AND

    execution_authorized =
        FALSE
);


CREATE POLICY
    learning_outcome_verifications_scope
ON learning.outcome_verifications
FOR ALL
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

    AND

    execution_authorized =
        FALSE
);


COMMIT;