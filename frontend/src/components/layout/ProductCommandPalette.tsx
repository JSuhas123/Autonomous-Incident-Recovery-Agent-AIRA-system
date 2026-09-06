import {
  Search,
  X,
} from 'lucide-react'

import {
  useEffect,
  useMemo,
  useState,
} from 'react'

import {
  useNavigate,
} from 'react-router-dom'

import {
  getNavigationForPersona,
} from '@/product/product.navigation'

import {
  useProductRuntimeStore,
} from '@/store/productRuntimeStore'


export function ProductCommandPalette() {
  const navigate =
    useNavigate()

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

  const open =
    useProductRuntimeStore(
      (state) =>
        state.commandOpen,
    )

  const setOpen =
    useProductRuntimeStore(
      (state) =>
        state.setCommandOpen,
    )

  const [
    query,
    setQuery,
  ] =
    useState('')


  const items =
    useMemo(
      () =>
        getNavigationForPersona(
          persona,
          permissions,
        ).flatMap(
          (group) =>
            group.items,
        ),
      [
        persona,
        permissions,
      ],
    )


  const filteredItems =
    useMemo(
      () => {
        const normalized =
          query
            .trim()
            .toLowerCase()


        if (!normalized) {
          return items
        }


        return items.filter(
          (item) =>
            item.label
              .toLowerCase()
              .includes(
                normalized,
              ) ||
            item.description
              ?.toLowerCase()
              .includes(
                normalized,
              ),
        )
      },
      [
        items,
        query,
      ],
    )


  useEffect(
    () => {
      function onKeyDown(
        event:
          KeyboardEvent,
      ) {
        if (
          (
            event.ctrlKey ||
            event.metaKey
          ) &&
          event.key
            .toLowerCase() ===
            'k'
        ) {
          event.preventDefault()

          setOpen(
            true,
          )
        }


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


      return () =>
        window.removeEventListener(
          'keydown',
          onKeyDown,
        )
    },
    [
      setOpen,
    ],
  )


  useEffect(
    () => {
      if (!open) {
        setQuery('')
      }
    },
    [
      open,
    ],
  )


  if (!open) {
    return null
  }


  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/60 px-4 pt-[14vh] backdrop-blur-sm"
      onMouseDown={() =>
        setOpen(
          false,
        )
      }
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="AIRA command palette"
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl shadow-black/40"
        onMouseDown={
          (event) =>
            event.stopPropagation()
        }
      >
        <div className="flex items-center border-b border-border px-4">
          <Search className="h-4 w-4 text-muted-foreground" />

          <input
            autoFocus
            value={
              query
            }
            onChange={
              (event) =>
                setQuery(
                  event
                    .target
                    .value,
                )
            }
            placeholder="Search pages and product areas…"
            className="h-14 flex-1 bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground"
          />

          <button
            type="button"
            onClick={() =>
              setOpen(
                false,
              )
            }
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
            aria-label="Close command palette"
          >
            <X className="h-4 w-4" />
          </button>
        </div>


        <div className="max-h-[360px] overflow-y-auto p-2">
          {filteredItems.length ===
          0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              No matching AIRA product area.
            </div>
          ) : (
            filteredItems.map(
              (item) => {
                const Icon =
                  item.icon

                return (
                  <button
                    key={
                      item.id
                    }
                    type="button"
                    onClick={() => {
                      navigate(
                        item.path,
                      )

                      setOpen(
                        false,
                      )
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-secondary/70"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-secondary/40">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                    </div>

                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {
                          item.label
                        }
                      </p>

                      {item.description && (
                        <p className="truncate text-xs text-muted-foreground">
                          {
                            item.description
                          }
                        </p>
                      )}
                    </div>
                  </button>
                )
              },
            )
          )}
        </div>


        <div className="flex items-center justify-between border-t border-border px-4 py-2.5 text-[10px] text-muted-foreground">
          <span>
            Product navigation only
          </span>

          <span>
            Esc to close
          </span>
        </div>
      </div>
    </div>
  )
}