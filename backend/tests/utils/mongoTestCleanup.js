/**
 * MongoDB Test Cleanup Utility
 * Handles proper cleanup of MongoDB collections including unique indexes
 * 
 * Issue: When tests run multiple times, unique index constraints cause violations
 * Solution: Drop collections entirely (including indexes) between test runs
 */

const mongoose = require('mongoose');

/**
 * Clean all MongoDB collections and drop their indexes
 * This ensures no unique constraint violations on rerun
 */
async function cleanAllCollections() {
  const collections = mongoose.connection.collections;
  
  for (const key in collections) {
    const collection = collections[key];
    try {
      // Drop the entire collection (removes data AND indexes)
      await collection.drop();
    } catch (error) {
      // Collection might not exist yet, that's okay
      if (error.code !== 26) { // 26 = namespace not found
        console.error(`Error dropping collection ${key}:`, error.message);
      }
    }
  }
}

/**
 * Drop indexes on specific collections
 * Use when you want to keep data but reset indexes
 */
async function dropCollectionIndexes(collectionNames = []) {
  const collections = mongoose.connection.collections;
  
  for (const key in collections) {
    if (collectionNames.length === 0 || collectionNames.includes(key)) {
      const collection = collections[key];
      try {
        // Drop all indexes except _id
        await collection.dropIndexes();
      } catch (error) {
        if (error.code !== 27) { // 27 = index not found
          console.error(`Error dropping indexes on ${key}:`, error.message);
        }
      }
    }
  }
}

/**
 * Clean specific collections by name
 * Useful when you only want to clear certain collections
 */
async function cleanCollections(collectionNames = []) {
  const collections = mongoose.connection.collections;
  
  for (const key in collections) {
    if (collectionNames.length === 0 || collectionNames.includes(key)) {
      const collection = collections[key];
      try {
        await collection.deleteMany({});
      } catch (error) {
        console.error(`Error cleaning collection ${key}:`, error.message);
      }
    }
  }
}

/**
 * Generate unique test ID with timestamp and random value
 * Prevents duplicate key errors when tests rerun
 */
function generateTestId(prefix = 'test') {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9);
  return `${prefix}-${timestamp}-${random}`;
}

/**
 * Setup MongoDB test environment with proper cleanup
 * Call this in your test suite's beforeEach
 */
async function setupTestEnvironment() {
  // Clean all collections and reset indexes
  await cleanAllCollections();
  
  // Reconnect models to create fresh collections with indexes
  try {
    // Re-evaluate all models to rebuild indexes
    const models = Object.keys(mongoose.models);
    for (const modelName of models) {
      const model = mongoose.model(modelName);
      // Ensure indexes are created
      await model.collection.dropIndexes().catch(() => {}); // Ok if no indexes
      await model.syncIndexes(); // Rebuild indexes from schema
    }
  } catch (error) {
    console.warn('Index setup warning:', error.message);
  }
}

module.exports = {
  cleanAllCollections,
  dropCollectionIndexes,
  cleanCollections,
  generateTestId,
  setupTestEnvironment,
};
