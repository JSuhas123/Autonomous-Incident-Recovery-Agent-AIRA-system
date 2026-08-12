import {
  ApiError,
  environmentApi,
  type EnvironmentSummaryResponse,
} from '@/api/client'

import {
  useThresholds,
  useUpdateThresholds,
} from '@/api/hooks/useSafety'

import { ErrorState } from '@/components/shared/ErrorState'
import { PageLoader } from '@/components/shared/PageLoader'

import { Button } from '@/components/ui/button'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'

import { toast } from '@/hooks/useToast'

import {
  type EnvironmentSummary,
  useAuthStore,
} from '@/store/authStore'

import { motion } from 'framer-motion'

import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Crown,
  Plus,
  RefreshCw,
  Save,
  Server,
  Shield,
  Wrench,
} from 'lucide-react'

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'

const thresholdFields = [
  {
    key: 'confidenceThreshold',
    label: 'Confidence Threshold',
    description:
      'Minimum confidence score (0–1) to auto-approve',
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    key: 'criticalConfidenceThreshold',
    label: 'Critical Confidence Threshold',
    description:
      'Minimum score for critical incidents',
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    key: 'maxRetries',
    label: 'Max Retries',
    description:
      'Maximum retries for failed actions',
    min: 0,
    max: 10,
    step: 1,
  },
  {
    key: 'timeoutSeconds',
    label: 'Timeout (seconds)',
    description:
      'Execution timeout per step',
    min: 1,
    max: 3600,
    step: 1,
  },
]

type EnvironmentType =
  | 'development'
  | 'testing'
  | 'staging'
  | 'production'
  | 'custom'

type Criticality =
  | 'low'
  | 'medium'
  | 'high'
  | 'critical'

interface CreateEnvironmentForm {
  name: string
  type: EnvironmentType
  criticality: Criticality
  description: string
}

const INITIAL_ENVIRONMENT_FORM: CreateEnvironmentForm = {
  name: '',
  type: 'staging',
  criticality: 'medium',
  description: '',
}

function environmentTypeLabel(
  type: EnvironmentType,
) {
  switch (type) {
    case 'development':
      return 'Development'
    case 'testing':
      return 'Testing'
    case 'staging':
      return 'Staging'
    case 'production':
      return 'Production'
    default:
      return 'Custom'
  }
}

function environmentStatusLabel(
  status: EnvironmentSummary['status'],
) {
  switch (status) {
    case 'maintenance':
      return 'Maintenance'
    case 'archived':
      return 'Archived'
    default:
      return 'Active'
  }
}

function errorMessage(
  error: unknown,
) {
  if (error instanceof ApiError) {
    return error.message
  }

  if (
    error instanceof Error
  ) {
    return error.message
  }

  return 'Unexpected error'
}

export default function SettingsPage() {
  /*
   * ---------------------------------------------------------------
   * THRESHOLDS
   * ---------------------------------------------------------------
   */

  const {
    data: thresholds,
    isLoading: thresholdsLoading,
    error: thresholdsError,
    refetch: refetchThresholds,
  } = useThresholds()

  const updateThresholds =
    useUpdateThresholds()

  const [
    thresholdValues,
    setThresholdValues,
  ] = useState<
    Record<string, string>
  >({})

  const thresholdData =
    thresholds as any

  /*
   * ---------------------------------------------------------------
   * ENVIRONMENT STATE
   * ---------------------------------------------------------------
   */

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

  const setActiveEnvironment =
    useAuthStore(
      (state) =>
        state.setActiveEnvironment,
    )

  const setAvailableEnvironments =
    useAuthStore(
      (state) =>
        state.setAvailableEnvironments,
    )

  const [
    environmentSummary,
    setEnvironmentSummary,
  ] =
    useState<EnvironmentSummaryResponse | null>(
      null,
    )

  const [
    environmentsLoading,
    setEnvironmentsLoading,
  ] = useState(false)

  const [
    environmentError,
    setEnvironmentError,
  ] = useState<string | null>(
    null,
  )

  const [
    createForm,
    setCreateForm,
  ] =
    useState<CreateEnvironmentForm>(
      INITIAL_ENVIRONMENT_FORM,
    )

  const [
    creatingEnvironment,
    setCreatingEnvironment,
  ] = useState(false)

  const [
    actionEnvironmentId,
    setActionEnvironmentId,
  ] = useState<string | null>(
    null,
  )

  /*
   * ---------------------------------------------------------------
   * THRESHOLD HELPERS
   * ---------------------------------------------------------------
   */

  function getThresholdValue(
    key: string,
  ) {
    return key in thresholdValues
      ? thresholdValues[key]
      : String(
          thresholdData?.[key] ??
            '',
        )
  }

  async function handleSaveThresholds() {
    const parsed: Record<
      string,
      number
    > = {}

    for (
      const [key, value]
      of Object.entries(
        thresholdValues,
      )
    ) {
      const number =
        parseFloat(value)

      if (!Number.isNaN(number)) {
        parsed[key] = number
      }
    }

    if (
      !Object.keys(parsed).length
    ) {
      toast.error(
        'No changes to save',
      )
      return
    }

    try {
      await updateThresholds.mutateAsync(
        parsed,
      )

      toast.success(
        'Thresholds saved',
      )

      setThresholdValues({})
    } catch (error) {
      toast.error(
        'Save failed',
        errorMessage(error),
      )
    }
  }

  /*
   * ---------------------------------------------------------------
   * ENVIRONMENT LOADING
   * ---------------------------------------------------------------
   */

  const refreshEnvironments =
    useCallback(async () => {
      setEnvironmentsLoading(
        true,
      )

      setEnvironmentError(
        null,
      )

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

        setEnvironmentSummary(
          summaryResponse.summary,
        )

        /*
         * If the currently selected environment was archived
         * or otherwise disappeared, automatically move to a
         * valid environment.
         */
        const selectedStillExists =
          activeEnvironment
            ? listResponse.environments.some(
                (environment) =>
                  environment.id ===
                  activeEnvironment.id,
              )
            : false

        if (
          !selectedStillExists
        ) {
          const replacement =
            listResponse.environments.find(
              (environment) =>
                environment.isDefault,
            ) ??
            listResponse.environments.find(
              (environment) =>
                environment.status ===
                'active',
            ) ??
            listResponse.environments[0] ??
            null

          setActiveEnvironment(
            replacement,
          )
        }
      } catch (error) {
        setEnvironmentError(
          errorMessage(error),
        )
      } finally {
        setEnvironmentsLoading(
          false,
        )
      }
    }, [
      activeEnvironment,
      setActiveEnvironment,
      setAvailableEnvironments,
    ])

  useEffect(() => {
    void refreshEnvironments()
  }, [])

  /*
   * ---------------------------------------------------------------
   * ENVIRONMENT CREATION
   * ---------------------------------------------------------------
   */

  async function handleCreateEnvironment() {
    if (
      !createForm.name.trim()
    ) {
      toast.error(
        'Environment name is required',
      )

      return
    }

    setCreatingEnvironment(
      true,
    )

    try {
      const response =
        await environmentApi.create({
          name:
            createForm.name.trim(),

          type:
            createForm.type,

          criticality:
            createForm.type ===
            'production'
              ? 'critical'
              : createForm
                  .criticality,

          description:
            createForm.description.trim(),
        })

      toast.success(
        `${response.environment.name} created`,
      )

      setCreateForm(
        INITIAL_ENVIRONMENT_FORM,
      )

      await refreshEnvironments()
    } catch (error) {
      if (
        error instanceof
          ApiError &&
        error.code ===
          'ENTITLEMENT_LIMIT_REACHED'
      ) {
        const details =
          error.details as
            | {
                details?: {
                  limit?: number
                  currentUsage?: number
                  plan?: string
                }
              }
            | undefined

        toast.error(
          'Environment limit reached',
          `Your current plan does not allow another environment.`,
        )

        console.info(
          '[AIRA entitlement]',
          details,
        )
      } else if (
        error instanceof
          ApiError &&
        error.code ===
          'ENTITLEMENT_REQUIRED'
      ) {
        toast.error(
          'Plan upgrade required',
          'Production environments are not available on your current plan.',
        )
      } else {
        toast.error(
          'Environment creation failed',
          errorMessage(error),
        )
      }
    } finally {
      setCreatingEnvironment(
        false,
      )
    }
  }

  /*
   * ---------------------------------------------------------------
   * DEFAULT ENVIRONMENT
   * ---------------------------------------------------------------
   */

  async function handleSetDefault(
    environment: EnvironmentSummary,
  ) {
    setActionEnvironmentId(
      environment.id,
    )

    try {
      await environmentApi.setDefault(
        environment.id,
      )

      toast.success(
        `${environment.name} is now the default environment`,
      )

      await refreshEnvironments()
    } catch (error) {
      toast.error(
        'Unable to change default environment',
        errorMessage(error),
      )
    } finally {
      setActionEnvironmentId(
        null,
      )
    }
  }

  /*
   * ---------------------------------------------------------------
   * MAINTENANCE
   * ---------------------------------------------------------------
   */

  async function handleMaintenance(
    environment: EnvironmentSummary,
  ) {
    setActionEnvironmentId(
      environment.id,
    )

    try {
      const reason =
        window.prompt(
          `Why is ${environment.name} entering maintenance?`,
          'Scheduled maintenance',
        )

      if (!reason?.trim()) {
        return
      }

      await environmentApi.enterMaintenance(
        environment.id,
        reason.trim(),
      )

      toast.success(
        `${environment.name} entered maintenance mode`,
      )

      await refreshEnvironments()
    } catch (error) {
      toast.error(
        'Unable to enter maintenance',
        errorMessage(error),
      )
    } finally {
      setActionEnvironmentId(
        null,
      )
    }
  }

  async function handleActivate(
    environment: EnvironmentSummary,
  ) {
    setActionEnvironmentId(
      environment.id,
    )

    try {
      await environmentApi.activate(
        environment.id,
      )

      toast.success(
        `${environment.name} is active`,
      )

      await refreshEnvironments()
    } catch (error) {
      toast.error(
        'Unable to activate environment',
        errorMessage(error),
      )
    } finally {
      setActionEnvironmentId(
        null,
      )
    }
  }

  /*
   * ---------------------------------------------------------------
   * ARCHIVE
   * ---------------------------------------------------------------
   */

  async function handleArchive(
    environment: EnvironmentSummary,
  ) {
    const confirmed =
      window.confirm(
        `Archive ${environment.name}?\n\nThis does not delete historical incidents or executions.`,
      )

    if (!confirmed) {
      return
    }

    const reason =
      window.prompt(
        'Archive reason',
        'No longer in use',
      )

    setActionEnvironmentId(
      environment.id,
    )

    try {
      await environmentApi.archive(
        environment.id,
        reason?.trim() ?? '',
      )

      toast.success(
        `${environment.name} archived`,
      )

      await refreshEnvironments()
    } catch (error) {
      toast.error(
        'Unable to archive environment',
        errorMessage(error),
      )
    } finally {
      setActionEnvironmentId(
        null,
      )
    }
  }

  /*
   * ---------------------------------------------------------------
   * DERIVED UI
   * ---------------------------------------------------------------
   */

  const planUsageText =
    useMemo(() => {
      if (!environmentSummary) {
        return ''
      }

      if (
        environmentSummary.limit ===
        null
      ) {
        return `${environmentSummary.total} environments`
      }

      return `${environmentSummary.total} / ${environmentSummary.limit} environments`
    }, [
      environmentSummary,
    ])

  return (
    <motion.div
      className="max-w-5xl space-y-5"
      initial={{
        opacity: 0,
        y: 8,
      }}
      animate={{
        opacity: 1,
        y: 0,
      }}
      transition={{
        duration: 0.25,
      }}
    >
      <div>
        <h1 className="text-xl font-semibold">
          Settings
        </h1>

        <p className="mt-0.5 text-sm text-muted-foreground">
          Configure operational environments,
          safety thresholds, and platform
          preferences.
        </p>
      </div>

      <Tabs defaultValue="environments">
        <TabsList>
          <TabsTrigger value="environments">
            Environments
          </TabsTrigger>

          <TabsTrigger value="thresholds">
            Thresholds
          </TabsTrigger>
        </TabsList>

        {/* ===================================================== */}
        {/* ENVIRONMENTS                                          */}
        {/* ===================================================== */}

        <TabsContent
          value="environments"
          className="mt-4 space-y-4"
        >
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>
                    Operational Environments
                  </CardTitle>

                  <CardDescription>
                    Separate development, staging,
                    and production infrastructure
                    into protected operational
                    boundaries.
                  </CardDescription>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    void refreshEnvironments()
                  }
                  disabled={
                    environmentsLoading
                  }
                >
                  <RefreshCw
                    className={`mr-1 h-3.5 w-3.5 ${
                      environmentsLoading
                        ? 'animate-spin'
                        : ''
                    }`}
                  />

                  Refresh
                </Button>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {environmentSummary && (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground">
                      Plan
                    </p>

                    <p className="mt-1 font-medium capitalize">
                      {environmentSummary.plan}
                    </p>
                  </div>

                  <div className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground">
                      Usage
                    </p>

                    <p className="mt-1 font-medium">
                      {planUsageText}
                    </p>
                  </div>

                  <div className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground">
                      Active
                    </p>

                    <p className="mt-1 font-medium">
                      {
                        environmentSummary.active
                      }
                    </p>
                  </div>

                  <div className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground">
                      Production
                    </p>

                    <p className="mt-1 font-medium">
                      {environmentSummary.hasProduction
                        ? 'Configured'
                        : 'Not configured'}
                    </p>
                  </div>
                </div>
              )}

              {environmentError && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                  {environmentError}
                </div>
              )}

              {environmentsLoading &&
              availableEnvironments.length ===
                0 ? (
                <PageLoader />
              ) : (
                <div className="space-y-3">
                  {availableEnvironments.map(
                    (environment) => {
                      const isActionRunning =
                        actionEnvironmentId ===
                        environment.id

                      const isActiveSelection =
                        activeEnvironment?.id ===
                        environment.id

                      return (
                        <div
                          key={
                            environment.id
                          }
                          className={`rounded-lg border p-4 ${
                            environment.type ===
                            'production'
                              ? 'border-amber-500/40'
                              : ''
                          }`}
                        >
                          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                            <div className="space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <Server className="h-4 w-4 text-muted-foreground" />

                                <h3 className="font-medium">
                                  {
                                    environment.name
                                  }
                                </h3>

                                {environment.isDefault && (
                                  <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium">
                                    <Crown className="mr-1 h-3 w-3" />
                                    Default
                                  </span>
                                )}

                                {isActiveSelection && (
                                  <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                                    Current
                                  </span>
                                )}

                                {environment.type ===
                                  'production' && (
                                  <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                                    <Shield className="mr-1 h-3 w-3" />
                                    Production
                                  </span>
                                )}

                                {environment.status ===
                                  'maintenance' && (
                                  <span className="inline-flex items-center rounded-full bg-orange-500/10 px-2 py-0.5 text-[11px] font-medium text-orange-700 dark:text-orange-400">
                                    <Wrench className="mr-1 h-3 w-3" />
                                    Maintenance
                                  </span>
                                )}
                              </div>

                              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                <span>
                                  Type:{' '}
                                  {environmentTypeLabel(
                                    environment.type,
                                  )}
                                </span>

                                <span>
                                  Criticality:{' '}
                                  {
                                    environment.criticality
                                  }
                                </span>

                                <span>
                                  Status:{' '}
                                  {environmentStatusLabel(
                                    environment.status,
                                  )}
                                </span>
                              </div>

                              {environment.description && (
                                <p className="max-w-2xl text-sm text-muted-foreground">
                                  {
                                    environment.description
                                  }
                                </p>
                              )}

                              {environment.status ===
                                'maintenance' &&
                                environment.maintenance
                                  ?.reason && (
                                  <p className="text-xs text-orange-700 dark:text-orange-400">
                                    Maintenance:{' '}
                                    {
                                      environment
                                        .maintenance
                                        .reason
                                    }
                                  </p>
                                )}

                              <div className="flex flex-wrap gap-3 pt-1 text-xs text-muted-foreground">
                                <span>
                                  Autonomous execution:{' '}
                                  {environment.settings
                                    .allowAutonomousExecution
                                    ? 'Allowed'
                                    : 'Disabled'}
                                </span>

                                <span>
                                  Destructive approval:{' '}
                                  {environment.settings
                                    .requireApprovalForDestructiveActions
                                    ? 'Required'
                                    : 'Not required'}
                                </span>
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              {!isActiveSelection && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    setActiveEnvironment(
                                      environment,
                                    )
                                  }
                                >
                                  Use
                                </Button>
                              )}

                              {!environment.isDefault && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={
                                    isActionRunning
                                  }
                                  onClick={() =>
                                    void handleSetDefault(
                                      environment,
                                    )
                                  }
                                >
                                  Set Default
                                </Button>
                              )}

                              {environment.status ===
                              'maintenance' ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={
                                    isActionRunning
                                  }
                                  onClick={() =>
                                    void handleActivate(
                                      environment,
                                    )
                                  }
                                >
                                  <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                                  Activate
                                </Button>
                              ) : (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={
                                    isActionRunning
                                  }
                                  onClick={() =>
                                    void handleMaintenance(
                                      environment,
                                    )
                                  }
                                >
                                  <Wrench className="mr-1 h-3.5 w-3.5" />
                                  Maintenance
                                </Button>
                              )}

                              <Button
                                variant="outline"
                                size="sm"
                                disabled={
                                  isActionRunning ||
                                  availableEnvironments.length <=
                                    1
                                }
                                onClick={() =>
                                  void handleArchive(
                                    environment,
                                  )
                                }
                              >
                                <Archive className="mr-1 h-3.5 w-3.5" />
                                Archive
                              </Button>
                            </div>
                          </div>

                          {environment.type ===
                            'production' && (
                            <div className="mt-4 flex gap-2 rounded-md bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
                              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />

                              <p>
                                Production is protected.
                                Autonomous execution cannot
                                currently be enabled here,
                                and destructive actions must
                                require approval.
                              </p>
                            </div>
                          )}
                        </div>
                      )
                    },
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* CREATE ENVIRONMENT */}

          <Card>
            <CardHeader>
              <CardTitle>
                Create Environment
              </CardTitle>

              <CardDescription>
                Environment creation is governed
                by your organization's plan and
                production safety rules.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              {environmentSummary?.remaining ===
                0 && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
                  <div className="flex gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />

                    <div>
                      <p className="font-medium">
                        Environment limit reached
                      </p>

                      <p className="mt-0.5 text-xs text-muted-foreground">
                        The{' '}
                        {
                          environmentSummary.plan
                        }{' '}
                        plan currently supports{' '}
                        {
                          environmentSummary.limit
                        }{' '}
                        environment
                        {environmentSummary.limit ===
                        1
                          ? ''
                          : 's'}
                        .
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="environment-name">
                    Name
                  </Label>

                  <Input
                    id="environment-name"
                    value={
                      createForm.name
                    }
                    placeholder="Staging"
                    onChange={(event) =>
                      setCreateForm(
                        (previous) => ({
                          ...previous,
                          name:
                            event.target
                              .value,
                        }),
                      )
                    }
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="environment-type">
                    Type
                  </Label>

                  <select
                    id="environment-type"
                    value={
                      createForm.type
                    }
                    onChange={(event) => {
                      const type =
                        event.target
                          .value as EnvironmentType

                      setCreateForm(
                        (previous) => ({
                          ...previous,
                          type,

                          criticality:
                            type ===
                            'production'
                              ? 'critical'
                              : previous.criticality,
                        }),
                      )
                    }}
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

                <div className="space-y-1.5">
                  <Label htmlFor="environment-criticality">
                    Criticality
                  </Label>

                  <select
                    id="environment-criticality"
                    value={
                      createForm.criticality
                    }
                    disabled={
                      createForm.type ===
                      'production'
                    }
                    onChange={(event) =>
                      setCreateForm(
                        (previous) => ({
                          ...previous,

                          criticality:
                            event.target
                              .value as Criticality,
                        }),
                      )
                    }
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-60"
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

                <div className="space-y-1.5">
                  <Label htmlFor="environment-description">
                    Description
                  </Label>

                  <Input
                    id="environment-description"
                    value={
                      createForm.description
                    }
                    placeholder="Pre-production validation environment"
                    onChange={(event) =>
                      setCreateForm(
                        (previous) => ({
                          ...previous,

                          description:
                            event.target
                              .value,
                        }),
                      )
                    }
                  />
                </div>
              </div>

              {createForm.type ===
                'production' && (
                <div className="flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
                  <Shield className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />

                  <div>
                    <p className="font-medium">
                      Production protection
                    </p>

                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Production is automatically
                      created with critical
                      criticality, autonomous
                      execution disabled, and
                      destructive-action approval
                      required.
                    </p>
                  </div>
                </div>
              )}

              <Button
                onClick={() =>
                  void handleCreateEnvironment()
                }
                loading={
                  creatingEnvironment
                }
                disabled={
                  environmentSummary?.remaining ===
                  0
                }
              >
                <Plus className="mr-1 h-4 w-4" />

                Create Environment
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===================================================== */}
        {/* THRESHOLDS                                            */}
        {/* ===================================================== */}

        <TabsContent
          value="thresholds"
          className="mt-4 space-y-4"
        >
          {thresholdsLoading ? (
            <PageLoader />
          ) : thresholdsError ? (
            <ErrorState
              description={
                (
                  thresholdsError as Error
                ).message
              }
              onRetry={() =>
                refetchThresholds()
              }
            />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>
                  Confidence Thresholds
                </CardTitle>

                <CardDescription>
                  Control when decisions require
                  manual approval.
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-5">
                {thresholdFields.map(
                  ({
                    key,
                    label,
                    description,
                    min,
                    max,
                    step,
                  }) => (
                    <div
                      key={key}
                      className="space-y-1.5"
                    >
                      <Label htmlFor={key}>
                        {label}
                      </Label>

                      <Input
                        id={key}
                        type="number"
                        min={min}
                        max={max}
                        step={step}
                        value={getThresholdValue(
                          key,
                        )}
                        onChange={(event) =>
                          setThresholdValues(
                            (previous) => ({
                              ...previous,
                              [key]:
                                event
                                  .target
                                  .value,
                            }),
                          )
                        }
                      />

                      <p className="text-xs text-muted-foreground">
                        {description}
                      </p>
                    </div>
                  ),
                )}

                <Button
                  onClick={
                    handleSaveThresholds
                  }
                  loading={
                    updateThresholds.isPending
                  }
                  size="sm"
                >
                  <Save className="mr-1 h-3 w-3" />
                  Save Changes
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </motion.div>
  )
}