
# Phase 14 — Enterprise SaaS Control Plane

**Status:** ✅ COMPLETE / SECURITY CERTIFIED / FROZEN

Phase 14 transforms AIRA from an infrastructure recovery system with basic authentication and tenant awareness into an **enterprise-grade multi-tenant SaaS control plane**.

The purpose of this phase was not to expand AIRA's incident-recovery intelligence itself. Instead, Phase 14 establishes the identity, authorization, organization, environment, machine-access, enterprise identity, configuration, integration-governance, notification, human-operations, onboarding, audit, and tenant-isolation foundations required to operate AIRA safely as a real multi-tenant product.

Phase 14 establishes a fundamental platform invariant:

> Every action performed inside AIRA must have a known actor, tenant boundary, authorization decision, resource scope, environment boundary where applicable, and auditable outcome.

---

## 14.0 Phase Objectives

Phase 14 was designed around the following production requirements:

- Strong multi-tenant organization isolation
- Environment-aware authorization
- Human and machine identities
- Fine-grained permissions
- Centralized authorization decisions
- Enterprise identity-provider support
- Tenant-specific operational configuration
- Tenant-owned integrations
- Secure credential governance
- Notification routing
- Human intervention workflows
- SaaS onboarding
- Security-sensitive audit completeness
- Cross-tenant attack resistance
- Fail-closed authorization

The result is a control plane capable of supporting organizations with multiple users, environments, integrations, service accounts, policies, and operational workflows without allowing one tenant to escape into another tenant's resources.

---

# Phase 14 Architecture

The Phase 14 control plane follows the general hierarchy:

```text
AIRA SaaS Platform
│
├── Organization
│   │
│   ├── Members
│   │   ├── Owner
│   │   ├── Admin
│   │   ├── Platform Engineer
│   │   ├── Developer
│   │   ├── Security Analyst
│   │   ├── Auditor
│   │   └── Viewer
│   │
│   ├── Teams
│   │   └── Team Members
│   │
│   ├── Environments
│   │   ├── Development
│   │   ├── Staging
│   │   └── Production
│   │
│   ├── Human Identities
│   │
│   ├── Machine Identities
│   │   ├── Service Accounts
│   │   └── API Keys
│   │
│   ├── Enterprise Identity
│   │   ├── Identity Providers
│   │   └── External Identities
│   │
│   ├── Runtime Settings
│   │
│   ├── Integration Governance
│   │
│   ├── Notification Routing
│   │
│   ├── Human Tasks
│   │
│   ├── SaaS Onboarding
│   │
│   └── Audit Control Plane
│
└── Central Authorization Engine
```

The organization is the primary tenant boundary.

Environment-owned resources introduce an additional isolation boundary underneath the organization.

---

# 14.1 — Tenant Foundation

Phase 14.1 established the core tenant-aware authorization architecture.

The system moved away from authorization decisions being scattered throughout routes and services and toward canonical permissions and centralized authorization semantics.

Core concepts introduced include:

```text
Principal
Permission
Organization
Environment
Authorization Decision
```

Authorization follows a fail-closed model.

If AIRA cannot prove that an actor is authorized, the operation is denied.

Unknown permissions do not grant access.

Unknown roles do not receive privileges.

Missing identity context does not silently fall back to privileged behavior.

---

# 14.2 — Environment Control Plane

AIRA supports multiple operational environments belonging to the same organization.

Examples include:

```text
development
staging
production
```

Environment-aware authorization prevents a principal from automatically receiving access to every environment merely because it belongs to an organization.

This is particularly important for machine identities.

For example:

```text
Organization: Acme

Service Account:
    incident-reader

Allowed environments:
    development
    staging
```

The credential cannot automatically access:

```text
production
```

Environment scope is therefore treated independently from organization membership.

---

# 14.3 — Organization, Members and Teams

Phase 14 introduced the enterprise organization control plane.

The platform supports:

- Organization management
- Organization memberships
- Member invitations
- Membership lifecycle
- Role assignment
- Teams
- Team membership
- Organization-scoped administration

Organization operations are permission-controlled rather than being implemented through scattered hard-coded role comparisons.

This was an important architectural change.

Instead of application code asking:

```text
Is this user an ADMIN?
```

the control plane asks:

```text
Does this principal have MEMBER_MANAGE?
```

This makes the authorization architecture extensible and prepares AIRA for future custom roles.

---

# 14.4 — Machine Identity

Production infrastructure systems cannot rely exclusively on human login sessions.

AIRA therefore introduces first-class machine identities through:

```text
Service Accounts
        │
        └── API Keys
```

Service accounts represent automated actors such as:

- CI/CD systems
- Monitoring systems
- Automation platforms
- Infrastructure services
- Internal AIRA workers
- External integrations

Machine credentials carry explicit permissions and environment scope.

Example conceptual principal:

```json
{
  "actorType": "SERVICE_ACCOUNT",
  "organizationId": "org-a",
  "serviceAccountId": "svc-a",
  "apiKeyId": "key-a",
  "permissions": [
    "incident.read"
  ],
  "environmentIds": [
    "development"
  ]
}
```

Machine identities never masquerade as human users.

For service-account requests:

```text
userId = null
actorType = SERVICE_ACCOUNT
```

API keys are handled using secure key-generation and hashing semantics.

Plaintext credentials are not intended to become persistent retrievable secrets.

Legacy or invalid permissions attached to credentials are normalized before authorization.

Unknown permissions are discarded.

---

# 14.5 — Fine-Grained RBAC

Phase 14 replaced broad role checks with canonical fine-grained permissions.

Permissions cover platform capabilities including:

- Organization access
- Membership management
- Team management
- Environment access
- Incident operations
- Resource operations
- Execution operations
- Approval operations
- Playbook operations
- Policy operations
- Integration operations
- Integration credential management
- API-key management
- Service-account management
- Billing-related administration
- Audit access

Roles are implemented as permission bundles.

Conceptually:

```text
ROLE
 │
 └── Permission Bundle
      │
      ├── permission.a
      ├── permission.b
      └── permission.c
```

The Owner role receives the complete canonical permission set.

Less privileged roles receive only their required capabilities.

Important separation-of-duty invariants include:

```text
Developer
    can request/execute appropriate operations
    cannot approve protected execution

Security Analyst
    can approve protected execution
    cannot independently initiate that execution
```

This reduces the possibility of a single compromised account controlling an entire protected recovery workflow.

---

# 14.6 — Central Authorization Engine

One of the most important architectural changes in Phase 14 was the introduction of centralized authorization.

Authorization is no longer intended to be independently interpreted by every route.

The normal request flow is:

```text
Incoming Request
      │
      ▼
Authentication
      │
      ▼
Canonical Principal
      │
      ▼
Organization Resolution
      │
      ▼
Environment Resolution
      │
      ▼
Required Permission
      │
      ▼
Central Authorization Service
      │
      ├── Principal validation
      ├── Permission validation
      ├── Organization scope validation
      ├── Environment scope validation
      └── Permission decision
      │
      ▼
ALLOW / DENY
```

Authorization decisions preserve:

```text
executionAuthorized = false
```

on denied operations.

This is especially important because AIRA ultimately controls infrastructure recovery operations.

Authorization failure must never accidentally become infrastructure-execution permission.

---

## Canonical Principals

The authorization layer operates on normalized principals rather than arbitrary authentication structures.

Human principal:

```text
USER
├── userId
├── organizationId
├── role
└── permissions
```

Machine principal:

```text
SERVICE_ACCOUNT
├── serviceAccountId
├── organizationId
├── apiKeyId
├── permissions
└── environmentIds
```

This allows authorization logic to reason consistently regardless of authentication mechanism.

---

# 14.7 — Enterprise Identity

Phase 14 introduced foundations for enterprise identity-provider integration.

The identity model supports organization-owned identity providers and external identities.

The important security relationship is:

```text
Organization
      │
      └── Identity Provider
              │
              └── External Identity
```

An external identity cannot silently reference an identity provider belonging to another organization.

Database-level scope validation reinforces this relationship.

Enterprise identity serialization also avoids exposing encrypted client-secret material through normal API responses.

This prepares AIRA for future enterprise authentication capabilities such as:

- SSO
- OIDC
- SAML-style enterprise identity flows
- Corporate identity-provider mapping

without weakening tenant boundaries.

---

# 14.8 — Tenant Runtime Settings and Autonomy

Different organizations require different operational policies.

Phase 14 therefore introduced tenant-specific runtime configuration.

AIRA can reason about organization/environment-specific operational settings rather than depending exclusively on global configuration.

This creates the foundation for controlling capabilities such as:

```text
Autonomous recovery
Approval requirements
Environment-specific operational behavior
Safety restrictions
```

Production can therefore be governed differently from development.

Example:

```text
Development
    autonomous execution = enabled

Production
    autonomous execution = restricted
    approval = required
```

Database scope validation ensures that environment settings cannot reference an environment owned by another organization.

---

# 14.9 — Tenant-Owned Integrations

Infrastructure integrations are tenant resources.

An integration belongs to:

```text
Organization
      │
      └── Environment
              │
              └── Integration Connection
```

Integration lookup requires tenant scope.

The system does not perform globally discoverable integration-ID lookups and then check ownership afterward.

Instead, lookup is scoped using organization/environment context.

This prevents insecure direct object reference behavior.

A foreign integration identifier is treated as nonexistent:

```text
404 INTEGRATION_NOT_FOUND
```

rather than exposing:

```text
403 — integration belongs to another tenant
```

The latter could reveal resource existence.

---

## Integration Credential Security

Credential access is separated from normal integration access.

Normal integration responses expose metadata such as whether a credential exists, rather than exposing encrypted credential material.

Conceptually:

```text
Integration Response
├── id
├── provider
├── status
├── configuration
└── hasSecret
```

rather than:

```text
encryptedSecretReference
```

Credential-sensitive operations require explicit credential-management permission.

This creates defense in depth between:

```text
Integration management
```

and:

```text
Integration credential management
```

---

# 14.10 — Notification Routing

AIRA requires a reliable mechanism for routing operational notifications.

Phase 14 introduced tenant-aware notification routing.

Notification channels and routing rules are organization scoped.

The notification layer rejects unsafe credential material inside ordinary routing configuration.

The intended model is:

```text
Incident / Recovery Event
          │
          ▼
Notification Routing
          │
          ├── Tenant
          ├── Environment
          ├── Event Type
          └── Routing Rules
          │
          ▼
Notification Channel
```

This prepares AIRA for integrations such as:

- Slack
- PagerDuty
- Email
- Webhooks
- Enterprise notification systems

while retaining tenant isolation.

---

# 14.11 — HumanTask

AIRA is autonomous, but production infrastructure requires explicit human intervention paths.

Phase 14 introduced HumanTask as the control-plane representation of work requiring operator involvement.

Examples include:

```text
Manual investigation
Approval request
Recovery review
Escalation
Operator intervention
```

Human tasks are organization and environment scoped.

A critical invariant was established:

> A HumanTask cannot itself authorize infrastructure execution.

Human workflow state and execution authorization remain separate concepts.

Conceptually:

```text
HumanTask completed
        │
        ▼
Workflow may continue
        │
        ▼
Authorization / policy evaluated again
        │
        ▼
Execution decision
```

not:

```text
HumanTask completed
        │
        └── automatically authorize infrastructure execution
```

This protects AIRA from workflow-state manipulation becoming an execution bypass.

---

# 14.12 — SaaS Onboarding

Phase 14 introduced an onboarding control plane for bringing organizations into AIRA safely.

Onboarding state is organization scoped.

The onboarding layer establishes the foundation for workflows such as:

```text
Create Organization
        │
        ▼
Configure Organization
        │
        ▼
Create Environment
        │
        ▼
Configure Runtime Safety
        │
        ▼
Connect Infrastructure
        │
        ▼
Configure Integrations
        │
        ▼
Create Machine Identities
        │
        ▼
Configure Notifications
        │
        ▼
Operational Readiness
```

This is important because enterprise infrastructure products cannot rely on manual database configuration to provision every tenant.

---

# 14.13 — Audit Completeness

AIRA performs security-sensitive infrastructure operations.

Auditability therefore forms part of the platform architecture rather than being treated as ordinary application logging.

Phase 14 strengthened audit completeness around identity and authorization operations.

Sensitive metadata is sanitized before audit persistence.

Credential-related values such as:

```text
password
token
API key
client secret
access token
```

must not leak into audit metadata.

Audit certification also establishes concepts around:

```text
Integrity validity
Event-type coverage
Missing expected event types
```

This creates the foundation for later compliance and forensic capabilities.

---

# 14.14 — Cross-Tenant Security Certification

Phase 14 concluded with an explicit security-certification suite.

This phase did not introduce another product capability.

Instead, it attempted to prove that the control-plane architecture created throughout Phase 14 remained fail-closed under hostile tenant-boundary scenarios.

The certification validates the following invariants.

---

## Owner Isolation

Being an organization Owner does not make a principal a platform superuser.

```text
Owner — Organization A

        ✗

Organization B
```

Owner privileges terminate at the organization boundary.

---

## Machine Identity Isolation

Service accounts cannot escape their organization.

```text
Service Account
Organization A

        ✗

Organization B
```

They also cannot escape their configured environment allow-list.

```text
Allowed:
development

Attempt:
production

Result:
DENY
```

An empty environment allow-list does not mean unrestricted access.

It means no environment access.

---

## Unknown Permission Safety

Unknown permissions fail closed.

Even an Owner cannot request an invented privilege such as:

```text
aira.security.root
```

and receive access.

Canonical permission validation occurs before authorization succeeds.

---

## Integration Isolation

Integration resources require organization and environment scope.

Foreign resource identifiers do not disclose whether the resource exists.

Credential material remains separated from ordinary integration serialization.

---

## Enterprise Identity Isolation

Identity-provider ownership and external-identity relationships are organization scoped.

Cross-organization identity-provider relationships are rejected.

---

## Runtime Configuration Isolation

Environment runtime settings cannot reference an environment belonging to another organization.

---

## Notification Isolation

Notification configuration is tenant scoped.

Organization/environment mismatches are rejected.

Secret material is prohibited from ordinary routing configuration.

---

## HumanTask Isolation

Human tasks require tenant/environment scope.

Cross-tenant task relationships are rejected.

Human task completion cannot directly authorize infrastructure execution.

---

## Onboarding Isolation

Onboarding state remains tied to the organization being provisioned.

One organization's onboarding lifecycle cannot become another organization's control-plane state.

---

## Audit Safety

Audit metadata is sanitized.

Security certification verifies expected audit-integrity and event-coverage structures.

---

# Database Evolution During Phase 14

Phase 14 significantly expanded AIRA's PostgreSQL control-plane schema.

Relevant migrations include the identity/control-plane foundation and later enterprise SaaS migrations, including:

```text
0014_identity_platform_auth.sql
0015_identity_organization_provisioning_failed.sql
0016_subscription_entitlements.sql
...
0035_idempotency_records.sql
...
0037_organization_invitations.sql
...
0040_enterprise_identity.sql
0042_tenant_runtime_settings.sql
0043_integration_governance.sql
0044_notification_routing.sql
0045_human_tasks.sql
0046_saas_onboarding.sql
0047_audit_completeness.sql
```

Phase 14 also exposed and resolved an important development-environment issue where the host PostgreSQL service and Docker PostgreSQL instance could be confused.

The final migration workflow was validated against the intended Docker PostgreSQL instance.

The database was rebuilt from a clean volume and migrations were executed from the beginning to verify reproducibility.

This matters because successful incremental development migrations alone do not prove that a new production environment can bootstrap successfully.

---

# PostgreSQL Source of Truth

AIRA's PostgreSQL-backed control plane is expected to be reproducible through migrations.

A fresh database must be able to progress through the migration chain rather than depending on manually created schemas or tables.

The development PostgreSQL target must therefore be verified before performing migrations.

Conceptually:

```text
AIRA Backend
      │
      ▼
Configured PostgreSQL Target
      │
      ▼
Migration Runner
      │
      ▼
Fresh Database
      │
      ▼
All Migrations
      │
      ▼
Current Schema
```

Manual SQL execution should be treated as a diagnostic/recovery mechanism rather than the normal production migration path.

---

# Phase 14 Security Model

The resulting security model can be summarized as:

```text
                    REQUEST
                       │
                       ▼
                Authentication
                       │
                       ▼
              Canonical Principal
                       │
             ┌─────────┴─────────┐
             │                   │
            USER          SERVICE ACCOUNT
             │                   │
             └─────────┬─────────┘
                       │
                       ▼
              Organization Scope
                       │
                mismatch?
                 │           │
                YES          NO
                 │           │
               DENY          ▼
                       Environment Scope
                             │
                      mismatch?
                       │           │
                      YES          NO
                       │           │
                     DENY          ▼
                             Permission Check
                                  │
                            ┌─────┴─────┐
                            │           │
                          DENY        ALLOW
                            │           │
                            ▼           ▼
                     execution=false   Continue
```

The architecture deliberately prefers false denials over accidental privilege escalation.

---

# Phase 14 Core Security Invariants

The following invariants are now considered part of the AIRA architecture:

1. No organization principal may implicitly access another organization.

2. Organization Owner is not equivalent to platform superuser.

3. Environment-scoped resources require environment-aware authorization.

4. Service accounts remain organization scoped.

5. Service accounts remain restricted to explicitly authorized environments.

6. Unknown permissions fail closed.

7. Unknown roles receive no privileges.

8. Machine identities do not masquerade as users.

9. Integration identifiers cannot be used to discover foreign tenant resources.

10. Integration credential access requires stronger authorization than integration metadata access.

11. HumanTask completion cannot independently authorize infrastructure execution.

12. Notification configuration cannot become an arbitrary credential store.

13. Enterprise identities cannot cross identity-provider tenant boundaries.

14. Audit metadata must not contain authentication secrets.

15. Authorization denial must preserve:

```text
executionAuthorized = false
```

16. Authorization logic should flow through the central authorization engine rather than being independently reimplemented throughout routes.

17. Tenant-owned database entities must preserve organization/environment integrity.

---

# Phase 14 Test Strategy

Phase 14 introduced extensive regression tests around the control plane.

Tests cover areas including:

```text
Permission architecture
Role bundle integrity
Organization control plane
Machine identity
API-key authentication
Principal normalization
Central authorization
Environment authorization
Enterprise identity
Tenant configuration
Integration governance
Notification routing
HumanTask
SaaS onboarding
Audit completeness
Cross-tenant security
Final architecture certification
```

The final Phase 14 certification included explicit hostile scenarios rather than only happy-path tests.

Examples include:

```text
Owner A → Organization B              DENY

Service Account A → Organization B    DENY

Service Account DEV → PROD            DENY

Unknown permission → Owner            DENY

Foreign integration ID                404

HumanTask → direct execution auth      DENY

Cross-tenant environment reference    REJECT

Secrets → audit metadata              SANITIZE
```

---

# Phase 14 Completion Gate

Phase 14 was considered complete only after:

```text
Phase 14 unit tests
        │
        ▼
Cross-Tenant Security Certification
        │
        ▼
Final Architecture Certification
        │
        ▼
Complete Phase 14 Regression Suite
        │
        ▼
PASS
```

Final status:

```text
14.1   Tenant Foundation                     ✅
14.2   Environment Control Plane             ✅
14.3   Organization / Members / Teams        ✅
14.4   Machine Identity                      ✅
14.5   Fine-Grained RBAC                     ✅
14.6   Central Authorization                 ✅
14.7   Enterprise Identity                   ✅
14.8   Tenant Runtime Settings               ✅
14.9   Tenant-Owned Integrations             ✅
14.10  Notification Routing                  ✅
14.11  HumanTask                             ✅
14.12  SaaS Onboarding                       ✅
14.13  Audit Completeness                    ✅
14.14  Cross-Tenant Security Certification   ✅

PHASE 14 STATUS:

        🔒 COMPLETE AND FROZEN
```

---

# What Phase 14 Does NOT Do

Phase 14 intentionally does not solve every enterprise-product concern.

In particular, it does not represent the final implementation of:

- Billing economics
- Usage metering
- Commercial plan enforcement
- Invoice generation
- Payment-provider integration
- Production infrastructure execution validation
- Full compliance certification
- Complete production UI
- Global high-availability deployment

Those belong to later phases.

This separation is intentional.

Identity and authorization must remain independent from commercial plan logic.

A request should not become authorized simply because a tenant purchased a particular subscription.

Likewise, subscription entitlement should not replace security authorization.

The architecture therefore distinguishes:

```text
WHO are you?
        ↓
Authentication

WHAT are you allowed to do?
        ↓
Authorization

HAS YOUR ORGANIZATION PURCHASED THIS CAPABILITY?
        ↓
Entitlements

HOW MUCH HAS THE ORGANIZATION USED?
        ↓
Metering
```

---

# Contract Passed to Phase 15

Phase 15 can now assume that every commercial operation has a trustworthy tenant and principal context.

The next layer can therefore build on:

```text
Organization
Environment
Principal
Permission
Authorization
Service Account
Integration
Audit
```

without rebuilding those concepts.

The critical architecture for the next phase becomes:

```text
Authentication
      ↓
Authorization
      ↓
Entitlement
      ↓
Quota / Limit
      ↓
Operation
      ↓
Usage Event
      ↓
Metering
      ↓
Billing
```

Security authorization and commercial entitlement must remain separate.

For example:

```text
User has:
    integration.manage

but organization plan does not include:
    premium_datadog_connector

Result:

AUTHORIZATION = ALLOWED
ENTITLEMENT   = DENIED
OPERATION     = DENIED
```

Conversely:

```text
Organization purchased:
    autonomous_recovery

but user lacks:
    execution.execute

Result:

ENTITLEMENT   = ALLOWED
AUTHORIZATION = DENIED
OPERATION     = DENIED
```

Both gates must succeed.

---

# Phase 14 Final Result

At the end of Phase 14, AIRA is no longer merely an incident-recovery backend with authentication.

It has the foundations of a multi-tenant enterprise control plane capable of reasoning about:

```text
WHO is acting?
WHAT organization owns the request?
WHAT environment is targeted?
WHAT permission is required?
IS the actor allowed in that environment?
IS the resource owned by that tenant?
IS the operation sensitive?
DOES it require human involvement?
WHERE should operators be notified?
CAN the action be audited?
CAN another tenant discover or influence it?
```

That control plane becomes the trust boundary on which the remaining AIRA enterprise platform is built.

---

**Phase 14: COMPLETE.**

**Next: Phase 15.**