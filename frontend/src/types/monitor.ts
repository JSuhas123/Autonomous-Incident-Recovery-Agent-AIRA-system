export type MonitorType = 'http' | 'https' | 'ssl'
export type MonitorStatus = 'healthy' | 'degraded' | 'down' | 'unknown'
export type HttpMethod = 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH'

export interface Monitor {
  id: string
  serviceId: string
  organizationId: string
  name: string
  type: MonitorType
  url: string
  method: HttpMethod
  enabled: boolean
  intervalSeconds: number
  timeoutMs: number
  expectedStatusCodes: number[]
  expectedText: string | null
  requestHeaders: Record<string, string>
  followRedirects: boolean
  maximumRedirects: number
  sslExpiryWarningDays: number
  consecutiveFailureThreshold: number
  recoverySuccessThreshold: number
  regions: string[]
  lastStatus: MonitorStatus
  lastCheckedAt: string | null
  lastStatusCode: number | null
  lastResponseTimeMs: number | null
  consecutiveFailures: number
  consecutiveSuccesses: number
  nextCheckAt: string | null
  createdAt: string
  updatedAt: string
}

export interface MonitorCheck {
  id: string
  monitorId: string
  checkedAt: string
  status: MonitorStatus
  statusCode: number | null
  responseTimeMs: number | null
  responseSizeBytes: number | null
  dnsTimeMs: number | null
  tcpTimeMs: number | null
  tlsTimeMs: number | null
  firstByteTimeMs: number | null
  sslValid: boolean | null
  sslDaysRemaining: number | null
  contentMatched: boolean | null
  redirectCount: number
  errorCode: string | null
  sanitizedErrorMessage: string | null
  checkerRegion: string
}

export interface CreateMonitorBody {
  name: string
  type: MonitorType
  url: string
  method?: HttpMethod
  enabled?: boolean
  intervalSeconds?: number
  timeoutMs?: number
  expectedStatusCodes?: number[]
  expectedText?: string | null
  requestHeaders?: Record<string, string>
  followRedirects?: boolean
  maximumRedirects?: number
  sslExpiryWarningDays?: number
  consecutiveFailureThreshold?: number
  recoverySuccessThreshold?: number
}

export interface UpdateMonitorBody extends Partial<CreateMonitorBody> {}
