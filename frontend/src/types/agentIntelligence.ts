// Agent Intelligence v2 TypeScript types

export interface AgentTraceEntry {
  agent: string
  agentVersion: string
  status: 'SUCCESS' | 'FAILED' | 'MANUAL_REQUIRED' | 'SKIPPED'
  startedAt: string
  completedAt: string
  durationMs: number
  confidence?: number
  evidenceUsed?: string[]
  model?: string
  provider?: string
  fallbackUsed?: boolean
  warnings?: string[]
  manualReason?: string
  errorMessage?: string
}

export interface ConfidenceDimensions {
  correlationConfidence?: number
  evidenceCompleteness?: number
  diagnosisConfidence?: number
  playbookSelectionConfidence?: number
  parameterConfidence?: number
  recoveryObservationConfidence?: number
}

export interface AgentDiagnosis {
  primaryHypothesis?: string
  diagnosisConfidence?: number
  recommendedIncidentType?: string
  hypotheses?: Array<{
    rootCause: string
    confidence: number
    explanation: string
    evidenceSupporting: string[]
    evidenceAgainst: string[]
  }>
  unresolvedQuestions?: string[]
}

export interface AgentPlaybookRecommendation {
  recommendedPlaybookId?: string
  version?: string
  recommendation: 'EXECUTE_CANDIDATE' | 'COLLECT_MORE_EVIDENCE' | 'MANUAL_REQUIRED'
  reasoningConfidence?: number
  reasons?: string[]
  candidateRankings?: Array<{ playbookId: string; score?: number; name?: string }>
}

export interface AgentParameterResolution {
  candidates?: Array<{
    parameter: string
    proposedValue: unknown
    confidence: number
    source: string
  }>
  unresolved?: string[]
  ambiguous?: string[]
  readyForExecution?: boolean
}

export interface AgentRecoveryIntelligence {
  state: 'RECOVERING' | 'RECOVERED' | 'WORSENING' | 'STABLE' | 'UNKNOWN'
  confidence: number
  recommendation: 'CONTINUE' | 'ESCALATE' | 'WAIT'
  observations?: string[]
  concerns?: string[]
}

export interface AgentExplanation {
  title?: string
  summary?: string
  whatHappened?: string
  likelyCause?: string
  decisionSummary?: string
  actionSummary?: string[]
  policySummary?: string
  verificationSummary?: string
  rollbackSummary?: string
  finalOutcome?: string
  manualReason?: string
  operatorNextSteps?: string[]
  timeline?: Array<{ agent: string; status: string; durationMs: number; confidence?: number }>
}

export interface AgentLearning {
  patterns?: Array<{ pattern: string; frequency: number }>
  recommendations?: Array<{
    type: string
    description: string
    confidence: number
    requiresHumanApproval: boolean
    isDraft: boolean
    proposedChange?: string
  }>
}

export interface AgentIntelligence {
  runId?: string
  incidentId: string
  correlationId?: string
  tenantId?: string
  state: string
  manualRequired?: boolean
  manualReason?: string
  confidence?: ConfidenceDimensions
  diagnosis?: AgentDiagnosis
  playbookRecommendation?: AgentPlaybookRecommendation
  parameterResolution?: AgentParameterResolution
  recoveryIntelligence?: AgentRecoveryIntelligence
  explanationResult?: AgentExplanation
  learningResult?: AgentLearning
  agentTrace?: AgentTraceEntry[]
  executionResult?: {
    outcome?: string
    playbookId?: string
    executionId?: string
  }
  createdAt?: string
  completedAt?: string
}
