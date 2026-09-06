import {
  ChevronLeft,
  ChevronRight,
  Zap,
} from 'lucide-react'

import {
  NavLink,
} from 'react-router-dom'

import {
  getNavigationForPersona,
} from '@/product/product.navigation'

import {
  useProductRuntimeStore,
} from '@/store/productRuntimeStore'


export function ProductSidebar() {
  const persona =
    useProductRuntimeStore(
      (state) =>
        state.persona,
    )

  const permissions =
    useProductRuntimeStore(
      (state) =>
        state.permissions,
    )

  const collapsed =
    useProductRuntimeStore(
      (state) =>
        state.sidebarCollapsed,
    )

  const setCollapsed =
    useProductRuntimeStore(
      (state) =>
        state.setSidebarCollapsed,
    )


  const groups =
    getNavigationForPersona(
      persona,
      permissions,
    )


  return (
    <aside
      className={[
        'fixed inset-y-0 left-0 z-40 hidden border-r border-sidebar-border bg-sidebar-background transition-[width] duration-200 lg:flex lg:flex-col',

        collapsed
          ? 'w-[76px]'
          : 'w-[252px]',
      ].join(' ')}
    >
      <div className="flex h-16 items-center border-b border-sidebar-border px-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10">
            <Zap className="h-4 w-4 text-primary" />
          </div>

          {!collapsed && (
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold tracking-tight">
                  AIRA
                </span>

                <span className="rounded border border-border px-1.5 py-0.5 text-[9px] uppercase tracking-widest text-muted-foreground">
                  Platform
                </span>
              </div>

              <p className="truncate text-[10px] text-muted-foreground">
                Reliability control plane
              </p>
            </div>
          )}
        </div>
      </div>


      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <div className="space-y-5">
          {groups.map(
            (group) => (
              <div
                key={
                  group.id
                }
              >
                {!collapsed && (
                  <div className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70">
                    {
                      group.label
                    }
                  </div>
                )}

                <div className="space-y-1">
                  {group.items.map(
                    (item) => {
                      const Icon =
                        item.icon

                      return (
                        <NavLink
                          key={
                            item.id
                          }
                          to={
                            item.path
                          }
                          title={
                            collapsed
                              ? item.label
                              : undefined
                          }
                          className={
                            ({
                              isActive,
                            }) =>
                              [
                                'group flex h-10 items-center rounded-lg text-sm transition-colors',

                                collapsed
                                  ? 'justify-center px-2'
                                  : 'gap-3 px-3',

                                isActive
                                  ? 'bg-primary/10 text-primary'
                                  : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                              ].join(
                                ' ',
                              )
                          }
                        >
                          <Icon className="h-4 w-4 shrink-0" />

                          {!collapsed && (
                            <span className="truncate">
                              {
                                item.label
                              }
                            </span>
                          )}
                        </NavLink>
                      )
                    },
                  )}
                </div>
              </div>
            ),
          )}
        </div>
      </nav>


      <div className="border-t border-sidebar-border p-3">
        {!collapsed && (
          <div className="mb-3 rounded-lg border border-emerald-400/10 bg-emerald-400/[0.04] p-3">
            <div className="flex items-center gap-2 text-xs font-medium text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />

              Control plane
            </div>

            <p className="mt-1.5 text-[10px] leading-4 text-muted-foreground">
              Product presentation never grants recovery execution authority.
            </p>
          </div>
        )}

        <button
          type="button"
          onClick={() =>
            setCollapsed(
              !collapsed,
            )
          }
          className="flex h-9 w-full items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
          aria-label={
            collapsed
              ? 'Expand sidebar'
              : 'Collapse sidebar'
          }
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <div className="flex w-full items-center justify-between px-2">
              <span className="text-xs">
                Collapse
              </span>

              <ChevronLeft className="h-4 w-4" />
            </div>
          )}
        </button>
      </div>
    </aside>
  )
}