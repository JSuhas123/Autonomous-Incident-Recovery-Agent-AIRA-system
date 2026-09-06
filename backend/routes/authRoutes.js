"use strict";

const express = require("express");

const authCoreRoutes = require("./authCoreRoutes");
const passwordResetRoutes = require("./passwordResetRoutes");

const router = express.Router();

/*
 * Preserve the existing Phase-25 authentication contract:
 *
 * - registration
 * - login
 * - session
 * - context
 * - CSRF
 * - logout
 * - logout-all
 *
 * authCoreRoutes is the exact previously-working authRoutes.js,
 * renamed without modifying its contents.
 */
router.use(authCoreRoutes);

/*
 * Phase 25.2C
 *
 * Public account-recovery routes:
 *
 * POST /forgot-password
 * POST /reset-password
 *
 * Password recovery does not create a session and does not
 * grant any operational or execution authority.
 */
router.use(passwordResetRoutes);

module.exports = router;