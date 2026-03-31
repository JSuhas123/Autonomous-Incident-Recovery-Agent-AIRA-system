const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

let memoryServer = null;

async function connectDatabase() {
  const configuredUri =
    process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/autonomous_incident_agent";

  try {
    await mongoose.connect(configuredUri);
    console.log(`[db] Connected to MongoDB at ${configuredUri}`);
    return {
      uri: configuredUri,
      inMemory: false,
    };
  } catch (error) {
    if (process.env.DISABLE_MEMORY_DB === "true") {
      throw error;
    }

    console.warn(
      "[db] Failed to connect to configured MongoDB URI. Falling back to in-memory MongoDB."
    );

    memoryServer = await MongoMemoryServer.create();
    const memoryUri = memoryServer.getUri("autonomous_incident_agent");

    await mongoose.connect(memoryUri);
    console.log("[db] Connected to in-memory MongoDB instance");

    return {
      uri: memoryUri,
      inMemory: true,
    };
  }
}

async function disconnectDatabase() {
  await mongoose.connection.close();

  if (memoryServer) {
    await memoryServer.stop();
    memoryServer = null;
  }
}

module.exports = {
  connectDatabase,
  disconnectDatabase,
};
