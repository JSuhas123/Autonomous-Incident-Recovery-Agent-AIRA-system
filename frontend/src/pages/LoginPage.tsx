import { authApi } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/hooks/useToast'
import { useAuthStore } from '@/store/authStore'
import type { SafeMembership, SafeOrganization, SafeUser } from '@/types'
import { motion } from 'framer-motion'
import { Eye, EyeOff, Zap } from 'lucide-react'
import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'

export default function LoginPage() {
  const { setAuthenticated, status } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as any)?.from?.pathname || '/dashboard'

  const [form, setForm] = useState({ email: '', password: '', rememberMe: false })
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<'email' | 'password', string>>>({})
  const [globalError, setGlobalError] = useState<string | null>(null)

  if (status === 'authenticated') return <Navigate to={from} replace />

  function validate() {
    const e: Partial<Record<'email' | 'password', string>> = {}
    if (!form.email.trim()) e.email = 'Email is required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Enter a valid email address'
    if (!form.password) e.password = 'Password is required'
    return e
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setErrors({})
    setGlobalError(null)
    setLoading(true)
    try {
      const data = await authApi.login({
        email: form.email.trim(),
        password: form.password,
        rememberMe: form.rememberMe,
      })
      setAuthenticated({
        user: data.user as SafeUser,
        organization: data.organization as SafeOrganization | null,
        membership: data.membership as SafeMembership | null,
        session: null,
        csrfToken: data.csrfToken,
      })
      navigate(from, { replace: true })
    } catch (err: any) {
      if (err?.status === 401) {
        setGlobalError('Invalid email or password')
      } else if (err?.status === 403) {
        setGlobalError(err.message || 'Account access denied')
      } else {
        toast.error('Login failed', err?.message)
      }
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
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/20 glow-primary">
            <Zap className="w-7 h-7 text-primary" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gradient">AIRA</h1>
            <p className="text-muted-foreground text-sm">AI-Driven Incident Response & Recovery</p>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle>Sign in</CardTitle>
            <CardDescription>Enter your email and password to access the dashboard</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              {globalError && (
                <p role="alert" className="text-sm text-destructive text-center">{globalError}</p>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="email">Work email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@company.com"
                  value={form.email}
                  onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                  autoComplete="email"
                  aria-describedby={errors.email ? 'email-error' : undefined}
                  className={errors.email ? 'border-destructive' : ''}
                />
                {errors.email && <p id="email-error" className="text-xs text-destructive">{errors.email}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Your password"
                    value={form.password}
                    onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                    autoComplete="current-password"
                    className={`pr-10 ${errors.password ? 'border-destructive' : ''}`}
                    aria-describedby={errors.password ? 'password-error' : undefined}
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.password && <p id="password-error" className="text-xs text-destructive">{errors.password}</p>}
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="rememberMe"
                  type="checkbox"
                  checked={form.rememberMe}
                  onChange={(e) => setForm((p) => ({ ...p, rememberMe: e.target.checked }))}
                  className="accent-primary"
                />
                <Label htmlFor="rememberMe" className="font-normal text-sm cursor-pointer">
                  Remember me for 30 days
                </Label>
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Signing inâ€¦' : 'Sign in'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{' '}
          <Link to="/signup" className="text-primary hover:underline">Create one</Link>
        </p>
      </motion.div>
    </div>
  )
}

