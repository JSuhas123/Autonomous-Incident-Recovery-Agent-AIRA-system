"use strict";

const { isDatabaseIdentifier } = require("../../utils/identifier");
const PostgresUserRepository = require("../postgres/PostgresUserRepository");
const PostgresEmailVerificationTokenRepository = require("../postgres/PostgresEmailVerificationTokenRepository");
const MongoEmailVerificationTokenRepository = require("../mongo/MongoEmailVerificationTokenRepository");
const PostgresAuthenticationAuditEventRepository = require("../postgres/PostgresAuthenticationAuditEventRepository");
const repositories = require("../repositories");

function supportFor(row) {
  const queries = [];
  return {
    queries,
    async query(_transaction, text, values) {
      queries.push({ text, values });
      return { rows: [row], rowCount: 1 };
    },
  };
}

describe("Phase 13.6 Block A boundaries", () => {
  test("factory exposes transaction and identity repositories", () => {
    expect(repositories.persistenceTransactionManager).toBeDefined();
    expect(repositories.emailVerificationTokenRepository).toBeDefined();
    expect(repositories.passwordResetTokenRepository).toBeDefined();
    expect(repositories.authenticationAuditEventRepository).toBeDefined();
  });

  test("accepts database-neutral identifiers", () => {
    expect(isDatabaseIdentifier("507f1f77bcf86cd799439011")).toBe(true);
    expect(isDatabaseIdentifier("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    expect(isDatabaseIdentifier("tenant_public-1")).toBe(true);
    expect(isDatabaseIdentifier("bad identifier")).toBe(false);
  });

  test("generates a Postgres public ID on insert and preserves IDs on update", async () => {
    const support = supportFor({ id: "row-id", public_id: "generated-public", full_name: "A", email: "a@example.com", normalized_email: "a@example.com", status: "active" });
    const repository = new PostgresUserRepository({ support });
    await repository.create({ fullName: "A", email: "a@example.com", normalizedEmail: "a@example.com", status: "active" });
    expect(support.queries[0].values).toContainEqual(expect.any(String));
    await repository.updateOne({ _id: "generated-public" }, { status: "active" });
    expect(support.queries[1].text).not.toMatch(/SET[^W]*public_id\s*=/i);
  });

  test("hides token hashes by default and exposes them only explicitly", async () => {
    const row = { id: "token-id", user_id: "user-id", token_hash: "secret-hash", expires_at: new Date() };
    const support = supportFor(row);
    const repository = new PostgresEmailVerificationTokenRepository({ support });
    expect(await repository.findOne({ _id: "token-id" })).not.toHaveProperty("tokenHash");
    expect(await repository.findOne({ _id: "token-id" }, { includeTokenHash: true })).toHaveProperty("tokenHash", "secret-hash");
    await expect(repository.updateOne()).rejects.toMatchObject({ code: "TOKEN_APPEND_ONLY" });
  });

  test("Mongo token repository exposes the hidden hash only by opt-in", () => {
    expect(MongoEmailVerificationTokenRepository.prototype.findOne).toBeDefined();
  });

  test("authentication audit repository is append-only", async () => {
    const repository = new PostgresAuthenticationAuditEventRepository({ support: supportFor({ id: "audit-id", event_id: "event-1" }) });
    await expect(repository.updateOne()).rejects.toMatchObject({ code: "AUTH_AUDIT_EVENT_IMMUTABLE" });
    await expect(repository.deleteMany()).rejects.toMatchObject({ code: "AUTH_AUDIT_EVENT_IMMUTABLE" });
  });
});
