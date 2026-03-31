const TenantConfig = require("../../models/TenantConfig");
const PolicyDefinition = require("../../models/PolicyDefinition");
const crypto = require("crypto");

class TenantService {
  /**
   * Get active tenant configuration
   * @param {string} tenantId - Tenant identifier
   */
  static async getActiveTenant(tenantId) {
    try {
      const tenant = await TenantConfig.findOne({
        tenantId,
        status: "active",
      });

      if (!tenant) {
        console.warn(`[tenant] Tenant not found or inactive: ${tenantId}`);
        return null;
      }

      console.log(`[tenant] Retrieved config for tenant=${tenantId}`);

      return tenant;
    } catch (error) {
      console.error("[tenant] Error getting tenant:", error.message);
      throw error;
    }
  }

  /**
   * Get active policy for a tenant
   * @param {string} tenantId - Tenant identifier
   */
  static async getTenantPolicy(tenantId) {
    try {
      const tenant = await this.getActiveTenant(tenantId);
      if (!tenant) {
        return null;
      }

      const policy = await PolicyDefinition.findOne({
        tenantId,
        version: tenant.policyVersion,
        status: "active",
      });

      if (!policy) {
        console.warn(
          `[tenant] No policy found for tenant=${tenantId} v${tenant.policyVersion}`
        );
        return null;
      }

      console.log(
        `[tenant] Retrieved policy v${policy.version} for tenant=${tenantId}`
      );

      return policy;
    } catch (error) {
      console.error("[tenant] Error getting policy:", error.message);
      throw error;
    }
  }

  /**
   * Validate tenant status and permissions
   * @param {string} tenantId - Tenant identifier
   * @param {string} keyId - API key identifier
   */
  static async validateTenantStatus(tenantId, keyId) {
    try {
      const tenant = await TenantConfig.findOne({ tenantId });

      if (!tenant) {
        return {
          valid: false,
          reason: "Tenant not found",
          code: "TENANT_NOT_FOUND",
        };
      }

      if (tenant.status !== "active") {
        return {
          valid: false,
          reason: `Tenant status is ${tenant.status}`,
          code: "TENANT_INACTIVE",
        };
      }

      const apiKey = tenant.apiKeys.find((k) => k.keyId === keyId);
      if (!apiKey) {
        return {
          valid: false,
          reason: "API key not found",
          code: "API_KEY_NOT_FOUND",
        };
      }

      if (!apiKey.active) {
        return {
          valid: false,
          reason: "API key is inactive",
          code: "API_KEY_INACTIVE",
        };
      }

      if (apiKey.rotationDeadline && new Date() > apiKey.rotationDeadline) {
        return {
          valid: false,
          reason: "API key has rotated",
          code: "API_KEY_ROTATED",
        };
      }

      console.log(`[tenant] ✓ Validation passed for tenant=${tenantId}`);

      return {
        valid: true,
        tenant,
        apiKey,
      };
    } catch (error) {
      console.error("[tenant] Error validating status:", error.message);
      return {
        valid: false,
        reason: error.message,
        code: "VALIDATION_ERROR",
      };
    }
  }

  /**
   * Create or update a tenant (admin only)
   * @param {object} tenantData - {tenantId, name, status, settings}
   * @param {string} adminKeyId - API key of admin performing operation
   */
  static async createOrUpdateTenant(tenantData, adminKeyId) {
    try {
      const { tenantId, name, status = "active", settings = {} } = tenantData;

      if (!tenantId) {
        throw new Error("Missing required field: tenantId");
      }

      // Check if tenant exists
      let tenant = await TenantConfig.findOne({ tenantId });

      if (!tenant) {
        // Create new tenant
        tenant = new TenantConfig({
          tenantId,
          name,
          status,
          settings,
          createdAt: new Date(),
          createdBy: adminKeyId,
          apiKeys: [],
          admins: [
            {
              keyId: adminKeyId,
              role: "superadmin",
              grantedAt: new Date(),
              grantedBy: "system",
            },
          ],
        });

        await tenant.save();

        console.log(`[tenant] ✓ Created new tenant: ${tenantId}`);
      } else {
        // Update existing tenant
        tenant.name = name || tenant.name;
        tenant.status = status;
        tenant.settings = { ...tenant.settings, ...settings };
        tenant.updatedAt = new Date();

        await tenant.save();

        console.log(`[tenant] ✓ Updated tenant: ${tenantId}`);
      }

      return tenant;
    } catch (error) {
      console.error("[tenant] Error creating/updating tenant:", error.message);
      throw error;
    }
  }

  /**
   * Rotate API key for a tenant
   * @param {string} tenantId - Tenant identifier
   * @param {string} oldKeyId - Key to rotate out
   * @param {object} options - {rotationDeadlineHours, newScopes}
   */
  static async rotateApiKey(tenantId, oldKeyId, options = {}) {
    try {
      const tenant = await TenantConfig.findOne({ tenantId });
      if (!tenant) {
        throw new Error(`Tenant not found: ${tenantId}`);
      }

      const oldKey = tenant.apiKeys.find((k) => k.keyId === oldKeyId);
      if (!oldKey) {
        throw new Error(`API key not found: ${oldKeyId}`);
      }

      // Mark old key for rotation
      const rotationDeadline = new Date();
      rotationDeadline.setHours(
        rotationDeadline.getHours() + (options.rotationDeadlineHours || 24)
      );
      oldKey.rotationDeadline = rotationDeadline;

      // Generate new key
      const newKeyId = `key_${crypto.randomBytes(8).toString("hex")}`;
      const newSecret = crypto.randomBytes(32).toString("hex");
      const secretHash = crypto
        .createHash("sha256")
        .update(newSecret)
        .digest("hex");

      const newKey = {
        keyId: newKeyId,
        keyHash: crypto.createHash("sha256").update(newKeyId).digest("hex"),
        secretHash,
        active: true,
        createdAt: new Date(),
        scopes: options.newScopes || oldKey.scopes,
        rotationDeadline: null,
      };

      tenant.apiKeys.push(newKey);
      await tenant.save();

      console.log(
        `[tenant] ✓ Rotated API key for tenant=${tenantId} | old=${oldKeyId} → new=${newKeyId}`
      );

      return {
        tenantId,
        oldKeyId,
        newKeyId,
        newSecret, // Return secret ONLY at creation time
        rotationDeadline,
      };
    } catch (error) {
      console.error("[tenant] Error rotating API key:", error.message);
      throw error;
    }
  }

  /**
   * Remove an API key
   * @param {string} tenantId - Tenant identifier
   * @param {string} keyId - Key to remove
   */
  static async removeApiKey(tenantId, keyId) {
    try {
      const tenant = await TenantConfig.findOne({ tenantId });
      if (!tenant) {
        throw new Error(`Tenant not found: ${tenantId}`);
      }

      const keyIndex = tenant.apiKeys.findIndex((k) => k.keyId === keyId);
      if (keyIndex < 0) {
        throw new Error(`API key not found: ${keyId}`);
      }

      tenant.apiKeys.splice(keyIndex, 1);
      await tenant.save();

      console.log(
        `[tenant] ✓ Removed API key ${keyId} from tenant=${tenantId}`
      );

      return true;
    } catch (error) {
      console.error("[tenant] Error removing API key:", error.message);
      throw error;
    }
  }

  /**
   * Add admin to tenant
   * @param {string} tenantId - Tenant identifier
   * @param {string} newAdminKeyId - Admin key to add
   * @param {string} role - Admin role (superadmin, policy_manager, viewer)
   * @param {string} grantedByKeyId - Admin performing the grant
   */
  static async addAdmin(tenantId, newAdminKeyId, role, grantedByKeyId) {
    try {
      const tenant = await TenantConfig.findOne({ tenantId });
      if (!tenant) {
        throw new Error(`Tenant not found: ${tenantId}`);
      }

      if (!["superadmin", "policy_manager", "viewer"].includes(role)) {
        throw new Error(`Invalid role: ${role}`);
      }

      const admin = {
        keyId: newAdminKeyId,
        role,
        grantedAt: new Date(),
        grantedBy: grantedByKeyId,
      };

      tenant.admins.push(admin);
      await tenant.save();

      console.log(
        `[tenant] ✓ Added admin ${newAdminKeyId} (${role}) to tenant=${tenantId}`
      );

      return admin;
    } catch (error) {
      console.error("[tenant] Error adding admin:", error.message);
      throw error;
    }
  }

  /**
   * Get all tenants (for multi-tenant admin)
   * @param {object} options - {limit, skip, filter}
   */
  static async getAllTenants(options = {}) {
    try {
      const limit = options.limit || 50;
      const skip = options.skip || 0;

      const tenants = await TenantConfig.find(
        options.filter || { status: "active" }
      )
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(skip);

      const count = await TenantConfig.countDocuments(
        options.filter || { status: "active" }
      );

      console.log(`[tenant] Retrieved ${tenants.length}/${count} tenants`);

      return {
        tenants,
        total: count,
        limit,
        skip,
      };
    } catch (error) {
      console.error("[tenant] Error getting all tenants:", error.message);
      throw error;
    }
  }

  /**
   * Get tenant metrics (for admin dashboards)
   * @param {string} tenantId - Tenant identifier
   */
  static async getTenantMetrics(tenantId) {
    try {
      const tenant = await TenantConfig.findOne({ tenantId });
      if (!tenant) {
        throw new Error(`Tenant not found: ${tenantId}`);
      }

      // TODO: Query incident, alert, action logs for metrics
      const metrics = {
        tenantId,
        name: tenant.name,
        status: tenant.status,
        apiKeysCount: tenant.apiKeys.length,
        adminsCount: tenant.admins.length,
        policyVersion: tenant.policyVersion,
        createdAt: tenant.createdAt,
        lastActivity: tenant.updatedAt,
        // Placeholder metrics (to be populated from logs)
        incidentsThisMonth: 0,
        alertsThisMonth: 0,
        actionsExecutedThisMonth: 0,
      };

      console.log(`[tenant] Retrieved metrics for tenant=${tenantId}`);

      return metrics;
    } catch (error) {
      console.error("[tenant] Error getting metrics:", error.message);
      throw error;
    }
  }
}

module.exports = TenantService;
