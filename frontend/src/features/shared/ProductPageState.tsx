import type {
  ReactNode,
} from 'react'

import {
  AlertTriangle,
  Ban,
  CircleHelp,
  DatabaseZap,
  FileQuestion,
  Inbox,
  LoaderCircle,
  RefreshCw,
  ShieldAlert,
  WifiOff,
} from 'lucide-react'


export type ProductPageStateKind =
  | 'loading'
  | 'empty'
  | 'degraded'
  | 'unavailable'
  | 'forbidden'
  | 'not-found'
  | 'error'


interface ProductPageStateProps {
  kind:
    ProductPageStateKind

  title:
    string

  description:
    string

  retry?:
    () => void

  retrying?:
    boolean

  action?:
    ReactNode

  compact?:
    boolean
}


function StateIcon({
  kind,
}: {
  kind:
    ProductPageStateKind
}) {
  const className =
    'h-5 w-5'


  switch (
    kind
  ) {
    case 'loading':
      return (
        <LoaderCircle
          className={`${className} animate-spin text-primary`}
        />
      )


    case 'empty':
      return (
        <Inbox
          className={`${className} text-muted-foreground`}
        />
      )


    case 'degraded':
      return (
        <DatabaseZap
          className={`${className} text-amber-300`}
        />
      )


    case 'unavailable':
      return (
        <WifiOff
          className={`${className} text-amber-300`}
        />
      )


    case 'forbidden':
      return (
        <ShieldAlert
          className={`${className} text-red-300`}
        />
      )


    case 'not-found':
      return (
        <FileQuestion
          className={`${className} text-muted-foreground`}
        />
      )


    case 'error':
      return (
        <AlertTriangle
          className={`${className} text-red-300`}
        />
      )


    default:
      return (
        <CircleHelp
          className={`${className} text-muted-foreground`}
        />
      )
  }
}


function borderClass(
  kind:
    ProductPageStateKind
) {
  switch (
    kind
  ) {
    case 'degraded':
    case 'unavailable':
      return 'border-amber-400/20 bg-amber-400/[0.035]'

    case 'forbidden':
    case 'error':
      return 'border-red-400/20 bg-red-400/[0.035]'

    default:
      return 'border-border/60 bg-secondary/[0.12]'
  }
}


export function ProductPageState({
  kind,
  title,
  description,
  retry,
  retrying = false,
  action,
  compact = false,
}: ProductPageStateProps) {
  if (
    kind ===
      'loading' &&
    !compact
  ) {
    return (
      <div
        className="flex min-h-[45vh] items-center justify-center"
        role="status"
        aria-live="polite"
      >
        <div className="flex flex-col items-center text-center">
          <LoaderCircle className="h-6 w-6 animate-spin text-primary" />

          <p className="mt-3 text-sm font-medium">
            {title}
          </p>

          <p className="mt-1 max-w-md text-xs leading-5 text-muted-foreground">
            {description}
          </p>
        </div>
      </div>
    )
  }


  return (
    <div
      className={[
        'rounded-xl border',
        borderClass(
          kind,
        ),
        compact
          ? 'p-3'
          : 'p-5',
      ].join(
        ' ',
      )}
      role={
        kind ===
          'error' ||
        kind ===
          'forbidden'
          ? 'alert'
          : 'status'
      }
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0">
          <StateIcon
            kind={
              kind
            }
          />
        </div>


        <div className="min-w-0 flex-1">
          <p
            className={
              compact
                ? 'text-xs font-medium'
                : 'text-sm font-medium'
            }
          >
            {title}
          </p>


          <p
            className={[
              'mt-1 leading-5 text-muted-foreground',

              compact
                ? 'text-[11px]'
                : 'text-xs',
            ].join(
              ' ',
            )}
          >
            {description}
          </p>


          {(retry ||
            action) && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {retry && (
                <button
                  type="button"
                  disabled={
                    retrying
                  }
                  onClick={
                    retry
                  }
                  className="inline-flex h-8 items-center gap-2 rounded-lg border border-border bg-secondary/40 px-3 text-[11px] font-medium transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <RefreshCw
                    className={[
                      'h-3.5 w-3.5',

                      retrying
                        ? 'animate-spin'
                        : '',
                    ].join(
                      ' ',
                    )}
                  />

                  {retrying
                    ? 'Retrying'
                    : 'Retry'}
                </button>
              )}


              {action}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}


export function ProductLoadingState({
  title =
    'Loading product state',
  description =
    'AIRA is resolving authoritative organization and environment data.',
}: {
  title?:
    string

  description?:
    string
}) {
  return (
    <ProductPageState
      kind="loading"
      title={
        title
      }
      description={
        description
      }
    />
  )
}


export function ProductEmptyState({
  title,
  description,
  action,
}: {
  title:
    string

  description:
    string

  action?:
    ReactNode
}) {
  return (
    <ProductPageState
      kind="empty"
      title={
        title
      }
      description={
        description
      }
      action={
        action
      }
    />
  )
}


export function ProductErrorState({
  title =
    'Product data unavailable',
  description,
  retry,
  retrying,
}: {
  title?:
    string

  description:
    string

  retry?:
    () => void

  retrying?:
    boolean
}) {
  return (
    <ProductPageState
      kind="error"
      title={
        title
      }
      description={
        description
      }
      retry={
        retry
      }
      retrying={
        retrying
      }
    />
  )
}


export function ProductDegradedState({
  title =
    'Some product data is unavailable',
  description,
}: {
  title?:
    string

  description:
    string
}) {
  return (
    <ProductPageState
      kind="degraded"
      title={
        title
      }
      description={
        description
      }
      compact
    />
  )
}


export function ProductUnavailableMetric({
  label,
  reason =
    'Insufficient authoritative evidence',
}: {
  label:
    string

  reason?:
    string
}) {
  return (
    <div className="aira-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium text-muted-foreground">
          {label}
        </p>

        <Ban className="h-3.5 w-3.5 text-muted-foreground" />
      </div>

      <p className="mt-3 text-sm font-semibold">
        Unavailable
      </p>

      <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
        {reason}
      </p>
    </div>
  )
}