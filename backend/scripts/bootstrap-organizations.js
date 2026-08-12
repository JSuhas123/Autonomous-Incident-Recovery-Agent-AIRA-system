"use strict";

require("dotenv").config();

const mongoose = require("mongoose");

const Organization =
  require("../models/Organization");

const OrganizationBootstrapService =
  require("../services/core/organizationBootstrapService");

async function run() {
  if (!process.env.MONGODB_URI) {
    throw new Error(
      "MONGODB_URI is required"
    );
  }

  await mongoose.connect(
    process.env.MONGODB_URI
  );

  console.log(
    "Connected to MongoDB"
  );

  const organizations =
    await Organization.find({
      status: {
        $nin: ["deleted"],
      },
    });

  console.log(
    `Found ${organizations.length} organizations`
  );

  for (const organization of organizations) {
    console.log(
      `Bootstrapping ${organization.name}`
    );

    await OrganizationBootstrapService.bootstrapOrganization(
      organization,
      organization.createdByUserId
    );
  }

  console.log(
    "Organization bootstrap complete"
  );

  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error(error);

  try {
    await mongoose.disconnect();
  } catch (_) {}

  process.exit(1);
});