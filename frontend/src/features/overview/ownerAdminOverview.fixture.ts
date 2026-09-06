import type { OwnerAdminOverviewModel } from './ownerAdminOverview.types'

export const OWNER_ADMIN_OVERVIEW_FIXTURE: OwnerAdminOverviewModel = {
  health: 'degraded',
  metrics: [
    { id: 'services', label: 'Services healthy', value: '18 / 20', detail: '90% currently healthy', state: 'degraded' },
    { id: 'incidents', label: 'Active incidents', value: '2', detail: '1 critical · 1 medium', state: 'critical' },
    { id: 'human', label: 'Human action', value: '1', detail: 'Approval required', state: 'warning' },
    { id: 'recoveries', label: 'Recoveries running', value: '1', detail: 'Verification pending', state: 'warning' },
    { id: 'integrations', label: 'Integration health', value: '7 / 8', detail: '1 degraded connector', state: 'degraded' },
    { id: 'coverage', label: 'Recovery coverage', value: '76%', detail: 'Across critical services', state: 'warning' },
  ],
  incidents: [
    { id: 'inc_checkout', title: 'Checkout API elevated failure rate', service: 'checkout-api', severity: 'critical', status: 'Approval required', age: '12 min' },
    { id: 'inc_jobs', title: 'Worker queue saturation', service: 'jobs-worker', severity: 'medium', status: 'Investigating', age: '7 min' },
  ],
  attention: [
    { id: 'a1', title: 'Approve bounded checkout recovery', detail: 'Rollback candidate is ready but execution remains blocked pending an eligible approver.', kind: 'approval' },
    { id: 'a2', title: 'Datadog ingestion delayed', detail: 'Telemetry freshness is outside the expected window.', kind: 'integration' },
    { id: 'a3', title: 'Production recovery coverage below target', detail: 'Five critical services lack a certified recovery path.', kind: 'coverage' },
  ],
  environments: [
    { id: 'prod', name: 'Production', healthy: 13, total: 15, incidents: 2, state: 'degraded' },
    { id: 'stage', name: 'Staging', healthy: 3, total: 3, incidents: 0, state: 'healthy' },
    { id: 'dev', name: 'Development', healthy: 2, total: 2, incidents: 0, state: 'healthy' },
  ],
  reliabilityGaps: [
    { id: 'g1', title: 'Payment service lacks certified rollback', detail: 'Investigation and recommendation are available, but no recovery candidate is certified for execution.', state: 'critical' },
    { id: 'g2', title: 'Database recovery coverage incomplete', detail: 'Two production databases have monitoring without a validated recovery path.', state: 'warning' },
    { id: 'g3', title: 'Runbook coverage below target', detail: 'Three recurring incident patterns have no linked runbook.', state: 'warning' },
  ],
}
