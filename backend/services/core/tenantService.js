"use strict";

const crypto = require("crypto");

const TenantConfig = require("../../models/TenantConfig");
const {
  policyRepository,
} =
  require(
    "../../persistence/repositories"
  );
/**
 * Legacy tenant configuration service.
 *
 * IMPORTANT:
 *
 * TenantConfig remains the compatibility/configuration layer for
 * existing tenant-scoped machine APIs.
 *
 * Human identity and authorization are moving toward:
 *
 * Organization
 *   -> OrganizationMembership
 *   -> User
 *
 * Do not use TenantConfig.admins as the canonical human RBAC source
 * for new enterprise functionality.
 */
class TenantService {
  /**
   * Canonical hash function for machine credentials.
   *
   * This MUST remain consistent with authMiddleware.
   */
  static hashCredential(value) {
    return crypto
      .createHash("sha256")
      .update(String(value))
      .digest("hex");
  }

  /**
   * Generate a machine API credential.
   *
   * The plaintext secret is returned only to the caller.
   * Only hashes are intended to be persisted.
   */
  static generateApiCredential(scopes = ["read:*", "write:*"]) {
    const keyId =
      `key_${crypto.randomBytes(8).toString("hex")}`;

    const secret =
      crypto.randomBytes(32).toString("hex");

    return {
      keyId,
      secret,

      storedKey: {
        keyId,

        keyHash:
          this.hashCredential(keyId),

        secretHash:
          this.hashCredential(secret),

        createdAt:
          new Date(),

        rotationDeadline:
          null,

        scopes:
          Array.isArray(scopes)
            ? [...scopes]
            : ["read:*", "write:*"],

        status:
          "active",

        active:
          true,
      },
    };
  }

  /**
   * Get active tenant configuration.
   */
  static async getActiveTenant(tenantId) {
    try {
      const tenant =
        await TenantConfig.findOne({
          tenantId,
          status: "active",
        });

      if (!tenant) {
        console.warn(
          `[tenant] Tenant not found or inactive: ${tenantId}`
        );

        return null;
      }

      console.log(
        `[tenant] Retrieved config for tenant=${tenantId}`
      );

      return tenant;
    } catch (error) {
      console.error(
        "[tenant] Error getting tenant:",
        error.message
      );

      throw error;
    }
  }

  /**
   * Get active policy for a tenant.
   */
  static async getTenantPolicy(
  tenantId
) {
  try {
    const tenant =
      await this
        .getActiveTenant(
          tenantId
        );

    if (
      !tenant
    ) {
      return null;
    }

    const policy =
      await policyRepository
        .findActiveForTenant(
          tenantId,
          tenant.policyVersion
        );

    if (
      !policy
    ) {
      console.warn(
        `[tenant] No policy found for tenant=${tenantId} v${tenant.policyVersion}`
      );

      return null;
    }

    console.log(
      `[tenant] Retrieved policy v${policy.version} for tenant=${tenantId}`
    );

    return policy;
  } catch (
    error
  ) {
    console.error(
      "[tenant] Error getting policy:",
      error.message
    );

    throw error;
  }
}

  /**
   * Validate tenant status and API-key status.
   *
   * NOTE:
   * This validates whether a key record may be used.
   * Actual secret/signature authentication happens in
   * authMiddleware.
   */
  static async validateTenantStatus(
    tenantId,
    keyId
  ) {
    try {
      const tenant =
        await TenantConfig.findOne({
          tenantId,
        });

      if (!tenant) {
        return {
          valid: false,
          reason:
            "Tenant not found",
          code:
            "TENANT_NOT_FOUND",
        };
      }

      if (
        tenant.status !== "active"
      ) {
        return {
          valid: false,
          reason:
            `Tenant status is ${tenant.status}`,
          code:
            "TENANT_INACTIVE",
        };
      }

      const apiKey =
        tenant.apiKeys.find(
          (key) =>
            key.keyId === keyId
        );

      if (!apiKey) {
        return {
          valid: false,
          reason:
            "API key not found",
          code:
            "API_KEY_NOT_FOUND",
        };
      }

      if (
        !apiKey.active ||
        apiKey.status === "retired"
      ) {
        return {
          valid: false,
          reason:
            "API key is inactive",
          code:
            "API_KEY_INACTIVE",
        };
      }

      if (
        apiKey.rotationDeadline &&
        new Date() >
          new Date(
            apiKey.rotationDeadline
          )
      ) {
        return {
          valid: false,
          reason:
            "API key rotation deadline has passed",
          code:
            "API_KEY_ROTATED",
        };
      }

      console.log(
        `[tenant] ✓ Validation passed for tenant=${tenantId}`
      );

      return {
        valid: true,
        tenant,
        apiKey,
      };
    } catch (error) {
      console.error(
        "[tenant] Error validating status:",
        error.message
      );

      return {
        valid: false,
        reason:
          error.message,
        code:
          "VALIDATION_ERROR",
      };
    }
  }

  /**
   * Create or update legacy tenant configuration.
   *
   * Human membership/RBAC should NOT be introduced here.
   */
  static async createOrUpdateTenant(
    tenantData,
    adminKeyId
  ) {
    try {
      const {
        tenantId,
        name,
        status = "active",
        settings = {},
      } = tenantData;

      if (!tenantId) {
        throw new Error(
          "Missing required field: tenantId"
        );
      }

      let tenant =
        await TenantConfig.findOne({
          tenantId,
        });

      if (!tenant) {
        /*
         * Do not create legacy TenantConfig.admins records
         * using the old keyId/grantedAt shape because that
         * no longer matches the TenantConfig schema.
         *
         * OrganizationMembership is the canonical human
         * authorization system going forward.
         */
        tenant =
          new TenantConfig({
            tenantId,
            name,
            status,
            settings,

            createdAt:
              new Date(),

            createdBy:
              adminKeyId,

            apiKeys: [],
            admins: [],
          });

        await tenant.save();

        console.log(
          `[tenant] ✓ Created new tenant: ${tenantId}`
        );
      } else {
        tenant.name =
          name || tenant.name;

        tenant.status =
          status;

        tenant.settings = {
          ...(
            tenant.settings?.toObject?.() ||
            tenant.settings ||
            {}
          ),
          ...settings,
        };

        await tenant.save();

        console.log(
          `[tenant] ✓ Updated tenant: ${tenantId}`
        );
      }

      return tenant;
    } catch (error) {
      console.error(
        "[tenant] Error creating/updating tenant:",
        error.message
      );

      throw error;
    }
  }

  /**
   * Rotate machine API credentials.
   *
   * During the rotation grace period:
   *
   * OLD KEY -> rotating + active
   * NEW KEY -> active
   *
   * Once the deadline passes authMiddleware rejects the old key.
   */
  static async rotateApiKey(
    tenantId,
    oldKeyId,
    options = {}
  ) {
    try {
      const tenant =
        await TenantConfig.findOne({
          tenantId,
        });

      if (!tenant) {
        throw new Error(
          `Tenant not found: ${tenantId}`
        );
      }

      const oldKey =
        tenant.apiKeys.find(
          (key) =>
            key.keyId ===
            oldKeyId
        );

      if (!oldKey) {
        throw new Error(
          `API key not found: ${oldKeyId}`
        );
      }

      if (
        !oldKey.active ||
        oldKey.status ===
          "retired"
      ) {
        throw new Error(
          `API key is inactive: ${oldKeyId}`
        );
      }

      const requestedHours =
        Number(
          options.rotationDeadlineHours
        );

      const rotationDeadlineHours =
        Number.isFinite(
          requestedHours
        ) &&
        requestedHours > 0
          ? requestedHours
          : 24;

      const rotationDeadline =
        new Date(
          Date.now() +
            rotationDeadlineHours *
              60 *
              60 *
              1000
        );

      /*
       * Old key remains usable only until
       * rotationDeadline.
       */
      oldKey.status =
        "rotating";

      oldKey.active =
        true;

      oldKey.rotationDeadline =
        rotationDeadline;

      const scopes =
        Array.isArray(
          options.newScopes
        ) &&
        options.newScopes.length > 0
          ? options.newScopes
          : oldKey.scopes;

      const {
        keyId: newKeyId,
        secret: newSecret,
        storedKey,
      } =
        this.generateApiCredential(
          scopes
        );

      tenant.apiKeys.push(
        storedKey
      );

      await tenant.save();

      console.log(
        `[tenant] ✓ Rotated API key for tenant=${tenantId} | old=${oldKeyId} → new=${newKeyId}`
      );

      /*
       * newSecret must never be persisted or logged.
       *
       * Return it once so the caller can securely
       * deliver it to the client.
       */
      return {
        tenantId,
        oldKeyId,
        newKeyId,
        newSecret,
        rotationDeadline,
      };
    } catch (error) {
      console.error(
        "[tenant] Error rotating API key:",
        error.message
      );

      throw error;
    }
  }

  /**
   * Remove an API key.
   *
   * Existing behavior is retained for compatibility.
   * Later enterprise credential management can replace
   * physical deletion with permanent retirement.
   */
  static async removeApiKey(
    tenantId,
    keyId
  ) {
    try {
      const tenant =
        await TenantConfig.findOne({
          tenantId,
        });

      if (!tenant) {
        throw new Error(
          `Tenant not found: ${tenantId}`
        );
      }

      const keyIndex =
        tenant.apiKeys.findIndex(
          (key) =>
            key.keyId === keyId
        );

      if (keyIndex < 0) {
        throw new Error(
          `API key not found: ${keyId}`
        );
      }

      tenant.apiKeys.splice(
        keyIndex,
        1
      );

      await tenant.save();

      console.log(
        `[tenant] ✓ Removed API key ${keyId} from tenant=${tenantId}`
      );

      return true;
    } catch (error) {
      console.error(
        "[tenant] Error removing API key:",
        error.message
      );

      throw error;
    }
  }

  /**
   * Legacy tenant-admin method.
   *
   * TenantConfig.admins is not the canonical enterprise
   * human authorization model anymore.
   *
   * This implementation follows the CURRENT TenantConfig
   * admin schema for compatibility.
   */
  static async addAdmin(
    tenantId,
    email,
    role,
    permissions = []
  ) {
    try {
      const tenant =
        await TenantConfig.findOne({
          tenantId,
        });

      if (!tenant) {
        throw new Error(
          `Tenant not found: ${tenantId}`
        );
      }

      if (
        ![
          "superadmin",
          "policy_manager",
          "viewer",
        ].includes(role)
      ) {
        throw new Error(
          `Invalid role: ${role}`
        );
      }

      if (
        !email ||
        typeof email !== "string"
      ) {
        throw new Error(
          "Admin email is required"
        );
      }

      const normalizedEmail =
        email
          .trim()
          .toLowerCase();

      const existingAdmin =
        tenant.admins.find(
          (admin) =>
            admin.email
              ?.toLowerCase() ===
            normalizedEmail
        );

      if (existingAdmin) {
        existingAdmin.role =
          role;

        existingAdmin.permissions =
          Array.isArray(
            permissions
          )
            ? [...permissions]
            : [];

        await tenant.save();

        return existingAdmin;
      }

      const admin = {
        email:
          normalizedEmail,

        role,

        permissions:
          Array.isArray(
            permissions
          )
            ? [...permissions]
            : [],

        addedAt:
          new Date(),
      };

      tenant.admins.push(
        admin
      );

      await tenant.save();

      console.log(
        `[tenant] ✓ Added legacy admin ${normalizedEmail} (${role}) to tenant=${tenantId}`
      );

      return admin;
    } catch (error) {
      console.error(
        "[tenant] Error adding admin:",
        error.message
      );

      throw error;
    }
  }

  /**
   * Get tenants for administrative tooling.
   */
  static async getAllTenants(
    options = {}
  ) {
    try {
      const requestedLimit =
        Number(options.limit);

      const requestedSkip =
        Number(options.skip);

      const limit =
        Number.isInteger(
          requestedLimit
        ) &&
        requestedLimit > 0
          ? Math.min(
              requestedLimit,
              100
            )
          : 50;

      const skip =
        Number.isInteger(
          requestedSkip
        ) &&
        requestedSkip >= 0
          ? requestedSkip
          : 0;

      const filter =
        options.filter || {
          status: "active",
        };

      const [
        tenants,
        count,
      ] =
        await Promise.all([
          TenantConfig.find(
            filter
          )
            .sort({
              createdAt: -1,
            })
            .limit(limit)
            .skip(skip),

          TenantConfig.countDocuments(
            filter
          ),
        ]);

      console.log(
        `[tenant] Retrieved ${tenants.length}/${count} tenants`
      );

      return {
        tenants,
        total:
          count,
        limit,
        skip,
      };
    } catch (error) {
      console.error(
        "[tenant] Error getting all tenants:",
        error.message
      );

      throw error;
    }
  }

  /**
   * Get legacy tenant metrics.
   */
  static async getTenantMetrics(
    tenantId
  ) {
    try {
      const tenant =
        await TenantConfig.findOne({
          tenantId,
        });

      if (!tenant) {
        throw new Error(
          `Tenant not found: ${tenantId}`
        );
      }

      /*
       * Operational metrics are placeholders until
       * incident/action/event aggregation is connected.
       */
      const metrics = {
        tenantId,
        name:
          tenant.name,
        status:
          tenant.status,

        apiKeysCount:
          tenant.apiKeys.length,

        adminsCount:
          tenant.admins.length,

        policyVersion:
          tenant.policyVersion,

        createdAt:
          tenant.createdAt,

        lastActivity:
          tenant.updatedAt,

        incidentsThisMonth:
          0,

        alertsThisMonth:
          0,

        actionsExecutedThisMonth:
          0,
      };

      console.log(
        `[tenant] Retrieved metrics for tenant=${tenantId}`
      );

      return metrics;
    } catch (error) {
      console.error(
        "[tenant] Error getting metrics:",
        error.message
      );

      throw error;
    }
  }
}

module.exports =
  TenantService;