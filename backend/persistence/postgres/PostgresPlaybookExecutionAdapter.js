"use strict";

/**
 * Phase 18.7B
 *
 * PostgreSQL compatibility adapter for the existing PlaybookExecutionService.
 *
 * This is NOT a second persistence authority.
 *
 * It exposes the minimal document-like API the current orchestration service
 * already expects:
 *
 *   create()
 *   document.save()
 *   document.toObject()
 *   document.markModified()
 *
 * All persistence is delegated to PostgresPlaybookExecutionRepository.
 */

const PostgresPlaybookExecutionRepository =
  require(
    "./PostgresPlaybookExecutionRepository"
  );


let repository =
  null;


function _repo() {
  if (
    !repository
  ) {
    repository =
      new PostgresPlaybookExecutionRepository();
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


  return _decorateDocument(
    persisted
  );
}


function _decorateDocument(
  initial
) {
  const document = {
    ...initial,
  };


  let persistedChecksum =
    document.playbookChecksum;


  Object.defineProperty(
    document,
    "save",
    {
      enumerable:
        false,

      configurable:
        false,

      writable:
        false,

      value:
        async function save() {
          const scope = {
            tenantId:
              document.tenantId,

            organizationId:
              document.organizationId,

            environmentId:
              document.environmentId,

            executionId:
              document.executionId,
          };


          /**
           * The service intentionally creates the forensic row first with
           * checksum = "pending".
           *
           * Once PlaybookRegistry resolves the exact immutable definition,
           * this performs the one allowed pending → canonical binding.
           */
          if (
            persistedChecksum ===
              "pending" &&

            document
              .playbookChecksum &&

            document
              .playbookChecksum !==
              "pending"
          ) {
            const bound =
              await _repo()
                .bindResolvedVersion(
                  scope,
                  {
                    playbookId:
                      document
                        .playbookId,

                    playbookVersion:
                      document
                        .playbookVersion,

                    playbookVersionId:
                      document
                        .playbookVersionId ||
                      null,

                    versionRef:
                      document
                        .versionRef,

                    playbookChecksum:
                      document
                        .playbookChecksum,

                    playbookSnapshot:
                      document
                        .playbookSnapshot,
                  }
                );


            _synchronize(
              document,
              bound
            );


            persistedChecksum =
              bound
                .playbookChecksum;
          }


          const updated =
            await _repo()
              .update(
                scope,
                {
                  correlationId:
                    document
                      .correlationId,

                  incidentContext:
                    document
                      .incidentContext ||
                    {},

                  resolvedMappings:
                    document
                      .resolvedMappings ||
                    [],

                  matchScore:
                    document
                      .matchScore ??
                    null,

                  matchReasons:
                    document
                      .matchReasons ||
                    [],

                  policyDecision:
                    document
                      .policyDecision ||
                    {},

                  approval:
                    document
                      .approval ||
                    {},

                  status:
                    document
                      .status,

                  statusReason:
                    document
                      .statusReason ||
                    null,

                  startedAt:
                    document
                      .startedAt ||
                    null,

                  completedAt:
                    document
                      .completedAt ||
                    null,

                  durationMs:
                    document
                      .durationMs ??
                    null,

                  stageExecutions:
                    document
                      .stageExecutions ||
                    [],

                  rollback:
                    document
                      .rollback ||
                    {},

                  escalation:
                    document
                      .escalation ||
                    {},

                  outcome:
                    document
                      .outcome ||
                    {},

                  failedStageId:
                    document
                      .failedStageId ||
                    null,

                  errorMessage:
                    document
                      .errorMessage ||
                    null,

                  errorCode:
                    document
                      .errorCode ||
                    null,

                  auditEventIds:
                    document
                      .auditEventIds ||
                    [],

                  decisionTraceId:
                    document
                      .decisionTraceId ||
                    null,

                  requiresHumanReview:
                    Boolean(
                      document
                        .requiresHumanReview
                    ),
                }
              );


          if (
            updated
          ) {
            _synchronize(
              document,
              updated
            );

            persistedChecksum =
              updated
                .playbookChecksum;
          }


          return document;
        },
    }
  );


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

      value:
        function toObject() {
          return _plain(
            document
          );
        },
    }
  );


  /**
   * PostgreSQL JSONB updates do not require Mongoose-style dirty tracking.
   */
  Object.defineProperty(
    document,
    "markModified",
    {
      enumerable:
        false,

      configurable:
        false,

      writable:
        false,

      value:
        function markModified() {
          return undefined;
        },
    }
  );


  return document;
}


function _synchronize(
  target,
  source
) {
  if (
    !source
  ) {
    return;
  }


  for (
    const [
      key,
      value,
    ]
    of Object.entries(
      source
    )
  ) {
    target[key] =
      value;
  }
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

  setRepositoryForTests,
  resetRepositoryForTests,
};