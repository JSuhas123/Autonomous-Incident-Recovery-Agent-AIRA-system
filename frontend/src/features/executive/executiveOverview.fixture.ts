export const EXECUTIVE_OVERVIEW_FIXTURE = {
  metrics: [
    { id: 'reliability', label: 'Service reliability', value: '99.91%', detail: '30-day weighted availability', state: 'healthy' as const },
    { id: 'mttr', label: 'MTTR', value: '17 min', detail: 'Down 21% over 30 days', state: 'healthy' as const },
    { id: 'coverage', label: 'Recovery coverage', value: '76%', detail: 'Critical service coverage', state: 'warning' as const },
    { id: 'human', label: 'Human takeover', value: '14%', detail: 'Incidents requiring intervention', state: 'info' as const },
  ],
  impact: [
    { id: 'i1', label: 'Customer-impacting incidents', value: '3', detail: 'Last 30 days' },
    { id: 'i2', label: 'Estimated incident minutes avoided', value: '186', detail: 'From verified recoveries' },
    { id: 'i3', label: 'Critical reliability gaps', value: '2', detail: 'Need operational investment' },
  ],
  narrative: [
    'Recovery success improved while mean time to recovery declined.',
    'Payment and database recovery coverage remain the largest reliability gaps.',
    'Most incidents are still handled under approval-only policy; unrestricted production autonomy remains disabled.',
  ],
}
