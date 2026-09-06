export const GOVERNANCE_OVERVIEW_FIXTURE = {
  metrics: [
    { id: 'policy', label: 'Policy coverage', value: '94%', detail: 'Critical environments', state: 'healthy' as const },
    { id: 'approvals', label: 'Pending approvals', value: '1', detail: 'Production recovery', state: 'warning' as const },
    { id: 'audit', label: 'Audit completeness', value: '100%', detail: 'Critical actions captured', state: 'healthy' as const },
    { id: 'trust', label: 'Trust exceptions', value: '2', detail: 'Require review', state: 'warning' as const },
  ],
  controls: [
    { id: 'c1', title: 'Production recovery requires approval', detail: 'Bounded recovery cannot execute without an eligible approver.', state: 'healthy' as const },
    { id: 'c2', title: 'Kill switch enforcement', detail: 'Global execution kill switch is available and authoritative.', state: 'healthy' as const },
    { id: 'c3', title: 'Cross-tenant isolation', detail: 'RLS and middleware boundaries remain mandatory for product read models.', state: 'healthy' as const },
  ],
  recentEvents: [
    { id: 'e1', title: 'Recovery approval requested', actor: 'AIRA workflow', result: 'Awaiting eligible approver' },
    { id: 'e2', title: 'Trust level evaluated', actor: 'Certification service', result: 'No execution authority granted' },
    { id: 'e3', title: 'Organization profile updated', actor: 'Owner', result: 'Audit event recorded' },
  ],
}
