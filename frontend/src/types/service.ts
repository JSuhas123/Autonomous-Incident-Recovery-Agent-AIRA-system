export type ServiceType =
  | 'website'
  | 'api'
  | 'backend'
  | 'microservice'
  | 'kubernetes'
  | 'docker'
  | 'cloud'
  | 'database'
  | 'other'

export type ServiceEnvironment = 'production' | 'staging' | 'development' | 'testing'

export type ServiceStatus = 'active' | 'paused' | 'archived'

export type VerificationStatus = 'unverified' | 'pending' | 'verified' | 'failed'

export type MonitoringStatus =
  | 'not_configured'
  | 'configuring'
  | 'active'
  | 'paused'
  | 'error'

export interface Service {
  id: string
  name: string
  slug: string
  description: string | null
  organizationId: string
  type: ServiceType
  environment: ServiceEnvironment
  baseUrl: string | null
  status: ServiceStatus
  verificationStatus: VerificationStatus
  monitoringStatus: MonitoringStatus
  tags: string[]
  createdBy: string
  createdAt: string
  updatedAt: string
  archivedAt: string | null
}

export interface ServiceListResponse {
  success: boolean
  data: Service[]
  pagination: {
    page: number
    limit: number
    total: number
    pages: number
  }
}

export interface ServiceListParams {
  page?: number
  limit?: number
  search?: string
  type?: ServiceType
  environment?: ServiceEnvironment
  status?: ServiceStatus
  verificationStatus?: VerificationStatus
  monitoringStatus?: MonitoringStatus
  sort?: string
}

export interface CreateServiceBody {
  name: string
  type: ServiceType
  environment: ServiceEnvironment
  description?: string
  baseUrl?: string
  tags?: string[]
}

export interface UpdateServiceBody {
  name?: string
  description?: string
  type?: ServiceType
  environment?: ServiceEnvironment
  baseUrl?: string
  tags?: string[]
}
