"use strict";

const {
  randomUUID,
} = require(
  "crypto"
);


const executions =
  new Map();


async function create(
  input = {}
) {
  const document = {
    ...input,

    executionId:
      input.executionId ||
      `rbexec_${randomUUID()}`,

    status:
      input.status ||
      "CREATED",

    stepAttempts:
      input.stepAttempts ||
      [],

    verificationResult:
      input.verificationResult ||
      {},

    rollbackState:
      input.rollbackState ||
      {},

    auditEventIds:
      input.auditEventIds ||
      [],

    executionAuthorized:
      false,

    createdAt:
      input.createdAt ||
      new Date(),

    updatedAt:
      input.updatedAt ||
      new Date(),
  };


  executions.set(
    document.executionId,
    document
  );


  return _decorate(
    document
  );
}


async function updateOne(
  filter = {},
  update = {}
) {
  const document =
    executions.get(
      filter.executionId
    );


  if (
    !document
  ) {
    return {
      acknowledged:
        true,

      matchedCount:
        0,

      modifiedCount:
        0,
    };
  }


  if (
    update.$set
  ) {
    Object.assign(
      document,
      update.$set
    );
  }


  if (
    update.$push
  ) {
    for (
      const [
        field,
        value,
      ]
      of Object.entries(
        update.$push
      )
    ) {
      if (
        !Array.isArray(
          document[field]
        )
      ) {
        document[field] =
          [];
      }


      if (
        value &&
        typeof value ===
          "object" &&
        Array.isArray(
          value.$each
        )
      ) {
        document[field].push(
          ...value.$each
        );
      } else {
        document[field].push(
          value
        );
      }
    }
  }


  document.updatedAt =
    new Date();


  executions.set(
    document.executionId,
    document
  );


  return {
    acknowledged:
      true,

    matchedCount:
      1,

    modifiedCount:
      1,
  };
}


function findOne(
  filter = {}
) {
  const loader =
    async () => {
      const document =
        executions.get(
          filter.executionId
        );


      return document
        ? _decorate(
            document
          )
        : null;
    };


  return {
    lean() {
      return loader()
        .then(
          (
            document
          ) =>
            document
              ? _plain(
                  document
                )
              : null
        );
    },


    then(
      resolve,
      reject
    ) {
      return loader()
        .then(
          resolve,
          reject
        );
    },


    catch(
      reject
    ) {
      return loader()
        .catch(
          reject
        );
    },


    finally(
      callback
    ) {
      return loader()
        .finally(
          callback
        );
    },
  };
}


function _decorate(
  source
) {
  const document = {
    ...source,
  };


  Object.defineProperty(
    document,
    "toObject",
    {
      enumerable:
        false,

      value() {
        return _plain(
          document
        );
      },
    }
  );


  return document;
}


function _plain(
  document
) {
  const result = {};


  for (
    const [
      key,
      value,
    ]
    of Object.entries(
      document
    )
  ) {
    result[key] =
      value;
  }


  return result;
}


function reset() {
  executions.clear();
}


function getExecutions() {
  return Array.from(
    executions.values()
  );
}


module.exports = {
  create,
  updateOne,
  findOne,
  reset,
  getExecutions,
};