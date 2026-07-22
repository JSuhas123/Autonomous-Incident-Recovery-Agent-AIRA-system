import { cn } from '@/lib/cn'
import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary/20 text-primary',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        destructive: 'border-transparent bg-destructive/20 text-red-400',
        success: 'border-transparent bg-emerald-500/20 text-emerald-400',
        warning: 'border-transparent bg-amber-500/20 text-amber-400',
        outline: 'border-border text-foreground',
        critical: 'border-transparent bg-red-500/20 text-red-400',
        high: 'border-transparent bg-orange-500/20 text-orange-400',
        medium: 'border-transparent bg-amber-500/20 text-amber-400',
        low: 'border-transparent bg-blue-500/20 text-blue-400',
        pending: 'border-transparent bg-yellow-500/20 text-yellow-400',
        approved: 'border-transparent bg-emerald-500/20 text-emerald-400',
        rejected: 'border-transparent bg-red-500/20 text-red-400',
        expired: 'border-transparent bg-gray-500/20 text-gray-400',
        running: 'border-transparent bg-blue-500/20 text-blue-400',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
