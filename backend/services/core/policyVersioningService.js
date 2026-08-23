const crypto = require("crypto");
const {
  PolicyVersion,
} = require(
  "../../persistence/operational/runtimeModels"
);

/**
 * Policy Versioning Service
 * Manages policy history, versioning, and rollback
 */

class PolicyVersioningService {
  /**
   * Save new policy version
   */
  async createVersion(tenantId, policyName, policyContent, createdBy, description = "") {
    try {
      const versionId = `pv-${crypto.randomUUID()}`;

      // Get previous version for diff
      const previousVersion = await PolicyVersion.findOne({
        tenantId,
        policyName,
        isActive: true,
      }).sort({ version: -1 });

      let version = 1;
      let changes = { added: [], modified: [], removed: [], summary: "Initial version" };

      if (previousVersion) {
        version = previousVersion.version + 1;
        changes = this._calculateDiff(previousVersion.policyContent, policyContent);
      }

      // Deactivate previous version
      if (previousVersion) {
        await PolicyVersion.updateOne(
          { versionId: previousVersion.versionId },
          { isActive: false }
        );
      }

      // Create new version
      const newVersion = new PolicyVersion({
        tenantId,
        versionId,
        policyName,
        version,
        policyContent,
        previousVersionId: previousVersion?.versionId || null,
        changes,
        createdAt: new Date(),
        createdBy,
        description,
        isActive: true,
      });

      await newVersion.save();

      console.log(
        `[PolicyVersioning] Created version ${version} of ${policyName}`
      );

      return newVersion.toObject();
    } catch (error) {
      console.error("[PolicyVersioning] Failed to create version:", error);
      throw error;
    }
  }

  /**
   * Get all versions of a policy
   */
  async getVersionHistory(tenantId, policyName, limit = 50) {
    try {
      const versions = await PolicyVersion.find({
        tenantId,
        policyName,
      })
        .sort({ version: -1 })
        .limit(limit)
        .lean();

      return versions;
    } catch (error) {
      console.error("[PolicyVersioning] Failed to get history:", error);
      throw error;
    }
  }

  /**
   * Get specific version
   */
  async getVersion(tenantId, versionId) {
    try {
      const version = await PolicyVersion.findOne({
        tenantId,
        versionId,
      }).lean();

      if (!version) {
        throw new Error(`Version ${versionId} not found`);
      }

      return version;
    } catch (error) {
      console.error("[PolicyVersioning] Failed to get version:", error);
      throw error;
    }
  }

  /**
   * Get current active version
   */
  async getCurrentVersion(tenantId, policyName) {
    try {
      const version = await PolicyVersion.findOne({
        tenantId,
        policyName,
        isActive: true,
      })
        .sort({ version: -1 })
        .lean();

      return version || null;
    } catch (error) {
      console.error("[PolicyVersioning] Failed to get current version:", error);
      throw error;
    }
  }

  /**
   * Rollback to previous version
   */
  async rollbackToVersion(tenantId, policyName, targetVersionId, createdBy) {
    try {
      // Get target version
      const targetVersion = await PolicyVersion.findOne({
        tenantId,
        versionId: targetVersionId,
        policyName,
      });

      if (!targetVersion) {
        throw new Error(`Version ${targetVersionId} not found`);
      }

      // Deactivate current version
      await PolicyVersion.updateMany(
        { tenantId, policyName, isActive: true },
        { isActive: false }
      );

      // Create rollback version (clone target)
      const newVersionId = `pv-${crypto.randomUUID()}`;
      const currentVersion = await PolicyVersion.findOne({
        tenantId,
        policyName,
      }).sort({ version: -1 });

      const rollbackVersion = new PolicyVersion({
        tenantId,
        versionId: newVersionId,
        policyName,
        version: (currentVersion?.version || 0) + 1,
        policyContent: targetVersion.policyContent,
        previousVersionId: targetVersion.versionId,
        changes: {
          added: [],
          modified: [],
          removed: [],
          summary: `Rollback to v${targetVersion.version}`,
        },
        createdAt: new Date(),
        createdBy,
        description: `Rolled back from v${currentVersion?.version} to v${targetVersion.version}`,
        isActive: true,
      });

      await rollbackVersion.save();

      console.log(`[PolicyVersioning] Rolled back ${policyName} to v${targetVersion.version}`);

      return rollbackVersion.toObject();
    } catch (error) {
      console.error("[PolicyVersioning] Rollback failed:", error);
      throw error;
    }
  }

  /**
   * Compare two versions
   */
  async compareVersions(tenantId, versionId1, versionId2) {
    try {
      const v1 = await this.getVersion(tenantId, versionId1);
      const v2 = await this.getVersion(tenantId, versionId2);

      const diffs = this._calculateDiff(v1.policyContent, v2.policyContent);

      return {
        version1: v1.versionId,
        version2: v2.versionId,
        differences: diffs,
      };
    } catch (error) {
      console.error("[PolicyVersioning] Comparison failed:", error);
      throw error;
    }
  }

  /**
   * Calculate diff between two policies (simple YAML compare)
   */
  _calculateDiff(oldPolicy, newPolicy) {
    const added = [];
    const modified = [];
    const removed = [];

    // Convert to strings for comparison
    const oldStr = JSON.stringify(oldPolicy || {});
    const newStr = JSON.stringify(newPolicy || {});

    if (oldStr === newStr) {
      return { added: [], modified: [], removed: [], summary: "No changes" };
    }

    // Try to identify changes at policy level
    const oldPolicies = oldPolicy?.policies || [];
    const newPolicies = newPolicy?.policies || [];

    // Find added
    newPolicies.forEach((np) => {
      const found = oldPolicies.find((op) => op.name === np.name);
      if (!found) {
        added.push(np.name);
      }
    });

    // Find removed
    oldPolicies.forEach((op) => {
      const found = newPolicies.find((np) => np.name === op.name);
      if (!found) {
        removed.push(op.name);
      }
    });

    // Find modified
    oldPolicies.forEach((op) => {
      const np = newPolicies.find((p) => p.name === op.name);
      if (np && JSON.stringify(op) !== JSON.stringify(np)) {
        modified.push(op.name);
      }
    });

    const summary = `Added: ${added.length}, Modified: ${modified.length}, Removed: ${removed.length}`;

    return {
      added,
      modified,
      removed,
      summary,
    };
  }

  /**
   * Increment usage count when decision uses a version
   */
  async incrementUsageCount(tenantId, versionId) {
    try {
      await PolicyVersion.updateOne(
        { tenantId, versionId },
        { $inc: { appliedCount: 1 } }
      );
    } catch (error) {
      console.error("[PolicyVersioning] Failed to increment usage:", error);
    }
  }
}

module.exports = new PolicyVersioningService();

