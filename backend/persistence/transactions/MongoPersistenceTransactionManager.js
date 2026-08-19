"use strict";

const mongoose =
  require(
    "mongoose"
  );

const PersistenceTransactionManager =
  require(
    "./PersistenceTransactionManager"
  );

class MongoPersistenceTransactionManager
  extends PersistenceTransactionManager {
  async run(
    work
  ) {
    if (
      typeof work !==
      "function"
    ) {
      throw Object.assign(
        new Error(
          "Transaction work function is required"
        ),
        {
          code:
            "PERSISTENCE_TRANSACTION_WORK_REQUIRED",
        }
      );
    }

    const session =
      await mongoose
        .startSession();

    try {
      let result;

      await session
        .withTransaction(
          async () => {
            result =
              await work({
                kind:
                  "mongo",

                session,
              });
          }
        );

      return result;
    } finally {
      await session
        .endSession();
    }
  }
}

module.exports =
  MongoPersistenceTransactionManager;