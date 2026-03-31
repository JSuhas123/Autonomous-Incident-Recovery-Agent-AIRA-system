const mongoose = require("mongoose");

const logSchema = new mongoose.Schema(
  {
    tenantId: {
      type: String,
      default: "default",
    },
    serviceId: String,
    message: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["success", "error"],
      required: true,
    },
    level: {
      type: String,
      enum: ["debug", "info", "warn", "error"],
      default: "info",
    },
    responseTime: {
      type: Number,
      required: true,
      min: 0,
    },
    requestId: String,
    traceId: String,
    context: mongoose.Schema.Types.Mixed,
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  {
    versionKey: false,
  }
);

// Indexes for multi-tenant queries
logSchema.index({ tenantId: 1, timestamp: -1 });
logSchema.index({ tenantId: 1, status: 1, timestamp: -1 });
logSchema.index({ traceId: 1 });

module.exports = mongoose.model("Log", logSchema);
