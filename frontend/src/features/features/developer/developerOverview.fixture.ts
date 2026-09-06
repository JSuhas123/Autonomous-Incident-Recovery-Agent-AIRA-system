export const DEVELOPER_OVERVIEW_FIXTURE = {
  metrics: [
    { id: 'owned', label: 'My services', value: '6', detail: '5 healthy · 1 degraded', state: 'degraded' as const },
    { id: 'incidents', label: 'Relevant incidents', value: '2', detail: 'Affecting owned services', state: 'warning' as const },
    { id: 'changes', label: 'Recent changes', value: '4', detail: 'Last 24 hours', state: 'info' as const },
    { id: 'gaps', label: 'Reliability gaps', value: '3', detail: 'Across owned services', state: 'warning' as const },
  ],
  services: [
    { id: 'checkout', name: 'checkout-api', health: 'degraded' as const, incidents: 1, coverage: '82%' },
    { id: 'catalog', name: 'catalog-api', health: 'healthy' as const, incidents: 0, coverage: '91%' },
    { id: 'profile', name: 'profile-api', health: 'healthy' as const, incidents: 0, coverage: '78%' },
  ],
  recommendations: [
    { id: 'r1', title: 'Add rollback verification for checkout-api', detail: 'Current recovery path verifies HTTP health but not payment-side effects.' },
    { id: 'r2', title: 'Link catalog timeout runbook', detail: 'Repeated latency pattern has no linked operational runbook.' },
  ],
  changes: [
    { id: 'c1', service: 'checkout-api', change: 'Deployment 7d8f3a', impact: 'High correlation with active incident' },
    { id: 'c2', service: 'catalog-api', change: 'Deployment a924f1', impact: 'No detected incident correlation' },
  ],
}
