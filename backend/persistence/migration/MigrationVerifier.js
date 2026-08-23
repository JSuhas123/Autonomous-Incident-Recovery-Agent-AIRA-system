"use strict";

const VerificationCanonicalizer =
  require(
    "./VerificationCanonicalizer"
  );

const VerificationReport =
  require(
    "./VerificationReport"
  );

class MigrationVerifier {
  constructor(
    options = {}
  ) {
    this.canonicalizer =
      options.canonicalizer ||
      new VerificationCanonicalizer();

    this.verificationStore =
      options.verificationStore ||
      null;

    this.stateStore =
      options.stateStore ||
      null;

    this.cutoverPolicy =
      options.cutoverPolicy ||
      null;

    this.logger =
      options.logger ||
      console;
  }

  async verify({
    domain,
    adapter,
    sourceScope,
    repositoryScope,
    controlScope,
    sampleLimit =
      null,
    persistResult =
      true,
  } = {}) {
    if (
      !domain
    ) {
      throw Object.assign(
        new Error(
          "Migration verification domain is required"
        ),
        {
          code:
            "MIGRATION_VERIFICATION_DOMAIN_REQUIRED",
        }
      );
    }

    if (
      !adapter
    ) {
      throw Object.assign(
        new Error(
          `Migration verification adapter missing for ${domain}`
        ),
        {
          code:
            "MIGRATION_VERIFICATION_ADAPTER_REQUIRED",
        }
      );
    }

    const report =
      new VerificationReport(
        domain
      );

    const sourceCount =
      await adapter
        .countSource(
          sourceScope
        );

    const targetCount =
      await adapter
        .countTarget(
          repositoryScope
        );

    report.setCounts(
      sourceCount,
      targetCount
    );

    const sourceRecords =
      await adapter
        .readSource({
          scope:
            sourceScope,

          limit:
            sampleLimit,
        });

    for (
      const sourceRecord
      of sourceRecords
    ) {
      const logicalId =
        adapter.getSourceIdentity(
          sourceRecord
        );

      if (
        !logicalId
      ) {
        report
          .checked();

        report
          .mismatch({
            sourceId:
              null,

            type:
              "SOURCE_IDENTITY_MISSING",

            message:
              "Source record has no logical verification identity",
          });

        continue;
      }

      const targetRecord =
        await adapter
          .findTarget(
            repositoryScope,
            logicalId
          );

      report.checked();

      if (
        !targetRecord
      ) {
        report
          .mismatch({
            sourceId:
              logicalId,

            type:
              "TARGET_RECORD_MISSING",

            message:
              `Target record missing for ${logicalId}`,
          });

        continue;
      }

      const sourceCanonical =
        adapter
          .canonicalizeSource
          ? adapter
              .canonicalizeSource(
                sourceRecord
              )
          : sourceRecord;

      const targetCanonical =
        adapter
          .canonicalizeTarget
          ? adapter
              .canonicalizeTarget(
                targetRecord
              )
          : targetRecord;

      const ignoredFields =
        adapter
          .ignoredFields ||
        [];

      const sourceChecksum =
        this.canonicalizer
          .checksum(
            sourceCanonical,
            {
              ignoredFields,
            }
          );

      const targetChecksum =
        this.canonicalizer
          .checksum(
            targetCanonical,
            {
              ignoredFields,
            }
          );

      if (
        sourceChecksum !==
        targetChecksum
      ) {
        report
          .mismatch({
            sourceId:
              logicalId,

            targetId:
              adapter
                .getTargetIdentity
                ? adapter
                    .getTargetIdentity(
                      targetRecord
                    )
                : logicalId,

            type:
              "CONTENT_MISMATCH",

            sourceChecksum,

            targetChecksum,

            fields:
              this.findDifferentFields(
                sourceCanonical,
                targetCanonical,
                ignoredFields
              ),
          });
      }
    }

    report.complete();

    const result =
      report.toJSON();

    if (
      persistResult &&
      this.verificationStore
    ) {
      await this
        .verificationStore
        .record(
          controlScope,
          domain,
          {
            verificationType:
              "full-parity",

            sourceCount:
              result.sourceCount,

            targetCount:
              result.targetCount,

            checkedCount:
              result.checkedCount,

            mismatchCount:
              result.mismatchCount,

            passed:
              result.passed,

            details: {
              countParity:
                result.countParity,

              sampleLimit,

              mismatches:
                result.mismatches
                  .slice(
                    0,
                    100
                  ),
            },
          }
        );
    }

    return result;
  }

  findDifferentFields(
    source,
    target,
    ignoredFields =
      []
  ) {
    const ignored =
      new Set(
        ignoredFields
      );

    const sourceObject =
      this.canonicalizer
        .canonicalize(
          source,
          {
            ignoredFields,
          }
        );

    const targetObject =
      this.canonicalizer
        .canonicalize(
          target,
          {
            ignoredFields,
          }
        );

    const keys =
      new Set([
        ...Object.keys(
          sourceObject ||
          {}
        ),

        ...Object.keys(
          targetObject ||
          {}
        ),
      ]);

    const different =
      [];

    for (
      const key
      of keys
    ) {
      if (
        ignored.has(
          key
        )
      ) {
        continue;
      }

      const left =
        JSON.stringify(
          sourceObject?.[
            key
          ]
        );

      const right =
        JSON.stringify(
          targetObject?.[
            key
          ]
        );

      if (
        left !==
        right
      ) {
        different.push(
          key
        );
      }
    }

    return different
      .sort();
  }
}

module.exports =
  MigrationVerifier;