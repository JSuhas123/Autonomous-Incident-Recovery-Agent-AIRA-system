import { useHealth } from '@/api/hooks/useHealth'
import { useKillSwitches, useToggleKillSwitch } from '@/api/hooks/useSafety'
import { ErrorState } from '@/components/shared/ErrorState'
import { MetricCard } from '@/components/shared/MetricCard'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { toast } from '@/hooks/useToast'
import { motion } from 'framer-motion'
import { Activity, Server, ShieldOff } from 'lucide-react'

export default function ClusterPage() {
  const { data: health, isLoading: loadingHealth } = useHealth()
  const { data: killSwitches, isLoading: loadingKS, error, refetch } = useKillSwitches()
  const toggleKS = useToggleKillSwitch()

  const h = health as any
  const ks = killSwitches as any
  const switches: any[] = Array.isArray(ks) ? ks : ks?.killSwitches ?? []
  const globalActive = ks?.globalKillSwitch ?? ks?.active ?? false

  async function handleToggle(action: 'activate' | 'deactivate', scope?: string) {
    try {
      await toggleKS.mutateAsync({ action, scope })
      toast.success(`Kill switch ${action === 'activate' ? 'activated' : 'deactivated'}`)
    } catch (err: any) {
      toast.error('Toggle failed', err.message)
    }
  }

  return (
    <motion.div
      className="space-y-5"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div>
        <h1 className="text-xl font-semibold">Cluster</h1>
        <p className="text-sm text-muted-foreground mt-0.5">System health and kill switch management</p>
      </div>

      {/* Health metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loadingHealth ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)
        ) : (
          <>
            <MetricCard
              title="System Status"
              value={h?.status ?? 'Unknown'}
              icon={Activity}
              iconColor={h?.status === 'healthy' ? 'text-emerald-400' : 'text-amber-400'}
            />
            <MetricCard title="Database" value={h?.components?.database ?? '—'} icon={Server} />
            <MetricCard title="Cache" value={h?.components?.cache ?? '—'} icon={Server} />
            <MetricCard title="Queue" value={h?.components?.queue ?? '—'} icon={Activity} />
          </>
        )}
      </div>

      {/* Global kill switch */}
      <Card className={globalActive ? 'border-red-500/50' : ''}>
        <CardContent className="p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${globalActive ? 'bg-red-500/10' : 'bg-muted/50'}`}>
              <ShieldOff className={`w-5 h-5 ${globalActive ? 'text-red-400' : 'text-muted-foreground'}`} />
            </div>
            <div>
              <p className="font-semibold">Global Kill Switch</p>
              <p className="text-sm text-muted-foreground">
                {globalActive ? 'Active — all autonomous actions are blocked' : 'Inactive — normal operation'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {globalActive && <Badge variant="destructive">ACTIVE</Badge>}
            <Switch
              checked={globalActive}
              onCheckedChange={(checked) =>
                handleToggle(checked ? 'activate' : 'deactivate')
              }
              disabled={toggleKS.isPending}
            />
          </div>
        </CardContent>
      </Card>

      {/* Per-scope kill switches */}
      {error ? (
        <ErrorState description={(error as Error).message} onRetry={() => refetch()} />
      ) : loadingKS ? (
        <Skeleton className="h-32" />
      ) : switches.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Scoped Kill Switches</CardTitle></CardHeader>
          <CardContent className="divide-y divide-border">
            {switches.map((sw: any, i: number) => (
              <div key={sw.scope ?? i} className="flex items-center justify-between py-3">
                <div>
                  <p className="font-medium text-sm">{sw.scope ?? sw.name ?? `Scope ${i + 1}`}</p>
                  <p className="text-xs text-muted-foreground">{sw.description ?? '—'}</p>
                </div>
                <Switch
                  checked={sw.active}
                  onCheckedChange={(checked) =>
                    handleToggle(checked ? 'activate' : 'deactivate', sw.scope)
                  }
                  disabled={toggleKS.isPending}
                />
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </motion.div>
  )
}
