import { useState } from "react";
import { useToast } from "@/hooks/useToast";
import { useCreateConnection } from "@/api/hooks/useIntegrations";
import type { IntegrationDefinition } from "../../types/integration";

interface ConnectDialogProps {
  definition: IntegrationDefinition;
  onClose: () => void;
}

export function ConnectDialog({ definition, onClose }: ConnectDialogProps) {
  const [name, setName]     = useState(`${definition.displayName} Connection`);
  const [secret, setSecret] = useState("");
  const [targetUrl, setTargetUrl] = useState("");

  const create  = useCreateConnection();
  const { toast } = useToast();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const nonSecretConfig: Record<string, unknown> = {};
    if (targetUrl) nonSecretConfig.targetUrl = targetUrl;

    try {
      await create.mutateAsync({
        provider: definition.provider,
        name,
        nonSecretConfig,
        secret: secret || undefined,
      });
      toast({ title: "Integration connected", description: name });
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Connection failed";
      toast({ title: "Error", description: msg, variant: "destructive" });
    }
  }

  const needsTargetUrl = definition.provider === "webhook_outgoing";
  const needsSecret    = ["webhook_incoming", "webhook_outgoing"].includes(definition.provider);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Connect {definition.displayName}</h2>
        <p className="text-sm text-gray-500 mb-5">{definition.description}</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Connection name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {needsTargetUrl && (
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Target URL</label>
              <input
                type="url"
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                placeholder="https://example.com/webhook"
                required
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          {needsSecret && (
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">
                Signing secret <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                type="password"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder="Leave blank to skip HMAC verification"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          <div className="flex gap-2 justify-end pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={create.isPending}
              className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
              {create.isPending ? "Connecting…" : "Connect"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
