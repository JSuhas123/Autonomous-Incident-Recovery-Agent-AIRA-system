"use strict";

const MigrationDomainRegistry =
  require(
    "../../persistence/migration/MigrationDomainRegistry"
  );

const MigrationCutoverPolicy =
  require(
    "../../persistence/migration/MigrationCutoverPolicy"
  );

const {
  getMigrationConfig,
} =
  require(
    "../../config/migration"
  );

describe(
  "Phase 13.5 migration control plane",
  () => {
    const originalEnv = {
      ...process.env,
    };

    afterEach(
      () => {
        process.env = {
          ...originalEnv,
        };
      }
    );

    test(
      "domain registry exposes core persistence domains",
      () => {
        const registry =
          new MigrationDomainRegistry();

        expect(
          registry.has(
            "incidents"
          )
        )
          .toBe(
            true
          );

        expect(
          registry.has(
            "signals"
          )
        )
          .toBe(
            true
          );

        expect(
          registry.has(
            "recoveryDecisions"
          )
        )
          .toBe(
            true
          );

        expect(
          registry.has(
            "workflowOutbox"
          )
        )
          .toBe(
            true
          );
      }
    );

    test(
      "unknown migration domain is rejected",
      () => {
        const registry =
          new MigrationDomainRegistry();

        expect(
          () =>
            registry.get(
              "does-not-exist"
            )
        )
          .toThrow(
            "Unknown migration domain"
          );
      }
    );

    test(
      "valid migration transitions are allowed",
      () => {
        const policy =
          new MigrationCutoverPolicy();

        expect(
          policy.canTransition(
            "pending",
            "backfilling"
          )
        )
          .toBe(
            true
          );

        expect(
          policy.canTransition(
            "verified",
            "shadow"
          )
        )
          .toBe(
            true
          );

        expect(
          policy.canTransition(
            "shadow",
            "cutover"
          )
        )
          .toBe(
            true
          );
      }
    );

    test(
      "unsafe direct cutover is rejected",
      () => {
        const policy =
          new MigrationCutoverPolicy();

        expect(
          () =>
            policy.assertTransition(
              "pending",
              "cutover"
            )
        )
          .toThrow(
            "Invalid migration transition"
          );
      }
    );

    test(
      "cutover requires backfill verification and shadow",
      () => {
        const policy =
          new MigrationCutoverPolicy();

        expect(
          () =>
            policy.assertCutoverAllowed({
              phase:
                "shadow",

              backfill_complete:
                false,

              verification_complete:
                true,
            })
        )
          .toThrow(
            "completed backfill"
          );

        expect(
          () =>
            policy.assertCutoverAllowed({
              phase:
                "shadow",

              backfill_complete:
                true,

              verification_complete:
                false,
            })
        )
          .toThrow(
            "successful verification"
          );

        expect(
          () =>
            policy.assertCutoverAllowed({
              phase:
                "verified",

              backfill_complete:
                true,

              verification_complete:
                true,
            })
        )
          .toThrow(
            "shadow phase"
          );

        expect(
          () =>
            policy.assertCutoverAllowed({
              phase:
                "shadow",

              backfill_complete:
                true,

              verification_complete:
                true,
            })
        )
          .not
          .toThrow();
      }
    );

    test(
      "postgres becomes read backend after cutover",
      () => {
        const policy =
          new MigrationCutoverPolicy();

        expect(
          policy.getReadBackend({
            phase:
              "cutover",
            read_backend:
              "mongo",
          })
        )
          .toBe(
            "postgres"
          );
      }
    );

    test(
      "migration is disabled by default",
      () => {
        delete process.env
          .MIGRATION_MODE;

        const config =
          getMigrationConfig();

        expect(
          config.enabled
        )
          .toBe(
            false
          );

        expect(
          config.mode
        )
          .toBe(
            "disabled"
          );
      }
    );

    test(
      "invalid migration mode fails closed",
      () => {
        process.env
          .MIGRATION_MODE =
          "YOLO";

        expect(
          () =>
            getMigrationConfig()
        )
          .toThrow(
            "Unsupported migration mode"
          );
      }
    );
  }
);