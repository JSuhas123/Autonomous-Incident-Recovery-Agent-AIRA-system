"use strict";

const mongoose =
  require("mongoose");

const CORRELATION_STATUSES = [
  "forming",
  "active",
  "incident_candidate",
  "routed",
  "closed",
];

const signalCorrelationSchema =
  new mongoose.Schema(
    {
      organizationId: {
        type:
          mongoose.Schema.Types.ObjectId,

        ref:
          "Organization",

        required:
          true,

        index:
          true,
      },

      environmentId: {
        type:
          mongoose.Schema.Types.ObjectId,

        ref:
          "Environment",

        required:
          true,

        index:
          true,
      },

      tenantId: {
        type:
          String,

        required:
          true,

        index:
          true,
      },

      correlationGroupId: {
        type:
          String,

        required:
          true,

        index:
          true,
      },

      status: {
        type:
          String,

        enum:
          CORRELATION_STATUSES,

        default:
          "forming",

        index:
          true,
      },

      signalIds: {
        type:
          [String],

        default:
          [],
      },

      primarySignalId: {
        type:
          String,

        default:
          null,
      },

      serviceId: {
        type:
          mongoose.Schema.Types.ObjectId,

        ref:
          "Service",

        default:
          null,

        index:
          true,
      },

      providers: {
        type:
          [String],

        default:
          [],
      },

      signalTypes: {
        type:
          [String],

        default:
          [],
      },

      highestSeverity: {
        type:
          String,

        enum: [
          "unknown",
          "info",
          "warning",
          "critical",
        ],

        default:
          "unknown",
      },

      confidenceScore: {
        type:
          Number,

        min:
          0,

        max:
          1,

        default:
          0,
      },

      incidentCandidate: {
        type:
          Boolean,

        default:
          false,

        index:
          true,
      },

      incidentCandidateReason: {
        type:
          String,

        maxlength:
          1024,

        default:
          null,
      },

      incidentId: {
        type:
          mongoose.Schema.Types.ObjectId,

        ref:
          "Incident",

        default:
          null,

        index:
          true,
      },

      firstObservedAt: {
        type:
          Date,

        required:
          true,

        default:
          Date.now,
      },

      lastObservedAt: {
        type:
          Date,

        required:
          true,

        default:
          Date.now,

        index:
          true,
      },

      signalCount: {
        type:
          Number,

        min:
          1,

        default:
          1,
      },

      providerCount: {
        type:
          Number,

        min:
          1,

        default:
          1,
      },

      evidence: {
        type:
          [
            {
              signalId:
                String,

              provider:
                String,

              signalType:
                String,

              severity:
                String,

              score:
                Number,

              reasons:
                [String],

              observedAt:
                Date,
            },
          ],

        default:
          [],
      },

      routedAt: {
        type:
          Date,

        default:
          null,
      },

      closedAt: {
        type:
          Date,

        default:
          null,
      },
    },
    {
      timestamps:
        true,

      versionKey:
        false,
    }
  );

signalCorrelationSchema.index(
  {
    organizationId:
      1,

    environmentId:
      1,

    correlationGroupId:
      1,
  },
  {
    unique:
      true,

    name:
      "unique_signal_correlation_group",
  }
);

signalCorrelationSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  status:
    1,

  lastObservedAt:
    -1,
});

signalCorrelationSchema.index({
  organizationId:
    1,

  environmentId:
    1,

  serviceId:
    1,

  incidentCandidate:
    1,
});

const SignalCorrelation =
  mongoose.model(
    "SignalCorrelation",
    signalCorrelationSchema
  );

module.exports = {
  SignalCorrelation,

  CORRELATION_STATUSES,
};