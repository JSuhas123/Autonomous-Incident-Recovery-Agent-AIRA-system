"use strict";

const PostgresIncidentRepository =
  require(
    "../postgres/PostgresIncidentRepository"
  );

const PostgresIncidentEventRepository =
  require(
    "../postgres/PostgresIncidentEventRepository"
  );

const PostgresIncidentLifecycleRepository =
  require(
    "../postgres/PostgresIncidentLifecycleRepository"
  );

const PostgresSignalRepository =
  require(
    "../postgres/PostgresSignalRepository"
  );

const PostgresSignalCorrelationRepository =
  require(
    "../postgres/PostgresSignalCorrelationRepository"
  );

const PostgresCorrelationTopologyRepository =
  require(
    "../postgres/PostgresCorrelationTopologyRepository"
  );

const PostgresAgentIntelligenceRunRepository =
  require(
    "../postgres/PostgresAgentIntelligenceRunRepository"
  );

const PostgresIncidentDiagnosisRepository =
  require(
    "../postgres/PostgresIncidentDiagnosisRepository"
  );

const PostgresDecisionTraceRepository =
  require(
    "../postgres/PostgresDecisionTraceRepository"
  );

const PostgresRecoveryDecisionRepository =
  require(
    "../postgres/PostgresRecoveryDecisionRepository"
  );

const PostgresExecutionAuthorizationRepository =
  require(
    "../postgres/PostgresExecutionAuthorizationRepository"
  );

const PostgresRuntimeRecoveryCheckpointRepository =
  require(
    "../postgres/PostgresRuntimeRecoveryCheckpointRepository"
  );

const PostgresApprovalRepository =
  require(
    "../postgres/PostgresApprovalRepository"
  );

const PostgresAuditRepository =
  require(
    "../postgres/PostgresAuditRepository"
  );

const PostgresPolicyRepository =
  require(
    "../postgres/PostgresPolicyRepository"
  );

const PostgresWorkflowOutboxRepository =
  require(
    "../postgres/PostgresWorkflowOutboxRepository"
  );

/**
 * Phase 13.5B
 *
 * Explicit domain -> PostgreSQL write contract mapping.
 */
class DomainBackfillAdapterRegistry {
  constructor(
    options = {}
  ) {
    const supplied =
      options.repositories ||
      {};

    this.repositories = {
      incidentRepository:
        supplied.incidentRepository ||
        new PostgresIncidentRepository(),

      incidentEventRepository:
        supplied.incidentEventRepository ||
        new PostgresIncidentEventRepository(),

      incidentLifecycleRepository:
        supplied.incidentLifecycleRepository ||
        new PostgresIncidentLifecycleRepository(),

      signalRepository:
        supplied.signalRepository ||
        new PostgresSignalRepository(),

      signalCorrelationRepository:
        supplied.signalCorrelationRepository ||
        new PostgresSignalCorrelationRepository(),

      correlationTopologyRepository:
        supplied.correlationTopologyRepository ||
        new PostgresCorrelationTopologyRepository(),

      agentIntelligenceRunRepository:
        supplied.agentIntelligenceRunRepository ||
        new PostgresAgentIntelligenceRunRepository(),

      incidentDiagnosisRepository:
        supplied.incidentDiagnosisRepository ||
        new PostgresIncidentDiagnosisRepository(),

      decisionTraceRepository:
        supplied.decisionTraceRepository ||
        new PostgresDecisionTraceRepository(),

      recoveryDecisionRepository:
        supplied.recoveryDecisionRepository ||
        new PostgresRecoveryDecisionRepository(),

      executionAuthorizationRepository:
        supplied.executionAuthorizationRepository ||
        new PostgresExecutionAuthorizationRepository(),

      runtimeRecoveryCheckpointRepository:
        supplied.runtimeRecoveryCheckpointRepository ||
        new PostgresRuntimeRecoveryCheckpointRepository(),

      approvalRepository:
        supplied.approvalRepository ||
        new PostgresApprovalRepository(),

      auditRepository:
        supplied.auditRepository ||
        new PostgresAuditRepository(),

      policyRepository:
        supplied.policyRepository ||
        new PostgresPolicyRepository(),

      workflowOutboxRepository:
        supplied.workflowOutboxRepository ||
        new PostgresWorkflowOutboxRepository(),
    };

    this.adapters =
      this.buildAdapters();
  }

  has(
    domain
  ) {
    return Boolean(
      this.adapters[
        domain
      ]
    );
  }

  get(
    domain
  ) {
    const adapter =
      this.adapters[
        domain
      ];

    if (
      !adapter
    ) {
      throw Object.assign(
        new Error(
          `No PostgreSQL backfill adapter registered for domain: ${domain}`
        ),
        {
          code:
            "MIGRATION_ADAPTER_NOT_FOUND",

          domain,
        }
      );
    }

    return adapter;
  }

  list() {
    return Object.entries(
      this.adapters
    )
      .map(
        ([
          domain,
          adapter,
        ]) => ({
          domain,

          mode:
            adapter.mode,

          writeMethod:
            adapter.writeMethod,
        })
      );
  }

  async migrate({
    domain,
    document,
    context,
    transaction = null,
    dryRun = false,
  } = {}) {
    const adapter =
      this.get(
        domain
      );

    const prepared =
      adapter.prepare
        ? adapter.prepare(
            document,
            context
          )
        : this.prepareCommon(
            document,
            context
          );

    this.assertSafeDocument(
      prepared
    );

    if (
      adapter.mode ===
      "derived"
    ) {
      return {
        status:
          "skipped",

        reason:
          "derived-domain",

        domain,
      };
    }

    if (
      dryRun
    ) {
      return {
        status:
          "validated",

        dryRun:
          true,

        domain,

        writeMethod:
          adapter.writeMethod,

        document:
          prepared,
      };
    }

    const result =
      await adapter.write(
        prepared,
        context,
        transaction
      );

    return {
      status:
        "migrated",

      domain,

      writeMethod:
        adapter.writeMethod,

      result,
    };
  }

  buildAdapters() {
    const repositories =
      this.repositories;

    return {
      incidents: {
        mode:
          "write",

        writeMethod:
          "create",

        prepare:
          (
            document,
            context
          ) =>
            this.prepareEnvironmentDocument(
              document,
              context
            ),

        write:
          (
            document,
            _context,
            transaction
          ) =>
            repositories
              .incidentRepository
              .create(
                document,
                transaction
              ),
      },

      incidentEvents: {
        mode:
          "write",

        writeMethod:
          "create",

        prepare:
          (
            document,
            context
          ) =>
            this.prepareEnvironmentDocument(
              document,
              context
            ),

        write:
          (
            document,
            _context,
            transaction
          ) =>
            repositories
              .incidentEventRepository
              .create(
                document,
                transaction
              ),
      },

      incidentLifecycleTransitions: {
        mode:
          "write",

        writeMethod:
          "createTransition",

        prepare:
          (
            document,
            context
          ) =>
            this.prepareEnvironmentDocument(
              document,
              context
            ),

        write:
          (
            document,
            _context,
            transaction
          ) =>
            repositories
              .incidentLifecycleRepository
              .createTransition(
                document,
                transaction
              ),
      },

      incidentLifecycle: {
        mode:
          "write",

        writeMethod:
          "upsertCurrent",

        prepare:
          (
            document,
            context
          ) =>
            this.prepareEnvironmentDocument(
              document,
              context
            ),

        write:
          (
            document,
            _context,
            transaction
          ) => {
            const scope = {
              organizationId:
                document.organizationId,

              environmentId:
                document.environmentId,

              incidentId:
                document.incidentId,
            };

            const update = {
              ...document,
            };

            delete update._id;
            delete update.organizationId;
            delete update.environmentId;
            delete update.incidentId;
            delete update.legacyMongoId;

            return repositories
              .incidentLifecycleRepository
              .upsertCurrent(
                scope,
                update,
                transaction
              );
          },
      },

      signals: {
        mode:
          "write",

        writeMethod:
          "create",

        prepare:
          (
            document,
            context
          ) =>
            this.prepareEnvironmentDocument(
              document,
              context
            ),

        write:
          (
            document,
            _context,
            transaction
          ) =>
            repositories
              .signalRepository
              .create(
                document,
                transaction
              ),
      },

      signalCorrelations: {
        mode:
          "write",

        writeMethod:
          "upsertGroup",

        prepare:
          (
            document,
            context
          ) =>
            this.prepareEnvironmentDocument(
              document,
              context
            ),

        write:
          (
            document,
            _context,
            transaction
          ) =>
            repositories
              .signalCorrelationRepository
              .upsertGroup(
                {
                  organizationId:
                    document.organizationId,

                  environmentId:
                    document.environmentId,
                },
                document.correlationGroupId,
                {
                  set: {
                    ...document,
                  },

                  addSignalIds:
                    document.signalIds ||
                    [],
                },
                transaction
              ),
      },

      correlationTopology: {
        mode:
          "derived",

        writeMethod:
          null,

        prepare:
          (
            document,
            context
          ) =>
            this.prepareEnvironmentDocument(
              document ||
              {},
              context
            ),

        write:
          async () =>
            null,
      },

      agentIntelligenceRuns: {
        mode:
          "write",

        writeMethod:
          "create",

        prepare:
          (
            document,
            context
          ) =>
            this.prepareEnvironmentDocument(
              document,
              context
            ),

        write:
          (
            document,
            _context,
            transaction
          ) =>
            repositories
              .agentIntelligenceRunRepository
              .create(
                document,
                transaction
              ),
      },

      incidentDiagnoses: {
        mode:
          "write",

        writeMethod:
          "create",

        prepare:
          (
            document,
            context
          ) =>
            this.prepareEnvironmentDocument(
              document,
              context
            ),

        write:
          (
            document,
            _context,
            transaction
          ) =>
            repositories
              .incidentDiagnosisRepository
              .create(
                document,
                transaction
              ),
      },

      decisionTraces: {
        mode:
          "write",

        writeMethod:
          "create",

        prepare:
          (
            document,
            context
          ) =>
            this.prepareEnvironmentDocument(
              document,
              context,
              {
                includeTenant:
                  true,
              }
            ),

        write:
          (
            document,
            _context,
            transaction
          ) =>
            repositories
              .decisionTraceRepository
              .create(
                document,
                transaction
              ),
      },

      recoveryDecisionRuns: {
        mode:
          "write",

        writeMethod:
          "createRun",

        prepare:
          (
            document,
            context
          ) =>
            this
              .prepareSafetyCriticalDocument(
                document,
                context
              ),

        write:
          (
            document,
            _context,
            transaction
          ) =>
            repositories
              .recoveryDecisionRepository
              .createRun(
                document,
                transaction
              ),
      },

      recoveryDecisions: {
        mode:
          "write",

        writeMethod:
          "createDecision",

        prepare:
          (
            document,
            context
          ) =>
            this
              .prepareSafetyCriticalDocument(
                document,
                context
              ),

        write:
          (
            document,
            _context,
            transaction
          ) =>
            repositories
              .recoveryDecisionRepository
              .createDecision(
                document,
                transaction
              ),
      },

      executionAuthorizations: {
        mode:
          "write",

        writeMethod:
          "createAuthorization",

        prepare:
          (
            document,
            context
          ) =>
            this
              .prepareSafetyCriticalDocument(
                document,
                context
              ),

        write:
          (
            document,
            _context,
            transaction
          ) =>
            repositories
              .executionAuthorizationRepository
              .createAuthorization(
                document,
                transaction
              ),
      },

      executionRequests: {
        mode:
          "write",

        writeMethod:
          "createExecutionRequest",

        prepare:
          (
            document,
            context
          ) =>
            this
              .prepareSafetyCriticalDocument(
                document,
                context
              ),

        write:
          (
            document,
            _context,
            transaction
          ) =>
            repositories
              .executionAuthorizationRepository
              .createExecutionRequest(
                document,
                transaction
              ),
      },

      runtimeRecoveryCheckpoints: {
        mode:
          "write",

        writeMethod:
          "create",

        prepare:
          (
            document,
            context
          ) =>
            this
              .prepareSafetyCriticalDocument(
                document,
                context
              ),

        write:
          (
            document,
            _context,
            transaction
          ) =>
            repositories
              .runtimeRecoveryCheckpointRepository
              .create(
                document,
                transaction
              ),
      },

      approvals: {
        mode:
          "write",

        writeMethod:
          "createRequest",

        prepare:
          (
            document,
            context
          ) =>
            this.prepareEnvironmentDocument(
              document,
              context,
              {
                includeTenant:
                  true,
              }
            ),

        write:
          (
            document,
            _context,
            transaction
          ) =>
            repositories
              .approvalRepository
              .createRequest(
                document,
                transaction
              ),
      },

      audit: {
        mode:
          "write",

        writeMethod:
          "create",

        prepare:
          (
            document,
            context
          ) =>
            this.prepareTenantDocument(
              document,
              context
            ),

        write:
          (
            document,
            _context,
            transaction
          ) =>
            repositories
              .auditRepository
              .create(
                document,
                transaction
              ),
      },

      policies: {
        mode:
          "write",

        writeMethod:
          "create",

        prepare:
          (
            document,
            context
          ) =>
            this.prepareTenantDocument(
              document,
              context
            ),

        write:
          (
            document,
            _context,
            transaction
          ) =>
            repositories
              .policyRepository
              .create(
                document,
                transaction
              ),
      },

      workflowOutbox: {
        mode:
          "write",

        writeMethod:
          "create",

        prepare:
          (
            document,
            context
          ) => {
            const prepared =
              this
                .prepareSafetyCriticalDocument(
                  document,
                  context
                );

            prepared.executionAuthorized =
              false;

            prepared.payload = {
              ...(
                prepared.payload ||
                {}
              ),

              executionAuthorized:
                false,

              authorizationGranted:
                false,
            };

            return prepared;
          },

        write:
          (
            document,
            _context,
            transaction
          ) =>
            repositories
              .workflowOutboxRepository
              .create(
                document,
                transaction
              ),
      },
    };
  }

  prepareCommon(
    document,
    context
  ) {
    return {
      ...document,

      legacyMongoId:
        document.legacyMongoId ||
        (
          document._id
            ? String(
                document._id
              )
            : null
        ),
    };
  }

  prepareEnvironmentDocument(
    document,
    context,
    options = {}
  ) {
    const repositoryScope =
      context
        ?.repositoryScope;

    if (
      !repositoryScope
        ?.organizationId ||
      !repositoryScope
        ?.environmentId
    ) {
      throw Object.assign(
        new Error(
          "Environment-scoped backfill requires resolved repository scope"
        ),
        {
          code:
            "MIGRATION_SCOPE_NOT_BOOTSTRAPPED",
        }
      );
    }

    const output = {
      ...this.prepareCommon(
        document,
        context
      ),

      /*
       * Use canonical PostgreSQL-resolvable public IDs.
       *
       * The original Mongo ownership remains available in serialized
       * document/legacy IDs.
       */
      organizationId:
        repositoryScope
          .organizationId,

      environmentId:
        repositoryScope
          .environmentId,
    };

    if (
      options.includeTenant
    ) {
      output.tenantId =
        output.tenantId ||
        repositoryScope
          .tenantId;
    }

    return output;
  }

  prepareTenantDocument(
    document,
    context
  ) {
    const repositoryScope =
      context
        ?.repositoryScope;

    if (
      !repositoryScope
        ?.tenantId
    ) {
      throw Object.assign(
        new Error(
          "Tenant-scoped backfill requires resolved tenant"
        ),
        {
          code:
            "MIGRATION_TENANT_NOT_BOOTSTRAPPED",
        }
      );
    }

    const output = {
      ...this.prepareCommon(
        document,
        context
      ),

      tenantId:
        repositoryScope
          .tenantId,
    };

    /*
     * Audit may contain organization/environment scope.
     *
     * Policy normally does not need them.
     */
    if (
      document.organizationId &&
      repositoryScope
        .organizationId
    ) {
      output.organizationId =
        repositoryScope
          .organizationId;
    }

    if (
      document.environmentId &&
      repositoryScope
        .environmentId
    ) {
      output.environmentId =
        repositoryScope
          .environmentId;
    }

    return output;
  }

  prepareSafetyCriticalDocument(
    document,
    context
  ) {
    const output =
      this.prepareEnvironmentDocument(
        document,
        context,
        {
          includeTenant:
            true,
        }
      );

    /*
     * A backfill transfers historical state.
     *
     * It must never manufacture live execution authority.
     */
    output.executionAuthorized =
      false;

    return output;
  }

  assertSafeDocument(
    document
  ) {
    if (
      document
        ?.executionAuthorized ===
      true
    ) {
      throw Object.assign(
        new Error(
          "Migration cannot create execution authority"
        ),
        {
          code:
            "MIGRATION_EXECUTION_AUTHORITY_FORBIDDEN",
        }
      );
    }

    return true;
  }
}

module.exports =
  DomainBackfillAdapterRegistry;