import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { motion } from 'framer-motion'
import { RefreshCw } from 'lucide-react'

export default function RecoveryPage() {
  return (
    <motion.div
      className="space-y-6 max-w-2xl"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div>
        <h1 className="text-xl font-semibold">Recovery</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Automated and manual recovery actions executed by AIRA.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <RefreshCw className="w-4 h-4 text-muted-foreground" />
            No recovery actions yet
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>Recovery actions will appear here once AIRA starts processing incidents.</p>
        </CardContent>
      </Card>
    </motion.div>
  )
}
