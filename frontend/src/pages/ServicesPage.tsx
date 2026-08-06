import {
    useArchiveService,
    useCreateService,
    usePauseService,
    useResumeService,
    useServices,
} from '@/api/hooks/useServices'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import type {
    CreateServiceBody,
    Service,
    ServiceEnvironment,
    ServiceType,
} from '@/types/service'
import { motion } from 'framer-motion'
import { MoreHorizontal, Pause, Play, Plus, Search, Server, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

// ─── Badge colour helpers ────────────────────────────────────────────────────

const TYPE_LABELS: Record<ServiceType, string> = {
  website: 'Website',
  api: 'API',
  backend: 'Backend',
  microservice: 'Microservice',
  kubernetes: 'Kubernetes',
  docker: 'Docker',
  cloud: 'Cloud',
  database: 'Database',
  other: 'Other',
}

const ENV_VARIANT: Record<ServiceEnvironment, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  production: 'default',
  staging: 'secondary',
  development: 'outline',
  testing: 'outline',
}

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  active: 'default',
  paused: 'secondary',
  archived: 'outline',
}

// ─── Wizard steps ────────────────────────────────────────────────────────────

const WIZARD_STEPS = ['Basic details', 'Service type', 'Environment', 'URL', 'Review']

const SERVICE_TYPES: ServiceType[] = [
  'website', 'api', 'backend', 'microservice', 'kubernetes', 'docker', 'cloud', 'database', 'other',
]

const ENVIRONMENTS: ServiceEnvironment[] = [
  'production', 'staging', 'development', 'testing',
]

interface WizardState {
  name: string
  description: string
  type: ServiceType | ''
  environment: ServiceEnvironment | ''
  baseUrl: string
}

const EMPTY_WIZARD: WizardState = {
  name: '',
  description: '',
  type: '',
  environment: '',
  baseUrl: '',
}

// ─── Add Service Wizard ───────────────────────────────────────────────────────

function AddServiceWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<WizardState>(EMPTY_WIZARD)
  const [error, setError] = useState<string | null>(null)
  const createService = useCreateService()

  const reset = () => {
    setStep(0)
    setForm(EMPTY_WIZARD)
    setError(null)
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const canNext = () => {
    if (step === 0) return form.name.trim().length >= 2
    if (step === 1) return form.type !== ''
    if (step === 2) return form.environment !== ''
    return true
  }

  const handleSubmit = async () => {
    setError(null)
    const body: CreateServiceBody = {
      name: form.name.trim(),
      type: form.type as ServiceType,
      environment: form.environment as ServiceEnvironment,
      description: form.description.trim() || undefined,
      baseUrl: form.baseUrl.trim() || undefined,
    }
    try {
      await createService.mutateAsync(body)
      handleClose()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to create service'
      setError(msg)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add a service</DialogTitle>
          <DialogDescription>
            Step {step + 1} of {WIZARD_STEPS.length} — {WIZARD_STEPS[step]}
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-1 mb-2">
          {WIZARD_STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i <= step ? 'bg-primary' : 'bg-muted'
              }`}
            />
          ))}
        </div>

        <div className="space-y-4 min-h-[140px]">
          {step === 0 && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="svc-name">Service name *</Label>
                <Input
                  id="svc-name"
                  placeholder="e.g. Payments API"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="svc-desc">Description (optional)</Label>
                <Input
                  id="svc-desc"
                  placeholder="Brief description"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>
            </>
          )}

          {step === 1 && (
            <div className="space-y-1.5">
              <Label>Service type *</Label>
              <Select
                value={form.type}
                onValueChange={(v) => setForm((f) => ({ ...f, type: v as ServiceType }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {SERVICE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{TYPE_LABELS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-1.5">
              <Label>Environment *</Label>
              <Select
                value={form.environment}
                onValueChange={(v) => setForm((f) => ({ ...f, environment: v as ServiceEnvironment }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select environment" />
                </SelectTrigger>
                <SelectContent>
                  {ENVIRONMENTS.map((e) => (
                    <SelectItem key={e} value={e} className="capitalize">{e}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-1.5">
              <Label htmlFor="svc-url">Base URL (optional)</Label>
              <Input
                id="svc-url"
                placeholder="https://api.example.com"
                value={form.baseUrl}
                onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                Must be a public HTTPS endpoint. Private IPs are not allowed.
              </p>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Name</span>
                <span className="font-medium">{form.name}</span>
              </div>
              {form.description && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Description</span>
                  <span>{form.description}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Type</span>
                <span className="capitalize">{form.type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Environment</span>
                <span className="capitalize">{form.environment}</span>
              </div>
              {form.baseUrl && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">URL</span>
                  <span className="font-mono text-xs break-all">{form.baseUrl}</span>
                </div>
              )}
            </div>
          )}

          {error && (
            <p className="text-sm text-destructive mt-2">{error}</p>
          )}
        </div>

        <DialogFooter className="gap-2">
          {step > 0 && (
            <Button variant="outline" size="sm" onClick={() => setStep((s) => s - 1)} disabled={createService.isPending}>
              Back
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleClose} disabled={createService.isPending}>
            Cancel
          </Button>
          {step < WIZARD_STEPS.length - 1 ? (
            <Button size="sm" onClick={() => setStep((s) => s + 1)} disabled={!canNext()}>
              Next
            </Button>
          ) : (
            <Button size="sm" onClick={handleSubmit} disabled={createService.isPending}>
              {createService.isPending ? 'Adding…' : 'Add service'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Archive confirmation dialog ──────────────────────────────────────────────

function ArchiveConfirmDialog({
  service,
  onClose,
}: {
  service: Service | null
  onClose: () => void
}) {
  const archiveService = useArchiveService()

  const handleConfirm = async () => {
    if (!service) return
    await archiveService.mutateAsync(service.id)
    onClose()
  }

  return (
    <Dialog open={!!service} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Archive service?</DialogTitle>
          <DialogDescription>
            <strong>{service?.name}</strong> will be archived and removed from active monitoring.
            You can restore it later.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={archiveService.isPending}>Cancel</Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={archiveService.isPending}>
            {archiveService.isPending ? 'Archiving…' : 'Archive'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Services Page ────────────────────────────────────────────────────────────

export default function ServicesPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState<ServiceType | 'all'>('all')
  const [filterEnv, setFilterEnv] = useState<ServiceEnvironment | 'all'>('all')
  const [wizardOpen, setWizardOpen] = useState(false)
  const [archiveTarget, setArchiveTarget] = useState<Service | null>(null)

  const { data, isLoading } = useServices({
    search: search || undefined,
    type: filterType !== 'all' ? filterType : undefined,
    environment: filterEnv !== 'all' ? filterEnv : undefined,
    status: 'active',
  })

  const pauseService = usePauseService()
  const resumeService = useResumeService()

  const services = data?.data ?? []

  return (
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Services</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Register and manage the services AIRA monitors.
          </p>
        </div>
        <Button size="sm" className="gap-2" onClick={() => setWizardOpen(true)}>
          <Plus className="w-4 h-4" />
          Add service
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[160px] max-w-xs">
          <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-8 h-9 text-sm"
            placeholder="Search services…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={filterType} onValueChange={(v) => setFilterType(v as ServiceType | 'all')}>
          <SelectTrigger className="h-9 w-[130px] text-sm">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {SERVICE_TYPES.map((t) => (
              <SelectItem key={t} value={t}>{TYPE_LABELS[t]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterEnv} onValueChange={(v) => setFilterEnv(v as ServiceEnvironment | 'all')}>
          <SelectTrigger className="h-9 w-[140px] text-sm">
            <SelectValue placeholder="All environments" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All environments</SelectItem>
            {ENVIRONMENTS.map((e) => (
              <SelectItem key={e} value={e} className="capitalize">{e}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      ) : services.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Server className="w-10 h-10 text-muted-foreground" />
            <div>
              <p className="font-medium">No services found</p>
              <p className="text-sm text-muted-foreground mt-1">
                {search || filterType !== 'all' || filterEnv !== 'all'
                  ? 'Try adjusting your filters.'
                  : 'Add your first service to start monitoring with AIRA.'}
              </p>
            </div>
            {!search && filterType === 'all' && filterEnv === 'all' && (
              <Button size="sm" className="gap-2 mt-2" onClick={() => setWizardOpen(true)}>
                <Plus className="w-4 h-4" />
                Add your first service
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {services.map((svc) => (
            <Card
              key={svc.id}
              className="cursor-pointer hover:bg-muted/40 transition-colors"
              onClick={() => navigate(`/services/${svc.id}`)}
            >
              <CardContent className="flex items-center gap-4 py-3 px-4">
                <Server className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{svc.name}</p>
                  {svc.description && (
                    <p className="text-xs text-muted-foreground truncate">{svc.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="outline" className="text-xs capitalize hidden sm:inline-flex">
                    {svc.type}
                  </Badge>
                  <Badge variant={ENV_VARIANT[svc.environment]} className="text-xs capitalize">
                    {svc.environment}
                  </Badge>
                  <Badge variant={STATUS_VARIANT[svc.status]} className="text-xs capitalize">
                    {svc.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground hidden md:inline">
                    {svc.monitoringStatus === 'not_configured' ? 'Not monitored' : svc.monitoringStatus}
                  </span>
                </div>
                {/* Actions */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className="w-7 h-7 shrink-0">
                      <MoreHorizontal className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenuItem onClick={() => navigate(`/services/${svc.id}`)}>
                      View details
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {svc.status === 'active' ? (
                      <DropdownMenuItem
                        onClick={() => pauseService.mutate(svc.id)}
                        disabled={pauseService.isPending}
                      >
                        <Pause className="w-3.5 h-3.5 mr-2" />
                        Pause
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem
                        onClick={() => resumeService.mutate(svc.id)}
                        disabled={resumeService.isPending}
                      >
                        <Play className="w-3.5 h-3.5 mr-2" />
                        Resume
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => setArchiveTarget(svc)}
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-2" />
                      Archive
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AddServiceWizard open={wizardOpen} onClose={() => setWizardOpen(false)} />
      <ArchiveConfirmDialog service={archiveTarget} onClose={() => setArchiveTarget(null)} />
    </motion.div>
  )
}
