"use strict";

const argon2 = require("@node-rs/argon2");

const MAX_PASSWORD_BYTES = 1024;

function getOptions() {
  return {
    memoryCost: parseInt(process.env.ARGON2_MEMORY_COST || "65536", 10),
    timeCost: parseInt(process.env.ARGON2_TIME_COST || "3", 10),
    parallelism: parseInt(process.env.ARGON2_PARALLELISM || "4", 10),
    algorithm: 1, // argon2id
  };
}

async function hashPassword(plaintext) {
  if (typeof plaintext !== "string" || Buffer.byteLength(plaintext, "utf8") > MAX_PASSWORD_BYTES) {
    const err = new Error("Password exceeds maximum allowed size");
    err.status = 400;
    err.code = "PASSWORD_TOO_LONG";
    throw err;
  }
  return argon2.hash(plaintext, getOptions());
}

async function verifyPassword(storedHash, plaintext) {
  if (typeof plaintext !== "string" || Buffer.byteLength(plaintext, "utf8") > MAX_PASSWORD_BYTES) {
    return false;
  }
  try {
    return await argon2.verify(storedHash, plaintext);
  } catch {
    return false;
  }
}

function needsRehash(storedHash) {
  try {
    return argon2.needsRehash(storedHash, getOptions());
  } catch {
    return false;
  }
}

module.exports = { hashPassword, verifyPassword, needsRehash, MAX_PASSWORD_BYTES };
