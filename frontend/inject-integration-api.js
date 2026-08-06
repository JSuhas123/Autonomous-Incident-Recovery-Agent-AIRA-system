const fs = require("fs");
const path = require("path");

const filePath = path.resolve(
  "c:/Users/J SUHAS/OneDrive/Desktop/AIRA/frontend/src/api/client.ts"
);
const src = fs.readFileSync(filePath, "utf8");

const snippet = `
export const integrationCatalogueApi = {
  listDefinitions: () => request<{ definitions: import("../types/integration").IntegrationDefinition[] }>("/integration-definitions"),
};

export const integrationConnectionApi = {
  list: () => request<{ integrations: import("../types/integration").IntegrationConnection[]; count: number }>("/integrations/connections"),
  get:  (id: string) => request<{ integration: import("../types/integration").IntegrationConnection }>(\`/integrations/connections/\${id}\`),
  create: (body: import("../types/integration").CreateConnectionBody) =>
    request<{ integration: import("../types/integration").IntegrationConnection }>("/integrations/connections", { method: "POST", body: JSON.stringify(body) }),
  update: (id: string, body: import("../types/integration").UpdateConnectionBody) =>
    request<{ integration: import("../types/integration").IntegrationConnection }>(\`/integrations/connections/\${id}\`, { method: "PATCH", body: JSON.stringify(body) }),
  test: (id: string) =>
    request<{ success: boolean; latencyMs?: number; detail?: string }>(\`/integrations/connections/\${id}/test\`, { method: "POST" }),
  disable: (id: string) =>
    request<{ integration: import("../types/integration").IntegrationConnection }>(\`/integrations/connections/\${id}/disable\`, { method: "POST" }),
  rotateSecret: (id: string, secret: string) =>
    request<{ success: boolean }>(\`/integrations/connections/\${id}/rotate-secret\`, { method: "POST", body: JSON.stringify({ secret }) }),
  delete: (id: string) =>
    request<void>(\`/integrations/connections/\${id}\`, { method: "DELETE" }),
};
`;

if (src.includes("integrationCatalogueApi")) {
  console.log("Already injected — skipping.");
  process.exit(0);
}

fs.writeFileSync(filePath, src + snippet, "utf8");
console.log("Injected integrationCatalogueApi and integrationConnectionApi into client.ts");
