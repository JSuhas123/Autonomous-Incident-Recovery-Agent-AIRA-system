"use strict";


const PostgresMemoryRepository =
  require(
    "../../../persistence/postgres/PostgresMemoryRepository"
  );


const MEMORY_LIFECYCLE_STATUS =
  Object.freeze({
    ACTIVE:
      "ACTIVE",

    SUPERSEDED:
      "SUPERSEDED",

    STALE:
      "STALE",

    ARCHIVED:
      "ARCHIVED",

    REVOKED:
      "REVOKED",
  });


const ALLOWED_TRANSITIONS =
  Object.freeze({
    ACTIVE: [
      "SUPERSEDED",
      "STALE",
      "ARCHIVED",
      "REVOKED",
    ],

    STALE: [
      "ACTIVE",
      "SUPERSEDED",
      "ARCHIVED",
      "REVOKED",
    ],

    SUPERSEDED: [
      "ARCHIVED",
      "REVOKED",
    ],

    ARCHIVED:
      [],

    REVOKED:
      [],
  });


class MemoryLifecycleService {

  constructor(
    options = {}
  ) {
    this.memoryRepository =
      options.memoryRepository ||
      new PostgresMemoryRepository();
  }


  createError(
    message,
    code,
    status =
      422
  ) {
    const error =
      new Error(
        message
      );

    error.code =
      code;

    error.status =
      status;

    return error;
  }


  normalizeStatus(
    value
  ) {
    const status =
      String(
        value ||
        ""
      )
        .trim()
        .toUpperCase();


    if (
      !Object.values(
        MEMORY_LIFECYCLE_STATUS
      )
        .includes(
          status
        )
    ) {
      throw this.createError(
        `Unsupported memory lifecycle status: ${status}`,
        "MEMORY_LIFECYCLE_STATUS_INVALID"
      );
    }


    return status;
  }


  canTransition(
    fromStatus,
    toStatus
  ) {
    const from =
      this.normalizeStatus(
        fromStatus
      );


    const to =
      this.normalizeStatus(
        toStatus
      );


    if (
      from ===
        to
    ) {
      return true;
    }


    return (
      ALLOWED_TRANSITIONS[
        from
      ] ||
      []
    )
      .includes(
        to
      );
  }


  assertTransition(
    fromStatus,
    toStatus
  ) {
    if (
      !this.canTransition(
        fromStatus,
        toStatus
      )
    ) {
      throw this.createError(
        `Memory cannot transition from ${fromStatus} to ${toStatus}`,
        "MEMORY_LIFECYCLE_TRANSITION_INVALID",
        409
      );
    }


    return true;
  }


  async transition({
    organizationId,

    publicId,

    toStatus,

    reason,

    changedByType =
      "MEMORY_LIFECYCLE",

    metadata =
      {},
  }) {
    if (
      !organizationId ||
      !publicId
    ) {
      throw this.createError(
        "Organization and memory public ID are required",
        "MEMORY_LIFECYCLE_IDENTITY_REQUIRED"
      );
    }


    const targetStatus =
      this.normalizeStatus(
        toStatus
      );


    const existing =
      await this
        .memoryRepository
        .findByPublicId({
          organizationId,

          publicId,
        });


    if (
      !existing
    ) {
      throw this.createError(
        "Memory not found",
        "MEMORY_LIFECYCLE_MEMORY_NOT_FOUND",
        404
      );
    }


    const currentStatus =
      this.normalizeStatus(
        existing.status
      );


    this.assertTransition(
      currentStatus,
      targetStatus
    );


    if (
      currentStatus ===
        targetStatus
    ) {
      return {
        changed:
          false,

        memory:
          existing,
      };
    }


    const updated =
      await this
        .memoryRepository
        .updateMemory({
          organizationId,

          publicId,

          patch: {
            status:
              targetStatus,

            metadata: {
              ...(
                existing.metadata ||
                {}
              ),

              ...metadata,

              lifecycle: {
                previousStatus:
                  currentStatus,

                currentStatus:
                  targetStatus,

                changedAt:
                  new Date(),

                reason:
                  reason ||
                  null,
              },

              executionAuthorized:
                false,
            },
          },

          changeReason:
            reason ||
            `Memory lifecycle changed from ${currentStatus} to ${targetStatus}`,

          changedByType,
        });


    return {
      changed:
        true,

      previousStatus:
        currentStatus,

      currentStatus:
        targetStatus,

      memory:
        updated,
    };
  }


  async supersede({
    organizationId,

    publicId,

    supersededByPublicId,

    reason =
      "Memory superseded by newer authoritative knowledge",
  }) {
    if (
      !supersededByPublicId
    ) {
      throw this.createError(
        "Superseding memory public ID is required",
        "MEMORY_LIFECYCLE_SUPERSEDING_MEMORY_REQUIRED"
      );
    }


    if (
      publicId ===
      supersededByPublicId
    ) {
      throw this.createError(
        "Memory cannot supersede itself",
        "MEMORY_LIFECYCLE_SELF_SUPERSEDE_INVALID",
        409
      );
    }


    const replacement =
      await this
        .memoryRepository
        .findByPublicId({
          organizationId,

          publicId:
            supersededByPublicId,
        });


    if (
      !replacement
    ) {
      throw this.createError(
        "Superseding memory not found",
        "MEMORY_LIFECYCLE_SUPERSEDING_MEMORY_NOT_FOUND",
        404
      );
    }


    if (
      this.normalizeStatus(
        replacement.status
      ) !==
      MEMORY_LIFECYCLE_STATUS
        .ACTIVE
    ) {
      throw this.createError(
        "Superseding memory must be ACTIVE",
        "MEMORY_LIFECYCLE_SUPERSEDING_MEMORY_NOT_ACTIVE",
        409
      );
    }


    const existing =
      await this
        .memoryRepository
        .findByPublicId({
          organizationId,

          publicId,
        });


    if (
      !existing
    ) {
      throw this.createError(
        "Memory not found",
        "MEMORY_LIFECYCLE_MEMORY_NOT_FOUND",
        404
      );
    }


    const result =
      await this.transition({
        organizationId,

        publicId,

        toStatus:
          MEMORY_LIFECYCLE_STATUS
            .SUPERSEDED,

        reason,

        metadata: {
          supersededByPublicId,
        },
      });


    return {
      ...result,

      supersededBy:
        replacement,
    };
  }


  async markStale({
    organizationId,

    publicId,

    reason =
      "Memory exceeded freshness policy",
  }) {
    return this.transition({
      organizationId,

      publicId,

      toStatus:
        MEMORY_LIFECYCLE_STATUS
          .STALE,

      reason,
    });
  }


  async reactivate({
    organizationId,

    publicId,

    reason =
      "Memory revalidated by current evidence",
  }) {
    return this.transition({
      organizationId,

      publicId,

      toStatus:
        MEMORY_LIFECYCLE_STATUS
          .ACTIVE,

      reason,
    });
  }


  async archive({
    organizationId,

    publicId,

    reason =
      "Memory intentionally archived",
  }) {
    return this.transition({
      organizationId,

      publicId,

      toStatus:
        MEMORY_LIFECYCLE_STATUS
          .ARCHIVED,

      reason,
    });
  }


  async revoke({
    organizationId,

    publicId,

    reason =
      "Memory revoked due to invalid or unsafe evidence",
  }) {
    return this.transition({
      organizationId,

      publicId,

      toStatus:
        MEMORY_LIFECYCLE_STATUS
          .REVOKED,

      reason,

      metadata: {
        revoked:
          true,

        revokedAt:
          new Date(),
      },
    });
  }


  isRetrievalEligible(
    memory
  ) {
    if (
      !memory ||
      typeof memory !==
        "object"
    ) {
      return false;
    }


    const status =
      this.normalizeStatus(
        memory.status
      );


    return (
      status ===
      MEMORY_LIFECYCLE_STATUS
        .ACTIVE
    );
  }


  filterRetrievalEligible(
    memories =
      []
  ) {
    if (
      !Array.isArray(
        memories
      )
    ) {
      throw this.createError(
        "Memories must be an array",
        "MEMORY_LIFECYCLE_MEMORIES_INVALID"
      );
    }


    const accepted =
      [];

    const rejected =
      [];


    for (
      const memory
      of memories
    ) {
      if (
        this.isRetrievalEligible(
          memory
        )
      ) {
        accepted.push(
          memory
        );

        continue;
      }


      const status =
        String(
          memory
            ?.status ||
          "UNKNOWN"
        )
          .trim()
          .toUpperCase();


      rejected.push({
        memory,

        reason:
          `MEMORY_STATUS_${status}`,
      });
    }


    return {
      accepted,

      rejected,

      diagnostics: {
        inputCount:
          memories.length,

        acceptedCount:
          accepted.length,

        rejectedCount:
          rejected.length,
      },
    };
  }
}


const memoryLifecycleService =
  new MemoryLifecycleService();


module.exports = {
  MEMORY_LIFECYCLE_STATUS,

  ALLOWED_TRANSITIONS,

  MemoryLifecycleService,

  memoryLifecycleService,
};