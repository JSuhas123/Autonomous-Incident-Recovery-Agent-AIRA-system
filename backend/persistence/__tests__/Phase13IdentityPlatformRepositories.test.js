"use strict";

const PostgresOrganizationRepository = require("../postgres/PostgresOrganizationRepository");
const PostgresEnvironmentRepository = require("../postgres/PostgresEnvironmentRepository");
const PostgresTenantConfigRepository = require("../postgres/PostgresTenantConfigRepository");

function supportFor(row) {
  const queries = [];
  return {
    queries,
    async query(_transaction, text) {
      queries.push(text);
      return { rows: [row], rowCount: 1 };
    },
  };
}

describe("Phase 13 identity/platform repositories", () => {
  test("maps organization and environment application identifiers to existing PostgreSQL columns", async () => {
    const organizationSupport = supportFor({ id: "org-uuid", public_id: "org-public", tenant_public_id: "tenant-a", name: "A", status: "active", settings: {}, metadata: {} });
    const organization = new PostgresOrganizationRepository({ support: organizationSupport });
    expect((await organization.findOne({ tenantId: "tenant-a" })).tenantId).toBe("tenant-a");
    expect(organizationSupport.queries[0]).toContain("tenancy.organizations");
    expect(organizationSupport.queries[0]).toContain("tenant_public_id");

    const environmentSupport = supportFor({ id: "env-uuid", public_id: "env-public", organization_id: "org-uuid", environment_type: "production", status: "active", settings: {}, metadata: {} });
    const environment = new PostgresEnvironmentRepository({ support: environmentSupport });
    expect((await environment.findOne({ type: "production" })).type).toBe("production");
    expect(environmentSupport.queries[0]).toContain("environment_type");
  });

  test("redacts tenant api keys, admins, and document unless explicitly requested", async () => {
    const row = { id: "tenant-config-uuid", tenant_public_id: "tenant-a", status: "active", settings: {}, api_keys: [{ keyId: "key" }], admins: [{ email: "admin@example.com" }], document: { secret: true } };
    const support = supportFor(row);
    const repository = new PostgresTenantConfigRepository({ support });

    const redacted = await repository.findOne({ tenantId: "tenant-a" });
    expect(redacted).not.toHaveProperty("apiKeys");
    expect(redacted).not.toHaveProperty("admins");
    expect(redacted).not.toHaveProperty("document");

    const internal = await repository.findOne({ tenantId: "tenant-a" }, { includeSecrets: true });
    expect(internal.apiKeys).toEqual(row.api_keys);
    expect(internal.admins).toEqual(row.admins);
    expect(internal.document).toEqual(row.document);
  });
});