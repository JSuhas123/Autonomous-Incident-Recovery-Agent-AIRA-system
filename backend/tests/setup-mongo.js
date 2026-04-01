/**
 * MongoDB Memory Server Setup for Tests
 * 
 * Configures in-memory MongoDB for isolated test execution
 * Automatically starts/stops mongoMemoryServer for test suite
 */

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

let mongoServer;

// Global setup before all tests
global.setupMongoDB = async () => {
  try {
    // Create mongod instance
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();

    // Connect mongoose
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('[Test Setup] MongoDB Memory Server started');
    return mongoUri;
  } catch (error) {
    console.error('[Test Setup] Failed to start MongoDB Memory Server:', error.message);
    throw error;
  }
};

// Global teardown after all tests
global.teardownMongoDB = async () => {
  try {
    // Disconnect mongoose
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
    }

    // Stop mongoServer
    if (mongoServer) {
      await mongoServer.stop();
      console.log('[Test Setup] MongoDB Memory Server stopped');
    }
  } catch (error) {
    console.error('[Test Setup] Failed to stop MongoDB Memory Server:', error.message);
    throw error;
  }
};

// Clear database between tests
global.clearDatabase = async () => {
  if (mongoose.connection.readyState === 1) {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      const collection = collections[key];
      await collection.deleteMany({});
    }
  }
};

module.exports = {
  setupMongoDB: global.setupMongoDB,
  teardownMongoDB: global.teardownMongoDB,
  clearDatabase: global.clearDatabase,
};
