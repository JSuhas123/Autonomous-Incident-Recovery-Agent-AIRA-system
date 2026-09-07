import {
  Menu,
  X,
  Zap,
} from 'lucide-react'

import {
  useEffect,
  useState,
} from 'react'

import {
  NavLink,
  useLocation,
} from 'react-router-dom'

import {
  getNavigationForPersona,
} from '@/product/product.navigation'

import {
  useProductRuntimeStore,
} from '@/store/productRuntimeStore'


export function ProductMobileNavigation() {
  const [
    open,
    setOpen,
  ] =
    useState(
      false,
    )


  const location =
    useLocation()


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


  const groups =
    getNavigationForPersona(
      persona,
      permissions,
    )


  useEffect(
    () => {
      setOpen(
        false,
      )
    },
    [
      location.pathname,
    ],
  )


  useEffect(
    () => {
      if (
        !open
      ) {
        return
      }


      const onKeyDown =
        (
          event:
            KeyboardEvent,
        ) => {
          if (
            event.key ===
            'Escape'
          ) {
            setOpen(
              false,
            )
          }
        }


      window.addEventListener(
        'keydown',
        onKeyDown,
      )


      return () => {
        window.removeEventListener(
          'keydown',
          onKeyDown,
        )
      }
    },
    [
      open,
    ],
  )


  return (
    <>
      <button
        type="button"
        onClick={
          () =>
            setOpen(
              true,
            )
        }
        className="fixed bottom-4 left-4 z-40 flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-background/95 shadow-xl backdrop-blur lg:hidden"
        aria-label="Open product navigation"
      >
        <Menu className="h-4 w-4" />
      </button>


      {open && (
        <div className="fixed inset-0 z-[80] lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            aria-label="Close product navigation"
            onClick={
              () =>
                setOpen(
                  false,
                )
            }
          />


          <aside className="absolute inset-y-0 left-0 flex w-[min(88vw,320px)] flex-col border-r border-sidebar-border bg-sidebar-background shadow-2xl">
            <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-primary/20 bg-primary/10">
                  <Zap className="h-4 w-4 text-primary" />
                </div>


                <div>
                  <p className="text-sm font-semibold">
                    AIRA
                  </p>

                  <p className="text-[10px] text-muted-foreground">
                    Reliability control plane
                  </p>
                </div>
              </div>


              <button
                type="button"
                onClick={
                  () =>
                    setOpen(
                      false,
                    )
                }
                className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
                aria-label="Close product navigation"
              >
                <X className="h-4 w-4" />
              </button>
            </div>


            <nav className="flex-1 overflow-y-auto px-3 py-4">
              <div className="space-y-5">
                {groups.map(
                  (
                    group,
                  ) => (
                    <section
                      key={
                        group.id
                      }
                    >
                      <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70">
                        {group.label}
                      </p>


                      <div className="space-y-1">
                        {group.items.map(
                          (
                            item,
                          ) => {
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
                                className={
                                  ({
                                    isActive,
                                  }) =>
                                    [
                                      'flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',

                                      isActive
                                        ? 'bg-primary/10 text-primary'
                                        : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                                    ].join(
                                      ' ',
                                    )
                                }
                              >
                                <Icon className="h-4 w-4 shrink-0" />

                                <span>
                                  {item.label}
                                </span>
                              </NavLink>
                            )
                          },
                        )}
                      </div>
                    </section>
                  ),
                )}
              </div>
            </nav>


            <div className="border-t border-sidebar-border p-4">
              <p className="text-[10px] leading-4 text-muted-foreground">
                Navigation visibility is presentation only. Backend permissions remain authoritative.
              </p>
            </div>
          </aside>
        </div>
      )}
    </>
  )
}