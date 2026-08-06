"use strict";

/**
 * Monitor execution service.
 *
 * Performs real HTTP/HTTPS/SSL checks with:
 *  - SSRF protection before every request and redirect destination
 *  - Accurate timing breakdown (DNS, TCP, TLS, TTFB, total)
 *  - SSL certificate inspection and expiry calculation
 *  - Content matching
 *  - Redirect counting with re-validation
 *  - Configurable timeouts
 *
 * This module is stateless — it takes a Monitor document, executes the check,
 * and returns a result object.  Persistence and state transitions are handled
 * by the caller (MonitorScheduler).
 */

const https   = require("https");
const http    = require("http");
const tls     = require("tls");
const dns     = require("dns").promises;
const { URL } = require("url");

const { assertSafeHost } = require("../../utils/ssrfGuard");
const Monitor    = require("../../models/Monitor");
const MonitorCheck = require("../../models/MonitorCheck");
const { record: auditRecord } = require("../identity/identityAuditService");
const { AUTH_EVENT_TYPES, AUTH_EVENT_OUTCOMES } = require("../../constants/authEvents");
const incidentService = require("../incidents/incidentService");

const MAX_RESPONSE_BYTES  = 512_000;  // 512 KB
const CHECKER_REGION      = process.env.CHECKER_REGION ?? "default";

// ─── Low-level HTTP request with timing ──────────────────────────────────────

/**
 * Perform a single HTTP/HTTPS request to `url` with timing.
 * Does NOT follow redirects — the caller handles them.
 *
 * @returns {{
 *   statusCode: number,
 *   headers: object,
 *   body: string,
 *   timing: { dns, tcp, tls, firstByte, total },
 *   sslInfo: { valid, daysRemaining, subject, issuer } | null,
 * }}
 */
async function rawRequest(url, opts = {}) {
  const {
    method    = "GET",
    headers   = {},
    body      = null,
    timeoutMs = 10000,
  } = opts;

  const parsed = new URL(url);
  const isHttps = parsed.protocol === "https:";
  const port    = parsed.port
    ? parseInt(parsed.port, 10)
    : isHttps ? 443 : 80;

  const t0 = process.hrtime.bigint();
  let tDns, tTcp, tTls, tFirstByte;
  let sslInfo = null;

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      req.destroy(Object.assign(new Error("Request timed out"), { code: "ETIMEDOUT" }));
    }, timeoutMs);

    const reqOptions = {
      hostname: parsed.hostname,
      port,
      path: parsed.pathname + parsed.search,
      method,
      headers: {
        "User-Agent": "AIRA-Monitor/1.0",
        "Accept": "*/*",
        ...headers,
      },
      // For HTTPS: capture the certificate but don't override validation
      ...(isHttps && {
        agent: new https.Agent({ maxSockets: 1, keepAlive: false }),
      }),
    };

    const transport = isHttps ? https : http;
    const req = transport.request(reqOptions, (res) => {
      tFirstByte = Number(process.hrtime.bigint() - t0) / 1e6;
      const chunks = [];
      let bytesRead = 0;

      res.on("data", (chunk) => {
        bytesRead += chunk.length;
        if (bytesRead <= MAX_RESPONSE_BYTES) chunks.push(chunk);
      });

      res.on("end", () => {
        clearTimeout(timer);
        const total = Number(process.hrtime.bigint() - t0) / 1e6;
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks).toString("utf8"),
          timing: {
            dns:        tDns        ?? null,
            tcp:        tTcp        ?? null,
            tls:        tTls        ?? null,
            firstByte:  tFirstByte  ?? null,
            total,
          },
          sslInfo,
          responseSizeBytes: bytesRead,
        });
      });

      res.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });

    // ── Socket timing events ────────────────────────────────────────────────
    req.on("socket", (socket) => {
      socket.on("lookup", () => {
        tDns = Number(process.hrtime.bigint() - t0) / 1e6;
      });
      socket.on("connect", () => {
        tTcp = Number(process.hrtime.bigint() - t0) / 1e6;
      });
      socket.on("secureConnect", () => {
        tTls = Number(process.hrtime.bigint() - t0) / 1e6;
        // Capture SSL certificate info
        if (socket.getPeerCertificate) {
          try {
            const cert = socket.getPeerCertificate();
            if (cert && cert.valid_to) {
              const expiry = new Date(cert.valid_to);
              const daysRemaining = Math.floor((expiry - Date.now()) / (1000 * 60 * 60 * 24));
              sslInfo = {
                valid: socket.authorized ?? true,
                daysRemaining,
                subject: cert.subject?.CN ?? null,
                issuer:  cert.issuer?.O  ?? null,
              };
            }
          } catch (_) { /* non-fatal */ }
        }
      });
    });

    req.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    if (body && (reqOptions.method === "POST" || reqOptions.method === "PUT" || reqOptions.method === "PATCH")) {
      req.write(body);
    }
    req.end();
  });
}

// ─── SSL-only check via tls.connect ──────────────────────────────────────────

async function checkSslOnly(hostname, port = 443, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.destroy(Object.assign(new Error("TLS connect timed out"), { code: "ETIMEDOUT" }));
    }, timeoutMs);

    const socket = tls.connect(
      { host: hostname, port, servername: hostname, rejectUnauthorized: true },
      () => {
        clearTimeout(timer);
        try {
          const cert = socket.getPeerCertificate();
          const expiry = new Date(cert.valid_to);
          const daysRemaining = Math.floor((expiry - Date.now()) / (1000 * 60 * 60 * 24));
          resolve({
            valid: socket.authorized,
            daysRemaining,
            subject: cert.subject?.CN ?? null,
            issuer:  cert.issuer?.O  ?? null,
          });
        } catch (err) {
          resolve({ valid: false, daysRemaining: null, subject: null, issuer: null });
        } finally {
          socket.destroy();
        }
      }
    );

    socket.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

// ─── SSRF-safe request with redirect following ────────────────────────────────

async function safeRequest(monitor) {
  const { url, method, timeoutMs, maximumRedirects, followRedirects } = monitor;
  const requestHeaders = monitor.requestHeaders instanceof Map
    ? Object.fromEntries(monitor.requestHeaders)
    : (monitor.requestHeaders ?? {});

  let currentUrl = url;
  let redirectCount = 0;
  let lastResponse = null;

  const maxRedirects = followRedirects ? (maximumRedirects ?? 5) : 0;

  for (let attempt = 0; attempt <= maxRedirects; attempt++) {
    const parsed = new URL(currentUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw Object.assign(new Error("Only http/https allowed"), { code: "SSRF_BLOCKED" });
    }

    // SSRF check on every hop
    await assertSafeHost(parsed.hostname);

    lastResponse = await rawRequest(currentUrl, {
      method: attempt === 0 ? method : "GET", // degrade to GET on redirects
      headers: requestHeaders,
      body: attempt === 0 ? monitor.requestBody : null,
      timeoutMs,
    });

    if (lastResponse.statusCode >= 300 && lastResponse.statusCode < 400 && followRedirects) {
      const location = lastResponse.headers["location"];
      if (!location) break;
      currentUrl = new URL(location, currentUrl).toString();
      redirectCount++;
    } else {
      break;
    }
  }

  return { response: lastResponse, redirectCount, finalUrl: currentUrl };
}

// ─── Main check executor ──────────────────────────────────────────────────────

/**
 * Execute a single monitor check.
 *
 * @param {object} monitor  Mongoose Monitor document
 * @returns {object}        Raw result (not persisted here)
 */
async function executeCheck(monitor) {
  const checkedAt = new Date();
  let result = {
    monitorId:     monitor._id,
    serviceId:     monitor.serviceId,
    organizationId: monitor.organizationId,
    tenantId:      monitor.tenantId,
    checkedAt,
    status:        "unknown",
    statusCode:    null,
    responseTimeMs: null,
    responseSizeBytes: null,
    dnsTimeMs:     null,
    tcpTimeMs:     null,
    tlsTimeMs:     null,
    firstByteTimeMs: null,
    sslValid:      null,
    sslDaysRemaining: null,
    contentMatched: null,
    redirectCount:  0,
    errorCode:     null,
    sanitizedErrorMessage: null,
    checkerRegion: CHECKER_REGION,
  };

  try {
    // ── SSL-only monitors ───────────────────────────────────────────────────
    if (monitor.type === "ssl") {
      const parsed = new URL(monitor.url);
      await assertSafeHost(parsed.hostname);
      const port = parsed.port ? parseInt(parsed.port, 10) : 443;
      const sslInfo = await checkSslOnly(parsed.hostname, port, monitor.timeoutMs);
      result.sslValid = sslInfo.valid;
      result.sslDaysRemaining = sslInfo.daysRemaining;
      const warnThreshold = monitor.sslExpiryWarningDays ?? 30;
      if (!sslInfo.valid) {
        result.status = "down";
      } else if (sslInfo.daysRemaining !== null && sslInfo.daysRemaining <= warnThreshold) {
        result.status = "degraded";
      } else {
        result.status = "healthy";
      }
      return result;
    }

    // ── HTTP / HTTPS monitors ───────────────────────────────────────────────
    const { response, redirectCount, finalUrl } = await safeRequest(monitor);

    result.statusCode       = response.statusCode;
    result.responseTimeMs   = Math.round(response.timing.total);
    result.responseSizeBytes = response.responseSizeBytes;
    result.dnsTimeMs        = response.timing.dns     !== null ? Math.round(response.timing.dns)        : null;
    result.tcpTimeMs        = response.timing.tcp     !== null ? Math.round(response.timing.tcp)        : null;
    result.tlsTimeMs        = response.timing.tls     !== null ? Math.round(response.timing.tls)        : null;
    result.firstByteTimeMs  = response.timing.firstByte !== null ? Math.round(response.timing.firstByte) : null;
    result.redirectCount    = redirectCount;

    // SSL info from the response socket (HTTPS only)
    if (response.sslInfo) {
      result.sslValid        = response.sslInfo.valid;
      result.sslDaysRemaining = response.sslInfo.daysRemaining;
    }

    // Status code assertion
    const expectedCodes = monitor.expectedStatusCodes?.length
      ? monitor.expectedStatusCodes
      : [200];
    const statusOk = expectedCodes.includes(response.statusCode);

    // Content match assertion
    if (monitor.expectedText) {
      result.contentMatched = response.body.includes(monitor.expectedText);
    }

    // Determine check status
    const sslWarnThreshold = monitor.sslExpiryWarningDays ?? 30;
    const sslExpiring = result.sslDaysRemaining !== null && result.sslDaysRemaining <= sslWarnThreshold;
    const contentFail  = monitor.expectedText && !result.contentMatched;

    if (!statusOk || contentFail) {
      result.status = "down";
    } else if (sslExpiring) {
      result.status = "degraded";
    } else {
      result.status = "healthy";
    }

    return result;
  } catch (err) {
    result.status = "down";
    result.errorCode = err.code ?? "UNKNOWN";
    // Never include raw error messages that could contain path or credential info
    result.sanitizedErrorMessage = sanitizeErrorMessage(err);
    return result;
  }
}

/** Map error codes to safe, user-facing descriptions. */
function sanitizeErrorMessage(err) {
  const CODE_MAP = {
    ENOTFOUND:       "DNS resolution failed",
    EAI_AGAIN:       "DNS temporarily unavailable",
    ECONNREFUSED:    "Connection refused",
    ECONNRESET:      "Connection reset",
    ETIMEDOUT:       "Request timed out",
    CERT_HAS_EXPIRED: "SSL certificate expired",
    UNABLE_TO_VERIFY_LEAF_SIGNATURE: "SSL certificate verification failed",
    DEPTH_ZERO_SELF_SIGNED_CERT: "Self-signed SSL certificate",
    SSRF_BLOCKED:    "Target address is not accessible for security reasons",
    SSRF_DNS_FAILED: "Could not resolve target hostname",
    TOO_MANY_REDIRECTS: "Too many redirects",
  };
  return CODE_MAP[err.code] ?? "Check failed";
}

// ─── Persist result and update monitor state ──────────────────────────────────

/**
 * Save a MonitorCheck and update the Monitor's runtime state.
 * Returns { oldStatus, newStatus, transitioned }.
 */
async function recordResult(monitor, result) {
  // 1. Persist check record
  await MonitorCheck.create(result);

  const isSuccess = result.status === "healthy";
  const oldStatus = monitor.lastStatus;

  // 2. Update counters and runtime state atomically
  const consecutiveFailures  = isSuccess ? 0 : monitor.consecutiveFailures + 1;
  const consecutiveSuccesses = isSuccess ? monitor.consecutiveSuccesses + 1 : 0;

  // State transition logic
  let newStatus = oldStatus;
  if (consecutiveFailures >= monitor.consecutiveFailureThreshold) {
    newStatus = "down";
  } else if (consecutiveSuccesses >= monitor.recoverySuccessThreshold) {
    newStatus = "healthy";
  } else if (result.status === "degraded") {
    newStatus = "degraded";
  } else if (oldStatus === "unknown" && result.status === "healthy") {
    newStatus = "healthy";
  } else if (oldStatus === "unknown") {
    newStatus = result.status;
  }
  // If not enough data yet to confirm up or down, keep current status

  const nextCheckAt = new Date(Date.now() + monitor.intervalSeconds * 1000);

  await Monitor.findByIdAndUpdate(monitor._id, {
    $set: {
      lastStatus:           newStatus,
      lastCheckedAt:        result.checkedAt,
      lastStatusCode:       result.statusCode,
      lastResponseTimeMs:   result.responseTimeMs,
      consecutiveFailures,
      consecutiveSuccesses,
      nextCheckAt,
      lockedAt: null,
      lockedBy: null,
    },
  });

  const transitioned = oldStatus !== newStatus;
  if (transitioned) {
    console.log(
      `[monitor] State transition for ${monitor._id} (${monitor.name}): ${oldStatus} → ${newStatus}`
    );

    if (newStatus === "down") {
      // Open or update the incident (fire-and-forget; failures must not break monitoring)
      incidentService.openOrUpdate({ monitor, check: result, transitionedAt: result.checkedAt })
        .catch((err) => console.error("[incident] openOrUpdate failed:", err.message));
    } else if (newStatus === "healthy" && (oldStatus === "down" || oldStatus === "degraded")) {
      incidentService.resolveForMonitor({ monitor, resolvedAt: result.checkedAt })
        .catch((err) => console.error("[incident] resolveForMonitor failed:", err.message));
    }
  } else if (newStatus === "down") {
    // Still down — update existing incident occurrence count
    incidentService.openOrUpdate({ monitor, check: result, transitionedAt: result.checkedAt })
      .catch((err) => console.error("[incident] openOrUpdate (update) failed:", err.message));
  }

  return { oldStatus, newStatus, transitioned };
}

module.exports = { executeCheck, recordResult, sanitizeErrorMessage };
