export const INCIDENT_COMMAND_FIXTURE = {
  id: 'inc_checkout',
  title: 'Checkout API elevated failure rate',
  severity: 'critical' as const,
  service: 'checkout-api',
  environment: 'Production',
  status: 'Approval required',
  timeline: [
    { id: 't1', time: '12:01', title: 'Signal received', detail: 'Error-rate alert received from observability integration.' },
    { id: 't2', time: '12:02', title: 'Incident correlated', detail: 'AIRA grouped API errors, payment timeouts, and deployment change into one incident.' },
    { id: 't3', time: '12:04', title: 'Hypothesis ranked', detail: 'Recent deployment configuration became the leading hypothesis.' },
    { id: 't4', time: '12:06', title: 'Recovery candidate prepared', detail: 'Rollback to previous verified revision scored highest.' },
    { id: 't5', time: '12:08', title: 'Human approval requested', detail: 'Execution remains blocked by production approval policy.' },
  ],
  evidence: [
    'Error rate increased within four minutes of deployment revision 7d8f3a.',
    'Payment-client timeout errors increased 9.4×.',
    'Previous deployment revision passed the latest verification profile.',
  ],
  hypotheses: [
    { id: 'h1', title: 'Deployment configuration regression', confidence: 0.94 },
    { id: 'h2', title: 'Payment provider external degradation', confidence: 0.41 },
    { id: 'h3', title: 'Database saturation', confidence: 0.18 },
  ],
  recovery: {
    action: 'Rollback checkout-api to previous verified revision',
    confidence: 0.92,
    risk: 'medium',
    rollbackAvailable: true,
    policy: 'HUMAN_APPROVAL_REQUIRED',
    executionAuthorized: false,
    verification: 'PENDING',
  },
}
