"use strict";

/**
 * SSRF guard for domain-verification HTTP fetches.
 *
 * Before every request (and after every redirect) this module:
 *  - Resolves the hostname to IPv4/IPv6 addresses.
 *  - Rejects private, loopback, link-local, multicast, reserved,
 *    and cloud-metadata IP ranges.
 *  - Enforces short timeouts and a maximum response-body size.
 *  - Strips authentication headers and cookies from outgoing requests.
 *  - Limits redirect depth and re-validates each redirect destination.
 */

const dns   = require("dns").promises;
const axios = require("axios");
const { URL } = require("url");

// ─── Private / reserved IP ranges ────────────────────────────────────────────

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "ip6-localhost",
  "ip6-loopback",
  "broadcasthost",
]);

// Simple prefix/range checks for IPv4
const BLOCKED_V4_PREFIXES = [
  "0.",        // 0.0.0.0/8   — "This" network
  "10.",       // RFC-1918 private
  "100.64.",   // Shared address space (CGNAT)
  "127.",      // Loopback
  "169.254.",  // Link-local / cloud metadata (AWS/GCP/Azure use 169.254.169.254)
  "172.16.", "172.17.", "172.18.", "172.19.",
  "172.20.", "172.21.", "172.22.", "172.23.",
  "172.24.", "172.25.", "172.26.", "172.27.",
  "172.28.", "172.29.", "172.30.", "172.31.", // RFC-1918 private
  "192.0.0.", // IETF Protocol Assignments
  "192.0.2.", // TEST-NET-1 (docs/examples)
  "192.168.", // RFC-1918 private
  "198.18.", "198.19.", // Benchmark testing
  "198.51.100.", // TEST-NET-2
  "203.0.113.",  // TEST-NET-3
  "240.",  // Reserved (class E)
  "255.",  // Broadcast
];

// IPv6 blocked prefixes (lowercase)
const BLOCKED_V6_PREFIXES = [
  "::1",         // Loopback
  "::",          // Unspecified / wildcard
  "fc",          // fc00::/7 — Unique local (RFC-4193)
  "fd",          // fd00::/8 — Unique local (RFC-4193)
  "fe80",        // fe80::/10 — Link-local
  "ff",          // ff00::/8  — Multicast
  "2001:db8",    // Documentation
  "100::",       // Discard prefix (RFC-6666)
];

function isPrivateIpv4(ip) {
  return BLOCKED_V4_PREFIXES.some((p) => ip.startsWith(p));
}

function isPrivateIpv6(ip) {
  const lower = ip.toLowerCase().replace(/^\[|\]$/g, "");
  return BLOCKED_V6_PREFIXES.some((p) => lower.startsWith(p));
}

/**
 * Resolve all IPv4 and IPv6 addresses for a hostname and reject if any of
 * them fall in a private/reserved range.
 *
 * Throws an Error with code "SSRF_BLOCKED" if the hostname resolves to a
 * private address or cannot be resolved.
 */
async function assertSafeHost(hostname) {
  const lower = hostname.toLowerCase();

  if (BLOCKED_HOSTNAMES.has(lower)) {
    const e = new Error(`Hostname "${hostname}" is not allowed`);
    e.code = "SSRF_BLOCKED";
    throw e;
  }

  // If the hostname is already a raw IPv4 address, validate it directly without DNS
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
    if (isPrivateIpv4(hostname)) {
      const e = new Error(`IP address "${hostname}" is in a private/reserved range`);
      e.code = "SSRF_BLOCKED";
      throw e;
    }
    return; // public IPv4 literal — allow
  }

  // Likewise for bracketed IPv6 literals
  const ipv6 = hostname.replace(/^\[|\]$/g, "");
  if (ipv6.includes(":")) {
    if (isPrivateIpv6(ipv6)) {
      const e = new Error(`IP address "${hostname}" is in a private/reserved range`);
      e.code = "SSRF_BLOCKED";
      throw e;
    }
    return;
  }

  // Collect all resolved addresses
  const addresses = [];

  await Promise.allSettled([
    dns.resolve4(hostname).then((addrs) => addresses.push(...addrs)).catch(() => {}),
    dns.resolve6(hostname).then((addrs) => addresses.push(...addrs)).catch(() => {}),
  ]);

  if (addresses.length === 0) {
    const e = new Error(`Could not resolve hostname "${hostname}"`);
    e.code = "SSRF_DNS_FAILED";
    throw e;
  }

  for (const addr of addresses) {
    if (isPrivateIpv4(addr) || isPrivateIpv6(addr)) {
      const e = new Error(`Hostname "${hostname}" resolves to a private address`);
      e.code = "SSRF_BLOCKED";
      throw e;
    }
  }
}

// ─── Safe HTTP fetch ──────────────────────────────────────────────────────────

const MAX_REDIRECTS      = 3;
const CONNECT_TIMEOUT_MS = 8_000;
const RESPONSE_TIMEOUT_MS = 10_000;
const MAX_BODY_BYTES     = 100_000; // 100 KB

/**
 * Perform a safe HTTP GET for domain verification.
 *
 * @param {string} rawUrl        - URL to fetch (must be http/https)
 * @param {object} [opts]
 * @param {boolean} [opts.preferHttps=true] - redirect http → https when possible
 * @returns {{ status: number, body: string, finalUrl: string }}
 */
async function safeFetch(rawUrl, opts = {}) {
  const { preferHttps = true } = opts;

  let currentUrl = rawUrl.trim();

  // Upgrade http → https if preferred
  if (preferHttps && currentUrl.startsWith("http://")) {
    currentUrl = "https://" + currentUrl.slice(7);
  }

  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect++) {
    let parsed;
    try {
      parsed = new URL(currentUrl);
    } catch {
      const e = new Error(`Invalid URL: ${currentUrl}`);
      e.code = "INVALID_URL";
      throw e;
    }

    if (!["http:", "https:"].includes(parsed.protocol)) {
      const e = new Error("Only http and https are permitted");
      e.code = "SSRF_BLOCKED";
      throw e;
    }

    // Resolve and reject private IPs before connecting
    await assertSafeHost(parsed.hostname);

    let res;
    try {
      res = await axios.get(currentUrl, {
        maxRedirects: 0,          // we handle redirects ourselves
        timeout: CONNECT_TIMEOUT_MS,
        responseType: "text",
        maxContentLength: MAX_BODY_BYTES,
        maxBodyLength: MAX_BODY_BYTES,
        // Never forward authentication or cookies
        headers: {
          "User-Agent": "AIRA-Verifier/1.0",
          Accept: "text/plain, text/html, */*",
        },
        withCredentials: false,
        validateStatus: (s) => s < 400 || (s >= 300 && s < 400),
        decompress: true,
      });
    } catch (err) {
      if (err.code === "SSRF_BLOCKED" || err.code === "SSRF_DNS_FAILED") throw err;
      if (err.response) {
        // Non-2xx that axios chose to reject
        return { status: err.response.status, body: "", finalUrl: currentUrl };
      }
      const e = new Error(`Request failed: ${err.message}`);
      e.code = "FETCH_FAILED";
      throw e;
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers["location"];
      if (!location) {
        const e = new Error("Redirect with no Location header");
        e.code = "FETCH_FAILED";
        throw e;
      }
      if (redirect === MAX_REDIRECTS) {
        const e = new Error("Too many redirects");
        e.code = "TOO_MANY_REDIRECTS";
        throw e;
      }
      // Resolve relative redirect against current URL
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }

    const body = typeof res.data === "string" ? res.data : String(res.data ?? "");
    return { status: res.status, body: body.slice(0, MAX_BODY_BYTES), finalUrl: currentUrl };
  }

  const e = new Error("Too many redirects");
  e.code = "TOO_MANY_REDIRECTS";
  throw e;
}

module.exports = { assertSafeHost, safeFetch, MAX_BODY_BYTES };
