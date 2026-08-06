"use strict";

const { URL } = require("url");

// RFC-1918 private ranges and link-local, encoded as CIDR for simple prefix check
const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "0.0.0.0",
  // AWS/GCP/Azure metadata endpoints
  "169.254.169.254",
  "metadata.google.internal",
  "metadata.azure.com",
]);

const BLOCKED_PREFIXES = [
  // RFC-1918 private ranges
  "10.",
  "192.168.",
  "172.16.", "172.17.", "172.18.", "172.19.",
  "172.20.", "172.21.", "172.22.", "172.23.",
  "172.24.", "172.25.", "172.26.", "172.27.",
  "172.28.", "172.29.", "172.30.", "172.31.",
  // Link-local
  "169.254.",
  // Loopback block
  "127.",
];

/**
 * Validate and normalise a URL supplied for public service monitoring.
 * Returns { valid: true, normalised } or { valid: false, reason }.
 */
function validateServiceUrl(raw) {
  if (!raw || typeof raw !== "string") {
    return { valid: false, reason: "URL is required" };
  }

  const trimmed = raw.trim();
  if (trimmed.length > 2048) {
    return { valid: false, reason: "URL exceeds maximum length of 2048 characters" };
  }

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, reason: "URL is not valid" };
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return { valid: false, reason: "Only http and https URLs are allowed" };
  }

  const host = parsed.hostname.toLowerCase();

  if (BLOCKED_HOSTNAMES.has(host)) {
    return { valid: false, reason: "Private, loopback, and metadata-service URLs are not allowed" };
  }

  for (const prefix of BLOCKED_PREFIXES) {
    if (host.startsWith(prefix)) {
      return { valid: false, reason: "Private-network and link-local URLs are not allowed" };
    }
  }

  // Block .local mDNS hostnames
  if (host.endsWith(".local") || host.endsWith(".internal")) {
    return { valid: false, reason: "Internal hostnames are not allowed" };
  }

  // Normalise: strip default port, lowercase host, remove trailing slash from path
  const normalised = parsed.toString().replace(/\/$/, "") || parsed.toString();

  return { valid: true, normalised };
}

module.exports = { validateServiceUrl };
