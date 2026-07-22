import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/hooks/useToast'
import { useAuthStore } from '@/store/authStore'
import { motion } from 'framer-motion'
import { Eye, EyeOff, Zap } from 'lucide-react'
import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

export default function LoginPage() {
  const login = useAuthStore((s) => s.login)
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as any)?.from?.pathname || '/dashboard'

  const [form, setForm] = useState({ tenantId: '', keyId: '', secret: '' })
  const [showSecret, setShowSecret] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Partial<typeof form>>({})

  function validate() {
    const e: Partial<typeof form> = {}
    if (!form.tenantId.trim()) e.tenantId = 'Tenant ID is required'
    else if (!/^[a-zA-Z0-9_-]+$/.test(form.tenantId.trim())) e.tenantId = 'Only letters, numbers, - and _ allowed'
    if (!form.keyId.trim()) e.keyId = 'Key ID is required'
    if (!form.secret.trim()) e.secret = 'Secret is required'
    else if (form.secret.length < 8) e.secret = 'Secret must be at least 8 characters'
    return e
  }

  function set(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) {
      setErrors(errs)
      return
    }
    setErrors({})
    setLoading(true)
    try {
      login({ tenantId: form.tenantId.trim(), keyId: form.keyId.trim(), secret: form.secret })
      navigate(from, { replace: true })
    } catch (err: any) {
      toast.error('Login failed', err?.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <motion.div
        className="w-full max-w-md space-y-6"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      >
        {/* Brand */}
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/20 glow-primary">
            <Zap className="w-7 h-7 text-primary" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gradient">AIRA</h1>
            <p className="text-muted-foreground text-sm">
              AI-Driven Incident Response & Recovery
            </p>
          </div>
        </div>

        {/* Form */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle>Sign in</CardTitle>
            <CardDescription>Enter your tenant credentials to access the dashboard</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="tenantId">Tenant ID</Label>
                <Input
                  id="tenantId"
                  placeholder="e.g. demo"
                  value={form.tenantId}
                  onChange={set('tenantId')}
                  autoComplete="username"
                  aria-describedby={errors.tenantId ? 'tenantId-error' : undefined}
                  className={errors.tenantId ? 'border-destructive' : ''}
                />
                {errors.tenantId && (
                  <p id="tenantId-error" className="text-xs text-destructive">{errors.tenantId}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="keyId">API Key ID</Label>
                <Input
                  id="keyId"
                  placeholder="e.g. demo-key-1"
                  value={form.keyId}
                  onChange={set('keyId')}
                  aria-describedby={errors.keyId ? 'keyId-error' : undefined}
                  className={errors.keyId ? 'border-destructive' : ''}
                />
                {errors.keyId && (
                  <p id="keyId-error" className="text-xs text-destructive">{errors.keyId}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="secret">Secret</Label>
                <div className="relative">
                  <Input
                    id="secret"
                    type={showSecret ? 'text' : 'password'}
                    placeholder="API secret"
                    value={form.secret}
                    onChange={set('secret')}
                    autoComplete="current-password"
                    className={`pr-10 ${errors.secret ? 'border-destructive' : ''}`}
                    aria-describedby={errors.secret ? 'secret-error' : undefined}
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowSecret((v) => !v)}
                    aria-label={showSecret ? 'Hide secret' : 'Show secret'}
                  >
                    {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.secret && (
                  <p id="secret-error" className="text-xs text-destructive">{errors.secret}</p>
                )}
              </div>
              <Button type="submit" className="w-full" loading={loading}>
                Sign in
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          Credentials are stored locally and used to sign API requests.
        </p>
      </motion.div>
    </div>
  )
}
