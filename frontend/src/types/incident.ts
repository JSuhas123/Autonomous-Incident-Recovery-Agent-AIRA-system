export type IncidentStatus =
  | 'open'
  | 'acknowledged'
  | 'investigating'
  | 'recovering'
  | 'resolved'
  | 'closed'

export type IncidentSeverity = 'info' | 'warning' | 'critical'

export interface IncidentEvidence {
  checkedAt: string
  status: string
  statusCode: number | null
  responseTimeMs: number | null
  errorCode: string | null
  sanitizedErrorMessage: string | null
  checkerRegion: string
}

export interface IncidentTimelineEvent {
  id: string
  occurredAt: string
  eventType: string
  actor: 'system' | 'user'
  actorId?: string
  description: string
  metadata?: Record<string, unknown>
}

export interface Incident {
  id: string
  organizationId: string
  serviceId: string
  monitorId?: string
  fingerprint: string
  title: string
  description?: string
  severity: IncidentSeverity
  status: IncidentStatus
  impact?: string
  startedAt: string
  detectedAt: string
  acknowledgedAt?: string
  resolvedAt?: string
  lastObservedAt: string
  occurrenceCount: number
  evidence: IncidentEvidence[]
  assignedTo?: string
  resolution?: string
  tags: string[]
  createdAt: string
  updatedAt: string
}

export interface IncidentListParams {
  status?: IncidentStatus
  severity?: IncidentSeverity
  serviceId?: string
  from?: string
  to?: string
  limit?: number
  before?: string
}
