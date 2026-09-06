-- ============================================================================
-- AIRA PHASE 25.0B + 25.1A
-- MIGRATION 0105 — ENTERPRISE PRODUCT FOUNDATION
-- ============================================================================
--
-- PURPOSE
--
-- Establish the first canonical Phase 25 product-layer persistence model.
--
-- IMPORTANT ARCHITECTURE
--
-- tenancy.organizations
--     remains the canonical tenant / authorization identity.
--
-- product.organization_profiles
--     contains customer-facing enterprise/company metadata.
--
-- SECURITY INVARIANTS
--
-- 1. Company profile data MUST NOT redefine organization identity.
-- 2. Product metadata MUST NOT grant authorization.
-- 3. Product metadata MUST NOT modify execution authority.
-- 4. Product metadata MUST NOT modify autonomy.
-- 5. Product rows remain organization scoped.
-- 6. tenancy.organizations.slug remains the canonical unique organization slug.
--
-- ============================================================================

BEGIN;


-- ============================================================================
-- PRODUCT SCHEMA
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS product;


-- ============================================================================
-- ORGANIZATION PROFILE
-- ============================================================================

CREATE TABLE IF NOT EXISTS
    product.organization_profiles (
        id UUID PRIMARY KEY
            DEFAULT gen_random_uuid(),

        public_id TEXT NOT NULL
            UNIQUE
            DEFAULT (
                'orgprof_' ||
                replace(
                    gen_random_uuid()::text,
                    '-',
                    ''
                )
            ),

        organization_id UUID NOT NULL
            REFERENCES tenancy.organizations(id)
            ON DELETE CASCADE,

        legal_name TEXT NULL,

        website_url TEXT NULL,

        industry TEXT NULL,

        company_size TEXT NULL,

        employee_count INTEGER NULL,

        headquarters_country_code TEXT NULL,

        operating_region TEXT NULL,

        data_region TEXT NULL,

        primary_domain TEXT NULL,

        technical_maturity TEXT NULL,

        profile_status TEXT NOT NULL
            DEFAULT 'incomplete',

        metadata JSONB NOT NULL
            DEFAULT '{}'::jsonb,

        completed_at TIMESTAMPTZ NULL,

        verified_at TIMESTAMPTZ NULL,

        created_at TIMESTAMPTZ NOT NULL
            DEFAULT NOW(),

        updated_at TIMESTAMPTZ NOT NULL
            DEFAULT NOW(),

        CONSTRAINT product_org_profile_org_unique
            UNIQUE (
                organization_id
            ),

        CONSTRAINT product_org_profile_company_size_check
            CHECK (
                company_size IS NULL
                OR
                company_size IN (
                    'solo',
                    'micro',
                    'small',
                    'medium',
                    'large',
                    'enterprise'
                )
            ),

        CONSTRAINT product_org_profile_employee_count_check
            CHECK (
                employee_count IS NULL
                OR
                employee_count >= 1
            ),

        CONSTRAINT product_org_profile_country_code_check
            CHECK (
                headquarters_country_code IS NULL
                OR
                headquarters_country_code ~
                    '^[A-Z]{2}$'
            ),

        CONSTRAINT product_org_profile_domain_check
            CHECK (
                primary_domain IS NULL
                OR
                (
                    primary_domain =
                        lower(
                            primary_domain
                        )

                    AND

                    primary_domain ~
                        '^[a-z0-9][a-z0-9.-]*[a-z0-9]$'
                )
            ),

        CONSTRAINT product_org_profile_technical_maturity_check
            CHECK (
                technical_maturity IS NULL
                OR
                technical_maturity IN (
                    'emerging',
                    'developing',
                    'established',
                    'advanced'
                )
            ),

        CONSTRAINT product_org_profile_status_check
            CHECK (
                profile_status IN (
                    'incomplete',
                    'complete',
                    'verified'
                )
            ),

        CONSTRAINT product_org_profile_metadata_object
            CHECK (
                jsonb_typeof(
                    metadata
                ) = 'object'
            )
    );


-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS
    idx_product_org_profiles_status
ON product.organization_profiles (
    organization_id,
    profile_status
);


CREATE INDEX IF NOT EXISTS
    idx_product_org_profiles_industry
ON product.organization_profiles (
    industry
)
WHERE industry IS NOT NULL;


CREATE INDEX IF NOT EXISTS
    idx_product_org_profiles_company_size
ON product.organization_profiles (
    company_size
)
WHERE company_size IS NOT NULL;


CREATE INDEX IF NOT EXISTS
    idx_product_org_profiles_primary_domain
ON product.organization_profiles (
    lower(
        primary_domain
    )
)
WHERE primary_domain IS NOT NULL;


-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE
    product.organization_profiles
ENABLE ROW LEVEL SECURITY;


ALTER TABLE
    product.organization_profiles
FORCE ROW LEVEL SECURITY;


DROP POLICY IF EXISTS
    product_organization_profiles_scope
ON product.organization_profiles;


CREATE POLICY
    product_organization_profiles_scope
ON product.organization_profiles
FOR ALL
USING (
    organization_id =
        tenancy.current_organization_id()
)
WITH CHECK (
    organization_id =
        tenancy.current_organization_id()
);


-- ============================================================================
-- COMMENTS / CONTRACT DOCUMENTATION
-- ============================================================================

COMMENT ON SCHEMA product IS
    'AIRA customer-facing product control-plane read/write state. Product state does not grant execution authority.';


COMMENT ON TABLE product.organization_profiles IS
    'Phase 25 enterprise company profile. tenancy.organizations remains the canonical authorization and tenant identity.';


COMMENT ON COLUMN product.organization_profiles.organization_id IS
    'Immutable reference to canonical tenancy organization identity.';


COMMENT ON COLUMN product.organization_profiles.primary_domain IS
    'Claimed primary company domain. Domain verification is a separate security lifecycle and this field alone does not establish ownership.';


COMMENT ON COLUMN product.organization_profiles.technical_maturity IS
    'Product/onboarding classification used for recommendations and UX defaults. It never changes authorization or autonomy.';


COMMENT ON COLUMN product.organization_profiles.profile_status IS
    'Completion status only. verified requires a future explicit verification workflow.';


-- ============================================================================
-- SAFETY CERTIFICATION
-- ============================================================================

DO $$
BEGIN

    IF NOT EXISTS (
        SELECT 1
        FROM pg_class c
        JOIN pg_namespace n
          ON n.oid =
             c.relnamespace
        WHERE
            n.nspname =
                'product'
            AND
            c.relname =
                'organization_profiles'
            AND
            c.relrowsecurity =
                TRUE
            AND
            c.relforcerowsecurity =
                TRUE
    ) THEN
        RAISE EXCEPTION
            'Phase 25 product.organization_profiles must FORCE row-level security';
    END IF;

END $$;


COMMIT;