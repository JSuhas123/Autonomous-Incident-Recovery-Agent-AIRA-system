import type { FeatureState } from '../shared'

export interface OwnerAdminMetric {
  id: string
  label: string
  value: string
  detail: string
  state: FeatureState
}

export interface OwnerAdminOverviewModel {
  health: FeatureState
  metrics: OwnerAdminMetric[]
  incidents: Array<{
    id: string
    title: string
    service: string
    severity: 'critical' | 'high' | 'medium' | 'low'
    status: string
    age: string
  }>
  attention: Array<{
    id: string
    title: string
    detail: string
    kind: 'approval' | 'human_task' | 'integration' | 'coverage'
  }>
  environments: Array<{
    id: string
    name: string
    healthy: number
    total: number
    incidents: number
    state: FeatureState
  }>
  reliabilityGaps: Array<{
    id: string
    title: string
    detail: string
    state: FeatureState
  }>
}
