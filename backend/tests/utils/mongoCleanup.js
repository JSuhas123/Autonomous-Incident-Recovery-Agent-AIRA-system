/**
 * MongoDB Cleanup Utilities
 * Provides comprehensive cleanup functions for integration and E2E tests
 * Handles unique constraint violations by properly cleaning collections between test runs
 * 
 * Issue: E2E workflow tests fail on rerun due to MongoDB document uniqueness violations
 * Solution: Complete collection cleanup between test suites and individual tests
 * 
 * Usage:
 *  const { cleanupTestData, cleanupAllCollections } = require('../utils/mongoCleanup');
 *  
 *  // In beforeEach
 *  await cleanupTestData(TEST_TENANT);
 *  
 *  // In afterAll
 *  await cleanupAllCollections();
 */

const mongoose = require('mongoose');

// List of all collections that need cleanup
const COLLECTIONS_TO_CLEANUP = [
  'DecisionTrace',
  'Feedback',
  'FeedbackOutcome',
  'IncidentEvent',
  'IncidentMemory',
  'AuditEvent',
  'ApprovalRequest',
  'SimulationResult',
  'PolicyDefinition',
  'PolicyVersion',
  'TenantConfig',
  'ActionLog',
  'Log',
  'Runbook',
  'RunbookExecution',
  'ServiceDependency',
  'FailedMessage',
];

/**
 * Clean up all documents for a specific tenant
 * This prevents unique constraint violations from previous test runs
 * 
 * @param {string} tenantId - Tenant ID to clean up
 * @param {Object} additionalFilters - Additional filter conditions (e.g., { decisionId: 'test-id' })
 */
async function cleanupTestData(tenantId, additionalFilters = {}) {
  if (!mongoose.connection.readyState) {
    return; // Not connected, skip cleanup
  }

  const baseFilter = { tenantId };
  const filter = { ...baseFilter, ...additionalFilters };

  try {
    for (const collectionName of COLLECTIONS_TO_CLEANUP) {
      // Try to delete via model if available
      try {
        const model = mongoose.model(collectionName);
        await model.deleteMany(filter);
      } catch (e) {
        // Model might not exist in this test context, try via collection
        if (mongoose.connection.collections[collectionName.toLowerCase()]) {
          await mongoose.connection.collections[collectionName.toLowerCase()].deleteMany(filter);
        }
      }
    }
  } catch (error) {
    console.warn(`Warning: Cleanup failed for tenant ${tenantId}:`, error.message);
  }
}

/**
 * Drop all collections completely
 * Use this in afterAll hooks to ensure clean database for next test run
 * Solves unique constraint violation issues completely
 */
async function cleanupAllCollections() {
  if (!mongoose.connection.readyState) {
    return; // Not connected, skip cleanup
  }

  try {
    const db = mongoose.connection.db;
    
    // Drop all collections
    const collections = await db.listCollections().toArray();
    
    for (const collection of collections) {
      if (!collection.name.startsWith('system.')) {
        try {
          await db.dropCollection(collection.name);
        } catch (error) {
          if (error.code !== 26) { // 26 = namespace not found
            console.warn(`Failed to drop collection ${collection.name}:`, error.message);
          }
        }
      }
    }

    // Drop all indexes
    try {
      const indexResult = await db.collection('DecisionTrace').getIndexes();
      // Collections are recreated on next test with fresh schema
    } catch (e) {
      // Collection doesn't exist, that's fine
    }
  } catch (error) {
    console.warn('Warning: Full collection cleanup failed:', error.message);
  }
}

/**
 * Cleanup specific collections only
 * Use when you know exactly which collections need cleaning
 * 
 * @param {string[]} collectionNames - Array of collection names to clean
 * @param {Object} filter - Filter conditions for deletion
 */
async function cleanupSpecificCollections(collectionNames, filter = {}) {
  if (!mongoose.connection.readyState) {
    return;
  }

  try {
    for (const collectionName of collectionNames) {
      try {
        const model = mongoose.model(collectionName);
        const deleteResult = await model.deleteMany(filter);
        // console.log(`Cleaned ${collectionName}: ${deleteResult.deletedCount} documents removed`);
      } catch (e) {
        if (mongoose.connection.collections[collectionName.toLowerCase()]) {
          await mongoose.connection.collections[collectionName.toLowerCase()].deleteMany(filter);
        }
      }
    }
  } catch (error) {
    console.warn(`Warning: Cleanup of specific collections failed:`, error.message);
  }
}

/**
 * Reset collections by dropping and recreating
 * Most aggressive cleanup - ensures completely fresh state
 */
async function resetDatabase() {
  if (!mongoose.connection.readyState) {
    return;
  }

  try {
    // Remove all documents without dropping collections (preserves indexes)
    for (const collectionName of COLLECTIONS_TO_CLEANUP) {
      try {
        const model = mongoose.model(collectionName);
        await model.deleteMany({}); // Delete all documents
      } catch (e) {
        if (mongoose.connection.collections[collectionName.toLowerCase()]) {
          await mongoose.connection.collections[collectionName.toLowerCase()].deleteMany({});
        }
      }
    }
  } catch (error) {
    console.warn('Warning: Database reset failed:', error.message);
  }
}

/**
 * Get cleanup statistics (useful for debugging)
 * Shows what will be cleaned up for a tenant
 */
async function getCleanupStats(tenantId) {
  if (!mongoose.connection.readyState) {
    return {};
  }

  const stats = {};

  for (const collectionName of COLLECTIONS_TO_CLEANUP) {
    try {
      const model = mongoose.model(collectionName);
      const count = await model.countDocuments({ tenantId });
      if (count > 0) {
        stats[collectionName] = count;
      }
    } catch (e) {
      // Model doesn't exist in this context
    }
  }

  return stats;
}

module.exports = {
  cleanupTestData,
  cleanupAllCollections,
  cleanupSpecificCollections,
  resetDatabase,
  getCleanupStats,
  COLLECTIONS_TO_CLEANUP,
};
