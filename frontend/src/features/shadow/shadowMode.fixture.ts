export const SHADOW_MODE_FIXTURE = {
  enabled: true,
  metrics: [
    { id: 'observed', label: 'Incidents observed', value: '42', detail: 'Last 30 days', state: 'info' as const },
    { id: 'diagnosis', label: 'Diagnosis agreement', value: '88%', detail: 'Matched engineer conclusion', state: 'healthy' as const },
    { id: 'action', label: 'Action agreement', value: '81%', detail: 'Matched engineer recovery', state: 'healthy' as const },
    { id: 'auto', label: 'Autonomous executions', value: '0', detail: 'Required in shadow mode', state: 'healthy' as const },
  ],
  cases: [
    { id: 's1', incident: 'Checkout deployment regression', aira: 'Rollback previous revision', human: 'Rollback previous revision', outcome: 'Recovered', match: true },
    { id: 's2', incident: 'Worker queue saturation', aira: 'Scale consumer pool', human: 'Restart consumer pool', outcome: 'Recovered', match: false },
    { id: 's3', incident: 'DNS resolution degradation', aira: 'Fail over resolver', human: 'Fail over resolver', outcome: 'Recovered', match: true },
  ],
}
