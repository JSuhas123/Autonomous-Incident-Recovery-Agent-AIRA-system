"use strict";

/**
 * Admin stub routes for Users, Roles, and API Keys management.
 * These are development stubs - replace with real implementation before production.
 */

const express = require("express");
const router = express.Router();

// In-memory store for dev
const users = [
  { id: "user-superadmin-1", email: "admin@aira.local", name: "Super Admin", role: "superadmin", status: "active", createdAt: new Date().toISOString() }
];
const roles = [
  { id: "role-superadmin", name: "superadmin", description: "Full system access", permissions: ["*"], createdAt: new Date().toISOString() },
  { id: "role-admin", name: "admin", description: "Tenant administration", permissions: ["read:*", "write:*"], createdAt: new Date().toISOString() },
  { id: "role-viewer", name: "viewer", description: "Read-only access", permissions: ["read:*"], createdAt: new Date().toISOString() },
];
const apiKeys = [
  { id: "key-demo-1", keyId: "demo-key-1", description: "Demo API Key", active: true, createdAt: new Date().toISOString() }
];

// Users
router.get("/users", (req, res) => res.json({ users, total: users.length }));
router.post("/users", (req, res) => {
  const { email, name, role } = req.body || {};
  const user = { id: `user-${Date.now()}`, email, name, role: role || "viewer", status: "active", createdAt: new Date().toISOString() };
  users.push(user);
  res.status(201).json(user);
});
router.put("/users/:id", (req, res) => {
  const idx = users.findIndex(u => u.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "User not found" });
  users[idx] = { ...users[idx], ...req.body, id: req.params.id };
  res.json(users[idx]);
});
router.delete("/users/:id", (req, res) => {
  const idx = users.findIndex(u => u.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "User not found" });
  users.splice(idx, 1);
  res.json({ success: true });
});

// Roles
router.get("/roles", (req, res) => res.json({ roles, total: roles.length }));
router.post("/roles", (req, res) => {
  const role = { id: `role-${Date.now()}`, ...req.body, createdAt: new Date().toISOString() };
  roles.push(role);
  res.status(201).json(role);
});
router.delete("/roles/:id", (req, res) => {
  const idx = roles.findIndex(r => r.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Role not found" });
  roles.splice(idx, 1);
  res.json({ success: true });
});

// API Keys
router.get("/api-keys", (req, res) => res.json({ apiKeys, total: apiKeys.length }));
router.post("/api-keys", (req, res) => {
  const key = {
    id: `key-${Date.now()}`,
    keyId: `key-${Math.random().toString(36).slice(2, 10)}`,
    description: req.body?.description || "New API Key",
    active: true,
    secret: Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2),
    createdAt: new Date().toISOString()
  };
  apiKeys.push(key);
  res.status(201).json(key);
});
router.delete("/api-keys/:id", (req, res) => {
  const idx = apiKeys.findIndex(k => k.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "API Key not found" });
  apiKeys.splice(idx, 1);
  res.json({ success: true });
});

module.exports = router;
