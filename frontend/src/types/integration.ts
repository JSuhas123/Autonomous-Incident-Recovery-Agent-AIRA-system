export type AvailabilityStatus = "available" | "beta" | "coming_soon";

export interface IntegrationDefinition {
  provider: string;
  displayName: string;
  description: string;
  category: string;
  availabilityStatus: AvailabilityStatus;
  capabilities: string[];
  iconUrl?: string;
  docsUrl?: string;
}

export type ConnectionStatus =
  | "draft"
  | "connected"
  | "degraded"
  | "disconnected"
  | "disabled";

export type HealthStatus = "unknown" | "healthy" | "degraded" | "unhealthy";

export interface IntegrationConnection {
  id: string;
  organizationId: string;
  provider: string;
  name: string;
  serviceIds: string[];
  status: ConnectionStatus;
  capabilities: string[];
  nonSecretConfig: Record<string, unknown>;
  hasSecret: boolean;
  lastEventAt: string | null;
  lastSuccessfulEventAt: string | null;
  healthStatus: HealthStatus;
  errorSummary: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  disabledAt: string | null;
  definition?: IntegrationDefinition;
}

export interface CreateConnectionBody {
  provider: string;
  name: string;
  serviceIds?: string[];
  nonSecretConfig?: Record<string, unknown>;
  secret?: string;
}

export interface UpdateConnectionBody {
  name?: string;
  serviceIds?: string[];
  nonSecretConfig?: Record<string, unknown>;
}
