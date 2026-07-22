import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/cn'
import type { LucideIcon } from 'lucide-react'

interface MetricCardProps {
  title: string
  value: string | number
  description?: string
  icon?: LucideIcon
  iconColor?: string
  delta?: string
  deltaPositive?: boolean
  className?: string
}

export function MetricCard({
  title,
  value,
  description,
  icon: Icon,
  iconColor = 'text-primary',
  delta,
  deltaPositive,
  className,
}: MetricCardProps) {
  return (
    <Card className={cn('', className)}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
              {title}
            </p>
            <p className="text-2xl font-bold text-foreground">{value}</p>
            {description && (
              <p className="text-xs text-muted-foreground">{description}</p>
            )}
            {delta && (
              <p
                className={cn(
                  'text-xs font-medium',
                  deltaPositive ? 'text-emerald-400' : 'text-red-400',
                )}
              >
                {delta}
              </p>
            )}
          </div>
          {Icon && (
            <div className={cn('p-2 rounded-lg bg-primary/10', iconColor)}>
              <Icon className="w-5 h-5" />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
