"use strict";

jest.mock(
  "../../models/Incident",
  () => ({
    Incident: {
      findOne:
        jest.fn(),

      find:
        jest.fn(),

      create:
        jest.fn(),
    },
  })
);

const {
  Incident,
} =
  require(
    "../../models/Incident"
  );

const MongoIncidentRepository =
  require(
    "../mongo/MongoIncidentRepository"
  );

describe(
  "MongoIncidentRepository",
  () => {
    let repository;

    beforeEach(
      () => {
        jest.clearAllMocks();

        repository =
          new MongoIncidentRepository();
      }
    );

    test(
      "findOne delegates to Incident.findOne",
      async () => {
        const filter = {
          organizationId:
            "org-1",

          environmentId:
            "env-1",
        };

        const expected = {
          _id:
            "incident-1",
        };

        Incident
          .findOne
          .mockResolvedValue(
            expected
          );

        const result =
          await repository
            .findOne(
              filter
            );

        expect(
          Incident.findOne
        ).toHaveBeenCalledWith(
          filter
        );

        expect(
          result
        ).toBe(
          expected
        );
      }
    );

    test(
      "findMany delegates to Incident.find",
      async () => {
        const filter = {
          status:
            "open",
        };

        const expected = [
          {
            _id:
              "incident-1",
          },
        ];

        Incident
          .find
          .mockResolvedValue(
            expected
          );

        const result =
          await repository
            .findMany(
              filter
            );

        expect(
          Incident.find
        ).toHaveBeenCalledWith(
          filter
        );

        expect(
          result
        ).toBe(
          expected
        );
      }
    );

    test(
      "create delegates to Incident.create",
      async () => {
        const data = {
          tenantId:
            "tenant-1",
        };

        const expected = {
          _id:
            "incident-1",
        };

        Incident
          .create
          .mockResolvedValue(
            expected
          );

        const result =
          await repository
            .create(
              data
            );

        expect(
          Incident.create
        ).toHaveBeenCalledWith(
          data
        );

        expect(
          result
        ).toBe(
          expected
        );
      }
    );

    test(
      "save delegates to mongoose document save",
      async () => {
        const expected = {
          _id:
            "incident-1",
        };

        const incident = {
          save:
            jest
              .fn()
              .mockResolvedValue(
                expected
              ),
        };

        const result =
          await repository
            .save(
              incident
            );

        expect(
          incident.save
        ).toHaveBeenCalledTimes(
          1
        );

        expect(
          result
        ).toBe(
          expected
        );
      }
    );

    test(
      "save fails closed for a non-document value",
      async () => {
        await expect(
          repository.save({
            _id:
              "incident-1",
          })
        ).rejects.toMatchObject({
          code:
            "INVALID_INCIDENT_DOCUMENT",
        });
      }
    );

    test(
      "does not translate duplicate-key errors",
      async () => {
        const duplicateError =
          Object.assign(
            new Error(
              "duplicate key"
            ),
            {
              code:
                11000,
            }
          );

        Incident
          .create
          .mockRejectedValue(
            duplicateError
          );

        await expect(
          repository.create({
            fingerprint:
              "abc123",
          })
        ).rejects.toBe(
          duplicateError
        );
      }
    );
  }
);