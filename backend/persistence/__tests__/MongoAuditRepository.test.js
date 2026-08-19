"use strict";

jest.mock(
  "../../models/AuditEvent",
  () => ({
    create:
      jest.fn(),

    findOne:
      jest.fn(),

    find:
      jest.fn(),
  })
);

const AuditEvent =
  require(
    "../../models/AuditEvent"
  );

const MongoAuditRepository =
  require(
    "../mongo/MongoAuditRepository"
  );

describe(
  "MongoAuditRepository",
  () => {
    let repository;

    beforeEach(
      () => {
        jest.clearAllMocks();

        repository =
          new MongoAuditRepository();
      }
    );

    test(
      "creates immutable audit event",
      async () => {
        await repository
          .create({
            eventId:
              "event-1",
          });

        expect(
          AuditEvent.create
        ).toHaveBeenCalledWith({
          eventId:
            "event-1",
        });
      }
    );

    test(
      "findLatestForTenant orders newest first",
      async () => {
        const sort =
          jest.fn();

        AuditEvent
          .findOne
          .mockReturnValue({
            sort,
          });

        await repository
          .findLatestForTenant(
            "tenant-1"
          );

        expect(
          AuditEvent.findOne
        ).toHaveBeenCalledWith({
          tenantId:
            "tenant-1",
        });

        expect(
          sort
        ).toHaveBeenCalledWith({
          timestamp:
            -1,
        });
      }
    );

    test(
      "repository exposes no update API",
      () => {
        expect(
          repository.updateOne
        ).toBeUndefined();

        expect(
          repository.deleteOne
        ).toBeUndefined();
      }
    );
  }
);