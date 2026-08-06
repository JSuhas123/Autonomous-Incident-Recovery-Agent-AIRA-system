import { ApiError } from '@/api/client'
import {
    useCreateChallenge,
    useRegenerateChallenge,
    useRunVerificationCheck,
    useVerificationStatus,
} from '@/api/hooks/useVerification'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import type {
    DnsTxtInstructions,
    FileInstructions,
    MetaTagInstructions,
    VerificationMethod,
} from '@/types/verification'
import { AlertTriangle, Check, CheckCircle2, Clock, Copy, RefreshCw, ShieldCheck, XCircle } from 'lucide-react'
import { useState } from 'react'

// ─── Copy button ──────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={copy} title="Copy">
      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
    </Button>
  )
}

function CodeLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
      <div className="flex items-center gap-2 bg-muted rounded px-3 py-2">
        <code className="text-xs font-mono flex-1 break-all">{value}</code>
        <CopyButton text={value} />
      </div>
    </div>
  )
}

// ─── Instructions panel ───────────────────────────────────────────────────────

function Instructions({
  method,
  instructions,
}: {
  method: VerificationMethod
  instructions: DnsTxtInstructions | FileInstructions | MetaTagInstructions | null
}) {
  if (!instructions) return null

  if (method === 'dns_txt') {
    const ins = instructions as DnsTxtInstructions
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Add the following TXT record to your DNS provider:
        </p>
        <CodeLine label="Host / Name" value={ins.host} />
        <CodeLine label="Value" value={ins.value} />
        <p className="text-xs text-muted-foreground">{ins.note}</p>
      </div>
    )
  }

  if (method === 'file') {
    const ins = instructions as FileInstructions
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Create a publicly accessible file at the following URL:
        </p>
        <CodeLine label="URL" value={ins.url} />
        <CodeLine label="File content" value={ins.content} />
        <p className="text-xs text-muted-foreground">{ins.note}</p>
      </div>
    )
  }

  // meta_tag
  const ins = instructions as MetaTagInstructions
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Place the following tag inside the{' '}
        <code className="text-xs font-mono bg-muted px-1 rounded">&lt;head&gt;</code> of your homepage:
      </p>
      <CodeLine label="Meta tag" value={ins.tag} />
      <p className="text-xs text-muted-foreground">{ins.note}</p>
    </div>
  )
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  if (status === 'verified') {
    return (
      <Badge className="gap-1 bg-green-100 text-green-800 border-green-300">
        <CheckCircle2 className="w-3 h-3" /> Verified
      </Badge>
    )
  }
  if (status === 'pending') {
    return (
      <Badge variant="secondary" className="gap-1">
        <Clock className="w-3 h-3" /> Pending
      </Badge>
    )
  }
  if (status === 'failed') {
    return (
      <Badge variant="destructive" className="gap-1">
        <XCircle className="w-3 h-3" /> Failed
      </Badge>
    )
  }
  if (status === 'expired') {
    return (
      <Badge variant="outline" className="gap-1">
        <Clock className="w-3 h-3" /> Expired
      </Badge>
    )
  }
  return <Badge variant="outline">{status}</Badge>
}

// ─── Main wizard ──────────────────────────────────────────────────────────────

const METHOD_LABELS: Record<VerificationMethod, string> = {
  dns_txt: 'DNS TXT record',
  file: 'HTML verification file',
  meta_tag: 'HTML meta tag',
}

interface Props {
  serviceId: string
  hasBaseUrl: boolean
}

export function VerificationWizard({ serviceId, hasBaseUrl }: Props) {
  const [selectedMethod, setSelectedMethod] = useState<VerificationMethod>('dns_txt')
  const [checkError, setCheckError] = useState<string | null>(null)
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null)

  const { data, isLoading } = useVerificationStatus(serviceId)
  const createChallenge    = useCreateChallenge(serviceId)
  const runCheck           = useRunVerificationCheck(serviceId)
  const regenerate         = useRegenerateChallenge(serviceId)

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6 space-y-3">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-10 w-32" />
        </CardContent>
      </Card>
    )
  }

  const status = data?.data
  const challenge = status?.challenge
  const verificationStatus = status?.verificationStatus ?? 'unverified'

  // ─── Already verified ────────────────────────────────────────────────────

  if (verificationStatus === 'verified') {
    return (
      <Card className="border-green-200 bg-green-50/50">
        <CardContent className="flex items-center gap-4 pt-6">
          <ShieldCheck className="w-8 h-8 text-green-600 shrink-0" />
          <div>
            <p className="font-medium text-green-900">Domain verified</p>
            <p className="text-sm text-green-700 mt-0.5">
              Verified via{' '}
              <span className="font-medium">
                {status.verificationMethod ? METHOD_LABELS[status.verificationMethod] : 'unknown method'}
              </span>
              {status.verifiedAt && (
                <> on {new Date(status.verifiedAt).toLocaleDateString()}</>
              )}
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  // ─── Pending challenge ───────────────────────────────────────────────────

  const hasPendingChallenge = challenge && challenge.status === 'pending'
  const hasFailed           = challenge && (challenge.status === 'failed' || challenge.status === 'expired')

  const handleVerifyNow = async () => {
    setCheckError(null)
    setAttemptsRemaining(null)
    try {
      const res = await runCheck.mutateAsync()
      if (!res.data.verified) {
        setCheckError(res.data.reason ?? 'Verification failed')
        setAttemptsRemaining(res.data.attemptsRemaining ?? null)
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setCheckError(err.message)
      } else {
        setCheckError('Verification check failed. Please try again.')
      }
    }
  }

  const handleRegenerate = async () => {
    setCheckError(null)
    setAttemptsRemaining(null)
    await regenerate.mutateAsync(challenge?.method ?? selectedMethod)
  }

  return (
    <div className="space-y-4">
      {/* Disclaimer */}
      <Card className="border-blue-200 bg-blue-50/50">
        <CardContent className="flex items-start gap-3 pt-4 pb-4">
          <ShieldCheck className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
          <p className="text-sm text-blue-800">
            Verification proves you control this domain. It does{' '}
            <strong>not</strong> grant AIRA access to your infrastructure.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center justify-between">
            Domain ownership verification
            <StatusBadge status={hasPendingChallenge ? 'pending' : (hasFailed ? challenge.status : 'unverified')} />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Method selector — only when no active challenge */}
          {!hasPendingChallenge && (
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Verification method</p>
              <Select
                value={selectedMethod}
                onValueChange={(v) => setSelectedMethod(v as VerificationMethod)}
              >
                <SelectTrigger className="w-[240px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dns_txt">DNS TXT record</SelectItem>
                  <SelectItem value="file" disabled={!hasBaseUrl}>
                    HTML verification file{!hasBaseUrl ? ' (requires base URL)' : ''}
                  </SelectItem>
                  <SelectItem value="meta_tag" disabled={!hasBaseUrl}>
                    HTML meta tag{!hasBaseUrl ? ' (requires base URL)' : ''}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Active challenge instructions */}
          {hasPendingChallenge && challenge.instructions && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">
                  {METHOD_LABELS[challenge.method]} instructions
                </p>
                <p className="text-xs text-muted-foreground">
                  Expires {new Date(challenge.expiresAt).toLocaleString()}
                </p>
              </div>
              <Instructions method={challenge.method} instructions={challenge.instructions} />
            </>
          )}

          {/* Error / attempts remaining */}
          {checkError && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
              <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
              <div className="text-sm text-destructive">
                <p>{checkError}</p>
                {attemptsRemaining != null && (
                  <p className="text-xs mt-0.5">{attemptsRemaining} attempts remaining</p>
                )}
              </div>
            </div>
          )}

          {/* Expired / failed state */}
          {hasFailed && (
            <p className="text-sm text-muted-foreground">
              {challenge.status === 'expired'
                ? 'This challenge has expired.'
                : 'Verification failed. '}
              Generate a new challenge to try again.
            </p>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-2 pt-1">
            {!hasPendingChallenge ? (
              <Button
                size="sm"
                onClick={() => createChallenge.mutate(selectedMethod)}
                disabled={createChallenge.isPending}
              >
                {createChallenge.isPending ? 'Creating…' : 'Get verification instructions'}
              </Button>
            ) : (
              <>
                <Button
                  size="sm"
                  onClick={handleVerifyNow}
                  disabled={runCheck.isPending}
                >
                  {runCheck.isPending ? 'Checking…' : 'Verify now'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={handleRegenerate}
                  disabled={regenerate.isPending}
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Regenerate
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
