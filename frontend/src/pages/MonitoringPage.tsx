import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { motion } from 'framer-motion'
import { BarChart2 } from 'lucide-react'

export default function MonitoringPage() {
  return (
    <motion.div
      className="space-y-6 max-w-2xl"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div>
        <h1 className="text-xl font-semibold">Monitoring</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Live health and signal data for your connected services.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart2 className="w-4 h-4 text-muted-foreground" />
            No monitoring data
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>Connect a monitoring integration and add a service to start seeing live data here.</p>
        </CardContent>
      </Card>
    </motion.div>
  )
}
