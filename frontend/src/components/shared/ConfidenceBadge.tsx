import { cn } from '@/lib/cn'

interface ConfidenceBadgeProps {
  score: number // 0-1
  className?: string
}

export function ConfidenceBadge({ score, className }: ConfidenceBadgeProps) {
  const pct = Math.round(score * 100)
  const color =
    pct >= 80
      ? 'text-emerald-400 bg-emerald-500/10'
      : pct >= 60
        ? 'text-amber-400 bg-amber-500/10'
        : 'text-red-400 bg-red-500/10'

  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-medium',
        color,
        className,
      )}
    >
      {pct}%
    </span>
  )
}
