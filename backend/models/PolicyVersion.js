const mongoose = require("mongoose");

/**
 * Policy Version Model
 * Tracks all policy changes with complete history and diffs
 */
const policyVersionSchema = new mongoose.Schema(
  {
    tenantId: {
      type: String,
      required: true,
    },
    versionId: {
      type: String,
      required: true,
      unique: true,
    },
    policyName: {
      type: String,
      required: true,
    },
    version: {
      type: Number,
      required: true, // 1, 2, 3, etc.
    },
    policyContent: {
      type: mongoose.Schema.Types.Mixed, // Full YAML rules
      required: true,
    },
    previousVersionId: {
      type: String,
      default: null, // null for first version
    },
    changes: {
      added: [String],
      modified: [String],
      removed: [String],
      summary: String, // Human-readable summary
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    createdBy: {
      type: String,
      required: true, // User, system, admin, etc.
    },
    description: String,
    isActive: {
      type: Boolean,
      default: true,
    },
    appliedCount: {
      type: Number,
      default: 0, // How many decisions used this version
    },
  },
  { timestamps: true }
);

// Index for queries
policyVersionSchema.index({ tenantId: 1, policyName: 1, createdAt: -1 });
policyVersionSchema.index({ tenantId: 1, isActive: 1 });

/**
 * Compare two policy versions
 * @param {object|string} version1 - First policy version (document or versionId)
 * @param {object|string} version2 - Second policy version (document or versionId)
 * @returns {object} Comparison result with differences, similarities, and changes
 */
policyVersionSchema.statics.compareVersion = async function(version1, version2) {
  try {
    // Fetch documents if IDs provided
    const v1 = typeof version1 === 'string' ? await this.findOne({ versionId: version1 }) : version1;
    const v2 = typeof version2 === 'string' ? await this.findOne({ versionId: version2 }) : version2;
    
    if (!v1 || !v2) {
      throw new Error('One or both policy versions not found');
    }

    const differences = [];
    
    // Compare core fields
    if (JSON.stringify(v1.policyContent) !== JSON.stringify(v2.policyContent)) {
      differences.push('policyContent');
    }
    
    return {
      version1: {
        versionId: v1.versionId,
        version: v1.version,
        createdAt: v1.createdAt,
      },
      version2: {
        versionId: v2.versionId,
        version: v2.version,
        createdAt: v2.createdAt,
      },
      hasDifferences: differences.length > 0,
      differences,
      summaryV1: v1.changes?.summary || 'No summary',
      summaryV2: v2.changes?.summary || 'No summary',
    };
  } catch (error) {
    console.error(`[policy] Error comparing versions: ${error.message}`);
    throw error;
  }
};

/**
 * Get differences between two policy versions
 * @param {object} oldPolicy - Previous policy version
 * @param {object} newPolicy - New policy version
 * @returns {object} Detailed differences (added, modified, removed rules)
 */
policyVersionSchema.statics.getDifferences = function(oldPolicy, newPolicy) {
  const differences = {
    added: [],
    modified: [],
    removed: [],
    summary: '',
  };

  if (!oldPolicy || !newPolicy) {
    differences.summary = 'Cannot compare: one or both policies are empty';
    return differences;
  }

  const oldContent = oldPolicy.policyContent || {};
  const newContent = newPolicy.policyContent || {};

  // Simple field-level comparison
  const oldKeys = Object.keys(oldContent);
  const newKeys = Object.keys(newContent);

  // Find added rules
  newKeys.forEach(key => {
    if (!oldKeys.includes(key)) {
      differences.added.push(key);
    }
  });

  // Find removed rules
  oldKeys.forEach(key => {
    if (!newKeys.includes(key)) {
      differences.removed.push(key);
    }
  });

  // Find modified rules
  oldKeys.forEach(key => {
    if (newKeys.includes(key) && JSON.stringify(oldContent[key]) !== JSON.stringify(newContent[key])) {
      differences.modified.push(key);
    }
  });

  differences.summary = `Added: ${differences.added.length}, Modified: ${differences.modified.length}, Removed: ${differences.removed.length}`;

  return differences;
};

/**
 * Rollback to a previous policy version
 * @param {string} tenantId - Tenant ID
 * @param {number} targetVersion - Version number to rollback to
 * @returns {Promise<Document>} New active policy version (rollback)
 */
policyVersionSchema.statics.rollbackPolicy = async function(tenantId, targetVersion) {
  try {
    // Find target version to rollback to
    const targetPolicy = await this.findOne({ tenantId, version: targetVersion });
    if (!targetPolicy) {
      throw new Error(`Policy version ${targetVersion} not found for tenant ${tenantId}`);
    }

    // Deactivate current active version
    await this.updateMany({ tenantId, isActive: true }, { $set: { isActive: false } });

    // Activate target version
    targetPolicy.isActive = true;
    await targetPolicy.save();

    console.log(`[policy] ✓ Rolled back policy to version ${targetVersion}`);
    return targetPolicy;
  } catch (error) {
    console.error(`[policy] Error rolling back policy: ${error.message}`);
    throw error;
  }
};

module.exports = mongoose.model("PolicyVersion", policyVersionSchema);
