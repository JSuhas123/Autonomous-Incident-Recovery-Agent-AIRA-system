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
      `pbexec_${randomUUID()}`,

    status:
      input.status ||
      "CREATED",

    stageExecutions:
      input.stageExecutions ||
      [],

    rollback:
      input.rollback ||
      {},

    escalation:
      input.escalation ||
      {},

    outcome:
      input.outcome ||
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


  Object.defineProperty(
    document,
    "save",
    {
      enumerable:
        false,

      value:
        async function save() {
          document.updatedAt =
            new Date();


          executions.set(
            document.executionId,
            document
          );


          return document;
        },
    }
  );


  Object.defineProperty(
    document,
    "markModified",
    {
      enumerable:
        false,

      value:
        function markModified() {
          return undefined;
        },
    }
  );


  Object.defineProperty(
    document,
    "toObject",
    {
      enumerable:
        false,

      value:
        function toObject() {
          return _plain(
            document
          );
        },
    }
  );


  executions.set(
    document.executionId,
    document
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


function getByExecutionId(
  executionId
) {
  return executions.get(
    executionId
  ) || null;
}


module.exports = {
  create,
  reset,
  getExecutions,
  getByExecutionId,
};