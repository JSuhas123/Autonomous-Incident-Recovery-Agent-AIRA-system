import type { OperationsOverviewModel } from './operationsOverview.types'

export const OPERATIONS_OVERVIEW_FIXTURE: OperationsOverviewModel = {
  metrics: [
    { id: 'incidents', label: 'Active incidents', value: '4', detail: '1 critical · 2 high', state: 'critical' },
    { id: 'human', label: 'Human action', value: '2', detail: '1 approval · 1 task', state: 'warning' },
    { id: 'recovery', label: 'Recoveries running', value: '1', detail: 'Bounded recovery', state: 'warning' },
    { id: 'verification', label: 'Verification pending', value: '1', detail: 'Post-recovery check', state: 'warning' },
    { id: 'degraded', label: 'Degraded services', value: '3', detail: 'Across production', state: 'degraded' },
    { id: 'integrations', label: 'Integration health', value: '7 / 8', detail: 'One delayed connector', state: 'degraded' },
  ],
  primaryIncident: {
    id: 'inc_checkout',
    title: 'Checkout API elevated failure rate',
    service: 'checkout-api',
    severity: 'critical',
    state: 'approval_required',
    blastRadius: '3 services · 11 resources · ~18% checkout requests impacted',
    hypothesis: 'Recent checkout-api deployment introduced an incompatible payment-client configuration.',
    diagnosisConfidence: 0.94,
    recovery: 'Rollback checkout-api to the previous verified deployment revision.',
    recoveryConfidence: 0.92,
    policy: 'HUMAN_APPROVAL_REQUIRED',
    approvalRequired: true,
    executionAuthorized: false,
    authorizationReason: 'Approval has not yet been granted.',
    verification: 'verification_pending',
  },
  incidents: [
    { id: 'inc_checkout', title: 'Checkout API elevated failure rate', service: 'checkout-api', severity: 'critical', state: 'approval_required', age: '12 min' },
    { id: 'inc_jobs', title: 'Worker queue saturation', service: 'jobs-worker', severity: 'high', state: 'investigating', age: '8 min' },
    { id: 'inc_catalog', title: 'Catalog API latency regression', service: 'catalog-api', severity: 'high', state: 'observing', age: '5 min' },
    { id: 'inc_webhook', title: 'Webhook processor delayed', service: 'integration-worker', severity: 'medium', state: 'recovery_running', age: '4 min' },
  ],
  humanTasks: [
    { id: 't1', title: 'Review checkout rollback', assignee: 'Production on-call', waiting: '4 min' },
    { id: 't2', title: 'Validate worker backlog hypothesis', assignee: 'Platform team', waiting: '2 min' },
  ],
  recentChanges: [
    { id: 'c1', service: 'checkout-api', description: 'Deployment revision checkout-api:7d8f3a promoted to production.', correlation: 'high', age: '18 min' },
    { id: 'c2', service: 'payment-client', description: 'Payment gateway timeout changed from 3s to 1.5s.', correlation: 'medium', age: '31 min' },
    { id: 'c3', service: 'catalog-api', description: 'Routine catalog deployment completed.', correlation: 'low', age: '52 min' },
  ],
}
