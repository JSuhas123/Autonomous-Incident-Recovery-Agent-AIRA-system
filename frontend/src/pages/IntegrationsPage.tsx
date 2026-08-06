import { useDeleteConnection, useDisableConnection, useIntegrationConnections, useIntegrationDefinitions, useTestConnection } from "@/api/hooks/useIntegrations";
import { ConnectDialog } from "@/components/integrations/ConnectDialog";
import { IntegrationCard } from "@/components/integrations/IntegrationCard";
import { useToast } from "@/hooks/useToast";
import { useState } from "react";
import type { IntegrationConnection, IntegrationDefinition } from "../types/integration";

const CATEGORY_LABELS: Record<string, string> = {
  all:              "All",
  observability:    "Observability",
  alerting:         "Alerting",
  apm:              "APM",
  logging:          "Logging",
  cloud:            "Cloud",
  infrastructure:   "Infrastructure",
  databases:        "Databases",
  messaging:        "Messaging",
  incident_management: "Incident Mgmt",
  notifications:    "Notifications",
  ci_cd:            "CI/CD",
  webhook:          "Webhooks",
};

export default function IntegrationsPage() {
  const { data: definitions = [], isLoading: loadingDefs } = useIntegrationDefinitions();
  const { data: connections = [] } = useIntegrationConnections();

  const [search, setSearch]       = useState("");
  const [category, setCategory]   = useState("all");
  const [connectDef, setConnectDef] = useState<IntegrationDefinition | null>(null);
  const [managingConn, setManagingConn] = useState<IntegrationConnection | null>(null);

  const testConn    = useTestConnection();
  const disableConn = useDisableConnection();
  const deleteConn  = useDeleteConnection();
  const { toast }   = useToast();

  const connByProvider = Object.fromEntries(connections.map((c) => [c.provider, c]));

  const categories = ["all", ...Array.from(new Set(definitions.map((d) => d.category))).sort()];

  const filtered = definitions.filter((d) => {
    const matchSearch   = !search || d.displayName.toLowerCase().includes(search.toLowerCase()) || d.description.toLowerCase().includes(search.toLowerCase());
    const matchCategory = category === "all" || d.category === category;
    return matchSearch && matchCategory;
  });

  const ORDER = { available: 0, beta: 1, coming_soon: 2 } as const;
  const sorted = [...filtered].sort((a, b) =>
    (ORDER[a.availabilityStatus as keyof typeof ORDER] ?? 2) -
    (ORDER[b.availabilityStatus as keyof typeof ORDER] ?? 2)
  );

  async function handleTest(conn: IntegrationConnection) {
    try {
      const result = await testConn.mutateAsync(conn.id);
      toast({
        title: result.success ? "Test passed" : "Test failed",
        description: result.detail ?? (result.success ? `${conn.name} responded` : "Check configuration"),
        variant: result.success ? "default" : "destructive",
      });
    } catch {
      toast({ title: "Test error", description: "Could not reach connection", variant: "destructive" });
    }
  }

  async function handleDisable(conn: IntegrationConnection) {
    try {
      await disableConn.mutateAsync(conn.id);
      toast({ title: "Integration disabled", description: conn.name });
      setManagingConn(null);
    } catch {
      toast({ title: "Error", description: "Could not disable integration", variant: "destructive" });
    }
  }

  async function handleDelete(conn: IntegrationConnection) {
    if (!confirm(`Delete "${conn.name}"? This cannot be undone.`)) return;
    try {
      await deleteConn.mutateAsync(conn.id);
      toast({ title: "Integration deleted" });
      setManagingConn(null);
    } catch {
      toast({ title: "Error", description: "Could not delete integration", variant: "destructive" });
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Integrations</h1>
        <p className="text-gray-500 mt-1 text-sm">
          Connect external monitoring, alerting, and notification tools to AIRA.
        </p>
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        <input
          type="search"
          placeholder="Search integrations…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="flex flex-wrap gap-1.5">
          {categories.map((cat) => (
            <button
              type="button"
              key={cat}
              onClick={() => setCategory(cat)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                category === cat ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {CATEGORY_LABELS[cat] ?? cat}
            </button>
          ))}
        </div>
      </div>

      {connections.length > 0 && (
        <div className="mb-6 p-4 rounded-xl bg-blue-50 border border-blue-100 text-sm text-blue-800">
          <strong>{connections.filter((c) => c.status === "connected").length}</strong> active{" "}
          {connections.length > 1 ? "connections" : "connection"} — {connections.length} total
        </div>
      )}

      {loadingDefs ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-xl border bg-gray-50 h-48 animate-pulse" />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <div className="py-16 text-center text-gray-400">No integrations match your search.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {sorted.map((def) => (
            <IntegrationCard
              key={def.provider}
              definition={def}
              connection={connByProvider[def.provider]}
              onConnect={setConnectDef}
              onManage={setManagingConn}
            />
          ))}
        </div>
      )}

      {connectDef && (
        <ConnectDialog definition={connectDef} onClose={() => setConnectDef(null)} />
      )}

      {managingConn && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={() => setManagingConn(null)}
          onKeyDown={(e) => e.key === "Escape" && setManagingConn(null)}
        >
          <div
            className="w-full max-w-sm rounded-t-2xl sm:rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-semibold text-gray-900 mb-1">{managingConn.name}</h2>
            <p className="text-xs text-gray-500 mb-4 capitalize">{managingConn.provider.replace(/_/g, " ")} · {managingConn.status}</p>

            <div className="flex flex-col gap-2">
              <button
                onClick={() => handleTest(managingConn)}
                disabled={testConn.isPending}
                type="button"
                className="w-full text-sm rounded-lg border border-gray-300 px-3 py-2 hover:bg-gray-50 disabled:opacity-50"
              >
                Test connection
              </button>

              {managingConn.status !== "disabled" && (
                <button
                  onClick={() => handleDisable(managingConn)}
                  disabled={disableConn.isPending}
                  type="button"
                  className="w-full text-sm rounded-lg border border-yellow-300 text-yellow-700 px-3 py-2 hover:bg-yellow-50 disabled:opacity-50"
                >
                  Disable
                </button>
              )}

              <button
                onClick={() => handleDelete(managingConn)}
                disabled={deleteConn.isPending}
                type="button"
                className="w-full text-sm rounded-lg border border-red-300 text-red-600 px-3 py-2 hover:bg-red-50 disabled:opacity-50"
              >
                Delete integration
              </button>

              <button
              type="button"
                onClick={() => setManagingConn(null)}
                className="w-full text-sm text-gray-500 py-1.5 hover:text-gray-700"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
