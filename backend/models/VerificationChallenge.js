"use strict";

const mongoose = require("mongoose");
const crypto   = require("crypto");

const CHALLENGE_METHODS  = ["dns_txt", "file", "meta_tag"];
const CHALLENGE_STATUSES = ["pending", "verified", "failed", "expired"];

// Configurable via env; defaults give a 24-hour window
const CHALLENGE_TTL_MS  = Number(process.env.VERIFICATION_TTL_MS  ?? 24 * 60 * 60 * 1000);
const MAX_ATTEMPTS      = Number(process.env.VERIFICATION_MAX_ATTEMPTS ?? 10);

const verificationChallengeSchema = new mongoose.Schema(
  {
    serviceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Service",
      required: true,
      index: true,
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    tenantId: {
      type: String,
      required: true,
    },
    method: {
      type: String,
      enum: CHALLENGE_METHODS,
      required: true,
    },
    // The raw token is shown to the user and placed publicly (DNS/HTTP); it is
    // not a password. We store it so we can compare against what the verifier
    // fetches from the public internet during a /check call.
    token: {
      type: String,
      required: true,
    },
    // SHA-256 of the token for indexed lookup without scanning plaintext.
    tokenHash: {
      type: String,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: CHALLENGE_STATUSES,
      default: "pending",
      // indexed via compound index below, not standalone
    },
    attempts: {
      type: Number,
      default: 0,
    },
    maxAttempts: {
      type: Number,
      default: MAX_ATTEMPTS,
    },
    expiresAt: {
      type: Date,
      required: true,
      // TTL index defined below via schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })
    },
    verifiedAt: {
      type: Date,
      default: null,
    },
    lastAttemptAt: {
      type: Date,
      default: null,
    },
    // Reason for failure or expiry; never contains the token.
    failureReason: {
      type: String,
      default: null,
    },
  },
  {
    versionKey: false,
    timestamps: true,
  }
);

// Only one active challenge per service (status=pending).
verificationChallengeSchema.index({ serviceId: 1, status: 1 });

// MongoDB TTL index: auto-delete challenges 7 days after expiry.
verificationChallengeSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 7 * 24 * 60 * 60 }
);

/** Generate a fresh 32-byte hex token and its SHA-256 hash. */
function generateToken() {
  const token     = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  return { token, tokenHash };
}

/** Compute the SHA-256 hash of a token string. */
function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** Create a new challenge, expiring all previous pending ones for this service. */
async function createChallenge(serviceId, organizationId, tenantId, method) {
  const { token, tokenHash } = generateToken();

  await VerificationChallenge.updateMany(
    { serviceId, status: "pending" },
    { $set: { status: "expired", failureReason: "superseded by new challenge" } }
  );

  return VerificationChallenge.create({
    serviceId,
    organizationId,
    tenantId,
    method,
    token,
    tokenHash,
    status: "pending",
    expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
  });
}

const VerificationChallenge = mongoose.model(
  "VerificationChallenge",
  verificationChallengeSchema
);

module.exports = VerificationChallenge;
module.exports.CHALLENGE_METHODS  = CHALLENGE_METHODS;
module.exports.CHALLENGE_STATUSES = CHALLENGE_STATUSES;
module.exports.CHALLENGE_TTL_MS   = CHALLENGE_TTL_MS;
module.exports.MAX_ATTEMPTS       = MAX_ATTEMPTS;
module.exports.generateToken      = generateToken;
module.exports.hashToken          = hashToken;
module.exports.createChallenge    = createChallenge;
