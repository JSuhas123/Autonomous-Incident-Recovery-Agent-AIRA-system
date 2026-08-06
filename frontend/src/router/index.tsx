import { AppLayout } from '@/components/layout/AppLayout'
import { PageLoader } from '@/components/shared/PageLoader'
import { lazy, Suspense } from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'
import { ProtectedRoute } from './ProtectedRoute'

// Auth
const LoginPage = lazy(() => import('@/pages/LoginPage'))
const SignupPage = lazy(() => import('@/pages/SignupPage'))

// Feature pages
const DashboardPage = lazy(() => import('@/pages/DashboardPage'))
const ServicesPage = lazy(() => import('@/pages/ServicesPage'))
const ServiceDetailPage = lazy(() => import('@/pages/ServiceDetailPage'))
const MonitoringPage = lazy(() => import('@/pages/MonitoringPage'))
const InsightsPage = lazy(() => import('@/pages/InsightsPage'))
const RecoveryPage = lazy(() => import('@/pages/RecoveryPage'))
const TeamPage = lazy(() => import('@/pages/TeamPage'))
const IncidentListPage = lazy(() => import('@/pages/IncidentListPage'))
const IncidentDetailPage = lazy(() => import('@/pages/IncidentDetailPage'))
const RecoveryTimelinePage = lazy(() => import('@/pages/RecoveryTimelinePage'))
const RecoveryExecutionPage = lazy(() => import('@/pages/RecoveryExecutionPage'))
const PoliciesPage = lazy(() => import('@/pages/PoliciesPage'))
const ApprovalsPage = lazy(() => import('@/pages/ApprovalsPage'))
const AuditLogsPage = lazy(() => import('@/pages/AuditLogsPage'))
const AnalyticsPage = lazy(() => import('@/pages/AnalyticsPage'))
const ReportsPage = lazy(() => import('@/pages/ReportsPage'))
const IntegrationsPage = lazy(() => import('@/pages/IntegrationsPage'))
const ClusterPage = lazy(() => import('@/pages/ClusterPage'))
const SettingsPage = lazy(() => import('@/pages/SettingsPage'))
const ProfilePage = lazy(() => import('@/pages/ProfilePage'))
const NotificationsPage = lazy(() => import('@/pages/NotificationsPage'))

function suspend(component: React.ReactNode) {
  return <Suspense fallback={<PageLoader />}>{component}</Suspense>
}

export const router = createBrowserRouter([
  {
    path: '/login',
    element: (
      <Suspense fallback={<PageLoader />}>
        <LoginPage />
      </Suspense>
    ),
  },
  {
    path: '/signup',
    element: (
      <Suspense fallback={<PageLoader />}>
        <SignupPage />
      </Suspense>
    ),
  },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <AppLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      {
        path: 'dashboard',
        element: suspend(<DashboardPage />),
      },
      {
        path: 'services',
        element: suspend(<ServicesPage />),
      },
      {
        path: 'services/:serviceId',
        element: suspend(<ServiceDetailPage />),
      },
      {
        path: 'monitoring',
        element: suspend(<MonitoringPage />),
      },
      {
        path: 'insights',
        element: suspend(<InsightsPage />),
      },
      {
        path: 'recovery',
        element: suspend(<RecoveryPage />),
      },
      {
        path: 'team',
        element: suspend(<TeamPage />),
      },
      {
        path: 'incidents',
        element: suspend(<IncidentListPage />),
      },
      {
        path: 'incidents/:incidentId',
        element: suspend(<IncidentDetailPage />),
      },
      {
        path: 'incidents/:decisionId/timeline',
        element: suspend(<RecoveryTimelinePage />),
      },
      {
        path: 'incidents/:decisionId/recovery',
        element: suspend(<RecoveryExecutionPage />),
      },
      {
        path: 'policies',
        element: suspend(<PoliciesPage />),
      },
      {
        path: 'approvals',
        element: suspend(<ApprovalsPage />),
      },
      {
        path: 'audit',
        element: suspend(<AuditLogsPage />),
      },
      {
        path: 'analytics',
        element: suspend(<AnalyticsPage />),
      },
      {
        path: 'reports',
        element: suspend(<ReportsPage />),
      },
      {
        path: 'integrations',
        element: suspend(<IntegrationsPage />),
      },
      {
        path: 'cluster',
        element: suspend(<ClusterPage />),
      },
      {
        path: 'settings',
        element: suspend(<SettingsPage />),
      },
      {
        path: 'profile',
        element: suspend(<ProfilePage />),
      },
      {
        path: 'notifications',
        element: suspend(<NotificationsPage />),
      },
    ],
  },
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
])
