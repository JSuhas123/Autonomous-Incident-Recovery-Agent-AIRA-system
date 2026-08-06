export type VerificationMethod = 'dns_txt' | 'file' | 'meta_tag'
export type ChallengeStatus = 'pending' | 'verified' | 'failed' | 'expired'

export interface DnsTxtInstructions {
  type: string
  host: string
  value: string
  note: string
}

export interface FileInstructions {
  type: string
  url: string
  content: string
  note: string
}

export interface MetaTagInstructions {
  type: string
  tag: string
  note: string
}

export type VerificationInstructions = DnsTxtInstructions | FileInstructions | MetaTagInstructions

export interface VerificationChallenge {
  id: string
  serviceId: string
  method: VerificationMethod
  token: string
  status: ChallengeStatus
  attempts: number
  maxAttempts: number
  expiresAt: string
  verifiedAt: string | null
  lastAttemptAt: string | null
  failureReason: string | null
  instructions: VerificationInstructions | null
}

export interface VerificationStatus {
  verificationStatus: 'unverified' | 'pending' | 'verified' | 'failed'
  verificationMethod: VerificationMethod | null
  verifiedAt: string | null
  challenge: VerificationChallenge | null
}

export interface VerificationCheckResult {
  verified: boolean
  verificationStatus?: string
  verificationMethod?: string
  verifiedAt?: string
  reason?: string
  attemptsRemaining?: number
  service?: {
    id: string
    verificationStatus: string
    verificationMethod: string | null
    verifiedAt: string | null
  }
}
