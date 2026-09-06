import {
  environmentApi,
  type EnvironmentSummaryResponse,
} from '@/api/client'

import {
  Button,
} from '@/components/ui/button'

import {
  Input,
} from '@/components/ui/input'

import {
  Label,
} from '@/components/ui/label'

import {
  useEnvironmentTransition,
} from '@/hooks/useEnvironmentTransition'

import {
  useAuthStore,
  type EnvironmentSummary,
} from '@/store/authStore'

import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  LoaderCircle,
  Plus,
  Server,
  ShieldCheck,
} from 'lucide-react'

import {
  useCallback,
  useEffect,
  useState,
} from 'react'


interface CreateEnvironmentForm {
  name: string

  type:
    | 'development'
    | 'testing'
    | 'staging'
    | 'production'
    | 'custom'

  criticality:
    | 'low'
    | 'medium'
    | 'high'
    | 'critical'

  description: string
}


const INITIAL_FORM:
  CreateEnvironmentForm = {
    name: '',

    type:
      'staging',

    criticality:
      'medium',

    description: '',
  }


export default function EnvironmentManagementPage() {
  const activeEnvironment =
    useAuthStore(
      (state) =>
        state.activeEnvironment,
    )

  const availableEnvironments =
    useAuthStore(
      (state) =>
        state.availableEnvironments,
    )

  const setAvailableEnvironments =
    useAuthStore(
      (state) =>
        state.setAvailableEnvironments,
    )

  const setEnvironmentsLoading =
    useAuthStore(
      (state) =>
        state.setEnvironmentsLoading,
    )


  const transitionEnvironment =
    useEnvironmentTransition()


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
    creating,
    setCreating,
  ] =
    useState(false)


  const [
    showCreate,
    setShowCreate,
  ] =
    useState(false)


  const [
    error,
    setError,
  ] =
    useState<
      string |
      null
    >(null)


  const [
    form,
    setForm,
  ] =
    useState<CreateEnvironmentForm>(
      INITIAL_FORM,
    )


  const refresh =
    useCallback(
      async () => {
        setLoading(true)
        setError(null)

        try {
          const [
            listResponse,
            summaryResponse,
          ] =
            await Promise.all([
              environmentApi.list(),
              environmentApi.summary(),
            ])


          setAvailableEnvironments(
            listResponse.environments,
          )


          setSummary(
            summaryResponse.summary,
          )
        } catch (
          refreshError: unknown
        ) {
          setError(
            refreshError instanceof Error
              ? refreshError.message
              : 'Unable to load environments.',
          )
        } finally {
          setLoading(false)
        }
      },
      [
        setAvailableEnvironments,
      ],
    )


  useEffect(
    () => {
      void refresh()
    },
    [
      refresh,
    ],
  )


  async function createEnvironment(
    event:
      React.FormEvent,
  ) {
    event.preventDefault()

    const name =
      form.name.trim()

    if (!name) {
      setError(
        'Environment name is required.',
      )

      return
    }


    setCreating(true)
    setError(null)

    try {
      const response =
        await environmentApi.create({
          name,

          type:
            form.type,

          criticality:
            form.criticality,

          description:
            form.description
              .trim(),

          settings: {
            /*
             * Phase-25 safety defaults.
             */
            allowAutonomousExecution:
              false,

            requireApprovalForDestructiveActions:
              true,
          },
        })


      const created =
        response.environment


      await refresh()


      setForm(
        INITIAL_FORM,
      )

      setShowCreate(
        false,
      )


      await transitionEnvironment(
        created,
      )
    } catch (
      createError: unknown
    ) {
      setError(
        createError instanceof Error
          ? createError.message
          : 'Unable to create environment.',
      )
    } finally {
      setCreating(false)
    }
  }


  async function switchEnvironment(
    environment:
      EnvironmentSummary,
  ) {
    try {
      setError(null)

      await transitionEnvironment(
        environment,
      )
    } catch (
      switchError: unknown
    ) {
      setError(
        switchError instanceof Error
          ? switchError.message
          : 'Unable to switch environment.',
      )
    }
  }


  if (
    loading &&
    availableEnvironments.length ===
      0
  ) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <LoaderCircle className="h-6 w-6 animate-spin text-primary" />
      </div>
    )
  }


  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Organization
          </p>

          <h1 className="mt-1 text-2xl font-semibold">
            Environments
          </h1>

          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Separate development, staging and production operational context while preserving tenant isolation.
          </p>
        </div>


        <Button
          type="button"
          onClick={
            () =>
              setShowCreate(
                (value) =>
                  !value,
              )
          }
        >
          <Plus className="mr-2 h-4 w-4" />

          Add environment
        </Button>
      </div>


      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-400/20 bg-red-400/[0.05] p-4 text-sm text-red-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />

          {error}
        </div>
      )}


      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Environments"
          value={
            String(
              summary?.total ??
                availableEnvironments.length,
            )
          }
        />

        <Metric
          label="Active"
          value={
            String(
              summary?.active ??
                availableEnvironments.filter(
                  (environment) =>
                    environment.status ===
                    'active',
                ).length,
            )
          }
        />

        <Metric
          label="Plan"
          value={
            summary?.plan ??
            'Developer'
          }
        />

        <Metric
          label="Environment capacity"
          value={
            summary?.limit ===
            null
              ? 'Unlimited'
              : `${summary?.remaining ?? 0} remaining`
          }
        />
      </div>


      {availableEnvironments.length ===
        1 && (
        <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/[0.04] p-4">
          <div className="flex gap-3">
            <Boxes className="mt-0.5 h-5 w-5 text-cyan-300" />

            <div>
              <p className="text-sm font-medium">
                Only one environment is configured
              </p>

              <p className="mt-1 text-sm text-muted-foreground">
                Create Staging or another isolated environment to test AIRA's environment-switching workflow.
              </p>
            </div>
          </div>
        </div>
      )}


      {showCreate && (
        <form
          onSubmit={
            createEnvironment
          }
          className="rounded-2xl border border-border bg-card p-5"
        >
          <div className="mb-5">
            <h2 className="font-medium">
              Create environment
            </h2>

            <p className="mt-1 text-xs text-muted-foreground">
              New environments start with autonomous execution disabled and destructive actions requiring approval.
            </p>
          </div>


          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="environment-name">
                Name
              </Label>

              <Input
                id="environment-name"
                value={
                  form.name
                }
                placeholder="AIRA Sandbox Staging"
                onChange={
                  (event) =>
                    setForm(
                      (current) => ({
                        ...current,

                        name:
                          event.target.value,
                      }),
                    )
                }
              />
            </div>


            <div className="space-y-2">
              <Label htmlFor="environment-type">
                Environment type
              </Label>

              <select
                id="environment-type"
                value={
                  form.type
                }
                onChange={
                  (event) =>
                    setForm(
                      (current) => ({
                        ...current,

                        type:
                          event.target.value as
                            CreateEnvironmentForm['type'],
                      }),
                    )
                }
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="development">
                  Development
                </option>

                <option value="testing">
                  Testing
                </option>

                <option value="staging">
                  Staging
                </option>

                <option value="production">
                  Production
                </option>

                <option value="custom">
                  Custom
                </option>
              </select>
            </div>


            <div className="space-y-2">
              <Label htmlFor="environment-criticality">
                Criticality
              </Label>

              <select
                id="environment-criticality"
                value={
                  form.criticality
                }
                onChange={
                  (event) =>
                    setForm(
                      (current) => ({
                        ...current,

                        criticality:
                          event.target.value as
                            CreateEnvironmentForm['criticality'],
                      }),
                    )
                }
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="low">
                  Low
                </option>

                <option value="medium">
                  Medium
                </option>

                <option value="high">
                  High
                </option>

                <option value="critical">
                  Critical
                </option>
              </select>
            </div>


            <div className="space-y-2">
              <Label htmlFor="environment-description">
                Description
              </Label>

              <Input
                id="environment-description"
                value={
                  form.description
                }
                placeholder="Pre-production validation environment"
                onChange={
                  (event) =>
                    setForm(
                      (current) => ({
                        ...current,

                        description:
                          event.target.value,
                      }),
                    )
                }
              />
            </div>
          </div>


          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <SafetySetting
              title="Autonomous execution"
              value="Disabled"
              safe
            />

            <SafetySetting
              title="Destructive actions"
              value="Approval required"
              safe
            />
          </div>


          <div className="mt-5 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={
                () =>
                  setShowCreate(
                    false,
                  )
              }
            >
              Cancel
            </Button>

            <Button
              type="submit"
              disabled={
                creating
              }
            >
              {creating && (
                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
              )}

              Create environment
            </Button>
          </div>
        </form>
      )}


      <div className="grid gap-4 xl:grid-cols-2">
        {availableEnvironments.map(
          (environment) => {
            const isCurrent =
              activeEnvironment?.id ===
              environment.id

            return (
              <article
                key={
                  environment.id
                }
                className="rounded-2xl border border-border bg-card p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-secondary/40">
                      <Server className="h-5 w-5 text-muted-foreground" />
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="font-medium">
                          {
                            environment.name
                          }
                        </h2>

                        {isCurrent && (
                          <span className="rounded-full border border-emerald-400/20 bg-emerald-400/[0.06] px-2 py-0.5 text-[10px] text-emerald-300">
                            Current
                          </span>
                        )}
                      </div>

                      <p className="mt-1 text-xs capitalize text-muted-foreground">
                        {environment.type}
                        {' · '}
                        {environment.criticality}
                        {' · '}
                        {environment.status}
                      </p>
                    </div>
                  </div>


                  {!isCurrent &&
                    environment.status !==
                      'archived' && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={
                        () =>
                          void switchEnvironment(
                            environment,
                          )
                      }
                    >
                      Switch
                    </Button>
                  )}
                </div>


                {environment.description && (
                  <p className="mt-4 text-sm text-muted-foreground">
                    {
                      environment.description
                    }
                  </p>
                )}


                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <SafetySetting
                    title="Autonomous execution"
                    value={
                      environment.settings
                        .allowAutonomousExecution
                        ? 'Enabled'
                        : 'Disabled'
                    }
                    safe={
                      !environment.settings
                        .allowAutonomousExecution
                    }
                  />

                  <SafetySetting
                    title="Destructive actions"
                    value={
                      environment.settings
                        .requireApprovalForDestructiveActions
                        ? 'Approval required'
                        : 'Policy dependent'
                    }
                    safe={
                      environment.settings
                        .requireApprovalForDestructiveActions
                    }
                  />
                </div>
              </article>
            )
          },
        )}
      </div>
    </div>
  )
}


function Metric({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">
        {label}
      </p>

      <p className="mt-2 text-xl font-semibold">
        {value}
      </p>
    </div>
  )
}


function SafetySetting({
  title,
  value,
  safe,
}: {
  title: string
  value: string
  safe: boolean
}) {
  return (
    <div className="rounded-lg border border-border bg-secondary/20 p-3">
      <div className="flex items-center gap-2">
        {safe ? (
          <ShieldCheck className="h-4 w-4 text-emerald-300" />
        ) : (
          <AlertTriangle className="h-4 w-4 text-amber-300" />
        )}

        <p className="text-xs font-medium">
          {title}
        </p>
      </div>

      <p className="mt-1 text-xs text-muted-foreground">
        {value}
      </p>
    </div>
  )
}