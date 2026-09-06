export const ONBOARDING_FIXTURE = [
  { id: 'profile', label: 'Complete company profile', status: 'complete' as const, evidence: 'Organization profile stored' },
  { id: 'invite', label: 'Invite your team', status: 'current' as const, evidence: 'No active invitation yet' },
  { id: 'observability', label: 'Connect observability', status: 'pending' as const, evidence: 'Requires healthy integration' },
  { id: 'infrastructure', label: 'Connect infrastructure', status: 'pending' as const, evidence: 'Requires validated connection' },
  { id: 'discovery', label: 'Discover resources', status: 'pending' as const, evidence: 'Requires discovered resources' },
  { id: 'environment', label: 'Classify environment', status: 'pending' as const, evidence: 'Requires canonical environment' },
  { id: 'policy', label: 'Configure safety policy', status: 'pending' as const, evidence: 'Requires stored tenant policy' },
  { id: 'shadow', label: 'Enter Shadow Mode', status: 'pending' as const, evidence: 'Execution disabled + monitoring active' },
  { id: 'incident', label: 'Observe first incident', status: 'pending' as const, evidence: 'Requires actual incident lifecycle event' },
]
