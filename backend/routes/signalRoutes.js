"use strict";

const express =
  require(
    "express"
  );

const mongoose =
  require(
    "mongoose"
  );

const {
  SignalCorrelation,
} =
  require(
    "../models/SignalCorrelation"
  );

const {
  signalIngestionService,
} =
  require(
    "../services/signals"
  );

const router =
  express.Router();

// ============================================================================
// LIST SIGNALS
// ============================================================================

router.get(
  "/",
  async (
    req,
    res,
    next
  ) => {
    try {
      const context =
        requireContext(
          req
        );

      const signals =
        await signalIngestionService
          .list(
            context,
            req.query
          );

      return res.json({
        count:
          signals.length,

        signals,
      });
    } catch (error) {
      return next(
        error
      );
    }
  }
);

// ============================================================================
// GET SIGNAL
// ============================================================================

router.get(
  "/:signalId",
  async (
    req,
    res,
    next
  ) => {
    try {
      const context =
        requireContext(
          req
        );

      const signal =
        await signalIngestionService
          .getById(
            context,
            req.params
              .signalId
          );

      if (!signal) {
        return res
          .status(
            404
          )
          .json({
            error:
              "Signal not found",

            code:
              "SIGNAL_NOT_FOUND",
          });
      }

      return res.json({
        signal,
      });
    } catch (error) {
      return next(
        error
      );
    }
  }
);

// ============================================================================
// INGEST INTERNAL/MANUAL SIGNAL
// ============================================================================

router.post(
  "/",
  async (
    req,
    res,
    next
  ) => {
    try {
      const context =
        requireContext(
          req
        );

      const input = {
        ...req.body,

        /*
         * Client must never override ownership.
         */
        organizationId:
          undefined,

        environmentId:
          undefined,

        tenantId:
          undefined,
      };

      const result =
        await signalIngestionService
          .ingest(
            input,
            {
              ...context,

              source:
                "manual",
            }
          );

      return res
        .status(
          result.duplicate
            ? 200
            : 201
        )
        .json(
          result
        );
    } catch (error) {
      return next(
        error
      );
    }
  }
);

// ============================================================================
// CORRELATION GROUP
// ============================================================================

router.get(
  "/correlations/:correlationGroupId",
  async (
    req,
    res,
    next
  ) => {
    try {
      const context =
        requireContext(
          req
        );

      const group =
        await SignalCorrelation
          .findOne({
            organizationId:
              context
                .organizationId,

            environmentId:
              context
                .environmentId,

            correlationGroupId:
              req.params
                .correlationGroupId,
          })
          .lean();

      if (!group) {
        return res
          .status(
            404
          )
          .json({
            error:
              "Signal correlation group not found",

            code:
              "SIGNAL_CORRELATION_NOT_FOUND",
          });
      }

      return res.json({
        correlation:
          group,
      });
    } catch (error) {
      return next(
        error
      );
    }
  }
);

// ============================================================================
// CONTEXT
// ============================================================================

function requireContext(
  req
) {
  const organizationId =
    req.context
      ?.organizationId;

  const environmentId =
    req.context
      ?.environmentId;

  const tenantId =
    req.context
      ?.tenantId;

  if (
    !organizationId ||
    !environmentId ||
    !tenantId
  ) {
    throw Object.assign(
      new Error(
        "Complete signal request context is required"
      ),
      {
        status:
          400,

        code:
          "SIGNAL_REQUEST_CONTEXT_REQUIRED",
      }
    );
  }

  if (
    !mongoose.Types.ObjectId
      .isValid(
        organizationId
      ) ||
    !mongoose.Types.ObjectId
      .isValid(
        environmentId
      )
  ) {
    throw Object.assign(
      new Error(
        "Invalid signal ownership context"
      ),
      {
        status:
          400,

        code:
          "SIGNAL_CONTEXT_INVALID",
      }
    );
  }

  return {
    organizationId,

    environmentId,

    tenantId,

    userId:
      req.context
        ?.userId ||
      null,
  };
}

module.exports =
  router;