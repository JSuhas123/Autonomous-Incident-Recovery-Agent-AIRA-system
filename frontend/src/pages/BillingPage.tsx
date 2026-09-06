import {
  environmentApi,
  type EnvironmentSummaryResponse,
} from '@/api/client'

import {
  CreditCard,
  Gauge,
  Layers3,
  LoaderCircle,
  ShieldCheck,
} from 'lucide-react'

import {
  useEffect,
  useState,
} from 'react'


export default function BillingPage() {
  const [
    summary,
    setSummary,
  ] =
    useState<
      EnvironmentSummaryResponse |
      null
    >(null)


  const [
    loading,
    setLoading,
  ] =
    useState(true)


  const [
    error,
    setError,
  ] =
    useState<
      string |
      null
    >(null)


  useEffect(
    () => {
      let active =
        true

      const controller =
        new AbortController()


      async function load() {
        setLoading(true)

        try {
          const response =
            await environmentApi.summary(
              controller.signal,
            )

          if (!active) {
            return
          }

          setSummary(
            response.summary,
          )
        } catch (
          loadError: unknown
        ) {
          if (
            loadError instanceof DOMException &&
            loadError.name ===
              'AbortError'
          ) {
            return
          }

          if (!active) {
            return
          }

          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Unable to load subscription information.',
          )
        } finally {
          if (active) {
            setLoading(false)
          }
        }
      }


      void load()


      return () => {
        active =
          false

        controller.abort()
      }
    },
    [],
  )


  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <LoaderCircle className="h-6 w-6 animate-spin text-primary" />
      </div>
    )
  }


  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Commercial
        </p>

        <h1 className="mt-1 text-2xl font-semibold">
          Billing & Usage
        </h1>

        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Subscription and capacity information for the current AIRA organization.
        </p>
      </div>


      {error && (
        <div className="rounded-xl border border-red-400/20 bg-red-400/[0.05] p-4 text-sm text-red-300">
          {error}
        </div>
      )}


      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card
          icon={
            Layers3
          }
          label="Current plan"
          value={
            summary?.plan ??
            'Developer'
          }
        />

        <Card
          icon={
            Gauge
          }
          label="Environment limit"
          value={
            summary?.limit ===
            null
              ? 'Unlimited'
              : String(
                  summary?.limit ??
                    0,
                )
          }
        />

        <Card
          icon={
            ShieldCheck
          }
          label="Active environments"
          value={
            String(
              summary?.active ??
                0,
            )
          }
        />

        <Card
          icon={
            CreditCard
          }
          label="Payment provider"
          value="Not configured"
        />
      </div>


      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="font-medium">
          Environment capacity
        </h2>

        <p className="mt-1 text-sm text-muted-foreground">
          Capacity is derived from the organization's current AIRA subscription.
        </p>


        <div className="mt-5">
          {summary?.limit ===
          null ? (
            <div className="rounded-xl border border-border bg-secondary/20 p-4">
              <p className="text-sm font-medium">
                Unlimited environment entitlement
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between text-sm">
                <span>
                  Used
                </span>

                <span>
                  {summary?.total ??
                    0}
                  {' / '}
                  {summary?.limit ??
                    0}
                </span>
              </div>

              <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{
                    width:
                      `${Math.min(
                        100,
                        ((summary?.total ??
                          0) /
                          Math.max(
                            1,
                            summary?.limit ??
                              1,
                          )) *
                          100,
                      )}%`,
                  }}
                />
              </div>

              <p className="mt-2 text-xs text-muted-foreground">
                {summary?.remaining ??
                  0}{' '}
                environment slots remaining.
              </p>
            </>
          )}
        </div>
      </section>


      <section className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.04] p-5">
        <h2 className="font-medium">
          Payment processing is not yet connected
        </h2>

        <p className="mt-2 text-sm text-muted-foreground">
          AIRA currently exposes the real subscription and entitlement state from its backend. Card management, invoices and plan purchases will remain unavailable until an actual payment provider is integrated.
        </p>
      </section>
    </div>
  )
}


function Card({
  icon: Icon,
  label,
  value,
}: {
  icon:
    typeof Layers3

  label:
    string

  value:
    string
}) {
  return (
    <article className="rounded-xl border border-border bg-card p-4">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-secondary/40">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        {label}
      </p>

      <p className="mt-1 text-lg font-semibold capitalize">
        {value}
      </p>
    </article>
  )
}