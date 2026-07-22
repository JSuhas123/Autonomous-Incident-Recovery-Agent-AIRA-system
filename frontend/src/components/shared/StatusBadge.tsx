import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';

type Status =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'running'
  | 'completed'
  | 'failed'
  | 'critical'
  | 'high'
  | 'medium'
  | 'low'
  | 'active'
  | 'inactive'
  | string

const statusConfig: Record<string, { label: string; variant: any }> = {
  pending: { label: 'Pending', variant: 'pending' },
  approved: { label: 'Approved', variant: 'approved' },
  rejected: { label: 'Rejected', variant: 'rejected' },
  expired: { label: 'Expired', variant: 'expired' },
  running: { label: 'Running', variant: 'running' },
  completed: { label: 'Completed', variant: 'success' },
  failed: { label: 'Failed', variant: 'destructive' },
  critical: { label: 'Critical', variant: 'critical' },
  high: { label: 'High', variant: 'high' },
  medium: { label: 'Medium', variant: 'medium' },
  low: { label: 'Low', variant: 'low' },
  active: { label: 'Active', variant: 'success' },
  inactive: { label: 'Inactive', variant: 'secondary' },
}

interface StatusBadgeProps {
  status: Status
  className?: string
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status.toLowerCase()] ?? { label: status, variant: 'outline' }
  return (
    <Badge variant={config.variant} className={cn('capitalize', className)}>
      {config.label}
    </Badge>
  )
}
