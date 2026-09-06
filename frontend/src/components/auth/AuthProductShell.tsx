import {
  Activity,
  Bot,
  CheckCircle2,
  Radar,
  ShieldCheck,
  Sparkles,
  Workflow,
  Zap,
} from 'lucide-react'

import {
  motion,
  useReducedMotion,
} from 'framer-motion'

import type {
  ReactNode,
} from 'react'

interface AuthProductShellProps {
  children: ReactNode

  eyebrow?: string

  title: string

  description: string
}

const CAPABILITIES = [
  {
    icon: Radar,
    label: 'Observe',
    description:
      'Correlate infrastructure, application and observability signals.',
  },

  {
    icon: Bot,
    label: 'Investigate',
    description:
      'Build evidence-backed hypotheses before proposing recovery.',
  },

  {
    icon: Workflow,
    label: 'Recover',
    description:
      'Route recommendations through policy, approval and human control.',
  },

  {
    icon: CheckCircle2,
    label: 'Verify',
    description:
      'Validate recovery outcomes before learning from an incident.',
  },
]

function OrbitNode({
  className,
  delay,
}: {
  className: string
  delay: number
}) {
  const reduceMotion =
    useReducedMotion()

  return (
    <motion.div
      aria-hidden="true"
      className={[
        'absolute h-2 w-2 rounded-full',
        'bg-primary shadow-[0_0_24px_hsl(var(--primary)/0.9)]',
        className,
      ].join(' ')}
      animate={
        reduceMotion
          ? undefined
          : {
              opacity: [
                0.25,
                1,
                0.25,
              ],

              scale: [
                0.8,
                1.2,
                0.8,
              ],
            }
      }
      transition={{
        duration: 3.2,
        delay,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
    />
  )
}

export function AuthProductShell({
  children,
  eyebrow = 'AIRA Enterprise',
  title,
  description,
}: AuthProductShellProps) {
  const reduceMotion =
    useReducedMotion()

  return (
    <main className="relative min-h-screen overflow-hidden bg-background">
      {/* Ambient background */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
      >
        <div className="absolute -left-32 -top-32 h-[34rem] w-[34rem] rounded-full bg-primary/[0.08] blur-[120px]" />

        <div className="absolute -bottom-48 right-[-6rem] h-[40rem] w-[40rem] rounded-full bg-cyan-400/[0.05] blur-[140px]" />

        <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--border)/0.22)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border)/0.22)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />

        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col">
        {/* Header */}
        <header className="flex h-20 items-center justify-between border-b border-border/60 px-6 lg:px-10">
          <div className="flex items-center gap-3">
            <div className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 shadow-[0_0_32px_hsl(var(--primary)/0.12)]">
              <Zap className="h-5 w-5 text-primary" />

              <span className="absolute right-0 top-0 h-2.5 w-2.5 -translate-y-1 translate-x-1 rounded-full border-2 border-background bg-emerald-400" />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-semibold tracking-tight">
                  AIRA
                </span>

                <span className="rounded-md border border-border bg-secondary/70 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                  Platform
                </span>
              </div>

              <p className="text-[11px] text-muted-foreground">
                Autonomous Incident Recovery Agent
              </p>
            </div>
          </div>

          <div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />

            <span>
              Tenant-isolated enterprise control plane
            </span>
          </div>
        </header>

        <section className="mx-auto grid w-full max-w-[1500px] flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1.08fr)_minmax(420px,0.92fr)]">
          {/* Product story */}
          <div className="relative hidden min-h-[calc(100vh-5rem)] overflow-hidden border-r border-border/60 px-10 py-12 lg:flex xl:px-16">
            <motion.div
              className="relative z-10 my-auto max-w-2xl"
              initial={
                reduceMotion
                  ? false
                  : {
                      opacity: 0,
                      y: 18,
                    }
              }
              animate={{
                opacity: 1,
                y: 0,
              }}
              transition={{
                duration: 0.55,
                ease: 'easeOut',
              }}
            >
              <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/[0.07] px-3 py-1.5 text-xs font-medium text-primary">
                <Sparkles className="h-3.5 w-3.5" />

                {eyebrow}
              </div>

              <h1 className="max-w-xl text-4xl font-semibold tracking-[-0.04em] text-foreground xl:text-5xl xl:leading-[1.08]">
                Reliability operations
                {' '}
                <span className="text-gradient">
                  with evidence before action.
                </span>
              </h1>

              <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground">
                AIRA connects incidents, infrastructure context,
                investigation, policy, human decisions and recovery
                verification into one operational control plane.
              </p>

              {/* Operational visual */}
              <div className="relative mt-10 overflow-hidden rounded-2xl border border-border/70 bg-card/55 p-1 shadow-2xl shadow-black/20 backdrop-blur-xl">
                <div className="rounded-[14px] border border-border/60 bg-background/70 p-5">
                  <div className="mb-5 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <Activity className="h-4 w-4 text-emerald-400" />

                        <span className="text-sm font-medium">
                          Reliability control loop
                        </span>
                      </div>

                      <p className="mt-1 text-xs text-muted-foreground">
                        Policy-bound incident lifecycle
                      </p>
                    </div>

                    <div className="flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/[0.07] px-2.5 py-1 text-[11px] font-medium text-emerald-300">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />

                      Observing
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-2">
                    {CAPABILITIES.map(
                      (
                        capability,
                        index,
                      ) => {
                        const Icon =
                          capability.icon

                        return (
                          <motion.div
                            key={
                              capability.label
                            }
                            className="relative min-h-[118px] rounded-xl border border-border/70 bg-card/80 p-3"
                            initial={
                              reduceMotion
                                ? false
                                : {
                                    opacity: 0,
                                    y: 8,
                                  }
                            }
                            animate={{
                              opacity: 1,
                              y: 0,
                            }}
                            transition={{
                              duration: 0.35,
                              delay:
                                0.12 +
                                index *
                                  0.06,
                            }}
                          >
                            <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg border border-primary/20 bg-primary/[0.07]">
                              <Icon className="h-4 w-4 text-primary" />
                            </div>

                            <p className="text-xs font-medium">
                              {
                                capability.label
                              }
                            </p>

                            <p className="mt-1.5 text-[10px] leading-4 text-muted-foreground">
                              {
                                capability.description
                              }
                            </p>
                          </motion.div>
                        )
                      },
                    )}
                  </div>

                  <div className="mt-4 flex items-center justify-between rounded-xl border border-amber-400/15 bg-amber-400/[0.04] px-4 py-3">
                    <div className="flex items-center gap-3">
                      <ShieldCheck className="h-4 w-4 text-amber-300" />

                      <div>
                        <p className="text-xs font-medium text-foreground">
                          Execution authority remains separately bounded
                        </p>

                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          Persona, confidence and recommendations never bypass policy.
                        </p>
                      </div>
                    </div>

                    <span className="rounded-md border border-amber-400/20 px-2 py-1 text-[10px] uppercase tracking-wider text-amber-300">
                      Guarded
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-8 grid grid-cols-3 gap-5">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    Tenant aware
                  </p>

                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Organization and environment boundaries are enforced server-side.
                  </p>
                </div>

                <div>
                  <p className="text-sm font-semibold text-foreground">
                    Human governed
                  </p>

                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Approval and takeover remain visible throughout recovery.
                  </p>
                </div>

                <div>
                  <p className="text-sm font-semibold text-foreground">
                    Evidence driven
                  </p>

                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Investigation and verification remain traceable after incidents.
                  </p>
                </div>
              </div>
            </motion.div>

            {/* Decorative topology */}
            <div
              aria-hidden="true"
              className="absolute right-[-40px] top-[9%] h-[320px] w-[320px] opacity-50"
            >
              <div className="absolute left-1/2 top-1/2 h-52 w-52 -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/10" />

              <div className="absolute left-1/2 top-1/2 h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/15" />

              <div className="absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-xl border border-primary/20 bg-primary/[0.08]" />

              <OrbitNode
                className="left-[48px] top-[92px]"
                delay={0}
              />

              <OrbitNode
                className="right-[60px] top-[78px]"
                delay={0.5}
              />

              <OrbitNode
                className="bottom-[60px] right-[108px]"
                delay={1}
              />
            </div>
          </div>

          {/* Auth form */}
          <div className="flex min-h-[calc(100vh-5rem)] items-center justify-center px-5 py-10 sm:px-8 lg:px-12 xl:px-16">
            <motion.div
              className="w-full max-w-[480px]"
              initial={
                reduceMotion
                  ? false
                  : {
                      opacity: 0,
                      x: 18,
                    }
              }
              animate={{
                opacity: 1,
                x: 0,
              }}
              transition={{
                duration: 0.45,
                ease: 'easeOut',
              }}
            >
              <div className="mb-8">
                <div className="mb-4 flex items-center gap-2 lg:hidden">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
                    <Zap className="h-4 w-4 text-primary" />
                  </div>

                  <span className="font-semibold">
                    AIRA
                  </span>
                </div>

                <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">
                  {eyebrow}
                </p>

                <h2 className="mt-3 text-3xl font-semibold tracking-[-0.035em]">
                  {title}
                </h2>

                <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
                  {description}
                </p>
              </div>

              {children}

              <div className="mt-8 flex items-center justify-center gap-5 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Secure session
                </span>

                <span className="h-3 w-px bg-border" />

                <span>
                  Tenant scoped
                </span>

                <span className="h-3 w-px bg-border" />

                <span>
                  Auditable
                </span>
              </div>
            </motion.div>
          </div>
        </section>
      </div>
    </main>
  )
}