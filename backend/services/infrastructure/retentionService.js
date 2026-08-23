"use strict";

const {
  DecisionTrace,
  FailedMessage,
  RetentionArchive,
} =
  require(
    "../../persistence/operational/extendedModels"
  );

const {
  IncidentMemory,
  RunbookExecution,
} =
  require(
    "../../persistence/operational/legacyModels"
  );

const crypto =
  require(
    "node:crypto"
  );





const {
  TenantConfig,
} = require(
  "../../persistence/operational/identityModels"
);


const distributedLockService =
  require(
    "./distributedLockService"
  );


// ============================================================================
// DEFAULTS
// ============================================================================

const DAY_MS =
  24 *
  60 *
  60 *
  1000;


const DEFAULT_POLICY =
  Object.freeze({
    incidentMemoryDays:
      30,

    decisionTraceDays:
      90,

    runbookExecutionDays:
      90,

    failedMessageDays:
      7,

    auditRetentionDays:
      2555,

    batchSize:
      500,

    incidentMemoryLimit:
      10000,

    decisionTraceLimit:
      50000,

    archiveEnabled:
      true,
  });


// ============================================================================
// HELPERS
// ============================================================================

function positiveInteger(
  value,
  fallback,
  maximum =
    Number.MAX_SAFE_INTEGER
) {
  const parsed =
    Number.parseInt(
      value,
      10
    );

  if (
    !Number.isFinite(
      parsed
    ) ||
    parsed <=
      0
  ) {
    return fallback;
  }

  return Math.min(
    parsed,
    maximum
  );
}


function canonicalize(
  value
) {
  if (
    value ===
      null ||
    value ===
      undefined
  ) {
    return JSON.stringify(
      value ??
      null
    );
  }

  if (
    value instanceof
    Date
  ) {
    return JSON.stringify(
      value.toISOString()
    );
  }

  if (
    Array.isArray(
      value
    )
  ) {
    return (
      "[" +
      value
        .map(
          canonicalize
        )
        .join(
          ","
        ) +
      "]"
    );
  }

  if (
    typeof value ===
      "object"
  ) {
    return (
      "{" +
      Object
        .keys(
          value
        )
        .sort()
        .map(
          (
            key
          ) =>
            JSON.stringify(
              key
            ) +
            ":" +
            canonicalize(
              value[
                key
              ]
            )
        )
        .join(
          ","
        ) +
      "}"
    );
  }

  return JSON.stringify(
    value
  );
}


function checksum(
  payload
) {
  return crypto
    .createHash(
      "sha256"
    )
    .update(
      canonicalize(
        payload
      ),
      "utf8"
    )
    .digest(
      "hex"
    );
}


// ============================================================================
// SERVICE
// ============================================================================

class RetentionService {
  constructor() {
    this.lastRun = {
      startedAt:
        null,

      completedAt:
        null,

      durationMs:
        null,

      dryRun:
        false,

      tenantsProcessed:
        0,

      archived:
        0,

      deleted:
        0,

      skipped:
        0,

      failed:
        0,

      lastError:
        null,

      executionAuthorized:
        false,
    };
  }


  // ==========================================================================
  // POLICY
  // ==========================================================================

  getTenantPolicy(
    tenantConfig
  ) {
    const configured =
      tenantConfig
        ?.settings
        ?.retention ||
      {};


    return {
      incidentMemoryDays:
        positiveInteger(
          configured
            .incidentMemoryDays,
          DEFAULT_POLICY
            .incidentMemoryDays,
          3650
        ),

      decisionTraceDays:
        positiveInteger(
          configured
            .decisionTraceDays,
          DEFAULT_POLICY
            .decisionTraceDays,
          3650
        ),

      runbookExecutionDays:
        positiveInteger(
          configured
            .runbookExecutionDays,
          DEFAULT_POLICY
            .runbookExecutionDays,
          3650
        ),

      failedMessageDays:
        positiveInteger(
          configured
            .failedMessageDays,
          DEFAULT_POLICY
            .failedMessageDays,
          365
        ),

      auditRetentionDays:
        positiveInteger(
          configured
            .auditRetentionDays ||
          tenantConfig
            ?.settings
            ?.auditRetentionDays,
          DEFAULT_POLICY
            .auditRetentionDays,
          36500
        ),

      batchSize:
        positiveInteger(
          configured
            .batchSize,
          DEFAULT_POLICY
            .batchSize,
          5000
        ),

      incidentMemoryLimit:
        positiveInteger(
          configured
            .incidentMemoryLimit,
          DEFAULT_POLICY
            .incidentMemoryLimit
        ),

      decisionTraceLimit:
        positiveInteger(
          configured
            .decisionTraceLimit,
          DEFAULT_POLICY
            .decisionTraceLimit
        ),

      archiveEnabled:
        configured
          .archiveEnabled !==
        false,
    };
  }


  cutoff(
    days
  ) {
    return new Date(
      Date.now() -
      days *
      DAY_MS
    );
  }


  // ==========================================================================
  // ARCHIVE
  // ==========================================================================

  async archiveDocuments({
    tenantId,
    sourceModel,
    documents,
    archiveReason,
    timestampField,
    dryRun =
      false,
  }) {
    if (
      !documents.length
    ) {
      return {
        archived:
          0,

        dryRun,

        executionAuthorized:
          false,
      };
    }


    if (
      dryRun
    ) {
      return {
        archived:
          documents.length,

        dryRun:
          true,

        executionAuthorized:
          false,
      };
    }


    const operations =
      documents.map(
        (
          document
        ) => {
          const payload =
            document;


          const sourceId =
            String(
              document._id
            );


          return {
            updateOne: {
              filter: {
                sourceModel,

                sourceId,
              },

              update: {
                $setOnInsert: {
                  tenantId,

                  sourceModel,

                  sourceId,

                  sourceTimestamp:
                    timestampField &&
                    document[
                      timestampField
                    ]
                      ? new Date(
                          document[
                            timestampField
                          ]
                        )
                      : null,

                  payload,

                  checksum:
                    checksum(
                      payload
                    ),

                  archiveReason,

                  archivedAt:
                    new Date(),
                },
              },

              upsert:
                true,
            },
          };
        }
      );


    await RetentionArchive
      .bulkWrite(
        operations,
        {
          ordered:
            false,
        }
      );


    return {
      archived:
        documents.length,

      dryRun:
        false,

      executionAuthorized:
        false,
    };
  }


  // ==========================================================================
  // ARCHIVE THEN DELETE
  // ==========================================================================

  async archiveAndDelete({
    Model,
    tenantId,
    query,
    sort,
    sourceModel,
    archiveReason,
    timestampField,
    batchSize,
    dryRun,
    archiveEnabled,
  }) {
    const documents =
      await Model
        .find(
          query
        )
        .sort(
          sort
        )
        .limit(
          batchSize
        )
        .lean();


    if (
      !documents.length
    ) {
      return {
        selected:
          0,

        archived:
          0,

        deleted:
          0,

        dryRun,

        executionAuthorized:
          false,
      };
    }


    if (
      dryRun
    ) {
      return {
        selected:
          documents.length,

        archived:
          archiveEnabled
            ? documents.length
            : 0,

        deleted:
          documents.length,

        dryRun:
          true,

        executionAuthorized:
          false,
      };
    }


    if (
      archiveEnabled
    ) {
      await this
        .archiveDocuments({
          tenantId,

          sourceModel,

          documents,

          archiveReason,

          timestampField,

          dryRun:
            false,
        });
    }


    const ids =
      documents.map(
        (
          document
        ) =>
          document._id
      );


    const deletion =
      await Model
        .deleteMany({
          _id: {
            $in:
              ids,
          },
        });


    return {
      selected:
        documents.length,

      archived:
        archiveEnabled
          ? documents.length
          : 0,

      deleted:
        deletion
          .deletedCount ||
        0,

      dryRun:
        false,

      executionAuthorized:
        false,
    };
  }


  // ==========================================================================
  // DIRECT DELETE
  // ==========================================================================

  async deleteBatch({
    Model,
    query,
    sort,
    batchSize,
    dryRun,
  }) {
    const documents =
      await Model
        .find(
          query
        )
        .sort(
          sort
        )
        .limit(
          batchSize
        )
        .select(
          "_id"
        )
        .lean();


    if (
      dryRun
    ) {
      return {
        selected:
          documents.length,

        deleted:
          documents.length,

        dryRun:
          true,

        executionAuthorized:
          false,
      };
    }


    if (
      !documents.length
    ) {
      return {
        selected:
          0,

        deleted:
          0,

        dryRun:
          false,

        executionAuthorized:
          false,
      };
    }


    const result =
      await Model
        .deleteMany({
          _id: {
            $in:
              documents.map(
                (
                  document
                ) =>
                  document._id
              ),
          },
        });


    return {
      selected:
        documents.length,

      deleted:
        result
          .deletedCount ||
        0,

      dryRun:
        false,

      executionAuthorized:
        false,
    };
  }


  // ==========================================================================
  // TENANT CLEANUP
  // ==========================================================================

  async cleanupTenant(
    tenantConfig,
    {
      dryRun =
        false,
    } = {}
  ) {
    const tenantId =
      tenantConfig
        .tenantId;


    const policy =
      this
        .getTenantPolicy(
          tenantConfig
        );


    const results = {
      tenantId,

      policy,

      dryRun,

      incidentMemory:
        null,

      decisionTrace:
        null,

      runbookExecution:
        null,

      failedMessage:
        null,

      audit:
        {
          policy:
            "PRESERVE_CHAIN",

          retentionDays:
            policy
              .auditRetentionDays,

          deleted:
            0,

          executionAuthorized:
            false,
        },

      authenticationAudit:
        {
          policy:
            "PRESERVE_CHAIN",

          deleted:
            0,

          executionAuthorized:
            false,
        },

      executionAuthorized:
        false,
    };


    // ------------------------------------------------------------------------
    // INACTIVE INCIDENT MEMORY
    // ------------------------------------------------------------------------

    results.incidentMemory =
      await this
        .archiveAndDelete({
          Model:
            IncidentMemory,

          tenantId,

          query: {
            tenantId,

            isActive:
              false,

            updatedAt: {
              $lt:
                this.cutoff(
                  policy
                    .incidentMemoryDays
                ),
            },
          },

          sort: {
            updatedAt:
              1,
          },

          sourceModel:
            "IncidentMemory",

          archiveReason:
            "RETENTION_TTL",

          timestampField:
            "updatedAt",

          batchSize:
            policy
              .batchSize,

          dryRun,

          archiveEnabled:
            policy
              .archiveEnabled,
        });


    // ------------------------------------------------------------------------
    // DECISION TRACE
    // ------------------------------------------------------------------------

    results.decisionTrace =
      await this
        .archiveAndDelete({
          Model:
            DecisionTrace,

          tenantId,

          query: {
            tenantId,

            createdAt: {
              $lt:
                this.cutoff(
                  policy
                    .decisionTraceDays
                ),
            },
          },

          sort: {
            createdAt:
              1,
          },

          sourceModel:
            "DecisionTrace",

          archiveReason:
            "RETENTION_TTL",

          timestampField:
            "createdAt",

          batchSize:
            policy
              .batchSize,

          dryRun,

          archiveEnabled:
            policy
              .archiveEnabled,
        });


    // ------------------------------------------------------------------------
    // RUNBOOK EXECUTION
    // ------------------------------------------------------------------------

    results.runbookExecution =
      await this
        .archiveAndDelete({
          Model:
            RunbookExecution,

          tenantId,

          query: {
            tenantId,

            startTime: {
              $lt:
                this.cutoff(
                  policy
                    .runbookExecutionDays
                ),
            },
          },

          sort: {
            startTime:
              1,
          },

          sourceModel:
            "RunbookExecution",

          archiveReason:
            "RETENTION_TTL",

          timestampField:
            "startTime",

          batchSize:
            policy
              .batchSize,

          dryRun,

          archiveEnabled:
            policy
              .archiveEnabled,
        });


    // ------------------------------------------------------------------------
    // RESOLVED FAILED MESSAGES
    // ------------------------------------------------------------------------

    results.failedMessage =
      await this
        .deleteBatch({
          Model:
            FailedMessage,

          query: {
            tenantId,

            status:
              "resolved",

            dlqEntryTime: {
              $lt:
                this.cutoff(
                  policy
                    .failedMessageDays
                ),
            },
          },

          sort: {
            dlqEntryTime:
              1,
          },

          batchSize:
            policy
              .batchSize,

          dryRun,
        });


    return results;
  }


  // ==========================================================================
  // PER-TENANT HOT COLLECTION LIMITS
  // ==========================================================================

  async enforceTenantLimits(
    tenantConfig,
    {
      dryRun =
        false,
    } = {}
  ) {
    const tenantId =
      tenantConfig
        .tenantId;


    const policy =
      this
        .getTenantPolicy(
          tenantConfig
        );


    const result = {
      tenantId,

      incidentMemory:
        null,

      decisionTrace:
        null,

      dryRun,

      executionAuthorized:
        false,
    };


    const memoryCount =
      await IncidentMemory
        .countDocuments({
          tenantId,
        });


    if (
      memoryCount >
      policy
        .incidentMemoryLimit
    ) {
      const excess =
        Math.min(
          memoryCount -
            policy
              .incidentMemoryLimit,
          policy
            .batchSize
        );


      result.incidentMemory =
        await this
          .archiveAndDelete({
            Model:
              IncidentMemory,

            tenantId,

            query: {
              tenantId,

              isActive:
                false,
            },

            sort: {
              updatedAt:
                1,
            },

            sourceModel:
              "IncidentMemory",

            archiveReason:
              "HOT_COLLECTION_LIMIT",

            timestampField:
              "updatedAt",

            batchSize:
              excess,

            dryRun,

            archiveEnabled:
              policy
                .archiveEnabled,
          });
    }


    const traceCount =
      await DecisionTrace
        .countDocuments({
          tenantId,
        });


    if (
      traceCount >
      policy
        .decisionTraceLimit
    ) {
      const excess =
        Math.min(
          traceCount -
            policy
              .decisionTraceLimit,
          policy
            .batchSize
        );


      result.decisionTrace =
        await this
          .archiveAndDelete({
            Model:
              DecisionTrace,

            tenantId,

            query: {
              tenantId,
            },

            sort: {
              createdAt:
                1,
            },

            sourceModel:
              "DecisionTrace",

            archiveReason:
              "HOT_COLLECTION_LIMIT",

            timestampField:
              "createdAt",

            batchSize:
              excess,

            dryRun,

            archiveEnabled:
              policy
                .archiveEnabled,
          });
    }


    return result;
  }


  // ==========================================================================
  // FULL CYCLE
  // ==========================================================================

  async runCycle({
    dryRun =
      false,
  } = {}) {
    const startedAt =
      new Date();


    const lockKey =
      "phase11:retention-cleanup";


    let lock =
      null;


    try {
      /*
       * One cleanup coordinator globally.
       *
       * Prevent two AIRA instances from archiving/deleting the
       * same hot records simultaneously.
       */
      lock =
        await distributedLockService
          .acquire(
            lockKey,
            5 *
              60 *
              1000,
            1000
          );


      const tenants =
        await TenantConfig
          .find({
            status: {
              $ne:
                "archived",
            },
          })
          .select(
            "tenantId settings status"
          )
          .lean();


      const results = {
        startedAt,

        completedAt:
          null,

        durationMs:
          null,

        dryRun,

        tenants:
          {},

        summary: {
          tenantsProcessed:
            0,

          archived:
            0,

          deleted:
            0,

          failed:
            0,

          auditRecordsDeleted:
            0,
        },

        executionAuthorized:
          false,
      };


      for (
        const tenant
        of tenants
      ) {
        try {
          const cleanup =
            await this
              .cleanupTenant(
                tenant,
                {
                  dryRun,
                }
              );


          const enforcement =
            await this
              .enforceTenantLimits(
                tenant,
                {
                  dryRun,
                }
              );


          results
            .tenants[
              tenant
                .tenantId
            ] = {
              cleanup,

              enforcement,
            };


          const archivalResults = [
            cleanup
              .incidentMemory,

            cleanup
              .decisionTrace,

            cleanup
              .runbookExecution,

            enforcement
              .incidentMemory,

            enforcement
              .decisionTrace,
          ]
            .filter(
              Boolean
            );


          const deletionResults = [
            ...archivalResults,

            cleanup
              .failedMessage,
          ]
            .filter(
              Boolean
            );


          results
            .summary
            .archived +=
            archivalResults
              .reduce(
                (
                  total,
                  current
                ) =>
                  total +
                  (
                    current
                      .archived ||
                    0
                  ),
                0
              );


          results
            .summary
            .deleted +=
            deletionResults
              .reduce(
                (
                  total,
                  current
                ) =>
                  total +
                  (
                    current
                      .deleted ||
                    0
                  ),
                0
              );


          results
            .summary
            .tenantsProcessed +=
            1;
        } catch (
          error
        ) {
          results
            .summary
            .failed +=
            1;


          results
            .tenants[
              tenant
                .tenantId
            ] = {
              error:
                error.message,

              code:
                error.code ||
                "RETENTION_TENANT_FAILED",

              executionAuthorized:
                false,
            };
        }
      }


      results.completedAt =
        new Date();


      results.durationMs =
        results
          .completedAt
          .getTime() -
        startedAt
          .getTime();


      this.lastRun = {
        startedAt:
          results
            .startedAt,

        completedAt:
          results
            .completedAt,

        durationMs:
          results
            .durationMs,

        dryRun,

        tenantsProcessed:
          results
            .summary
            .tenantsProcessed,

        archived:
          results
            .summary
            .archived,

        deleted:
          results
            .summary
            .deleted,

        failed:
          results
            .summary
            .failed,

        lastError:
          null,

        executionAuthorized:
          false,
      };


      return results;
    } catch (
      error
    ) {
      this.lastRun = {
        ...this.lastRun,

        startedAt,

        completedAt:
          new Date(),

        dryRun,

        lastError:
          error.message,

        executionAuthorized:
          false,
      };


      throw error;
    } finally {
      if (
        lock &&
        typeof lock
          .release ===
        "function"
      ) {
        try {
          await lock
            .release();
        } catch (
          error
        ) {
          console.warn(
            "[retention] Failed to release cleanup lock:",
            error.message
          );
        }
      }
    }
  }


  // ==========================================================================
  // STATUS
  // ==========================================================================

  getStatus() {
    return {
      lastRun:
        this.lastRun,

      defaults:
        DEFAULT_POLICY,

      protectedCollections: [
        "AuditEvent",
        "AuthenticationAuditEvent",
      ],

      executionAuthorized:
        false,
    };
  }
}


module.exports =
  new RetentionService();

module.exports
  .RetentionService =
  RetentionService;

module.exports
  .DEFAULT_POLICY =
  DEFAULT_POLICY;