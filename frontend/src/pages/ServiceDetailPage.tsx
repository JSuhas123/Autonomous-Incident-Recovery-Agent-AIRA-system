import { useService } from '@/api/hooks/useServices'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { motion } from 'framer-motion'
import { Activity, AlertTriangle, ArrowLeft, Plug, Server, Settings, Sparkles } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'

function ComingSoon({ label }: { label: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
        <p className="font-medium">{label}</p>
        <p className="text-sm">This section is coming soon.</p>
      </CardContent>
    </Card>
  )
}

export default function ServiceDetailPage() {
  const { serviceId } = useParams<{ serviceId: string }>()
  const navigate = useNavigate()
  const { data, isLoading, isError } = useService(serviceId ?? '')

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    )
  }

  if (isError || !data?.data) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <Server className="w-10 h-10 text-muted-foreground" />
        <p className="font-medium">Service not found</p>
        <Button variant="outline" size="sm" onClick={() => navigate('/services')}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to services
        </Button>
      </div>
    )
  }

  const svc = data.data

  return (
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      {/* Back + Header */}
      <div className="space-y-1">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1 -ml-2 text-muted-foreground"
          onClick={() => navigate('/services')}
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Services
        </Button>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <Server className="w-5 h-5 text-muted-foreground" />
            <div>
              <h1 className="text-xl font-semibold">{svc.name}</h1>
              {svc.description && (
                <p className="text-sm text-muted-foreground">{svc.description}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant="outline" className="capitalize">{svc.type}</Badge>
            <Badge className="capitalize">{svc.environment}</Badge>
            <Badge variant={svc.status === 'active' ? 'default' : 'secondary'} className="capitalize">
              {svc.status}
            </Badge>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview" className="gap-1.5">
            <Server className="w-3.5 h-3.5" /> Overview
          </TabsTrigger>
          <TabsTrigger value="verification" className="gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" /> Verification
          </TabsTrigger>
          <TabsTrigger value="monitoring" className="gap-1.5">
            <Activity className="w-3.5 h-3.5" /> Monitoring
          </TabsTrigger>
          <TabsTrigger value="integrations" className="gap-1.5">
            <Plug className="w-3.5 h-3.5" /> Integrations
          </TabsTrigger>
          <TabsTrigger value="incidents" className="gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" /> Incidents
          </TabsTrigger>
          <TabsTrigger value="insights" className="gap-1.5">
            <Sparkles className="w-3.5 h-3.5" /> Insights
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-1.5">
            <Settings className="w-3.5 h-3.5" /> Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <Card>
            <CardContent className="pt-6 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Name</p>
                <p className="font-medium">{svc.name}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Slug</p>
                <p className="font-mono">{svc.slug}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Type</p>
                <p className="capitalize">{svc.type}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Environment</p>
                <p className="capitalize">{svc.environment}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Base URL</p>
                <p className="font-mono text-xs break-all">{svc.baseUrl ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Verification</p>
                <Badge variant="outline" className="capitalize text-xs">{svc.verificationStatus}</Badge>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Monitoring</p>
                <Badge variant="outline" className="text-xs">
                  {svc.monitoringStatus === 'not_configured' ? 'Not configured' : svc.monitoringStatus}
                </Badge>
              </div>
              {svc.tags.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Tags</p>
                  <div className="flex flex-wrap gap-1">
                    {svc.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="verification" className="mt-4">
          <VerificationWizard serviceId={svc.id} hasBaseUrl={!!svc.baseUrl} />
        </TabsContent>

        <TabsContent value="monitoring" className="mt-4">
          {svc.monitoringStatus === 'not_configured' ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                <Activity className="w-8 h-8 text-muted-foreground" />
                <p className="font-medium">Monitoring not configured</p>
                <p className="text-sm text-muted-foreground">
                  Connect a monitoring integration to start receiving health data for this service.
                </p>
              </CardContent>
            </Card>
          ) : (
            <ComingSoon label="Monitoring data" />
          )}
        </TabsContent>

        <TabsContent value="integrations" className="mt-4">
          <ComingSoon label="Integrations" />
        </TabsContent>

        <TabsContent value="incidents" className="mt-4">
          <ComingSoon label="Incidents" />
        </TabsContent>

        <TabsContent value="insights" className="mt-4">
          <ComingSoon label="Insights" />
        </TabsContent>

        <TabsContent value="settings" className="mt-4">
          <ComingSoon label="Service settings" />
        </TabsContent>
      </Tabs>
    </motion.div>
  )
}
