"use strict";

const RetentionArchive =
  require(
    "../../../models/RetentionArchive"
  );

const IncidentMemory =
  require(
    "../../../models/IncidentMemory"
  );

const DecisionTrace =
  require(
    "../../../models/DecisionTrace"
  );

const RunbookExecution =
  require(
    "../../../models/RunbookExecution"
  );

const FailedMessage =
  require(
    "../../../models/FailedMessage"
  );

const TenantConfig =
  require(
    "../../../models/TenantConfig"
  );

const distributedLockService =
  require(
    "../distributedLockService"
  );

const {
  RetentionService,
  DEFAULT_POLICY,
} =
  require(
    "../retentionService"
  );


jest.mock(
  "../../../models/RetentionArchive"
);

jest.mock(
  "../../../models/IncidentMemory"
);

jest.mock(
  "../../../models/DecisionTrace"
);

jest.mock(
  "../../../models/RunbookExecution"
);

jest.mock(
  "../../../models/FailedMessage"
);

jest.mock(
  "../../../models/TenantConfig"
);

jest.mock(
  "../distributedLockService",
  () => ({
    acquire:
      jest.fn(),
  })
);


describe(
  "Phase 11.11 Retention / Cleanup / Archival",
  () => {
    let service;


    beforeEach(
      () => {
        jest.clearAllMocks();

        service =
          new RetentionService();
      }
    );


    // ========================================================================
    // POLICY
    // ========================================================================

    test(
      "returns canonical defaults when tenant policy is absent",
      () => {
        const policy =
          service
            .getTenantPolicy({
              tenantId:
                "tenant-a",

              settings:
                {},
            });


        expect(
          policy
        )
          .toMatchObject(
            DEFAULT_POLICY
          );
      }
    );


    test(
      "tenant retention configuration overrides defaults safely",
      () => {
        const policy =
          service
            .getTenantPolicy({
              tenantId:
                "tenant-a",

              settings: {
                retention: {
                  incidentMemoryDays:
                    45,

                  decisionTraceDays:
                    120,

                  runbookExecutionDays:
                    180,

                  failedMessageDays:
                    14,

                  auditRetentionDays:
                    3650,

                  batchSize:
                    250,

                  incidentMemoryLimit:
                    20000,

                  decisionTraceLimit:
                    75000,

                  archiveEnabled:
                    false,
                },
              },
            });


        expect(
          policy
        )
          .toMatchObject({
            incidentMemoryDays:
              45,

            decisionTraceDays:
              120,

            runbookExecutionDays:
              180,

            failedMessageDays:
              14,

            auditRetentionDays:
              3650,

            batchSize:
              250,

            incidentMemoryLimit:
              20000,

            decisionTraceLimit:
              75000,

            archiveEnabled:
              false,
          });
      }
    );


    // ========================================================================
    // ARCHIVAL
    // ========================================================================

    test(
      "archives selected documents before hot collection deletion",
      async () => {
        const documents = [
          {
            _id:
              "trace-1",

            tenantId:
              "tenant-a",

            createdAt:
              new Date(
                "2025-01-01T00:00:00.000Z"
              ),

            outcome:
              "test",
          },
        ];


        const lean =
          jest.fn()
            .mockResolvedValue(
              documents
            );


        const limit =
          jest.fn()
            .mockReturnValue({
              lean,
            });


        const sort =
          jest.fn()
            .mockReturnValue({
              limit,
            });


        DecisionTrace
          .find
          .mockReturnValue({
            sort,
          });


        RetentionArchive
          .bulkWrite
          .mockResolvedValue({
            upsertedCount:
              1,
          });


        DecisionTrace
          .deleteMany
          .mockResolvedValue({
            deletedCount:
              1,
          });


        const result =
          await service
            .archiveAndDelete({
              Model:
                DecisionTrace,

              tenantId:
                "tenant-a",

              query: {
                tenantId:
                  "tenant-a",
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
                100,

              dryRun:
                false,

              archiveEnabled:
                true,
            });


        expect(
          RetentionArchive
            .bulkWrite
        )
          .toHaveBeenCalledTimes(
            1
          );


        expect(
          DecisionTrace
            .deleteMany
        )
          .toHaveBeenCalledTimes(
            1
          );


        /*
         * Most important contract:
         * archive persistence happens before hot deletion.
         */
        expect(
          RetentionArchive
            .bulkWrite
            .mock
            .invocationCallOrder[0]
        )
          .toBeLessThan(
            DecisionTrace
              .deleteMany
              .mock
              .invocationCallOrder[0]
          );


        expect(
          result
        )
          .toMatchObject({
            selected:
              1,

            archived:
              1,

            deleted:
              1,

            executionAuthorized:
              false,
          });
      }
    );


    test(
      "archive failure prevents source deletion",
      async () => {
        const documents = [
          {
            _id:
              "trace-1",

            tenantId:
              "tenant-a",

            createdAt:
              new Date(),
          },
        ];


        DecisionTrace
          .find
          .mockReturnValue({
            sort:
              jest.fn()
                .mockReturnValue({
                  limit:
                    jest.fn()
                      .mockReturnValue({
                        lean:
                          jest.fn()
                            .mockResolvedValue(
                              documents
                            ),
                      }),
                }),
          });


        RetentionArchive
          .bulkWrite
          .mockRejectedValue(
            new Error(
              "archive unavailable"
            )
          );


        await expect(
          service
            .archiveAndDelete({
              Model:
                DecisionTrace,

              tenantId:
                "tenant-a",

              query: {
                tenantId:
                  "tenant-a",
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
                100,

              dryRun:
                false,

              archiveEnabled:
                true,
            })
        )
          .rejects
          .toThrow(
            "archive unavailable"
          );


        expect(
          DecisionTrace
            .deleteMany
        )
          .not
          .toHaveBeenCalled();
      }
    );


    test(
      "dry run selects records without writing archive or deleting source",
      async () => {
        DecisionTrace
          .find
          .mockReturnValue({
            sort:
              jest.fn()
                .mockReturnValue({
                  limit:
                    jest.fn()
                      .mockReturnValue({
                        lean:
                          jest.fn()
                            .mockResolvedValue([
                              {
                                _id:
                                  "trace-1",
                              },

                              {
                                _id:
                                  "trace-2",
                              },
                            ]),
                      }),
                }),
          });


        const result =
          await service
            .archiveAndDelete({
              Model:
                DecisionTrace,

              tenantId:
                "tenant-a",

              query:
                {},

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
                100,

              dryRun:
                true,

              archiveEnabled:
                true,
            });


        expect(
          RetentionArchive
            .bulkWrite
        )
          .not
          .toHaveBeenCalled();


        expect(
          DecisionTrace
            .deleteMany
        )
          .not
          .toHaveBeenCalled();


        expect(
          result
        )
          .toMatchObject({
            selected:
              2,

            archived:
              2,

            deleted:
              2,

            dryRun:
              true,

            executionAuthorized:
              false,
          });
      }
    );


    // ========================================================================
    // BOUNDED DELETION
    // ========================================================================

    test(
      "direct deletion is bounded by batch size",
      async () => {
        const lean =
          jest.fn()
            .mockResolvedValue([
              {
                _id:
                  "f1",
              },

              {
                _id:
                  "f2",
              },
            ]);


        const select =
          jest.fn()
            .mockReturnValue({
              lean,
            });


        const limit =
          jest.fn()
            .mockReturnValue({
              select,
            });


        const sort =
          jest.fn()
            .mockReturnValue({
              limit,
            });


        FailedMessage
          .find
          .mockReturnValue({
            sort,
          });


        FailedMessage
          .deleteMany
          .mockResolvedValue({
            deletedCount:
              2,
          });


        await service
          .deleteBatch({
            Model:
              FailedMessage,

            query: {
              tenantId:
                "tenant-a",
            },

            sort: {
              dlqEntryTime:
                1,
            },

            batchSize:
              25,

            dryRun:
              false,
          });


        expect(
          limit
        )
          .toHaveBeenCalledWith(
            25
          );
      }
    );


    // ========================================================================
    // AUDIT PROTECTION
    // ========================================================================

    test(
      "tenant cleanup explicitly preserves audit chains",
      async () => {
        const emptyQuery = {
          sort:
            jest.fn()
              .mockReturnValue({
                limit:
                  jest.fn()
                    .mockReturnValue({
                      lean:
                        jest.fn()
                          .mockResolvedValue(
                            []
                          ),
                    }),
              }),
        };


        IncidentMemory
          .find
          .mockReturnValue(
            emptyQuery
          );

        DecisionTrace
          .find
          .mockReturnValue(
            emptyQuery
          );

        RunbookExecution
          .find
          .mockReturnValue(
            emptyQuery
          );


        FailedMessage
          .find
          .mockReturnValue({
            sort:
              jest.fn()
                .mockReturnValue({
                  limit:
                    jest.fn()
                      .mockReturnValue({
                        select:
                          jest.fn()
                            .mockReturnValue({
                              lean:
                                jest.fn()
                                  .mockResolvedValue(
                                    []
                                  ),
                            }),
                      }),
                }),
          });


        const result =
          await service
            .cleanupTenant({
              tenantId:
                "tenant-a",

              settings: {
                retention:
                  {},
              },
            });


        expect(
          result.audit
        )
          .toMatchObject({
            policy:
              "PRESERVE_CHAIN",

            deleted:
              0,

            executionAuthorized:
              false,
          });


        expect(
          result
            .authenticationAudit
        )
          .toMatchObject({
            policy:
              "PRESERVE_CHAIN",

            deleted:
              0,

            executionAuthorized:
              false,
          });
      }
    );


    // ========================================================================
    // DISTRIBUTED COORDINATION
    // ========================================================================

    test(
      "full retention cycle acquires and releases distributed cleanup lock",
      async () => {
        const release =
          jest.fn()
            .mockResolvedValue();


        distributedLockService
          .acquire
          .mockResolvedValue({
            release,
          });


        TenantConfig
          .find
          .mockReturnValue({
            select:
              jest.fn()
                .mockReturnValue({
                  lean:
                    jest.fn()
                      .mockResolvedValue(
                        []
                      ),
                }),
          });


        const result =
          await service
            .runCycle();


        expect(
          distributedLockService
            .acquire
        )
          .toHaveBeenCalledWith(
            "phase11:retention-cleanup",
            300000,
            1000
          );


        expect(
          release
        )
          .toHaveBeenCalledTimes(
            1
          );


        expect(
          result
            .executionAuthorized
        )
          .toBe(
            false
          );
      }
    );


    test(
      "distributed cleanup lock is released after tenant processing failure",
      async () => {
        const release =
          jest.fn()
            .mockResolvedValue();


        distributedLockService
          .acquire
          .mockResolvedValue({
            release,
          });


        TenantConfig
          .find
          .mockReturnValue({
            select:
              jest.fn()
                .mockReturnValue({
                  lean:
                    jest.fn()
                      .mockRejectedValue(
                        new Error(
                          "database unavailable"
                        )
                      ),
                }),
          });


        await expect(
          service
            .runCycle()
        )
          .rejects
          .toThrow(
            "database unavailable"
          );


        expect(
          release
        )
          .toHaveBeenCalledTimes(
            1
          );
      }
    );


    // ========================================================================
    // ARCHIVE CHECKSUM
    // ========================================================================

    test(
      "archived document receives integrity checksum",
      async () => {
        const document = {
          _id:
            "trace-1",

          tenantId:
            "tenant-a",

          createdAt:
            new Date(
              "2025-01-01T00:00:00.000Z"
            ),

          nested: {
            value:
              123,
          },
        };


        RetentionArchive
          .bulkWrite
          .mockResolvedValue(
            {}
          );


        await service
          .archiveDocuments({
            tenantId:
              "tenant-a",

            sourceModel:
              "DecisionTrace",

            documents: [
              document,
            ],

            archiveReason:
              "RETENTION_TTL",

            timestampField:
              "createdAt",

            dryRun:
              false,
          });


        const operation =
          RetentionArchive
            .bulkWrite
            .mock
            .calls[0][0][0];


        expect(
          operation
            .updateOne
            .update
            .$setOnInsert
            .checksum
        )
          .toMatch(
            /^[a-f0-9]{64}$/
          );
      }
    );


    // ========================================================================
    // STATUS / SAFETY
    // ========================================================================

    test(
      "retention status identifies protected collections",
      () => {
        const status =
          service
            .getStatus();


        expect(
          status
            .protectedCollections
        )
          .toEqual(
            expect.arrayContaining([
              "AuditEvent",
              "AuthenticationAuditEvent",
            ])
          );


        expect(
          status
            .executionAuthorized
        )
          .toBe(
            false
          );
      }
    );
  }
);