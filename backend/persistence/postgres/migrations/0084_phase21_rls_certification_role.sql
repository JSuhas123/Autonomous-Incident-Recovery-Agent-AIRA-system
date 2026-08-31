BEGIN;

-- ============================================================================
-- AIRA PHASE 21.10C
-- RELIABILITY LAB RLS CERTIFICATION ROLE
--
-- PURPOSE
-- -------
-- The normal local development role "aira" is the PostgreSQL bootstrap/admin
-- role and may therefore have SUPERUSER / BYPASSRLS privileges.
--
-- Such a role cannot be used to prove Row Level Security enforcement.
--
-- This migration creates a deliberately restricted NOLOGIN role that the
-- Reliability Lab may SET ROLE into while performing RLS certification.
--
-- IMPORTANT
-- ---------
-- This role:
--   - is NOT a production execution identity
--   - does NOT grant AIRA execution authorization
--   - cannot bypass RLS
--   - cannot create databases or roles
--   - cannot login directly
--   - has only the minimum privileges required for the Phase 21.10C canary
-- ============================================================================


-- ============================================================================
-- CREATE / HARDEN ROLE
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT
            1
        FROM pg_roles
        WHERE rolname = 'aira_rls_certifier'
    ) THEN
        CREATE ROLE aira_rls_certifier
            NOLOGIN
            NOSUPERUSER
            NOCREATEDB
            NOCREATEROLE
            NOREPLICATION
            NOBYPASSRLS
            NOINHERIT;
    END IF;
END
$$;


ALTER ROLE aira_rls_certifier
    NOLOGIN
    NOSUPERUSER
    NOCREATEDB
    NOCREATEROLE
    NOREPLICATION
    NOBYPASSRLS
    NOINHERIT;


-- ============================================================================
-- ALLOW LOCAL ADMIN ROLE TO TEMPORARILY ASSUME CERTIFIER ROLE
--
-- This does NOT make aira_rls_certifier inheritable.
-- The certification transaction must explicitly:
--
--     SET LOCAL ROLE aira_rls_certifier;
--
-- ============================================================================

GRANT aira_rls_certifier
TO aira;


-- ============================================================================
-- SCHEMA ACCESS
-- ============================================================================

GRANT USAGE
ON SCHEMA tenancy
TO aira_rls_certifier;


GRANT USAGE
ON SCHEMA resources
TO aira_rls_certifier;


-- ============================================================================
-- TENANCY SCOPE FUNCTIONS
--
-- RLS policies on tenant-owned operational tables call these functions.
-- ============================================================================

GRANT EXECUTE
ON FUNCTION tenancy.current_organization_id()
TO aira_rls_certifier;


GRANT EXECUTE
ON FUNCTION tenancy.current_environment_id()
TO aira_rls_certifier;


-- ============================================================================
-- MINIMUM CANARY TABLE PRIVILEGES
--
-- RLS remains responsible for deciding which rows are visible/mutable.
--
-- The role intentionally receives no UPDATE privilege because Phase 21.10C
-- only needs:
--
--   target tenant -> INSERT canary
--   target tenant -> SELECT own canary
--   source tenant -> SELECT target canary, expecting zero rows
--   target tenant -> DELETE canary
-- ============================================================================

GRANT SELECT, INSERT, DELETE
ON TABLE resources.resources
TO aira_rls_certifier;


-- ============================================================================
-- DEFENSIVE VALIDATION
-- ============================================================================

DO $$
DECLARE
    certifier_exists BOOLEAN;
    certifier_superuser BOOLEAN;
    certifier_bypass_rls BOOLEAN;
    certifier_can_login BOOLEAN;
    certifier_create_db BOOLEAN;
    certifier_create_role BOOLEAN;
BEGIN
    SELECT
        TRUE,
        rolsuper,
        rolbypassrls,
        rolcanlogin,
        rolcreatedb,
        rolcreaterole
    INTO
        certifier_exists,
        certifier_superuser,
        certifier_bypass_rls,
        certifier_can_login,
        certifier_create_db,
        certifier_create_role
    FROM pg_roles
    WHERE rolname = 'aira_rls_certifier';


    IF certifier_exists IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION
            'PHASE21_RLS_CERTIFIER_ROLE_MISSING';
    END IF;


    IF certifier_superuser THEN
        RAISE EXCEPTION
            'PHASE21_RLS_CERTIFIER_MUST_NOT_BE_SUPERUSER';
    END IF;


    IF certifier_bypass_rls THEN
        RAISE EXCEPTION
            'PHASE21_RLS_CERTIFIER_MUST_NOT_BYPASS_RLS';
    END IF;


    IF certifier_can_login THEN
        RAISE EXCEPTION
            'PHASE21_RLS_CERTIFIER_MUST_BE_NOLOGIN';
    END IF;


    IF certifier_create_db THEN
        RAISE EXCEPTION
            'PHASE21_RLS_CERTIFIER_MUST_NOT_CREATEDB';
    END IF;


    IF certifier_create_role THEN
        RAISE EXCEPTION
            'PHASE21_RLS_CERTIFIER_MUST_NOT_CREATEROLE';
    END IF;
END
$$;


COMMENT ON ROLE aira_rls_certifier IS
'Phase 21 Reliability Lab PostgreSQL RLS certification role. NOLOGIN, NOSUPERUSER, NOBYPASSRLS and non-authorizing.';


COMMIT;