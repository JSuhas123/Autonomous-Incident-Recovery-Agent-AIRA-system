export const RELIABILITY_FIXTURE = {
  metrics: [
    { id: 'mttd', label: 'MTTD', value: '2.8 min', detail: '30-day median', state: 'healthy' as const },
    { id: 'mtta', label: 'MTTA', value: '4.1 min', detail: 'Human acknowledgment', state: 'healthy' as const },
    { id: 'mttr', label: 'MTTR', value: '17 min', detail: '30-day median', state: 'healthy' as const },
    { id: 'success', label: 'Recovery success', value: '91%', detail: 'Verified recoveries', state: 'healthy' as const },
    { id: 'takeover', label: 'Human takeover', value: '14%', detail: 'Incident share', state: 'info' as const },
    { id: 'coverage', label: 'Recovery coverage', value: '76%', detail: 'Critical services', state: 'warning' as const },
  ],
  gaps: [
    { id: 'g1', capability: 'Database failover', services: 2, state: 'warning' as const },
    { id: 'g2', capability: 'Payment rollback', services: 1, state: 'critical' as const },
    { id: 'g3', capability: 'DNS recovery verification', services: 2, state: 'warning' as const },
  ],
}
