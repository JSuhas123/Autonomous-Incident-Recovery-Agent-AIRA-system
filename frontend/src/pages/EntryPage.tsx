import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/store/authStore'
import {
  Activity,
  ArrowRight,
  Bot,
  CheckCircle2,
  Radar,
  ShieldCheck,
  Workflow,
  Zap,
} from 'lucide-react'
import { Link } from 'react-router-dom'

const CAPABILITIES = [
  {
    icon: Radar,
    title: 'Observe',
    body: 'Correlate infrastructure, application and observability signals across the operating environment.',
  },
  {
    icon: Bot,
    title: 'Investigate',
    body: 'Build evidence-backed hypotheses and recommendations before any recovery decision is considered.',
  },
  {
    icon: Workflow,
    title: 'Recover',
    body: 'Route recovery through tenant policy, approval, human takeover and bounded execution controls.',
  },
  {
    icon: CheckCircle2,
    title: 'Verify',
    body: 'Measure recovery outcomes, preserve evidence and learn without turning learning into authorization.',
  },
]

export default function EntryPage() {
  const status = useAuthStore((state) => state.status)

  const authenticated = status === 'authenticated'

  return (
    <main className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 -top-40 h-[36rem] w-[36rem] rounded-full bg-primary/[0.08] blur-[130px]" />
        <div className="absolute -bottom-48 right-[-8rem] h-[42rem] w-[42rem] rounded-full bg-cyan-400/[0.05] blur-[150px]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--border)/0.22)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border)/0.22)_1px,transparent_1px)] bg-[size:52px_52px] [mask-image:linear-gradient(to_bottom,black,transparent_88%)]" />
      </div>

      <div className="relative z-10">
        <header className="border-b border-border/60">
          <div className="mx-auto flex h-20 w-full max-w-[1500px] items-center justify-between px-6 lg:px-10">
            <div className="flex items-center gap-3">
              <div className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 shadow-[0_0_32px_hsl(var(--primary)/0.12)]">
                <Zap className="h-5 w-5 text-primary" />
                <span className="absolute right-0 top-0 h-2.5 w-2.5 -translate-y-1 translate-x-1 rounded-full border-2 border-background bg-emerald-400" />
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <span className="text-base font-semibold tracking-tight">AIRA</span>
                  <span className="rounded-md border border-border bg-secondary/70 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                    Platform
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Autonomous Incident Recovery Agent
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              {authenticated ? (
                <Button asChild>
                  <Link to="/dashboard">
                    Open AIRA
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              ) : (
                <>
                  <Button variant="ghost" asChild>
                    <Link to="/login">Sign in</Link>
                  </Button>

                  <Button asChild>
                    <Link to="/signup">Create organization</Link>
                  </Button>
                </>
              )}
            </div>
          </div>
        </header>

        <section className="mx-auto grid min-h-[calc(100vh-5rem)] w-full max-w-[1500px] items-center gap-14 px-6 py-16 lg:grid-cols-[minmax(0,1.05fr)_minmax(440px,0.95fr)] lg:px-10 xl:px-16">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/[0.07] px-3 py-1.5 text-xs font-medium text-primary">
              <ShieldCheck className="h-3.5 w-3.5" />
              Evidence before action. Authority remains bounded.
            </div>

            <h1 className="mt-7 text-5xl font-semibold tracking-[-0.05em] sm:text-6xl lg:text-7xl lg:leading-[0.98]">
              Reliability operations built for
              <span className="text-gradient"> controlled recovery.</span>
            </h1>

            <p className="mt-7 max-w-2xl text-base leading-8 text-muted-foreground sm:text-lg">
              AIRA connects incident signals, infrastructure context,
              investigation, policy, human decisions, recovery and verification
              in one tenant-isolated operational control plane.
            </p>

            <div className="mt-9 flex flex-wrap gap-3">
              {authenticated ? (
                <Button size="lg" asChild>
                  <Link to="/dashboard">
                    Continue to your workspace
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              ) : (
                <>
                  <Button size="lg" asChild>
                    <Link to="/login">
                      Sign in securely
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>

                  <Button size="lg" variant="outline" asChild>
                    <Link to="/signup">Create an AIRA organization</Link>
                  </Button>
                </>
              )}
            </div>

            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
                Tenant-isolated
              </span>

              <span className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-emerald-400" />
                Auditable lifecycle
              </span>

              <span className="flex items-center gap-2">
                <Workflow className="h-4 w-4 text-emerald-400" />
                Human takeover preserved
              </span>
            </div>
          </div>

          <div className="rounded-3xl border border-border/70 bg-card/55 p-2 shadow-2xl shadow-black/25 backdrop-blur-xl">
            <div className="rounded-[22px] border border-border/60 bg-background/75 p-5 sm:p-6">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">
                    AIRA reliability control loop
                  </p>

                  <p className="mt-1 text-xs text-muted-foreground">
                    Capability is never treated as execution authority.
                  </p>
                </div>

                <div className="rounded-full border border-emerald-400/20 bg-emerald-400/[0.07] px-2.5 py-1 text-[11px] font-medium text-emerald-300">
                  Safety bounded
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {CAPABILITIES.map(({ icon: Icon, title, body }) => (
                  <article
                    key={title}
                    className="rounded-2xl border border-border/70 bg-card/70 p-4"
                  >
                    <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-xl border border-primary/20 bg-primary/[0.07]">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>

                    <h2 className="text-sm font-semibold">{title}</h2>

                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      {body}
                    </p>
                  </article>
                ))}
              </div>

              <div className="mt-4 rounded-2xl border border-amber-400/15 bg-amber-400/[0.04] p-4">
                <div className="flex gap-3">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />

                  <p className="text-xs leading-5 text-muted-foreground">
                    Tenant policy, environment boundaries, approvals, risk
                    controls and kill-switch state may reduce operational
                    autonomy. Product presentation never grants backend
                    permission.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}