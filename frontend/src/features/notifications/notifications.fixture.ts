export type ProductNotificationKind =
  | 'incident'
  | 'approval'
  | 'human_task'
  | 'recovery'
  | 'trust'
  | 'certification'
  | 'integration'
  | 'policy'
  | 'security'
  | 'onboarding'
  | 'system'

export const NOTIFICATIONS_FIXTURE = [
  { id: 'n1', kind: 'approval' as ProductNotificationKind, title: 'Production rollback approval required', detail: 'Checkout incident is waiting for an eligible approver.', state: 'critical' as const, unread: true },
  { id: 'n2', kind: 'integration' as ProductNotificationKind, title: 'Datadog ingestion delayed', detail: 'Signal freshness exceeded the configured threshold.', state: 'warning' as const, unread: true },
  { id: 'n3', kind: 'recovery' as ProductNotificationKind, title: 'Webhook processor recovery verified', detail: 'Post-recovery verification completed successfully.', state: 'healthy' as const, unread: false },
  { id: 'n4', kind: 'trust' as ProductNotificationKind, title: 'Trust evaluation completed', detail: 'Capability evidence updated; execution authority unchanged.', state: 'info' as const, unread: false },
]
