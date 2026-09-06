import type { FeatureState } from '../shared'

export type WorkflowState =
  | 'observing'
  | 'investigating'
  | 'human_required'
  | 'approval_required'
  | 'recovery_ready'
  | 'recovery_running'
  | 'verification_pending'
  | 'verified'
  | 'failed'

export interface OperationsOverviewModel {
  metrics: Array<{
    id: string
    label: string
    value: string
    detail: string
    state: FeatureState
  }>
  primaryIncident: {
    id: string
    title: string
    service: string
    severity: 'critical' | 'high' | 'medium' | 'low'
    state: WorkflowState
    blastRadius: string
    hypothesis: string
    diagnosisConfidence: number
    recovery: string
    recoveryConfidence: number
    policy: string
    approvalRequired: boolean
    executionAuthorized: boolean
    authorizationReason: string
    verification: WorkflowState
  }
  incidents: Array<{
    id: string
    title: string
    service: string
    severity: 'critical' | 'high' | 'medium' | 'low'
    state: WorkflowState
    age: string
  }>
  humanTasks: Array<{
    id: string
    title: string
    assignee: string
    waiting: string
  }>
  recentChanges: Array<{
    id: string
    service: string
    description: string
    correlation: 'high' | 'medium' | 'low' | 'none'
    age: string
  }>
}
