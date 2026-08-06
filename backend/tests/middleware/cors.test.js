/**
 * CORS and Preflight Tests
 *
 * Verifies that:
 *  - OPTIONS preflight requests succeed without authentication
 *  - Allowed origins receive correct CORS headers
 *  - Disallowed origins get a controlled rejection (not a 500)
 *  - Health endpoints work without credentials
 *  - GET requests do not require X-Idempotency-Key
 *  - Auth middleware is never invoked for OPTIONS
 */

const express = require("express");
const cors = require("cors");
const request = require("supertest");

// ---------------------------------------------------------------------------
// Mirror the CORS setup from server.js so we test the exact same logic
// without spinning up the full server (no DB / Redis required)
// ---------------------------------------------------------------------------
const PRODUCTION_FRONTEND = "https://autonomous-incident-recovery-agent-ten.vercel.app";
const DEFAULT_ORIGINS = `http://localhost:5173,http://localhost:3000,${PRODUCTION_FRONTEND}`;

function parseOrigins(raw) {
  if (!raw) return [];
  return raw.split(",").map(s => s.trim().replace(/\/+$/, "")).filter(Boolean);
}

function buildApp(corsOriginsEnv) {
  const allowedOrigins = parseOrigins(corsOriginsEnv || DEFAULT_ORIGINS);

  const corsOptions = {
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      const normalized = origin.replace(/\/+$/, "");
      if (allowedOrigins.includes(normalized)) return callback(null, true);
      callback(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Authorization",
      "Content-Type",
      "X-Idempotency-Key",
      "X-Signature",
      "X-Timestamp",
      "X-Request-Id",
      "Accept",
    ],
    exposedHeaders: ["X-Request-Id", "Retry-After", "X-Correlation-ID"],
    optionsSuccessStatus: 204,
    maxAge: 86400,
  };

  const app = express();
  app.use(cors(corsOptions));

  // Preflight handler — mirrors server.js
  app.use((req, res, next) => {
    if (req.method === "OPTIONS") return res.status(204).end();
    next();
  });

  // Fake auth middleware that tracks whether it was called
  const authCalled = { value: false };
  const fakeAuth = (req, res, next) => {
    if (req.method === "OPTIONS") return next();
    authCalled.value = true;
    next();
  };

  app.get("/health", (req, res) => res.status(200).json({ status: "ok" }));

  app.use("/api/v1/tenants/:tenantId", fakeAuth, (req, res) => {
    res.json({ ok: true, authCalled: authCalled.value });
  });

  app._authCalled = authCalled;
  return app;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("CORS and Preflight", () => {
  const VERCEL_ORIGIN = "https://autonomous-incident-recovery-agent-ten.vercel.app";
  const LOCAL_ORIGIN = "http://localhost:5173";
  const BAD_ORIGIN = "https://evil.example.com";

  let app;
  beforeEach(() => {
    app = buildApp();
    app._authCalled.value = false;
  });

  // ---- Successful preflight (Vercel origin) ----
  test("OPTIONS /api/v1/tenants/demo/decisions returns 204 from Vercel origin", async () => {
    const res = await request(app)
      .options("/api/v1/tenants/demo/decisions")
      .set("Origin", VERCEL_ORIGIN)
      .set("Access-Control-Request-Method", "GET")
      .set(
        "Access-Control-Request-Headers",
        "authorization,content-type,x-idempotency-key,x-signature,x-timestamp"
      );

    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe(VERCEL_ORIGIN);
    expect(res.headers["access-control-allow-methods"]).toMatch(/GET/i);
    expect(res.headers["access-control-allow-headers"]).toMatch(/authorization/i);
    expect(res.headers["access-control-allow-headers"]).toMatch(/x-idempotency-key/i);
    expect(res.headers["access-control-allow-headers"]).toMatch(/x-signature/i);
    expect(res.headers["access-control-allow-headers"]).toMatch(/x-timestamp/i);
  });

  // ---- Successful preflight (localhost origin) ----
  test("OPTIONS from localhost:5173 returns 204", async () => {
    const res = await request(app)
      .options("/api/v1/tenants/demo/decisions")
      .set("Origin", LOCAL_ORIGIN)
      .set("Access-Control-Request-Method", "GET");

    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe(LOCAL_ORIGIN);
  });

  // ---- Auth middleware is NOT called for OPTIONS ----
  test("OPTIONS does not invoke auth middleware", async () => {
    app._authCalled.value = false;
    await request(app)
      .options("/api/v1/tenants/demo/decisions")
      .set("Origin", VERCEL_ORIGIN)
      .set("Access-Control-Request-Method", "GET");

    expect(app._authCalled.value).toBe(false);
  });

  // ---- Disallowed origin — controlled rejection, not 500 ----
  test("OPTIONS from disallowed origin returns non-500 without CORS headers", async () => {
    const res = await request(app)
      .options("/api/v1/tenants/demo/decisions")
      .set("Origin", BAD_ORIGIN)
      .set("Access-Control-Request-Method", "GET");

    // Must not be a 500
    expect(res.status).not.toBe(500);
    // CORS allow header must not be set for a rejected origin
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  // ---- Health GET ----
  test("GET /health succeeds without credentials", async () => {
    const res = await request(app)
      .get("/health")
      .set("Origin", VERCEL_ORIGIN);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  // ---- Health OPTIONS ----
  test("OPTIONS /health returns 200 or 204", async () => {
    const res = await request(app)
      .options("/health")
      .set("Origin", VERCEL_ORIGIN)
      .set("Access-Control-Request-Method", "GET");

    expect([200, 204]).toContain(res.status);
  });

  // ---- No-origin request (server-to-server / curl) ----
  test("GET /health without Origin header succeeds", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// parseOrigins unit tests
// ---------------------------------------------------------------------------
describe("parseOrigins", () => {
  test("handles undefined safely", () => {
    expect(parseOrigins(undefined)).toEqual([]);
  });

  test("trims whitespace and removes trailing slashes", () => {
    const result = parseOrigins("  http://localhost:5173/  , https://example.com/ ");
    expect(result).toEqual(["http://localhost:5173", "https://example.com"]);
  });

  test("removes empty entries", () => {
    const result = parseOrigins(",http://localhost:3000,,");
    expect(result).toEqual(["http://localhost:3000"]);
  });
});

// ---------------------------------------------------------------------------
// authMiddleware OPTIONS bypass test
// ---------------------------------------------------------------------------
describe("authMiddleware OPTIONS bypass", () => {
  test("OPTIONS calls next() immediately without checking headers", async () => {
    // Load the real authMiddleware
    const authMiddleware = require("../../middleware/authMiddleware");
    const next = jest.fn();
    const req = { method: "OPTIONS", params: {}, headers: {} };
    const res = {};
    await authMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// authMiddleware GET — no idempotency key required
// ---------------------------------------------------------------------------
describe("authMiddleware GET idempotency", () => {
  test("GET request without X-Idempotency-Key passes idempotency check", async () => {
    // We only test that authMiddleware does NOT reject a GET for missing
    // idempotency key.  It will reject later for missing Authorization, which
    // is expected — the point is the rejection code is MISSING_AUTH_HEADER,
    // not MISSING_IDEMPOTENCY_KEY.
    const authMiddleware = require("../../middleware/authMiddleware");
    let capturedStatus;
    let capturedBody;
    const req = {
      method: "GET",
      params: { tenantId: "demo" },
      headers: {}, // No Authorization, no idempotency key
    };
    const res = {
      status(code) { capturedStatus = code; return this; },
      json(body) { capturedBody = body; return this; },
    };
    const next = jest.fn();
    await authMiddleware(req, res, next);

    // Should fail for auth reasons, not idempotency
    expect(capturedBody?.code).not.toBe("MISSING_IDEMPOTENCY_KEY");
    expect(capturedStatus).toBe(401);
  });
});
