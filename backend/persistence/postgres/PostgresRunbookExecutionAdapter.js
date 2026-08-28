"use strict";

/**
 * Phase 18.7B
 *
 * PostgreSQL compatibility adapter for RunbookExecutionEngine.
 *
 * The existing engine uses only:
 *
 *   create()
 *   updateOne()
 *   findOne()
 *   findOne().lean()
 *
 * This adapter preserves that interface while making PostgreSQL authoritative.
 */

const PostgresRunbookExecutionRepository =
  require(
    "./PostgresRunbookExecutionRepository"
  );


let repository =
  null;


function _repo() {
  if (
    !repository
  ) {
    repository =
      new PostgresRunbookExecutionRepository();
  }

  return repository;
}


async function create(
  input = {}
) {
  const persisted =
    await _repo()
      .create(
        input
      );


  return _decorate(
    persisted
  );
}


async function updateOne(
  filter = {},
  update = {}
) {
  const scope =
    _scope(
      filter
    );


  let latest =
    null;


  if (
    update.$set &&
    Object.keys(
      update.$set
    ).length >
      0
  ) {
    latest =
      await _repo()
        .update(
          scope,
          update.$set
        );
  }


  if (
    update.$push
      ?.stepAttempts !==
    undefined
  ) {
    latest =
      await _repo()
        .appendStepAttempt(
          scope,
          update
            .$push
            .stepAttempts
        );
  }


  /**
   * Defensive support for any future array push fields.
   *
   * We intentionally fail rather than silently ignoring persistence.
   */
  if (
    update.$push
  ) {
    const unsupported =
      Object
        .keys(
          update.$push
        )
        .filter(
          (
            key
          ) =>
            key !==
            "stepAttempts"
        );


    if (
      unsupported.length >
      0
    ) {
      const error =
        new Error(
          `Unsupported PostgreSQL execution $push fields: ${unsupported.join(", ")}`
        );

      error.code =
        "POSTGRES_RUNBOOK_EXECUTION_UNSUPPORTED_PUSH";

      error.executionAuthorized =
        false;

      throw error;
    }
  }


  return {
    acknowledged:
      true,

    matchedCount:
      latest
        ? 1
        : 0,

    modifiedCount:
      latest
        ? 1
        : 0,
  };
}


function findOne(
  filter = {}
) {
  const scope =
    _scope(
      filter
    );


  const loader =
    async () => {
      const result =
        await _repo()
          .getByExecutionId(
            scope
          );


      return result
        ? _decorate(
            result
          )
        : null;
    };


  return _query(
    loader
  );
}


function _query(
  loader
) {
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
      handler
    ) {
      return loader()
        .finally(
          handler
        );
    },
  };
}


function _scope(
  filter
) {
  if (
    !filter
      ?.executionId
  ) {
    const error =
      new Error(
        "executionId is required"
      );

    error.code =
      "POSTGRES_RUNBOOK_EXECUTION_REQUIRED_FIELD";

    error.executionAuthorized =
      false;

    throw error;
  }


  if (
    !filter
      ?.tenantId
  ) {
    const error =
      new Error(
        "tenantId is required in Runbook execution filter"
      );

    error.code =
      "POSTGRES_RUNBOOK_EXECUTION_TENANT_REQUIRED";

    error.executionAuthorized =
      false;

    throw error;
  }


  if (
    !filter
      ?.organizationId
  ) {
    const error =
      new Error(
        "organizationId is required in Runbook execution filter"
      );

    error.code =
      "POSTGRES_RUNBOOK_EXECUTION_ORGANIZATION_REQUIRED";

    error.executionAuthorized =
      false;

    throw error;
  }


  if (
    !filter
      ?.environmentId
  ) {
    const error =
      new Error(
        "environmentId is required in Runbook execution filter"
      );

    error.code =
      "POSTGRES_RUNBOOK_EXECUTION_ENVIRONMENT_REQUIRED";

    error.executionAuthorized =
      false;

    throw error;
  }


  return {
    executionId:
      filter.executionId,

    tenantId:
      filter.tenantId,

    organizationId:
      filter.organizationId,

    environmentId:
      filter.environmentId,
  };
}


function _decorate(
  result
) {
  if (
    !result
  ) {
    return null;
  }


  const document = {
    ...result,
  };


  Object.defineProperty(
    document,
    "toObject",
    {
      enumerable:
        false,

      configurable:
        false,

      writable:
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
  value
) {
  const result = {};


  for (
    const [
      key,
      child,
    ]
    of Object.entries(
      value
    )
  ) {
    result[key] =
      child;
  }


  return result;
}


function setRepositoryForTests(
  value
) {
  repository =
    value;
}


function resetRepositoryForTests() {
  repository =
    null;
}


module.exports = {
  create,
  updateOne,
  findOne,

  setRepositoryForTests,
  resetRepositoryForTests,
};