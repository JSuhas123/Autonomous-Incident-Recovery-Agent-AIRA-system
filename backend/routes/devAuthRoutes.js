"use strict";

/**
 * Development Authentication Provider
 * 
 * Provides a simple email/password login returning a JWT.
 * This is a TEMPORARY provider for development only.
 * Replace with production auth (OAuth/OIDC/SSO) before going live.
 * 
 * Demo credentials:
 *   email:    admin@aira.local
 *   password: Admin@123
 */

const express = require("express");
const jwt = require("jsonwebtoken");

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || "dev-jwt-secret-change-in-production-32chars";
const JWT_EXPIRES_IN = "24h";

// Demo organization + tenant + user (DEV ONLY)
const DEMO_ORG = {
  id: "demo-org",
  name: "Demo Organization",
};

const DEMO_TENANT = {
  id: "demo",
  name: "Demo Tenant",
  orgId: DEMO_ORG.id,
};

const DEMO_USERS = [
  {
    id: "user-superadmin-1",
    email: "admin@aira.local",
    // Plain password stored only in dev mock - never do this in production
    password: "Admin@123",
    name: "Super Admin",
    role: "superadmin",
    tenantId: DEMO_TENANT.id,
    tenantName: DEMO_TENANT.name,
    orgId: DEMO_ORG.id,
  },
];

/**
 * POST /api/auth/login
 * Body: { email, password }
 * Returns: { token, user }
 */
router.post("/login", (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required", code: "MISSING_CREDENTIALS" });
  }

  const user = DEMO_USERS.find(
    (u) => u.email.toLowerCase() === email.toLowerCase() && u.password === password
  );

  if (!user) {
    return res.status(401).json({ error: "Invalid email or password", code: "INVALID_CREDENTIALS" });
  }

  const payload = {
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    tenantId: user.tenantId,
    tenantName: user.tenantName,
    orgId: user.orgId,
  };

  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

  return res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      tenantId: user.tenantId,
      tenantName: user.tenantName,
    },
  });
});

/**
 * POST /api/auth/logout
 * Stateless JWT - just return success. Client drops the token.
 */
router.post("/logout", (req, res) => {
  res.json({ success: true });
});

/**
 * GET /api/auth/me
 * Validate current token and return user info.
 */
router.get("/me", (req, res) => {
  const authHeader = req.headers["authorization"] || "";
  if (!authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Not authenticated", code: "MISSING_TOKEN" });
  }
  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    return res.json({ user: payload });
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token", code: "INVALID_TOKEN" });
  }
});

module.exports = router;
