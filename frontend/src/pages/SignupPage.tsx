import { authApi } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuthStore } from '@/store/authStore'
import type { SafeMembership, SafeOrganization, SafeUser } from '@/types'
import { motion } from 'framer-motion'
import { Eye, EyeOff, Zap } from 'lucide-react'
import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'

interface FormState {
  fullName: string
  email: string
  password: string
  organizationName: string
  terms: boolean
}

const INITIAL_FORM: FormState = {
  fullName: '',
  email: '',
  password: '',
  organizationName: '',
  terms: false,
}

export default function SignupPage() {
  const { setAuthenticated, status } = useAuthStore()
  const navigate = useNavigate()

  const [form, setForm] = useState<FormState>(INITIAL_FORM)
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})
  const [globalError, setGlobalError] = useState<string | null>(null)

  if (status === 'authenticated') return <Navigate to="/dashboard" replace />

  function validate() {
    const e: Partial<Record<keyof FormState, string>> = {}
    if (!form.fullName.trim()) e.fullName = 'Full name is required'
    else if (form.fullName.trim().length > 100) e.fullName = 'Full name must be 100 characters or fewer'
    if (!form.email.trim()) e.email = 'Email is required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Enter a valid email address'
    if (!form.password) e.password = 'Password is required'
    else if (form.password.length < 12) e.password = 'Password must be at least 12 characters'
    else if (form.password.length > 1024) e.password = 'Password is too long'
    if (!form.organizationName.trim()) e.organizationName = 'Organization name is required'
    else if (form.organizationName.trim().length > 100) e.organizationName = 'Organization name must be 100 characters or fewer'
    if (!form.terms) e.terms = 'You must accept the terms to continue'
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
      const data = await authApi.register({
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        password: form.password,
        organizationName: form.organizationName.trim(),
      })
      setAuthenticated({
        user: data.user as SafeUser,
        organization: data.organization as SafeOrganization | null,
        membership: data.membership as SafeMembership | null,
        session: null,
        csrfToken: data.csrfToken,
      })
      navigate('/dashboard', { replace: true })
    } catch (err: any) {
      if (err?.status === 409) {
        setErrors({ email: 'An account with this email already exists' })
      } else if (err?.status === 400 && err?.details) {
        const fieldErrs: Partial<Record<keyof FormState, string>> = {}
        for (const d of err.details as Array<{ field: string; message: string }>) {
          fieldErrs[d.field as keyof FormState] = d.message
        }
        setErrors(fieldErrs)
      } else {
        setGlobalError(err?.message || 'Registration failed. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  function field(key: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((p) => ({ ...p, [key]: e.target.value }))
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
            <CardTitle>Create account</CardTitle>
            <CardDescription>Set up your team workspace in seconds</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              {globalError && (
                <p role="alert" className="text-sm text-destructive text-center">{globalError}</p>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="fullName">Full name</Label>
                <Input
                  id="fullName"
                  type="text"
                  placeholder="Jane Smith"
                  value={form.fullName}
                  onChange={field('fullName')}
                  autoComplete="name"
                  aria-describedby={errors.fullName ? 'fullName-error' : undefined}
                  className={errors.fullName ? 'border-destructive' : ''}
                />
                {errors.fullName && <p id="fullName-error" className="text-xs text-destructive">{errors.fullName}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">Work email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@company.com"
                  value={form.email}
                  onChange={field('email')}
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
                    placeholder="At least 12 characters"
                    value={form.password}
                    onChange={field('password')}
                    autoComplete="new-password"
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
              <div className="space-y-1.5">
                <Label htmlFor="organizationName">Organization name</Label>
                <Input
                  id="organizationName"
                  type="text"
                  placeholder="Acme Corp"
                  value={form.organizationName}
                  onChange={field('organizationName')}
                  autoComplete="organization"
                  aria-describedby={errors.organizationName ? 'org-error' : undefined}
                  className={errors.organizationName ? 'border-destructive' : ''}
                />
                {errors.organizationName && <p id="org-error" className="text-xs text-destructive">{errors.organizationName}</p>}
              </div>
              <div className="space-y-1.5">
                <div className="flex items-start gap-2">
                  <input
                    id="terms"
                    type="checkbox"
                    checked={form.terms}
                    onChange={(e) => setForm((p) => ({ ...p, terms: e.target.checked }))}
                    className="mt-0.5 accent-primary"
                    aria-describedby={errors.terms ? 'terms-error' : undefined}
                  />
                  <Label htmlFor="terms" className="font-normal text-sm cursor-pointer leading-snug">
                    I agree to the terms of service and privacy policy
                  </Label>
                </div>
                {errors.terms && <p id="terms-error" className="text-xs text-destructive">{errors.terms}</p>}
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Creating account…' : 'Create account'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link to="/login" className="text-primary hover:underline">Sign in</Link>
        </p>
      </motion.div>
    </div>
  )
}
