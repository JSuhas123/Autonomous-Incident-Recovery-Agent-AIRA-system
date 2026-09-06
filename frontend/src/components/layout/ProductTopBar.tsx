import {
  Bell,
  Building2,
  ChevronDown,
  Command,
  Search,
  UserRound,
} from 'lucide-react'

import {
  EnvironmentSafetyBadge,
} from './EnvironmentSafetyBadge'

import {
  ProductContextStatus,
} from './ProductContextStatus'

import {
  useProductRuntimeStore,
} from '@/store/productRuntimeStore'


export function ProductTopBar() {
  const organization =
    useProductRuntimeStore(
      (state) =>
        state.organization,
    )

  const environment =
    useProductRuntimeStore(
      (state) =>
        state.environment,
    )

  const persona =
    useProductRuntimeStore(
      (state) =>
        state.persona,
    )

  const role =
    useProductRuntimeStore(
      (state) =>
        state.role,
    )

  const setCommandOpen =
    useProductRuntimeStore(
      (state) =>
        state.setCommandOpen,
    )


  return (
    <header className="sticky top-0 z-30 flex h-16 items-center border-b border-border/70 bg-background/85 px-4 backdrop-blur-xl sm:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <button
          type="button"
          className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-secondary/50"
        >
          <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />

          <div className="hidden min-w-0 sm:block">
            <p className="truncate text-xs font-medium text-foreground">
              {organization?.name ??
                'No organization'}
            </p>

            <p className="truncate text-[10px] text-muted-foreground">
              {organization?.slug ??
                'organization unavailable'}
            </p>
          </div>

          <ChevronDown className="hidden h-3.5 w-3.5 text-muted-foreground sm:block" />
        </button>


        <div className="hidden h-6 w-px bg-border sm:block" />


        <EnvironmentSafetyBadge
          environment={
            environment
          }
        />


        <div className="hidden xl:block">
          <ProductContextStatus />
        </div>
      </div>


      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() =>
            setCommandOpen(
              true,
            )
          }
          className="hidden h-9 min-w-[220px] items-center justify-between rounded-lg border border-border bg-secondary/30 px-3 text-xs text-muted-foreground transition-colors hover:bg-secondary/60 md:flex"
        >
          <span className="flex items-center gap-2">
            <Search className="h-3.5 w-3.5" />

            Search AIRA
          </span>

          <span className="flex items-center gap-1 rounded border border-border bg-background/60 px-1.5 py-0.5 text-[10px]">
            <Command className="h-2.5 w-2.5" />

            K
          </span>
        </button>


        <button
          type="button"
          className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />

          <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-amber-400" />
        </button>


        <div className="hidden h-6 w-px bg-border sm:block" />


        <button
          type="button"
          className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-secondary/50"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-secondary/50">
            <UserRound className="h-4 w-4 text-muted-foreground" />
          </div>

          <div className="hidden text-left lg:block">
            <p className="text-xs font-medium capitalize">
              {persona.replace(
                /_/g,
                ' ',
              )}
            </p>

            <p className="text-[10px] text-muted-foreground">
              {role
                ? role.replace(
                    /_/g,
                    ' ',
                  )
                : 'Product persona'}
            </p>
          </div>

          <ChevronDown className="hidden h-3.5 w-3.5 text-muted-foreground lg:block" />
        </button>
      </div>
    </header>
  )
}