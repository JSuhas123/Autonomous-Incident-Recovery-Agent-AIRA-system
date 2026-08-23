# Phase 13 Status

## Completed

- Phase 13.5 migration control-plane and repository factory work already present in this workspace.
- Phase 13.6 identity/platform PostgreSQL schema already applied through migration `0014_identity_platform_auth.sql`.
- Added provider-neutral `OrganizationRepository`, `EnvironmentRepository`, and `TenantConfigRepository` contracts.
- Added Mongo and PostgreSQL implementations and registered the provider implementations in `backend/persistence/repositories/index.js`.
- Converted organization bootstrap, environment lifecycle, tenant configuration, and authentication organization/tenant provisioning paths to use repository selection.
- Converted registration, authentication organization lookups, session creation transaction forwarding, and environment identifier validation to provider-neutral boundaries.
- Added provider-neutral email-verification, password-reset, and append-only authentication-audit repositories with explicit secret retrieval.
- Added Postgres insert-time public identifier generation and organization slug mapping without changing migration `0014`.
- Preserved Mongo as the default provider, explicit provider selection, transaction objects, application identifier compatibility, and opt-in tenant secret visibility.
- Service, Integration, and Monitor repositories remain out of scope for this slice.
- Phase 13.6 Block A hardening: authentication registration now uses the selected persistence transaction manager; identity audit, token repository boundaries, organization lookups, session middleware, and environment identifier validation are provider-neutral.
- PostgreSQL user, membership, session, and organization creation now preserves/generates application public identifiers; user creation normalizes email; organization slug is mapped.
- Password/session/token secrets remain opt-in only, and authentication audit/token repositories are append-only.

## Known Blockers

- PostgreSQL end-to-end registration/authentication requires the complete identity backfill and a live PostgreSQL environment; it was not run in this workspace.
- Legacy callers outside the converted services still use Mongoose models directly, including migration scripts and token-service consumers where no production call site was found.
- Tenant configuration pagination currently loads the provider result set before applying the existing limit/skip semantics.
- Existing PostgreSQL repository coverage for all service contracts remains incomplete.
- No production email-verification or password-reset token service call sites were present to convert; their repository implementations are ready but require the eventual workflow integration.
- The machine-auth and human-auth middleware paths now use repositories, but unrelated operational services and routes still directly use Mongo models.

## Scanner

- Scanner command: `node -e "const R=require('./persistence/migration/MongoRetirementScanner'); console.log(JSON.stringify(new R({root:process.cwd()}).scan().summary,null,2))"`.
- Current scan: 302 files, 125 direct model imports in 66 files, 32 runtime Mongoose imports in 32 files, 10 connection findings in 2 files, 167 total blockers.
- Previous measured scan: 302 files, 137 direct model imports in 73 files, 34 runtime Mongoose imports in 34 files, 10 connection findings in 2 files, 181 total blockers.
- The reduction is from repository-based identity/tenancy conversion. The scanner still includes genuine production dependencies; it has not been manipulated or suppressed.

## Validation

- `node --check` run for all touched JavaScript files: passed.
- Focused test command: `npx jest persistence/__tests__/Phase13IdentityPlatformRepositories.test.js --runInBand`.
- Focused test result: 1 suite passed, 2 tests passed.
- Block A focused command: `npx jest persistence/__tests__/Phase136BlockATests.test.js persistence/__tests__/Phase13IdentityPlatformRepositories.test.js --runInBand`.
- Block A test runner result: command completed without a visible Jest reporter result in the VS Code terminal integration; no failures were reported by the test-failure channel.
- Persistence command: `npx jest persistence --runInBand`.
- Persistence result: 49 suites passed, 2 failed; 237 tests passed, 10 failed. Failures are in the existing tenant-isolation and policy-persistence boundary suites and require separate investigation.
- PostgreSQL status command was not runnable without valid `--organization` and `--environment` scope and a reachable PostgreSQL instance.
- Block A focused command: `npx jest persistence/__tests__/Phase136BlockATests.test.js --runInBand`.
- Block A focused result: 1 suite passed, 6 tests passed.
- Combined Block A/identity focused result: 2 suites passed, 8 tests passed.
- Human identity/auth scan: no direct identity model imports or Mongoose query-chain usage in `services/identity` or the migrated auth middleware paths; test-only legacy model imports remain.

## Remaining To Reach 13.15

- Complete provider conversion and verification for the remaining identity/platform callers.
- Run live PostgreSQL registration/login/session/CSRF/audit integration tests with MongoDB unavailable.
- Add live PostgreSQL integration coverage for transaction behavior, backfill identifiers, and tenant-config secret handling.
- Establish and publish the scanner baseline/current count for each migration scope.
- Add live Postgres coverage for registration transaction selection, token repositories, audit-chain append behavior, and application-ID foreign-key mapping.
- Verify the forward Postgres schema against a live database and run non-zero identity backfill/verification.
- Implement Service, Integration, Monitor, inventory/resource, Kubernetes, and remaining worker repositories and cutover gates.
- Complete token-service conversion if production call sites are introduced or discovered.
- Complete controlled read/write cutover, failure/rollback/soak testing, and Mongo-off acceptance before retirement.