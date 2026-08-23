"use strict";

/**
 * Phase 13 — Workflow Outbox persistence boundary.
 *
 * IMPORTANT:
 *
 * The repository stores durable workflow intent only.
 * It never grants execution authority.
 *
 * Tenant-scoped operations must always include:
 *
 * organizationId
 * environmentId
 */
class WorkflowOutboxRepository {
  async create(
    _data,
    _transaction = null
  ) {
    throw new Error(
      "WorkflowOutboxRepository.create() is not implemented"
    );
  }

  async findByEventId(
    _scope,
    _eventId,
    _transaction = null
  ) {
    throw new Error(
      "WorkflowOutboxRepository.findByEventId() is not implemented"
    );
  }

  async findByEventKey(
    _scope,
    _eventKey,
    _transaction = null
  ) {
    throw new Error(
      "WorkflowOutboxRepository.findByEventKey() is not implemented"
    );
  }

  async claim(
    _scope,
    _input,
    _transaction = null
  ) {
    throw new Error(
      "WorkflowOutboxRepository.claim() is not implemented"
    );
  }

  async heartbeat(
    _scope,
    _input,
    _transaction = null
  ) {
    throw new Error(
      "WorkflowOutboxRepository.heartbeat() is not implemented"
    );
  }

  async markDelivered(
    _scope,
    _input,
    _transaction = null
  ) {
    throw new Error(
      "WorkflowOutboxRepository.markDelivered() is not implemented"
    );
  }

  async markFailed(
    _scope,
    _input,
    _transaction = null
  ) {
    throw new Error(
      "WorkflowOutboxRepository.markFailed() is not implemented"
    );
  }

  async markDeadLetter(
    _scope,
    _input,
    _transaction = null
  ) {
    throw new Error(
      "WorkflowOutboxRepository.markDeadLetter() is not implemented"
    );
  }

  /**
   * Cross-tenant dispatcher scan.
   *
   * Mongo supports this today.
   *
   * PostgreSQL intentionally fails closed until Phase 13.5 introduces
   * a dedicated privileged worker role rather than bypassing FORCE RLS.
   */
  async findDeliverable(
    _options = {},
    _transaction = null
  ) {
    throw new Error(
      "WorkflowOutboxRepository.findDeliverable() is not implemented"
    );
  }
}

module.exports =
  WorkflowOutboxRepository;