# AIRA Phase 25 — Feature Layer Bundle

Drop this `features/` folder under:

`frontend/src/features/`

This bundle deliberately contains only feature-owned UI modules. It does **not**
overwrite router, App.tsx, server.js, auth/session code, product runtime stores,
backend APIs, or persistence.

## Included Phase 25 slices

- 25.4A Owner/Admin Enterprise Dashboard V2
- 25.4B SRE / Platform Engineer Operations Dashboard V2
- 25.4C Developer Experience
- 25.4D Security / Auditor Governance Experience
- 25.4E Executive Reliability Experience
- 25.4F Persona experience matrix
- Incident Command Center V2 feature surface
- Shadow Mode product experience
- Product notification inbox
- Evidence-driven onboarding
- Reliability overview
- Team operations / routing surface
- Shared Phase 25 feature primitives

## Integration paths expected

Typical routes:

- `/overview` → `OwnerAdminOverviewPage` for administration persona
- `/operations` → `OperationsOverviewPage`
- `/services` or developer landing → `DeveloperOverviewPage`
- `/governance` → `GovernanceOverviewPage`
- executive `/overview` → `ExecutiveOverviewPage`
- `/incidents/:incidentId` → `IncidentCommandCenterPage`
- `/shadow` → `ShadowModePage`
- `/notifications` → `ProductNotificationsPage`
- `/onboarding` → `ProductOnboardingPage`
- `/reliability` → `ReliabilityOverviewPage`
- team operations surface → `TeamOperationsPage`

## Important boundary

The included fixtures are intentionally synthetic presentation fixtures. They
must be replaced by authoritative Product BFF / PostgreSQL projection read
models in Phase 25.6.

No page in this bundle grants execution authority. Product persona,
confidence, recommendation, approval display, trust, or certification must
never be treated as backend authorization.
