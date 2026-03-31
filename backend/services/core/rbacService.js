/**
 * RBAC Service (Phase 3 Sprint 2)
 * Role-Based Access Control system for enterprise customers
 * Roles: Admin, Engineer, Analyst, Viewer, Guest
 */

class RBACService {
  constructor() {
    this.roles = this.initializeRoles();
    this.permissions = this.initializePermissions();
    this.userRoles = new Map(); // tenantId:userId -> [roles]
    this.resourcePermissions = new Map(); // resourceId -> {role -> [permissions]}
  }

  /**
   * Initialize role definitions
   */
  initializeRoles() {
    return {
      admin: {
        name: "Administrator",
        description: "Full system access, manage users, configure policies",
        permissions: [
          "incidents.create",
          "incidents.resolve",
          "incidents.delete",
          "escalations.create",
          "escalations.override",
          "policies.create",
          "policies.edit",
          "policies.delete",
          "users.manage",
          "users.roles",
          "audit.read",
          "settings.edit",
        ],
        rank: 5,
      },
      engineer: {
        name: "Engineer",
        description: "Create incidents, execute runbooks, manage on-call",
        permissions: [
          "incidents.create",
          "incidents.resolve",
          "incidents.acknowledge",
          "escalations.create",
          "runbooks.execute",
          "runbooks.edit",
          "actions.execute",
          "alerts.view",
          "alerts.acknowledge",
        ],
        rank: 4,
      },
      analyst: {
        name: "Analyst",
        description: "View incidents, analyze data, no execution",
        permissions: [
          "incidents.view",
          "incidents.read",
          "insights.view",
          "reports.view",
          "trends.view",
          "data.export",
        ],
        rank: 3,
      },
      viewer: {
        name: "Viewer",
        description: "Read-only access to dashboards",
        permissions: [
          "dashboard.view",
          "incidents.view",
          "metrics.view",
        ],
        rank: 2,
      },
      guest: {
        name: "Guest",
        description: "Limited read access, no sensitive data",
        permissions: [
          "status.view",
          "public_incidents.view",
        ],
        rank: 1,
      },
    };
  }

  /**
   * Initialize permission groups
   */
  initializePermissions() {
    return {
      "incidents.create": {
        description: "Create new incident",
        resource: "incidents",
      },
      "incidents.view": {
        description: "View incidents",
        resource: "incidents",
      },
      "incidents.read": {
        description: "Read incident details",
        resource: "incidents",
      },
      "incidents.resolve": {
        description: "Resolve incident",
        resource: "incidents",
      },
      "incidents.acknowledge": {
        description: "Acknowledge incident",
        resource: "incidents",
      },
      "incidents.delete": {
        description: "Delete incident",
        resource: "incidents",
      },
      "escalations.create": {
        description: "Create escalation",
        resource: "escalations",
      },
      "escalations.override": {
        description: "Override escalation policy",
        resource: "escalations",
      },
      "policies.create": {
        description: "Create policy",
        resource: "policies",
      },
      "policies.edit": {
        description: "Edit policy",
        resource: "policies",
      },
      "policies.delete": {
        description: "Delete policy",
        resource: "policies",
      },
      "runbooks.execute": {
        description: "Execute runbook",
        resource: "runbooks",
      },
      "runbooks.edit": {
        description: "Edit runbook",
        resource: "runbooks",
      },
      "actions.execute": {
        description: "Execute action",
        resource: "actions",
      },
      "users.manage": {
        description: "Manage users",
        resource: "users",
      },
      "users.roles": {
        description: "Manage user roles",
        resource: "users",
      },
      "audit.read": {
        description: "Read audit logs",
        resource: "audit",
      },
      "settings.edit": {
        description: "Edit settings",
        resource: "settings",
      },
    };
  }

  /**
   * Assign role to user
   */
  async assignRole(tenantId, userId, role, grantedBy = null) {
    try {
      if (!this.roles[role]) {
        return { success: false, error: `Role not found: ${role}` };
      }

      const key = `${tenantId}:${userId}`;
      const currentRoles = this.userRoles.get(key) || [];

      if (!currentRoles.includes(role)) {
        currentRoles.push(role);
        this.userRoles.set(key, currentRoles);
      }

      console.log(
        `[rbac-service] ✓ Role ${role} assigned to ${userId} in ${tenantId}`
      );

      return {
        success: true,
        user: userId,
        roles: currentRoles,
        assignedAt: new Date().toISOString(),
        assignedBy: grantedBy,
      };
    } catch (error) {
      console.error(`[rbac-service] Error assigning role:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Remove role from user
   */
  async removeRole(tenantId, userId, role, revokedBy = null) {
    try {
      const key = `${tenantId}:${userId}`;
      const currentRoles = this.userRoles.get(key) || [];

      const index = currentRoles.indexOf(role);
      if (index > -1) {
        currentRoles.splice(index, 1);
        this.userRoles.set(key, currentRoles);
      }

      console.log(
        `[rbac-service] ✓ Role ${role} removed from ${userId} in ${tenantId}`
      );

      return {
        success: true,
        user: userId,
        roles: currentRoles,
        revokedAt: new Date().toISOString(),
        revokedBy: revokedBy,
      };
    } catch (error) {
      console.error(`[rbac-service] Error removing role:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get user roles
   */
  getUserRoles(tenantId, userId) {
    const key = `${tenantId}:${userId}`;
    return this.userRoles.get(key) || [];
  }

  /**
   * Check if user has permission
   */
  async hasPermission(tenantId, userId, permission, resourceId = null) {
    try {
      const roles = this.getUserRoles(tenantId, userId);

      // Check if any role has the permission
      for (const role of roles) {
        const rolePerms = this.roles[role]?.permissions || [];
        if (rolePerms.includes(permission)) {
          return {
            allowed: true,
            role: role,
            permission: permission,
          };
        }
      }

      return {
        allowed: false,
        reason: `User does not have ${permission} permission`,
      };
    } catch (error) {
      console.error(`[rbac-service] Error checking permission:`, error);
      return {
        allowed: false,
        error: error.message,
      };
    }
  }

  /**
   * Enforce permission (throw if not allowed)
   */
  async enforcePermission(tenantId, userId, permission, resourceId = null) {
    const result = await this.hasPermission(
      tenantId,
      userId,
      permission,
      resourceId
    );

    if (!result.allowed) {
      const error = new Error(
        `Access denied: ${permission} not allowed for user ${userId}`
      );
      error.code = "PERMISSION_DENIED";
      error.statusCode = 403;
      throw error;
    }

    return result;
  }

  /**
   * Get all permissions for user
   */
  getUserPermissions(tenantId, userId) {
    try {
      const roles = this.getUserRoles(tenantId, userId);
      const permissions = new Set();

      for (const role of roles) {
        const rolePerms = this.roles[role]?.permissions || [];
        rolePerms.forEach((p) => permissions.add(p));
      }

      return Array.from(permissions);
    } catch (error) {
      console.error(
        `[rbac-service] Error getting user permissions:`,
        error
      );
      return [];
    }
  }

  /**
   * Get role hierarchy
   */
  getRoleHierarchy() {
    return Object.entries(this.roles)
      .map(([key, role]) => ({
        id: key,
        name: role.name,
        description: role.description,
        rank: role.rank,
        permissions: role.permissions,
      }))
      .sort((a, b) => b.rank - a.rank);
  }

  /**
   * Create custom role
   */
  async createCustomRole(tenantId, roleName, description, permissions) {
    try {
      // Validate permissions
      for (const perm of permissions) {
        if (!this.permissions[perm]) {
          return {
            success: false,
            error: `Invalid permission: ${perm}`,
          };
        }
      }

      const customRoleKey = `custom:${tenantId}:${roleName}`;

      // Store custom role
      this.roles[customRoleKey] = {
        name: roleName,
        description: description,
        permissions: permissions,
        isCustom: true,
        tenantId: tenantId,
      };

      console.log(
        `[rbac-service] ✓ Custom role created: ${customRoleKey}`
      );

      return {
        success: true,
        roleId: customRoleKey,
        role: this.roles[customRoleKey],
      };
    } catch (error) {
      console.error(`[rbac-service] Error creating custom role:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Set resource-level permissions
   */
  async setResourcePermission(resourceId, role, permissions) {
    try {
      if (!this.roles[role]) {
        return { success: false, error: `Role not found: ${role}` };
      }

      if (!this.resourcePermissions.has(resourceId)) {
        this.resourcePermissions.set(resourceId, {});
      }

      const resourcePerms = this.resourcePermissions.get(resourceId);
      resourcePerms[role] = permissions;

      console.log(
        `[rbac-service] ✓ Resource permissions set for ${resourceId}`
      );

      return { success: true };
    } catch (error) {
      console.error(
        `[rbac-service] Error setting resource permission:`,
        error
      );
      return { success: false, error: error.message };
    }
  }

  /**
   * Check resource-level permission
   */
  async hasResourcePermission(
    tenantId,
    userId,
    resourceId,
    permission
  ) {
    try {
      // First check if user has general permission
      const generalResult = await this.hasPermission(
        tenantId,
        userId,
        permission
      );

      if (!generalResult.allowed) {
        return { allowed: false, reason: "User does not have permission" };
      }

      // Then check resource-specific permissions
      if (this.resourcePermissions.has(resourceId)) {
        const resourcePerms = this.resourcePermissions.get(resourceId);
        const roles = this.getUserRoles(tenantId, userId);

        for (const role of roles) {
          if (
            resourcePerms[role] &&
            resourcePerms[role].includes(permission)
          ) {
            return {
              allowed: true,
              resource: resourceId,
              permission: permission,
            };
          }
        }

        return {
          allowed: false,
          reason: "User does not have resource-level permission",
        };
      }

      return {
        allowed: true,
        resource: resourceId,
        permission: permission,
      };
    } catch (error) {
      console.error(
        `[rbac-service] Error checking resource permission:`,
        error
      );
      return { allowed: false, error: error.message };
    }
  }

  /**
   * Get audit trail for RBAC changes
   */
  getAuditTrail(tenantId, userId, limit = 100) {
    // This would integrate with audit service in real implementation
    return {
      success: true,
      events: [],
    };
  }
}

module.exports = new RBACService();
