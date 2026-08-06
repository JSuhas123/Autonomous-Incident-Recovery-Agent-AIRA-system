"use strict";

/**
 * Domain ownership verification service.
 *
 * Implements three proof-of-control mechanisms:
 *   dns_txt  – TXT record  _aira-verification.<domain>
 *   file     – HTTP file   <baseUrl>/.well-known/aira-verification.txt
 *   meta_tag – HTML meta   <meta name="aira-verification" content="<token>">
 *
 * All HTTP-based methods pass through ssrfGuard to prevent SSRF.
 */

const dns = require("dns").promises;
const { safeFetch } = require("../utils/ssrfGuard");

// ─── DNS TXT verification ─────────────────────────────────────────────────────

/**
 * Parse the hostname/domain from a URL string.
 * Returns null if the URL is invalid.
 */
function parseDomain(rawUrl) {
  try {
    return new URL(rawUrl).hostname;
  } catch {
    return null;
  }
}

/**
 * Look up TXT records on `_aira-verification.<domain>` and check whether
 * any record contains `aira-verification=<token>`.
 *
 * @returns {{ found: boolean, reason?: string }}
 */
async function checkDnsTxt(domain, token) {
  const host = `_aira-verification.${domain}`;
  let records;
  try {
    records = await dns.resolveTxt(host);
  } catch (err) {
    if (err.code === "ENOTFOUND" || err.code === "ENODATA" || err.code === "ESERVFAIL") {
      return { found: false, reason: `No TXT records found at ${host}` };
    }
    return { found: false, reason: `DNS lookup failed: ${err.code ?? err.message}` };
  }

  const expected = `aira-verification=${token}`;
  // resolveTxt returns string[][] – each record may be split into chunks
  for (const chunks of records) {
    const value = chunks.join("").trim();
    if (value === expected) {
      return { found: true };
    }
  }

  return {
    found: false,
    reason: `TXT record "aira-verification=<token>" not found at ${host}`,
  };
}

// ─── HTML file verification ───────────────────────────────────────────────────

/**
 * Fetch `<baseUrl>/.well-known/aira-verification.txt` and check the body
 * equals `aira-verification=<token>`.
 *
 * @returns {{ found: boolean, reason?: string }}
 */
async function checkFile(baseUrl, token) {
  const url = baseUrl.replace(/\/+$/, "") + "/.well-known/aira-verification.txt";
  let result;
  try {
    result = await safeFetch(url);
  } catch (err) {
    return { found: false, reason: `Could not fetch verification file: ${err.message}` };
  }

  if (result.status !== 200) {
    return { found: false, reason: `Verification file returned HTTP ${result.status}` };
  }

  const expected = `aira-verification=${token}`;
  if (result.body.trim() === expected) {
    return { found: true };
  }

  return {
    found: false,
    reason: "Verification file content does not match expected value",
  };
}

// ─── HTML meta tag verification ───────────────────────────────────────────────

const META_RE = /<meta[^>]+name=["']aira-verification["'][^>]+content=["']([^"']+)["'][^>]*\/?>/i;
const META_RE_REVERSED = /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']aira-verification["'][^>]*\/?>/i;

/**
 * Fetch the homepage of `baseUrl` and look for:
 *   <meta name="aira-verification" content="<token>">
 *
 * @returns {{ found: boolean, reason?: string }}
 */
async function checkMetaTag(baseUrl, token) {
  const url = baseUrl.replace(/\/+$/, "");
  let result;
  try {
    result = await safeFetch(url);
  } catch (err) {
    return { found: false, reason: `Could not fetch page: ${err.message}` };
  }

  if (result.status !== 200) {
    return { found: false, reason: `Page returned HTTP ${result.status}` };
  }

  // Check both attribute-order variants
  const m = META_RE.exec(result.body) || META_RE_REVERSED.exec(result.body);
  if (m && m[1] === token) {
    return { found: true };
  }

  return {
    found: false,
    reason: `<meta name="aira-verification" content="${token}"> not found in page`,
  };
}

// ─── Dispatcher ──────────────────────────────────────────────────────────────

/**
 * Run the appropriate verification check for the given method.
 *
 * @param {"dns_txt"|"file"|"meta_tag"} method
 * @param {string} baseUrl   - service.baseUrl (must be set for file/meta)
 * @param {string} token     - the challenge token
 * @returns {{ found: boolean, reason?: string }}
 */
async function runVerificationCheck(method, baseUrl, token) {
  const domain = parseDomain(baseUrl);

  if (!domain) {
    return { found: false, reason: "Service has no valid base URL" };
  }

  if (method === "dns_txt")  return checkDnsTxt(domain, token);
  if (method === "file")     return checkFile(baseUrl, token);
  if (method === "meta_tag") return checkMetaTag(baseUrl, token);

  return { found: false, reason: `Unknown verification method: ${method}` };
}

module.exports = { runVerificationCheck, parseDomain };
