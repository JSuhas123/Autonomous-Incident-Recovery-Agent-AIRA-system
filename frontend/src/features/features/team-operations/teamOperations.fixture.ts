export const TEAM_OPERATIONS_FIXTURE = {
  metrics: [
    { id: 'members', label: 'Active members', value: '12', detail: 'Across 4 teams', state: 'healthy' as const },
    { id: 'oncall', label: 'On-call coverage', value: '3', detail: 'Eligible responders', state: 'healthy' as const },
    { id: 'approval', label: 'Approval wait', value: '4 min', detail: 'Current oldest request', state: 'warning' as const },
    { id: 'tasks', label: 'Open human tasks', value: '2', detail: '1 acknowledged', state: 'warning' as const },
  ],
  routing: [
    { id: 'r1', event: 'Critical production incident', target: 'Production SRE on-call', channels: 'PagerDuty + Slack', state: 'healthy' as const },
    { id: 'r2', event: 'Recovery approval required', target: 'Eligible approvers', channels: 'Product inbox + Slack', state: 'healthy' as const },
    { id: 'r3', event: 'Security policy violation', target: 'Security team', channels: 'Product inbox + email', state: 'healthy' as const },
  ],
}
