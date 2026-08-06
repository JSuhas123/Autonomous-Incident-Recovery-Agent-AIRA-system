// ─── Auth & Tenant ─────────────────────────────────────────────────────────

/** @deprecated Use SafeUser from session auth */
export interface AuthCredentials {
  tenantId: string
  keyId: string
  secret: string
  tenantName?: string
}

export interface SafeUser {
  id: string
  fullName: string
  email: string
  status: string
  primaryOrganizationId: string | null
  emailVerifiedAt: string | null
  lastLoginAt: string | null
  createdAt: string
}

export interface SafeOrganization {
  id: string
  name: string
  slug: string
  tenantId: string
  status: string
  createdAt: string
}

export interface SafeMembership {
  id: string
  role: string
  status: string
  joinedAt: string | null
}

export interface SafeSession {
  id: string
  assuranceLevel: string
  lastActivityAt: string
  idleExpiresAt: string
  absoluteExpiresAt: string
  rememberMe: boolean
}

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

export interface AuthState {
  status: AuthStatus
  user: SafeUser | null
  organization: SafeOrganization | null
  membership: SafeMembership | null
  session: SafeSession | null
  csrfToken: string | null
  error: string | null
}

export interface ApiKey {
  keyId: string
  active: boolean
  createdAt: string
  description?: string
}

export interface TenantConfig {
  tenantId: string
  name: string
  status: 'active' | 'inactive' | 'suspended'
  apiKeys: ApiKey[]
  config: {
    maxDecisionsPerHour: number
    enableFeedback: boolean
    enableSimulation: boolean
    enableCascadeDetection: boolean
  }
}

// ─── Signals & Decisions ───────────────────────────────────────────────────

export type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
export type DecisionTier = 'execute' | 'safe_fallback' | 'escalate' | 'observe'

export interface Signal {
  errorRate?: number
  responseTime?: number
  affectedServices?: string[]
  severity?: Severity
  logSample?: string[]
  [key: string]: unknown
}

export interface DecisionTrace {
  _id?: string
  decisionId: string
  tenantId: string
  correlationId: string
  tier: DecisionTier
  confidence: number
  recommendedAction: string
  decision: string
  timestamp: string
  inputs: {
    signals: Signal
    severity: Severity
    confidence: number
    tier: DecisionTier
  }
  reasoning: {
    hypothesis: string
    evidenceFor: string[]
    evidenceAgainst: string[]
    cascadeDetection?: {
      identified: boolean
      affectedServices: string[]
      severity: Severity
      recommendation: string
    } | null
    confidenceFactors: Array<{
      name: string
      value: number
      weight: number
      contribution: number
    }>
    tier_reasoning: string
  }
  explanation: {
    decision: string
    reasoning: string
    confidence: {
      score: number
      factors: string[]
    }
    policiesApplied: string[]
  }
  actionRisk?: {
    blastRadius: string
    affectedServiceCount: number
    reversible: boolean
    dryRunAvailable: boolean
    dryRunRequired: boolean
    estimatedRecoveryTime: string
    circuitBreakerStatus: { enabled: boolean }
  }
}

export interface SignalSubmitResponse {
  decisionId: string
  correlationId: string
  tenantId: string
  tier: DecisionTier
  confidence: number
  message: string
  metadata: {
    patternType: string
    recommendedAction: string
    tier: DecisionTier
  }
}

// ─── Approvals ─────────────────────────────────────────────────────────────

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'EXECUTED'

export interface Approval {
  approvalId: string
  tenantId: string
  decisionId?: string
  action: string
  reason: string
  confidence: number
  resource?: string
  severity: Severity
  status: ApprovalStatus
  createdAt: string
  expiresAt: string
  expiresIn?: string
  approvedBy?: string
  rejectedBy?: string
  comment?: string
}

export interface ApprovalQueueStats {
  pending: number
  approved: number
  rejected: number
  expired: number
  avgWaitTime?: number
}

// ─── Runbooks ──────────────────────────────────────────────────────────────

export type RunbookStepType = 'kubernetes' | 'shell' | 'api' | 'wait'

export interface RunbookStep {
  stepNumber: number
  name: string
  type: RunbookStepType
  action: string
  timeout: number
  params?: Record<string, unknown>
}

export interface Runbook {
  _id: string
  tenantId: string
  name: string
  incidentType: string
  description?: string
  enabled: boolean
  steps: RunbookStep[]
  rollback?: RunbookStep[]
  successCriteria?: string[]
  version: number
  createdAt?: string
  updatedAt?: string
}

export interface RunbookExecution {
  _id: string
  tenantId: string
  runbookId: string
  correlationId: string
  status: 'running' | 'success' | 'failed' | 'cancelled'
  startTime: string
  endTime?: string | null
  result?: {
    stepsCompleted: number
    totalSteps: number
    notes: string
  }
}

// ─── Action Logs ───────────────────────────────────────────────────────────

export interface ActionLog {
  _id: string
  tenantId: string
  action: string
  status: 'success' | 'failed' | 'pending' | 'running'
  correlationId?: string
  decisionId?: string
  resource?: string
  result?: unknown
  error?: string
  timestamp: string
  duration?: number
}

// ─── Policies ──────────────────────────────────────────────────────────────

export interface PolicyVersion {
  version: number
  policyYaml: string
  description?: string
  createdBy?: string
  createdAt: string
  active: boolean
}

export interface PolicyValidationResult {
  valid: boolean
  errors?: string[]
  warnings?: string[]
}

export interface DryRunResult {
  _id: string
  tenantId: string
  policyYaml: string
  simulatedSignal: Signal
  result: {
    wouldExecute: boolean
    decision: string
    confidence: number
    reasoning: string
  }
  timestamp: string
}

// ─── Confidence & Effectiveness ────────────────────────────────────────────

export interface ConfidenceWeights {
  error_rate: number
  response_time: number
  service_count: number
  historical_pattern: number
  [key: string]: number
}

export interface ConfidenceTrend {
  date: string
  avgConfidence: number
  totalDecisions: number
  autoExecuted: number
  escalated: number
}

export interface ActionAccuracy {
  action: string
  totalPredictions: number
  correct: number
  accuracy: number
  avgConfidence: number
}

// ─── Effectiveness ─────────────────────────────────────────────────────────

export interface EffectivenessRecord {
  _id: string
  tenantId: string
  decisionTraceId: string
  beforeMetrics?: {
    errorRate: number
    responseTime: number
    timestamp: string
  }
  afterMetrics?: {
    errorRate: number
    responseTime: number
    timestamp: string
  }
  action?: string
  status: 'pending' | 'success' | 'failed'
  recoveryTime?: number
  timestamp: string
}

// ─── Integrations ──────────────────────────────────────────────────────────

export type WebhookSource = 'datadog' | 'prometheus' | 'grafana' | 'pagerduty' | 'custom'

export interface WebhookEvent {
  _id: string
  eventId: string
  source: WebhookSource
  payload: Record<string, unknown>
  processedAt: string
  decision?: {
    decisionId: string
    action: string
    confidence: number
  }
  status: 'received' | 'processed' | 'error'
}

export interface WebhookStats {
  total: number
  processed: number
  errors: number
  bySource: Record<string, number>
  last24h: number
}

// ─── Reports ───────────────────────────────────────────────────────────────

export interface Report {
  _id: string
  tenantId: string
  reportType: 'effectiveness' | 'failure-analysis' | 'confidence-calibration' | 'executive-summary'
  summary: string
  metrics: Record<string, unknown>
  startDate: string
  endDate: string
  createdAt: string
  archived?: boolean
}

// ─── Kill Switches & Safety ────────────────────────────────────────────────

export interface KillSwitchStatus {
  actionsEnabled: boolean
  learningEnabled: boolean
  emergencyMode: boolean
  requireManualApproval: boolean
  tenantOverrides: Record<string, boolean>
  lastModified?: string
  lastModifiedBy?: string
}

export interface ConfidenceThresholds {
  AUTO_EXECUTE_THRESHOLD: number
  ESCALATION_THRESHOLD: number
  currentTier: string
}

// ─── Health ────────────────────────────────────────────────────────────────

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'unhealthy'
  timestamp: string
  safeMode?: boolean
  redis?: { connected: boolean }
  warnings?: string[]
}

export interface DetailedHealth extends HealthStatus {
  deploymentMode?: string
  featureFlags?: {
    summary: string
    enabled: string[]
    disabled: string[]
  }
  components?: {
    database: string
    queue: string
    idempotency: string
    redis: { connected: boolean; failureStartTime?: string }
    memoryCleanup: string
  }
  canExecuteActions?: boolean
  diagnostics?: unknown
}

// ─── Pagination ────────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[]
  total?: number
  page?: number
  limit?: number
}

// ─── UI Types ──────────────────────────────────────────────────────────────

export type Theme = 'dark' | 'light' | 'system'

export interface Notification {
  id: string
  type: 'info' | 'success' | 'warning' | 'error'
  title: string
  message: string
  timestamp: string
  read: boolean
  actionLabel?: string
  actionHref?: string
}
