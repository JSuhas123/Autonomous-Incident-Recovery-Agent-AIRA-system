export type HumanTaskStatus =
  | 'OPEN'
  | 'ASSIGNED'
  | 'ACKNOWLEDGED'
  | 'IN_PROGRESS'
  | 'WAITING'
  | 'RESOLVED'
  | 'CANCELLED'
  | 'EXPIRED'

export type TakeoverSessionStatus =
  | 'REQUESTED'
  | 'AUTHORIZED'
  | 'ACTIVE'
  | 'RELEASING'
  | 'RELEASED'
  | 'EXPIRED'
  | 'REVOKED'
  | 'DENIED'

export type ControlLeaseStatus =
  | 'PENDING'
  | 'ACTIVE'
  | 'RELEASED'
  | 'EXPIRED'
  | 'REVOKED'

export type ReturnFenceState =
  | 'REQUIRES_FRESH_EVALUATION'
  | 'SATISFIED'
  | 'SUPERSEDED'

export interface IncidentCommandTask {
  id: string
  publicId: string

  incidentId: string

  approvalId?: string | null
  escalationId?: string | null
  executionRequestId?: string | null
  recoveryDecisionId?: string | null

  taskType: string
  title: string
  description?: string | null

  priority: string
  status: HumanTaskStatus
  source: string

  assignedUserId?: string | null
  assignedTeamId?: string | null

  acknowledgementRequired: boolean
  autonomousRecoveryBlocked: boolean

  recommendedActions: unknown[]
  evidence: unknown[]
  metadata: Record<string, unknown>

  dueAt?: string | null
  expiresAt?: string | null
  acknowledgedAt?: string | null
  resolvedAt?: string | null

  controlEpoch: number

  createdAt?: string | null
  updatedAt?: string | null

  executionAuthorized: false
}

export interface IncidentCommandAssignment {
  id: string
  publicId: string

  taskId: string

  assignedUserId?: string | null
  assignedTeamId?: string | null
  assignedByUserId?: string | null

  status: string

  reason?: string | null

  assignedAt?: string | null
  endedAt?: string | null

  metadata: Record<string, unknown>

  executionAuthorized: false
}

export interface IncidentCommandAcknowledgement {
  id: string
  publicId: string

  taskId: string
  assignmentId?: string | null

  acknowledgedByUserId?: string | null

  outcome: string
  note?: string | null

  acknowledgedAt?: string | null

  metadata: Record<string, unknown>

  executionAuthorized: false
}

export interface IncidentCommandEscalation {
  id: string
  publicId: string

  incidentId: string
  taskId?: string | null

  policyId?: string | null
  selectedTargetId?: string | null

  decision?: string | null
  reasonCode?: string | null

  severity?: string | null
  triggerSource?: string | null

  status: string

  decisionSnapshot: Record<string, unknown>
  routingSnapshot: Record<string, unknown>
  metadata: Record<string, unknown>

  acknowledgementDeadline?: string | null

  createdAt?: string | null
  updatedAt?: string | null

  executionAuthorized: false
}

export interface IncidentCommandNotification {
  id: string
  publicId: string

  escalationId?: string | null
  taskId?: string | null

  eventType: string
  status: string

  targetType?: string | null
  targetIdentity?: string | null

  attemptCount: number
  maxAttempts?: number | null

  lastError?: string | null

  queuedAt?: string | null
  deliveredAt?: string | null

  createdAt?: string | null
  updatedAt?: string | null

  metadata: Record<string, unknown>

  executionAuthorized: false
}

export interface IncidentCommandHandoff {
  id: string
  publicId: string

  incidentId: string

  escalationId?: string | null
  taskId?: string | null

  revision: number
  isCurrent: boolean

  status: string

  generationReason?: string | null
  schemaVersion?: string | null
  contentHash?: string | null

  package: Record<string, unknown>
  metadata: Record<string, unknown>

  generatedAt?: string | null
  createdAt?: string | null

  executionAuthorized: false
}

export interface IncidentCommandTakeoverSession {
  id: string
  publicId: string

  incidentId: string
  taskId?: string | null

  requestedByUserId?: string | null
  authorizedByUserId?: string | null

  status: TakeoverSessionStatus

  reason?: string | null

  requestedAt?: string | null
  authorizedAt?: string | null
  activatedAt?: string | null
  releaseRequestedAt?: string | null
  releasedAt?: string | null

  expiresAt?: string | null
  revokedAt?: string | null

  controlEpoch: number

  metadata: Record<string, unknown>

  executionAuthorized: false
}

export interface IncidentCommandControlLease {
  id: string
  publicId: string

  incidentId: string
  takeoverSessionId: string

  holderUserId?: string | null

  status: ControlLeaseStatus

  leaseVersion: number
  controlEpoch: number

  acquiredAt?: string | null
  heartbeatAt?: string | null
  expiresAt?: string | null
  releasedAt?: string | null
  revokedAt?: string | null

  releaseReason?: string | null

  metadata: Record<string, unknown>

  executionAuthorized: false
}

export interface IncidentCommandReturnFence {
  id: string
  publicId: string

  incidentId: string

  controlLeaseId: string
  takeoverSessionId: string

  previousControlEpoch: number
  requiredControlEpoch: number

  releaseOutcome: string
  state: ReturnFenceState

  freshAfter?: string | null

  freshDiagnosisId?: string | null
  freshRecoveryDecisionId?: string | null

  satisfiedAt?: string | null
  supersededAt?: string | null

  stalePlanResumeAllowed: false

  metadata: Record<string, unknown>

  createdAt?: string | null
  updatedAt?: string | null

  executionAuthorized: false
}

export interface IncidentCommandCapabilities {
  acknowledge: boolean

  requestControl: boolean
  authorizeControl: boolean
  acquireControl: boolean

  heartbeatControl: boolean
  returnControl: boolean

  executionAuthorized: false
}

export interface IncidentCommandReadModel {
  incidentId: string

  escalation: IncidentCommandEscalation | null

  task: IncidentCommandTask | null
  assignment: IncidentCommandAssignment | null
  acknowledgement: IncidentCommandAcknowledgement | null

  notification: IncidentCommandNotification | null

  handoff: IncidentCommandHandoff | null

  control: {
    session: IncidentCommandTakeoverSession | null

    lease: IncidentCommandControlLease | null

    humanControlActive: boolean

    holderUserId?: string | null
    controlEpoch?: number | null

    executionAuthorized: false
  }

  returnControl: {
    fence: IncidentCommandReturnFence | null

    requiresFreshEvaluation: boolean
    freshEvaluationSatisfied: boolean

    requiredControlEpoch?: number | null

    stalePlanResumeAllowed: false

    executionAuthorized: false
  }

  capabilities: IncidentCommandCapabilities

  autonomousContinuationBlocked: boolean

  stalePlanResumeAllowed: false

  executionAuthorized: false
}

export interface IncidentCommandReadResponse {
  command: IncidentCommandReadModel
}

export interface IncidentCommandResult {
  command: string

  humanControlActive?: boolean

  autonomousContinuationAllowed?: boolean

  requiresFreshEvaluation?: boolean
  freshEvaluationSatisfied?: boolean

  stalePlanResumeAllowed?: false
  executionAuthorized: false

  task?: IncidentCommandTask

  session?: IncidentCommandTakeoverSession

  lease?: IncidentCommandControlLease

  returnFence?: IncidentCommandReturnFence

  [key: string]: unknown
}