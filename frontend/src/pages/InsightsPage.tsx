import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { motion } from 'framer-motion'
import { Sparkles } from 'lucide-react'

export default function InsightsPage() {
  return (
    <motion.div
      className="space-y-6 max-w-2xl"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div>
        <h1 className="text-xl font-semibold">Insights</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          AI-generated observations and pattern analysis from your incident history.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="w-4 h-4 text-muted-foreground" />
            No insights yet
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>
            Insights appear automatically once AIRA has processed its first incident events. Add a
            service and connect monitoring to get started.
          </p>
        </CardContent>
      </Card>
    </motion.div>
  )
}
