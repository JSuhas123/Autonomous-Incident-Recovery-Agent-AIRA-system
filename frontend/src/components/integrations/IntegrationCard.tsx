import { cn } from "@/lib/cn";
import type { IntegrationConnection, IntegrationDefinition } from "../../types/integration";

const AVAILABILITY_LABEL: Record<string, string> = {
  available:    "Available",
  beta:         "Beta",
  coming_soon:  "Coming soon",
};

const AVAILABILITY_COLOUR: Record<string, string> = {
  available:   "bg-green-100 text-green-800",
  beta:        "bg-blue-100 text-blue-800",
  coming_soon: "bg-gray-100 text-gray-500",
};

const HEALTH_COLOUR: Record<string, string> = {
  unknown:   "bg-gray-400",
  healthy:   "bg-green-500",
  degraded:  "bg-yellow-500",
  unhealthy: "bg-red-500",
};

interface DefinitionCardProps {
  definition: IntegrationDefinition;
  connection?: IntegrationConnection;
  onConnect?: (def: IntegrationDefinition) => void;
  onManage?: (conn: IntegrationConnection) => void;
}

export function IntegrationCard({ definition, connection, onConnect, onManage }: DefinitionCardProps) {
  const isAvailable = definition.availabilityStatus === "available";
  const isBeta      = definition.availabilityStatus === "beta";

  return (
    <div className={cn(
      "rounded-xl border bg-white p-5 flex flex-col gap-3 shadow-sm",
      !isAvailable && !isBeta && "opacity-60"
    )}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-gray-900 leading-tight">{definition.displayName}</p>
          <p className="text-xs text-gray-500 capitalize mt-0.5">{definition.category.replaceAll("_", " ")}</p>
        </div>
        <span className={cn(
          "text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap",
          AVAILABILITY_COLOUR[definition.availabilityStatus]
        )}>
          {AVAILABILITY_LABEL[definition.availabilityStatus]}
        </span>
      </div>

      {/* Description */}
      <p className="text-sm text-gray-600 flex-1 line-clamp-3">{definition.description}</p>

      {/* Connected indicator */}
      {connection && (
        <div className="flex items-center gap-2 text-xs text-gray-500 border-t pt-2">
          <span className={cn("inline-block w-2 h-2 rounded-full", HEALTH_COLOUR[connection.healthStatus])} />
          <span className="font-medium text-gray-700 truncate">{connection.name}</span>
          <span className="capitalize">{connection.status}</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 mt-auto">
        {connection ? (
          <button
            type="button"
            onClick={() => onManage?.(connection)}
            className="flex-1 text-sm rounded-lg border border-gray-300 px-3 py-1.5 hover:bg-gray-50 transition-colors"
          >
            Manage
          </button>
        ) : isAvailable || isBeta ? (
          <button
            type="button"
            onClick={() => onConnect?.(definition)}
            className="flex-1 text-sm rounded-lg bg-blue-600 text-white px-3 py-1.5 hover:bg-blue-700 transition-colors"
          >
            Connect
          </button>
        ) : (
          <button type="button" disabled className="flex-1 text-sm rounded-lg border border-gray-200 text-gray-400 px-3 py-1.5 cursor-not-allowed">
            Coming soon
          </button>
        )}
      </div>
    </div>
  );
}
