import { cn } from '@/lib/cn'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'

const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2',
    'whitespace-nowrap rounded-md text-sm font-medium',
    'transition-colors',
    'focus-visible:outline-none',
    'focus-visible:ring-2',
    'focus-visible:ring-ring',
    'disabled:pointer-events-none',
    'disabled:opacity-50',
    '[&_svg]:pointer-events-none',
    '[&_svg]:size-4',
    '[&_svg]:shrink-0',
  ].join(' '),
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground hover:bg-primary/90',

        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/90',

        outline:
          'border border-border bg-transparent hover:bg-accent hover:text-accent-foreground',

        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/80',

        ghost:
          'hover:bg-accent hover:text-accent-foreground',

        link:
          'text-primary underline-offset-4 hover:underline',

        success:
          'bg-emerald-600 text-white hover:bg-emerald-500',

        warning:
          'bg-amber-600 text-white hover:bg-amber-500',
      },

      size: {
        default:
          'h-9 px-4 py-2',

        sm:
          'h-8 rounded-md px-3 text-xs',

        lg:
          'h-10 rounded-md px-8',

        icon:
          'h-9 w-9',

        'icon-sm':
          'h-7 w-7',
      },
    },

    defaultVariants: {
      variant:
        'default',

      size:
        'default',
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean

  loading?: boolean
}

const Button =
  React.forwardRef<
    HTMLButtonElement,
    ButtonProps
  >(
    (
      {
        className,
        variant,
        size,
        asChild = false,
        loading = false,
        children,
        disabled = false,
        ...props
      },
      ref,
    ) => {
      const unavailable =
        disabled || loading

      /*
       * IMPORTANT:
       *
       * Radix Slot requires exactly ONE React element child.
       *
       * Never render:
       *
       *   <Slot>
       *     {loading && <Spinner />}
       *     {children}
       *   </Slot>
       *
       * because even the conditional false value participates in
       * the Slot child structure and can trigger:
       *
       * "Slot failed to slot onto its children."
       *
       * asChild is therefore handled as a completely separate
       * render path.
       */
      if (asChild) {
        return (
          <Slot
            className={cn(
              buttonVariants({
                variant,
                size,
                className,
              }),

              unavailable &&
                'pointer-events-none opacity-50',
            )}
            ref={ref}
            aria-disabled={
              unavailable
                ? true
                : undefined
            }
            {...props}
          >
            {children}
          </Slot>
        )
      }

      return (
        <button
          className={cn(
            buttonVariants({
              variant,
              size,
              className,
            }),
          )}
          ref={ref}
          disabled={
            unavailable
          }
          {...props}
        >
          {loading ? (
            <svg
              aria-hidden="true"
              className="h-4 w-4 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />

              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
          ) : null}

          {children}
        </button>
      )
    },
  )

Button.displayName =
  'Button'

export {
  Button,
  buttonVariants
}
